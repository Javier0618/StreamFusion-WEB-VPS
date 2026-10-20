// ─── Series verticales ──────────────────────────────────────────────────────
// Módulo independiente: botón flotante + catálogo + reproductor deslizable de
// las series publicadas desde exploracurioso en la colección `vertical_content`.
// Se sube junto a config.js (sfusion.netlify.app/js/vertical.js) y no toca
// script3.js: comparte la misma app de Firebase si ya está inicializada.
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const COLLECTION = "vertical_content";
const MAX_ITEMS = 80;
const PROGRESS_KEY = "sf_vertical_progress"; // { [id]: episodeIndex }
// Open layer, so that if Android reloads the app in the background we come back to the same place.
const STATE_KEY = "sf_vertical_state"; // { layer: "catalog"|"player", id?, at }
const STATE_TTL_MS = 6 * 60 * 60 * 1000;

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

let items = null; // cache del catálogo
let loading = null;
let catalogEl = null;
let playerEl = null;
let current = null; // { item, episodes, index }

// ── utilidades ──────────────────────────────────────────────────────────────
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
function saveProgress(id, index) {
  try {
    const p = readProgress();
    p[id] = index;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* almacenamiento no disponible */
  }
}

function saveState(state) {
  try {
    if (state) localStorage.setItem(STATE_KEY, JSON.stringify({ ...state, at: Date.now() }));
    else localStorage.removeItem(STATE_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}
function readState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    return s && Date.now() - s.at < STATE_TTL_MS ? s : null;
  } catch {
    return null;
  }
}

function genresOf(item) {
  const g = Array.isArray(item.genres) ? item.genres : item.genres ? [item.genres] : [];
  return g
    .flatMap((x) => String(x).split(","))
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Aplana temporadas → lista ordenada de episodios con enlace. */
function episodesOf(item) {
  if (item.media_type === "movie" || !item.seasons) {
    return item.video_url ? [{ season: 1, number: 1, name: item.title, url: item.video_url }] : [];
  }
  const out = [];
  const seasons = Object.values(item.seasons).sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0));
  for (const s of seasons) {
    const eps = Object.entries(s.episodes || {})
      .map(([k, ep]) => ({
        season: Number(s.season_number) || 1,
        number: Number(ep.episode_number ?? k) || 0,
        name: ep.name || "",
        url: typeof ep.video_url === "string" ? ep.video_url.trim() : "",
      }))
      .filter((ep) => ep.url && ep.number > 0)
      .sort((a, b) => a.number - b.number);
    out.push(...eps);
  }
  return out;
}

async function loadItems() {
  if (items) return items;
  if (loading) return loading;
  loading = (async () => {
    const snap = await getDocs(query(collection(db, COLLECTION), orderBy("updated_at", "desc"), limit(MAX_ITEMS)));
    items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((it) => it.is_vertical !== false && episodesOf(it).length > 0);
    return items;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

// Botón atrás del navegador: cierra la capa abierta en vez de salir.
// Each open layer pushes a history entry; closing it from a button removes it
// with history.back(), and that popstate must not close the layer below.
let historyDepth = 0;
let selfPops = 0;
function pushLayer(name) {
  history.pushState({ sfVertical: name }, "");
  historyDepth++;
}
function popLayer() {
  if (historyDepth <= 0) return;
  selfPops++;
  history.back();
}
window.addEventListener("popstate", () => {
  if (historyDepth <= 0) return;
  historyDepth--;
  if (selfPops > 0) {
    selfPops--;
    return;
  }
  if (playerEl?.querySelector(".sfv-sheet.open")) {
    closeSheet();
    pushLayer("player"); // the sheet has no entry of its own: keep the player's
  } else if (playerEl?.classList.contains("open")) closePlayer(true);
  else if (catalogEl?.classList.contains("open")) closeCatalog(true);
});

/**
 * Botón atrás nativo de Android (MainActivity llama a esto antes de cerrar la app).
 * Devuelve true si cerró algo de la sección vertical.
 */
function handleBack() {
  if (playerEl?.querySelector(".sfv-sheet.open")) {
    closeSheet();
    return true;
  }
  if (playerEl?.classList.contains("open")) {
    closePlayer();
    return true;
  }
  if (catalogEl?.classList.contains("open")) {
    closeCatalog();
    return true;
  }
  return false;
}
const previousBackHandler = window.sfHandleBack;
window.sfHandleBack = () => handleBack() || (typeof previousBackHandler === "function" && previousBackHandler()) || false;

function lockScroll(on) {
  document.documentElement.classList.toggle("sfv-lock", on);
}

// ── botón flotante ──────────────────────────────────────────────────────────
function mountFab() {
  if (document.getElementById("sfv-fab")) return;
  const fab = document.createElement("button");
  fab.id = "sfv-fab";
  fab.type = "button";
  fab.setAttribute("aria-label", "Series verticales");
  fab.innerHTML = `<span class="sfv-fab-ring"></span><i class="fa-solid fa-mobile-screen-button"></i><span class="sfv-fab-label">Verticales</span>`;
  fab.addEventListener("click", openCatalog);
  document.body.appendChild(fab);
  requestAnimationFrame(() => fab.classList.add("show"));
}

// ── catálogo ────────────────────────────────────────────────────────────────
function ensureCatalog() {
  if (catalogEl) return catalogEl;
  catalogEl = document.createElement("div");
  catalogEl.id = "sfv-catalog";
  catalogEl.innerHTML = `
    <div class="sfv-cat-head">
      <button type="button" class="sfv-icon-btn" data-act="close" aria-label="Cerrar"><i class="fa-solid fa-arrow-left"></i></button>
      <div class="sfv-cat-title">
        <h2>Series verticales</h2>
        <p>Capítulos cortos · desliza para ver el siguiente</p>
      </div>
    </div>
    <div class="sfv-cat-body"></div>`;
  catalogEl.querySelector('[data-act="close"]').addEventListener("click", () => closeCatalog());
  document.body.appendChild(catalogEl);
  return catalogEl;
}

function renderCatalog(list) {
  const body = catalogEl.querySelector(".sfv-cat-body");
  if (!list.length) {
    body.innerHTML = `<div class="sfv-empty"><i class="fa-solid fa-clapperboard"></i><p>Aún no hay series verticales.</p></div>`;
    return;
  }
  const progress = readProgress();
  const [hero, ...rest] = list;
  const heroEps = episodesOf(hero);
  const heroAt = progress[hero.id];
  body.innerHTML = `
    <article class="sfv-hero" data-id="${esc(hero.id)}" style="--bg:url('${esc(hero.poster_url)}')">
      <img src="${esc(hero.poster_url)}" alt="" loading="lazy" />
      <div class="sfv-hero-info">
        <span class="sfv-chip">Nuevo</span>
        <h3>${esc(hero.title)}</h3>
        <p>${esc((hero.overview || "").slice(0, 140))}${(hero.overview || "").length > 140 ? "…" : ""}</p>
        <div class="sfv-meta">${heroEps.length} episodios${hero.language ? ` · ${esc(hero.language)}` : ""}</div>
        <button type="button" class="sfv-play-btn"><i class="fa-solid fa-play"></i> ${
          heroAt != null ? `Continuar ep. ${heroEps[heroAt]?.number ?? 1}` : "Ver ahora"
        }</button>
      </div>
    </article>
    ${rest.length ? `<h4 class="sfv-row-title">Más series</h4>` : ""}
    <div class="sfv-grid">
      ${rest
        .map((it) => {
          const eps = episodesOf(it);
          const at = progress[it.id];
          const pct = at != null && eps.length ? Math.round(((at + 1) / eps.length) * 100) : 0;
          return `
          <button type="button" class="sfv-card" data-id="${esc(it.id)}">
            <img src="${esc(it.poster_url)}" alt="" loading="lazy" />
            <span class="sfv-badge">${eps.length} ep.</span>
            ${pct ? `<span class="sfv-progress"><i style="width:${pct}%"></i></span>` : ""}
            <span class="sfv-card-title">${esc(it.title)}</span>
          </button>`;
        })
        .join("")}
    </div>`;
  body.querySelectorAll("[data-id]").forEach((el) =>
    el.addEventListener("click", () => {
      const it = list.find((x) => x.id === el.dataset.id);
      if (it) openPlayer(it);
    }),
  );
}

async function openCatalog() {
  ensureCatalog();
  const body = catalogEl.querySelector(".sfv-cat-body");
  body.innerHTML = `<div class="sfv-grid">${'<div class="sfv-card sfv-skel"></div>'.repeat(6)}</div>`;
  catalogEl.classList.add("open");
  lockScroll(true);
  pushLayer("catalog");
  if (!playerEl?.classList.contains("open")) saveState({ layer: "catalog" });
  try {
    renderCatalog(await loadItems());
  } catch (err) {
    console.error("[vertical] no se pudo cargar el catálogo", err);
    body.innerHTML = `<div class="sfv-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>No se pudo cargar. Revisa tu conexión.</p><button type="button" class="sfv-play-btn">Reintentar</button></div>`;
    body.querySelector("button").addEventListener("click", () => {
      items = null;
      closeCatalog(true);
      historyDepth = Math.max(0, historyDepth - 1);
      openCatalog();
    });
  }
}

function closeCatalog(fromHistory = false) {
  if (!catalogEl?.classList.contains("open")) return;
  catalogEl.classList.remove("open");
  lockScroll(false);
  saveState(null);
  if (!fromHistory) popLayer();
}

// ── reproductor vertical ────────────────────────────────────────────────────
function ensurePlayer() {
  if (playerEl) return playerEl;
  playerEl = document.createElement("div");
  playerEl.id = "sfv-player";
  playerEl.innerHTML = `
    <div class="sfv-feed"></div>
    <div class="sfv-top">
      <button type="button" class="sfv-icon-btn" data-act="close" aria-label="Cerrar"><i class="fa-solid fa-chevron-down"></i></button>
      <div class="sfv-top-title"><strong></strong><span></span></div>
    </div>
    <div class="sfv-side">
      <button type="button" data-act="prev" aria-label="Anterior"><i class="fa-solid fa-chevron-up"></i></button>
      <button type="button" data-act="list" aria-label="Episodios"><i class="fa-solid fa-list-ol"></i><span>Eps</span></button>
      <button type="button" data-act="next" aria-label="Siguiente"><i class="fa-solid fa-chevron-down"></i></button>
    </div>
    <div class="sfv-sheet" aria-hidden="true">
      <div class="sfv-sheet-panel">
        <div class="sfv-sheet-head"><strong>Episodios</strong><button type="button" class="sfv-icon-btn" data-act="sheet-close" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="sfv-sheet-grid"></div>
      </div>
    </div>`;
  playerEl.querySelector('[data-act="close"]').addEventListener("click", () => closePlayer());
  playerEl.querySelector('[data-act="prev"]').addEventListener("click", () => goTo(current.index - 1));
  playerEl.querySelector('[data-act="next"]').addEventListener("click", () => goTo(current.index + 1));
  playerEl.querySelector('[data-act="list"]').addEventListener("click", openSheet);
  playerEl.querySelector('[data-act="sheet-close"]').addEventListener("click", closeSheet);
  playerEl.querySelector(".sfv-sheet").addEventListener("click", (e) => {
    if (e.target.classList.contains("sfv-sheet")) closeSheet();
  });
  document.body.appendChild(playerEl);
  return playerEl;
}

let observer = null;
function openPlayer(item) {
  ensurePlayer();
  const episodes = episodesOf(item);
  const start = Math.min(readProgress()[item.id] ?? 0, episodes.length - 1);
  current = { item, episodes, index: -1 };

  playerEl.querySelector(".sfv-top-title strong").textContent = item.title || "";
  const feed = playerEl.querySelector(".sfv-feed");
  feed.innerHTML = episodes
    .map(
      (ep, i) => `
      <section class="sfv-slide" data-i="${i}" style="--bg:url('${esc(item.poster_url)}')">
        <div class="sfv-frame"></div>
        <div class="sfv-slide-info">
          <span class="sfv-chip">Episodio ${ep.number}</span>
          <h3>${esc(item.title)}</h3>
          ${i === 0 && item.overview ? `<p>${esc(item.overview.slice(0, 160))}${item.overview.length > 160 ? "…" : ""}</p>` : ""}
        </div>
        ${i < episodes.length - 1 ? `<div class="sfv-hint"><i class="fa-solid fa-angles-up"></i> Desliza para el episodio ${episodes[i + 1].number}</div>` : `<div class="sfv-hint end">Último episodio</div>`}
      </section>`,
    )
    .join("");

  playerEl.querySelector(".sfv-sheet-grid").innerHTML = episodes
    .map((ep, i) => `<button type="button" data-i="${i}">${ep.number}</button>`)
    .join("");
  playerEl.querySelectorAll(".sfv-sheet-grid button").forEach((b) =>
    b.addEventListener("click", () => {
      closeSheet();
      goTo(Number(b.dataset.i), false);
    }),
  );

  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) activate(Number(e.target.dataset.i));
      }
    },
    { root: feed, threshold: [0.6] },
  );
  feed.querySelectorAll(".sfv-slide").forEach((s) => observer.observe(s));

  playerEl.classList.add("open");
  lockScroll(true);
  pushLayer("player");
  saveState({ layer: "player", id: item.id });
  feed.scrollTop = 0;
  requestAnimationFrame(() => goTo(start, false));
  if (start === 0) activate(0);
}

/** Carga el iframe solo en el episodio visible (los demás se vacían). */
function activate(i) {
  if (!current || i === current.index || i < 0 || i >= current.episodes.length) return;
  current.index = i;
  const ep = current.episodes[i];
  const slides = playerEl.querySelectorAll(".sfv-slide");
  slides.forEach((s, j) => {
    const frame = s.querySelector(".sfv-frame");
    if (j === i) {
      if (!frame.querySelector("iframe")) {
        frame.innerHTML = `<div class="sfv-loader"></div><iframe src="${esc(ep.url)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="origin" loading="eager"></iframe>`;
        const iframe = frame.querySelector("iframe");
        iframe.addEventListener("load", () => frame.classList.add("ready"), { once: true });
      }
    } else if (Math.abs(j - i) > 0) {
      frame.innerHTML = "";
      frame.classList.remove("ready");
    }
  });
  playerEl.querySelector(".sfv-top-title span").textContent = `Episodio ${ep.number} de ${current.episodes.length}`;
  playerEl.querySelector('[data-act="prev"]').disabled = i === 0;
  playerEl.querySelector('[data-act="next"]').disabled = i === current.episodes.length - 1;
  playerEl.querySelectorAll(".sfv-sheet-grid button").forEach((b) => b.classList.toggle("active", Number(b.dataset.i) === i));
  saveProgress(current.item.id, i);
}

function goTo(i, smooth = true) {
  if (!current || i < 0 || i >= current.episodes.length) return;
  const slide = playerEl.querySelector(`.sfv-slide[data-i="${i}"]`);
  slide?.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "start" });
  if (!smooth) activate(i);
}

function openSheet() {
  const sheet = playerEl.querySelector(".sfv-sheet");
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
  sheet.querySelector("button.active")?.scrollIntoView({ block: "center" });
}
function closeSheet() {
  const sheet = playerEl.querySelector(".sfv-sheet");
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
}

function closePlayer(fromHistory = false) {
  if (!playerEl?.classList.contains("open")) return;
  observer?.disconnect();
  playerEl.querySelector(".sfv-feed").innerHTML = ""; // detiene el vídeo
  closeSheet();
  playerEl.classList.remove("open");
  current = null;
  if (!catalogEl?.classList.contains("open")) {
    lockScroll(false);
    saveState(null);
  } else {
    saveState({ layer: "catalog" });
    if (items) renderCatalog(items); // refresca "Continuar"
  }
  if (!fromHistory) popLayer();
}

// Teclado (escritorio): flechas para cambiar de episodio, Esc para cerrar.
document.addEventListener("keydown", (e) => {
  if (!playerEl?.classList.contains("open")) return;
  if (e.key === "ArrowDown") goTo(current.index + 1);
  else if (e.key === "ArrowUp") goTo(current.index - 1);
  else if (e.key === "Escape") closePlayer();
});

// ── arranque: el botón solo aparece si hay contenido vertical ──────────────
async function init() {
  try {
    const list = await loadItems();
    if (list.length) mountFab();
    // Android reloaded the app while it was minimized: go back to where the user was.
    const state = readState();
    if (state && list.length) {
      await openCatalog();
      const item = state.layer === "player" && list.find((x) => x.id === state.id);
      if (item) openPlayer(item);
    }
  } catch (err) {
    console.warn("[vertical] catálogo no disponible", err);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

// Para abrirlo desde otros botones/menús: window.sfOpenVertical()
window.sfOpenVertical = openCatalog;
