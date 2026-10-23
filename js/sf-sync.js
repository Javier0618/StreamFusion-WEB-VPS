// ─── StreamFusion: sincronización de progreso entre dispositivos ─────────────
// Lo usan la app del celular (script2.js) y la de TV (tv.js). Se sube a
// sfusion.netlify.app/js/sf-sync.js.
//
//   · Sin sesión: no hace nada; todo sigue en el dispositivo (localStorage).
//   · Con sesión: refleja en users/{uid}.sync lo que las apps guardan en
//       sf_progress_v1        minuto de cada título            { id: {s,e,t,d,ts} }
//       sf_watched_v1         episodios vistos                 { id: ["1-3", …] }
//       sf_continue_watching  fila "Continuar viendo" (celular) [ {id,…,timestamp} ]
//       sf_vertical_progress  episodio de cada serie vertical   { id: índice }
//     y trae lo que guardan los otros dispositivos de la cuenta.
//
// Las apps no cambian su forma de guardar: este módulo detecta las escrituras en
// esas claves y avisa con el evento `sf-sync-updated` cuando llegan datos de otro
// dispositivo, para que vuelvan a dibujar "Continuar viendo".
import { getApps } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";

const KEYS = {
  progress: "sf_progress_v1",
  watched: "sf_watched_v1",
  cw: "sf_continue_watching",
  vprogress: "sf_vertical_progress",
};
// Lo que el usuario quitó de "Continuar viendo" ({ id: ts }), para que otro
// dispositivo no lo vuelva a traer.
const REMOVED_KEY = "sf_sync_removed_v1";
const REMOVED_TTL_MS = 60 * 24 * 3600 * 1000;
const FLUSH_DELAY_MS = 60 * 1000; // como mucho una escritura por minuto (plan gratis: 20 000/día)
const MAX_PROGRESS = 100;
const MAX_CW = 20;

let db = null;
let uid = null;
let unsubscribe = null;
let dirty = false;
let flushTimer = null;
let applyingRemote = false;
let lastRemoteJson = "";

// ── lectura/escritura local ──
function readLocal(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}
function writeLocal(key, value) {
  applyingRemote = true;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento */
  } finally {
    applyingRemote = false;
  }
}
function localState() {
  return {
    progress: readLocal(KEYS.progress, {}),
    watched: readLocal(KEYS.watched, {}),
    cw: readLocal(KEYS.cw, []),
    vprogress: readLocal(KEYS.vprogress, {}),
    removed: readLocal(REMOVED_KEY, {}),
  };
}

// ── fusión: gana lo más reciente; los vistos se suman ──
function obj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}
function mergeState(a, b) {
  const now = Date.now();
  const removed = {};
  for (const src of [obj(a.removed), obj(b.removed)]) {
    for (const [k, ts] of Object.entries(src)) {
      const t = Number(ts) || 0;
      if (now - t < REMOVED_TTL_MS && t > (removed[k] || 0)) removed[k] = t;
    }
  }
  const progress = {};
  for (const [id, p] of Object.entries({ ...obj(a.progress) })) progress[id] = p;
  for (const [id, p] of Object.entries(obj(b.progress))) {
    if (!progress[id] || (Number(p && p.ts) || 0) > (Number(progress[id].ts) || 0)) progress[id] = p;
  }
  for (const id of Object.keys(progress)) {
    if (removed[id] && (Number(progress[id] && progress[id].ts) || 0) <= removed[id]) delete progress[id];
  }
  const keep = Object.keys(progress)
    .sort((x, y) => (Number(progress[y].ts) || 0) - (Number(progress[x].ts) || 0))
    .slice(0, MAX_PROGRESS);
  const progressCut = {};
  for (const k of keep) progressCut[k] = progress[k];

  const watched = { ...obj(a.watched) };
  for (const [id, list] of Object.entries(obj(b.watched))) {
    const set = new Set([...(Array.isArray(watched[id]) ? watched[id] : []), ...(Array.isArray(list) ? list : [])]);
    watched[id] = [...set];
  }

  const cwById = new Map();
  for (const it of [...(Array.isArray(a.cw) ? a.cw : []), ...(Array.isArray(b.cw) ? b.cw : [])]) {
    if (!it || it.id == null) continue;
    const prev = cwById.get(String(it.id));
    if (!prev || (Number(it.timestamp) || 0) > (Number(prev.timestamp) || 0)) cwById.set(String(it.id), it);
  }
  for (const [id, it] of [...cwById.entries()]) {
    if (removed[id] && (Number(it.timestamp) || 0) <= removed[id]) cwById.delete(id);
  }
  const cw = [...cwById.values()].sort((x, y) => (Number(y.timestamp) || 0) - (Number(x.timestamp) || 0)).slice(0, MAX_CW);

  const vprogress = { ...obj(a.vprogress) };
  for (const [id, i] of Object.entries(obj(b.vprogress))) {
    vprogress[id] = Math.max(Number(vprogress[id]) || 0, Number(i) || 0);
  }
  return { progress: progressCut, watched, cw, vprogress, removed };
}
const sameJson = (x, y) => JSON.stringify(x) === JSON.stringify(y);

function applyToLocal(state) {
  const before = localState();
  writeLocal(KEYS.progress, state.progress);
  writeLocal(KEYS.watched, state.watched);
  writeLocal(KEYS.cw, state.cw);
  writeLocal(KEYS.vprogress, state.vprogress);
  writeLocal(REMOVED_KEY, state.removed);
  if (!sameJson(before, state)) window.dispatchEvent(new CustomEvent("sf-sync-updated"));
}

// ── subida a la cuenta ──
async function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (!uid || !dirty) return;
  dirty = false;
  const state = localState();
  const json = JSON.stringify(state);
  if (json === lastRemoteJson) return;
  try {
    await updateDoc(doc(db, "users", uid), { sync: { ...state, at: Date.now() } });
    lastRemoteJson = json;
  } catch (err) {
    dirty = true;
    console.warn("[sf-sync] no se pudo guardar en la cuenta", err);
  }
}
function scheduleFlush() {
  dirty = true;
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
}

// Detecta cuándo las apps guardan algo en las claves sincronizadas.
const watchedKeys = new Set(Object.values(KEYS));
const origSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function (key, value) {
  origSetItem.call(this, key, value);
  if (this === window.localStorage && watchedKeys.has(key) && !applyingRemote && uid) scheduleFlush();
};
const origRemoveItem = Storage.prototype.removeItem;
Storage.prototype.removeItem = function (key) {
  origRemoveItem.call(this, key);
  if (this === window.localStorage && watchedKeys.has(key) && !applyingRemote && uid) scheduleFlush();
};

/**
 * El usuario quitó un título de "Continuar viendo": se anota con la hora para que
 * los otros dispositivos también lo quiten (y no lo vuelvan a traer al fusionar).
 * Las apps lo llaman con window.sfMarkRemoved(id) además de borrarlo en local.
 */
export function markRemoved(id) {
  if (id == null) return;
  const removed = readLocal(REMOVED_KEY, {});
  removed[String(id)] = Date.now();
  writeLocal(REMOVED_KEY, removed);
  if (uid) scheduleFlush();
}
window.sfMarkRemoved = markRemoved;

// Al salir o minimizar: guardar ya lo pendiente.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) flush();
});
window.addEventListener("pagehide", () => flush());

// ── sesión ──
// users/{uid} completo (Mi lista, nombre…) para quien lo necesite, sin otra lectura.
let lastUserDoc = null;
function emitUserDoc(data) {
  lastUserDoc = data;
  window.dispatchEvent(new CustomEvent("sf-user-doc", { detail: data }));
}
/** Último users/{uid} recibido (null sin sesión). */
export function getUserDoc() {
  return lastUserDoc;
}

async function onUser(user) {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  await flush();
  uid = user ? user.uid : null;
  lastRemoteJson = "";
  if (!uid) {
    emitUserDoc(null);
    return;
  }

  // 1) Juntar lo del dispositivo con lo de la cuenta.
  try {
    const snap = await getDoc(doc(db, "users", uid));
    emitUserDoc(snap.exists() ? snap.data() : {});
    const remote = obj(snap.exists() ? snap.data().sync : null);
    const local = localState();
    const merged = mergeState(remote, local);
    applyToLocal(merged);
    lastRemoteJson = JSON.stringify(mergeState(remote, {}));
    if (!sameJson(merged, mergeState(remote, {}))) {
      dirty = true;
      flush();
    }
  } catch (err) {
    console.warn("[sf-sync] no se pudo leer la cuenta", err);
  }

  // 2) En vivo: lo que guardan los otros dispositivos.
  unsubscribe = onSnapshot(
    doc(db, "users", uid),
    (snap) => {
      if (snap.metadata.hasPendingWrites) return; // es nuestra propia escritura
      emitUserDoc(snap.exists() ? snap.data() : {});
      const remote = obj(snap.exists() ? snap.data().sync : null);
      const json = JSON.stringify(mergeState(remote, {}));
      if (json === lastRemoteJson) return;
      lastRemoteJson = json;
      applyToLocal(mergeState(remote, localState()));
    },
    (err) => console.warn("[sf-sync] escucha detenida", err),
  );
}

/** Arranca la sincronización (idempotente). */
export function startSync() {
  if (db) return;
  const app = getApps()[0];
  if (!app) {
    console.warn("[sf-sync] Firebase aún no está inicializado");
    return;
  }
  db = getFirestore(app);
  onAuthStateChanged(getAuth(app), (user) => {
    onUser(user);
  });
}

/** Al cerrar sesión en un dispositivo compartido (TV): borrar el historial local. */
export function clearLocalProgress() {
  for (const k of [...Object.values(KEYS), REMOVED_KEY]) {
    try {
      origRemoveItem.call(window.localStorage, k);
    } catch {
      /* sin almacenamiento */
    }
  }
  window.dispatchEvent(new CustomEvent("sf-sync-updated"));
}

export const flushSync = flush;
