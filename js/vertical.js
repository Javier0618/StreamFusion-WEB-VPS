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
  where,
  doc,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";
import { firebaseConfig, ADMIN_EMAIL } from "./config.js";

const COLLECTION = "vertical_content";
// TMDB titles that exploracurioso marked as "Verticales" stay in `content`
// (with is_vertical: true and only "vertical" in their sections).
const TMDB_COLLECTION = "content";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const MAX_ITEMS = 80;
const PROGRESS_KEY = "sf_vertical_progress"; // { [id]: episodeIndex }
// Open layer, so that if Android reloads the app in the background we come back to the same place.
// sessionStorage: survives when Android reloads the page in the background, but is cleared
// when the app is closed from recents (opening it again starts at home).
const STATE_KEY = "sf_vertical_state"; // { layer: "catalog"|"player", id?, at }
const STATE_TTL_MS = 6 * 60 * 60 * 1000;
const AUTONEXT_KEY = "sf_vertical_autonext"; // "0" = desactivado

// Puente postMessage del reproductor de unlimplayer (el mismo que usa script2.js):
//   recibe {sf:"player", event:"ready"|"timeupdate"|"ended"|"next", currentTime, duration}
//   envía  {sf:"config", hasNext, ...}, {sf:"seek", time} y {sf:"play"}
const PLAYER_ORIGIN = "https://unlimplayer.top";
let userStarted = false; // the user already pressed play once: later episodes may start on their own
let autoAdvanced = false; // the current episode came from an automatic jump
let pendingSeek = null; // { index, t } to resume after Android reloaded the app
let lastStateSave = 0;

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Admin (same rule as the main app: the account whose email is ADMIN_EMAIL).
let isAdmin = false;
onAuthStateChanged(getAuth(app), (user) => {
  isAdmin = !!user && user.email === ADMIN_EMAIL;
  catalogEl?.querySelector('[data-act="admin"]')?.toggleAttribute("hidden", !isAdmin);
  loadAccountUnlocks(user);
});

let items = null; // cache del catálogo (lo que ven los usuarios)
let allItems = []; // todo, incluidas ocultas y sin episodios (panel de admin)
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
    if (state) sessionStorage.setItem(STATE_KEY, JSON.stringify({ ...state, at: Date.now() }));
    else sessionStorage.removeItem(STATE_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}
function readState() {
  try {
    const s = JSON.parse(sessionStorage.getItem(STATE_KEY) || "null");
    return s && Date.now() - s.at < STATE_TTL_MS ? s : null;
  } catch {
    return null;
  }
}

function autoNextOn() {
  try {
    return localStorage.getItem(AUTONEXT_KEY) !== "0";
  } catch {
    return true;
  }
}
function setAutoNext(on) {
  try {
    localStorage.setItem(AUTONEXT_KEY, on ? "1" : "0");
  } catch {
    /* almacenamiento no disponible */
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
    const [own, tmdb] = await Promise.all([
      getDocs(query(collection(db, COLLECTION), orderBy("updated_at", "desc"), limit(MAX_ITEMS))),
      // If this query fails (rules, network) the catalog still shows the series without TMDB.
      getDocs(query(collection(db, TMDB_COLLECTION), where("is_vertical", "==", true), limit(MAX_ITEMS))).catch((err) => {
        console.warn("[vertical] series TMDB no disponibles", err);
        return null;
      }),
    ]);
    const fromTmdb = (tmdb?.docs ?? []).map((d) => {
      const x = d.data();
      return {
        ...x,
        _col: TMDB_COLLECTION,
        _docId: d.id,
        id: `tmdb_${d.id}`, // own key: progress and state do not collide with vertical_content ids
        title: x.title || x.name || "",
        poster_url: x.poster_url || (x.poster_path ? TMDB_IMG + x.poster_path : ""),
        created_at: x.created_at || x.imported_at,
      };
    });
    allItems = [...own.docs.map((d) => ({ ...d.data(), id: d.id, _col: COLLECTION, _docId: d.id })), ...fromTmdb];
    items = allItems.filter((it) => it.is_vertical !== false && !it.hidden && episodesOf(it).length > 0);
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
  // No optional calls (fn?.()) in this file: the obfuscator turns them into plain calls.
  if (typeof adminBack === "function" && adminBack(true)) return;
  if (unlockEl?.classList.contains("open")) {
    pushLayer("player"); // browser Back while the ad plays: stay on it
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
  if (unlockEl?.classList.contains("open")) return true; // the ad cannot be closed with Back
  if (typeof adminBack === "function" && adminBack(false)) return true;
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

/**
 * The main app changes section (Inicio → Películas…) with swipes it listens to on
 * `document`. The gestures inside verticals must not reach it.
 */
function isolateGestures(el) {
  for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
    el.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  }
}

function lockScroll(on) {
  // Not "sfv-lock": that is the episode lock card class and its styles would hit <html>.
  document.documentElement.classList.toggle("sfv-noscroll", on);
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
// Organized like short-drama apps: featured carousel, categories,
// "Seguir viendo", Top, new releases, one row per genre and the full grid.
let catFilter = "all"; // genre chosen in the chips
let catQuery = ""; // search box text
let heroTimer = null;

const tsOf = (v) =>
  !v ? 0 : typeof v.toMillis === "function" ? v.toMillis() : typeof v.seconds === "number" ? v.seconds * 1000 : Date.parse(v) || 0;
const norm = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function ensureCatalog() {
  if (catalogEl) return catalogEl;
  catalogEl = document.createElement("div");
  catalogEl.id = "sfv-catalog";
  isolateGestures(catalogEl);
  catalogEl.innerHTML = `
    <div class="sfv-cat-head">
      <button type="button" class="sfv-icon-btn" data-act="close" aria-label="Cerrar"><i class="fa-solid fa-arrow-left"></i></button>
      <div class="sfv-cat-title">
        <h2>Verticales</h2>
        <p>Dramas cortos · desliza para el siguiente</p>
      </div>
      <button type="button" class="sfv-icon-btn" data-act="admin" aria-label="Gestionar verticales" hidden><i class="fa-solid fa-gear"></i></button>
    </div>
    <div class="sfv-search open">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input type="search" placeholder="Buscar series, géneros…" enterkeyhint="search" autocomplete="off" />
      <button type="button" data-act="search-clear" aria-label="Limpiar"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="sfv-chips" role="tablist"></div>
    <div class="sfv-cat-body"></div>`;
  catalogEl.querySelector('[data-act="close"]').addEventListener("click", () => closeCatalog());
  const adminBtn = catalogEl.querySelector('[data-act="admin"]');
  adminBtn.toggleAttribute("hidden", !isAdmin);
  adminBtn.addEventListener("click", openAdminPanel);
  const search = catalogEl.querySelector(".sfv-search");
  const input = search.querySelector("input");
  input.addEventListener("input", () => {
    catQuery = input.value.trim();
    search.classList.toggle("has-text", !!catQuery);
    if (items) renderCatalog(items);
  });
  // Enter closes the keyboard so the results are visible.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
  });
  search.querySelector('[data-act="search-clear"]').addEventListener("click", () => {
    input.value = catQuery = "";
    search.classList.remove("has-text");
    if (items) renderCatalog(items);
    input.focus();
  });
  // One listener for cards, banners, chips and "Ver todo".
  catalogEl.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-genre], [data-more]");
    if (pick) {
      catFilter = pick.dataset.genre ?? pick.dataset.more;
      if (items) renderCatalog(items);
      catalogEl.querySelector(".sfv-cat-body").scrollTop = 0;
      return;
    }
    const card = e.target.closest("[data-id]");
    if (card && items) {
      const it = items.find((x) => x.id === card.dataset.id);
      if (it) openPlayer(it);
    }
  });
  document.body.appendChild(catalogEl);
  return catalogEl;
}

/** Genres sorted by how many series they have. */
function genreIndex(list) {
  const map = new Map();
  for (const it of list) for (const g of genresOf(it)) map.set(g, [...(map.get(g) || []), it]);
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

function card(it, progress, opts = {}) {
  const eps = episodesOf(it);
  const at = progress[it.id];
  const pct = at != null && eps.length ? Math.round(((at + 1) / eps.length) * 100) : 0;
  const tag = genresOf(it)[0];
  return `
    <button type="button" class="sfv-card${opts.rank ? " ranked" : ""}" data-id="${esc(it.id)}">
      ${opts.rank ? `<span class="sfv-rank">${opts.rank}</span>` : ""}
      <span class="sfv-card-img">
        <img src="${esc(it.poster_url)}" alt="" loading="lazy" />
        <span class="sfv-badge">${eps.length} ep.</span>
        ${opts.isNew ? `<span class="sfv-new">NUEVO</span>` : ""}
        ${pct ? `<span class="sfv-progress"><i style="width:${pct}%"></i></span>` : ""}
      </span>
      <span class="sfv-card-title">${esc(it.title)}</span>
      ${
        opts.continueEp
          ? `<span class="sfv-card-sub">Ep. ${opts.continueEp} de ${eps.length}</span>`
          : tag
            ? `<span class="sfv-card-sub">${esc(tag)}</span>`
            : ""
      }
    </button>`;
}

function row(title, list, progress, opts = {}) {
  if (!list.length) return "";
  return `
    <section class="sfv-row">
      <div class="sfv-row-head">
        <h4>${opts.icon ? `<i class="${opts.icon}"></i> ` : ""}${esc(title)}</h4>
        ${opts.more ? `<button type="button" class="sfv-more" data-more="${esc(opts.more)}">Ver todo <i class="fa-solid fa-chevron-right"></i></button>` : ""}
      </div>
      <div class="sfv-scroller">
        ${list.map((it, i) => card(it, progress, opts.cardOpts ? opts.cardOpts(it, i) : {})).join("")}
      </div>
    </section>`;
}

function heroCarousel(list, progress) {
  const slides = list
    .map((it) => {
      const eps = episodesOf(it);
      const at = progress[it.id];
      const genres = genresOf(it).slice(0, 3);
      const overview = it.overview || "";
      return `
      <article class="sfv-banner" data-id="${esc(it.id)}" style="--bg:url('${esc(it.poster_url)}')">
        <img class="sfv-banner-poster" src="${esc(it.poster_url)}" alt="" loading="lazy" />
        <div class="sfv-banner-info">
          ${genres.length ? `<div class="sfv-tags">${genres.map((g) => `<span>${esc(g)}</span>`).join("")}</div>` : ""}
          <h3>${esc(it.title)}</h3>
          <p>${esc(overview.slice(0, 110))}${overview.length > 110 ? "…" : ""}</p>
          <span class="sfv-play-btn"><i class="fa-solid fa-play"></i> ${
            at != null ? `Continuar ep. ${eps[at]?.number ?? 1}` : `Ver ahora · ${eps.length} ep.`
          }</span>
        </div>
      </article>`;
    })
    .join("");
  const dots =
    list.length > 1 ? `<div class="sfv-dots">${list.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>` : "";
  return `<div class="sfv-hero-wrap"><div class="sfv-banners">${slides}</div>${dots}</div>`;
}

function startHeroAutoplay() {
  clearInterval(heroTimer);
  const track = catalogEl?.querySelector(".sfv-banners");
  const dots = catalogEl?.querySelectorAll(".sfv-dots i");
  if (!track || !dots || dots.length < 2) return;
  const indexNow = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  track.addEventListener("scroll", () => dots.forEach((d, i) => d.classList.toggle("on", i === indexNow())), {
    passive: true,
  });
  heroTimer = setInterval(() => {
    if (!catalogEl.classList.contains("open") || playerEl?.classList.contains("open") || document.hidden) return;
    const next = (indexNow() + 1) % dots.length;
    track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
  }, 5000);
}

function renderChips(genres) {
  const chips = catalogEl.querySelector(".sfv-chips");
  const all = [["all", "Todo"], ...genres.slice(0, 14).map(([g]) => [g, g])];
  chips.innerHTML = all
    .map(
      ([k, label]) =>
        `<button type="button" role="tab" data-genre="${esc(k)}" class="${catFilter === k ? "on" : ""}">${esc(label)}</button>`,
    )
    .join("");
  chips.querySelector(".on")?.scrollIntoView({ inline: "center", block: "nearest" });
}

function renderCatalog(list) {
  const body = catalogEl.querySelector(".sfv-cat-body");
  clearInterval(heroTimer);
  if (!list.length) {
    catalogEl.querySelector(".sfv-chips").innerHTML = "";
    body.innerHTML = `<div class="sfv-empty"><i class="fa-solid fa-clapperboard"></i><p>Aún no hay series verticales.</p></div>`;
    return;
  }
  const progress = readProgress();
  const genres = genreIndex(list);
  if (catFilter !== "all" && !genres.some(([g]) => g === catFilter)) catFilter = "all";
  renderChips(genres);

  const byNew = [...list].sort((a, b) => tsOf(b.created_at || b.updated_at) - tsOf(a.created_at || a.updated_at));
  const newIds = new Set(byNew.filter((it) => Date.now() - tsOf(it.created_at) < 3 * 864e5).map((it) => it.id));

  // Search or category: filtered grid.
  if (catQuery || catFilter !== "all") {
    const q = norm(catQuery);
    const pool = catFilter === "all" ? byNew : genres.find(([g]) => g === catFilter)[1];
    const res = pool.filter((it) => !q || norm(it.title).includes(q) || genresOf(it).some((g) => norm(g).includes(q)));
    body.innerHTML = res.length
      ? `<div class="sfv-row-head"><h4>${catQuery ? `Resultados para «${esc(catQuery)}»` : esc(catFilter)}</h4><span class="sfv-count">${res.length}</span></div>
         <div class="sfv-grid">${res.map((it) => card(it, progress, { isNew: newIds.has(it.id) })).join("")}</div>`
      : `<div class="sfv-empty"><i class="fa-solid fa-magnifying-glass"></i><p>No hay series que coincidan.</p></div>`;
    return;
  }

  const watching = list.filter((it) => progress[it.id] != null);
  const top = [...list]
    .sort(
      (a, b) =>
        (Number(b.vote_average) || 0) - (Number(a.vote_average) || 0) || episodesOf(b).length - episodesOf(a).length,
    )
    .slice(0, 10);
  const genreRows = genres.filter(([, its]) => its.length >= 2).slice(0, 6);

  body.innerHTML = `
    ${heroCarousel([...byNew.filter((it) => it.featured), ...byNew.filter((it) => !it.featured)].slice(0, 5), progress)}
    ${row("Seguir viendo", watching, progress, {
      icon: "fa-solid fa-clock-rotate-left",
      cardOpts: (it) => ({ continueEp: episodesOf(it)[progress[it.id]]?.number }),
    })}
    ${list.length >= 3 ? row("Top 10", top, progress, { icon: "fa-solid fa-fire", cardOpts: (_, i) => ({ rank: i + 1 }) }) : ""}
    ${
      list.length >= 2
        ? row("Nuevos estrenos", byNew.slice(0, 12), progress, {
            icon: "fa-solid fa-bolt",
            cardOpts: (it) => ({ isNew: newIds.has(it.id) }),
          })
        : ""
    }
    ${genreRows.map(([g, its]) => row(g, its.slice(0, 12), progress, { more: g })).join("")}
    <section class="sfv-row">
      <div class="sfv-row-head"><h4><i class="fa-solid fa-table-cells-large"></i> Todas las series</h4><span class="sfv-count">${list.length}</span></div>
      <div class="sfv-grid">${byNew.map((it) => card(it, progress, { isNew: newIds.has(it.id) })).join("")}</div>
    </section>`;
  startHeroAutoplay();
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
  clearInterval(heroTimer);
  lockScroll(false);
  saveState(null);
  if (!fromHistory) popLayer();
}

// ── reproductor vertical ────────────────────────────────────────────────────
function ensurePlayer() {
  if (playerEl) return playerEl;
  playerEl = document.createElement("div");
  playerEl.id = "sfv-player";
  isolateGestures(playerEl);
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
      <button type="button" data-act="auto" aria-label="Pasar solo al siguiente episodio"><i class="fa-solid fa-forward"></i><span>Auto</span></button>
    </div>
    <div class="sfv-toast" aria-live="polite"></div>
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
  const autoBtn = playerEl.querySelector('[data-act="auto"]');
  autoBtn.classList.toggle("on", autoNextOn());
  autoBtn.addEventListener("click", () => {
    const on = !autoNextOn();
    setAutoNext(on);
    autoBtn.classList.toggle("on", on);
    sendConfig();
    toast(on ? "Pase automático activado" : "Pase automático desactivado");
  });
  playerEl.querySelector('[data-act="sheet-close"]').addEventListener("click", closeSheet);
  playerEl.querySelector(".sfv-sheet").addEventListener("click", (e) => {
    if (e.target.classList.contains("sfv-sheet")) closeSheet();
  });
  document.body.appendChild(playerEl);
  return playerEl;
}

let observer = null;
let ignoreObserverUntil = 0;
function openPlayer(item) {
  ensurePlayer();
  const episodes = episodesOf(item);
  const start = Math.min(readProgress()[item.id] ?? 0, episodes.length - 1, unlockedCount(item, episodes.length));
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
    .map(
      (ep, i) =>
        `<button type="button" data-i="${i}" class="${i >= unlockedCount(item, episodes.length) ? "locked" : ""}">${ep.number}<i class="fa-solid fa-lock" aria-hidden="true"></i></button>`,
    )
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
        if (document.hidden || Date.now() < ignoreObserverUntil) continue;
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
    if (j === i && isLocked(i)) {
      if (!frame.querySelector(".sfv-lock")) {
        frame.innerHTML = lockCardHtml(i);
        frame.classList.add("ready");
        frame.querySelector('[data-act="unlock"]').addEventListener("click", openUnlockModal);
      }
    } else if (j === i) {
      if (!frame.querySelector("iframe")) {
        frame.innerHTML = `<div class="sfv-loader"></div><iframe src="${esc(withAdPolicy(ep.url))}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="origin" loading="eager"></iframe>`;
        const iframe = frame.querySelector("iframe");
        iframe.addEventListener("load", () => frame.classList.add("ready"), { once: true });
        watchFrame(frame);
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

// ── anuncios: en Verticales nunca dentro del reproductor ──
// Aquí el anuncio se ve al desbloquear episodios (página de apoyo de UnlimPlayer),
// así que el embed se abre siempre con ?na=1 (sin VAST).
function withAdPolicy(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)unlimplayer\.top$/i.test(u.hostname)) return url;
    u.searchParams.set("na", "1");
    return u.toString();
  } catch {
    return url;
  }
}

// ── desbloqueo: 7 episodios gratis y 10 más por cada anuncio visto ──
// Se guarda en el teléfono (localStorage) y, con sesión iniciada, también en
// la cuenta: users/{uid}.vertical_unlocks = { [serie]: episodios desbloqueados }.
const FREE_EPISODES = 7;
const UNLOCK_STEP = 10;
const ALL_FREE_UP_TO = 10; // series de 10 episodios o menos: enteras gratis
const UNLOCK_KEY = "sf_vertical_unlocks";
const SUPPORT_URL = "https://unlimplayer.top/sf-apoyo.html";
const SUPPORT_ORIGIN = "https://unlimplayer.top";
let uid = null;
let accountUnlocks = {};
let unlockEl = null;

function localUnlocks() {
  try {
    return JSON.parse(localStorage.getItem(UNLOCK_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
function saveLocalUnlocks(map) {
  try {
    localStorage.setItem(UNLOCK_KEY, JSON.stringify(map));
  } catch {
    /* almacenamiento no disponible */
  }
}

/** On login: read the account's unlocks and add the ones earned on this phone before. */
async function loadAccountUnlocks(user) {
  uid = user?.uid ?? null;
  accountUnlocks = {};
  if (!uid) return refreshLocks();
  try {
    const snap = await getDoc(doc(db, "users", uid));
    accountUnlocks = { ...(snap.exists() ? snap.data().vertical_unlocks : null) };
    const updates = {};
    for (const [id, n] of Object.entries(localUnlocks())) {
      if (Number(n) > (Number(accountUnlocks[id]) || 0)) {
        accountUnlocks[id] = Number(n);
        updates[`vertical_unlocks.${id}`] = Number(n);
      }
    }
    if (Object.keys(updates).length) await updateDoc(doc(db, "users", uid), updates);
  } catch (err) {
    console.warn("[vertical] desbloqueos de la cuenta no disponibles", err);
  }
  refreshLocks();
}

/** How many episodes (from the first one) the viewer can watch in this series. */
function unlockedCount(item, total) {
  if (item.free_all || total <= ALL_FREE_UP_TO) return total;
  const n = Math.max(FREE_EPISODES, Number(localUnlocks()[item.id]) || 0, Number(accountUnlocks[item.id]) || 0);
  return Math.min(total, n);
}
function isLocked(i) {
  return !!current && i >= unlockedCount(current.item, current.episodes.length);
}

async function grantUnlock(item, total) {
  const next = Math.min(total, unlockedCount(item, total) + UNLOCK_STEP);
  const loc = localUnlocks();
  loc[item.id] = Math.max(next, Number(loc[item.id]) || 0);
  saveLocalUnlocks(loc);
  if (uid) {
    accountUnlocks[item.id] = next;
    try {
      await updateDoc(doc(db, "users", uid), { [`vertical_unlocks.${item.id}`]: next });
    } catch (err) {
      console.warn("[vertical] no se pudo guardar el desbloqueo en la cuenta", err);
    }
  }
  return next;
}

function lockCardHtml(i) {
  const total = current.episodes.length;
  const from = current.episodes[i]?.number ?? i + 1;
  const toIdx = Math.min(total, unlockedCount(current.item, total) + UNLOCK_STEP) - 1;
  const to = current.episodes[toIdx]?.number ?? toIdx + 1;
  return `
    <div class="sfv-lock">
      <div class="sfv-lock-ico"><i class="fa-solid fa-lock"></i></div>
      <strong>Episodio ${from} bloqueado</strong>
      <p>Mira un anuncio corto y desbloquea los episodios <b>${from}–${to}</b>.</p>
      <button type="button" class="sfv-play-btn" data-act="unlock"><i class="fa-solid fa-play"></i> Ver anuncio y desbloquear</button>
      <small>Así apoyas a StreamFusion ❤</small>
    </div>`;
}

/** Lock icons in the episode list and, if needed, the current slide. */
function refreshLocks() {
  if (!current || !playerEl) return;
  playerEl.querySelectorAll(".sfv-sheet-grid button").forEach((b) => b.classList.toggle("locked", isLocked(Number(b.dataset.i))));
  const i = current.index;
  const frame = activeFrame();
  if (!frame) return;
  const locked = isLocked(i);
  const showsLock = !!frame.querySelector(".sfv-lock");
  if (locked !== showsLock) {
    current.index = -1; // force activate() to rebuild the slide
    activate(i);
  }
}

function openUnlockModal() {
  if (!current) return;
  const item = current.item;
  const total = current.episodes.length;
  if (!unlockEl) {
    unlockEl = document.createElement("div");
    unlockEl.id = "sfv-unlock";
    isolateGestures(unlockEl);
    document.body.appendChild(unlockEl);
  }
  // Full screen and without a close button: the ad page itself shows "Saltar" when allowed.
  unlockEl.innerHTML = `<iframe src="${SUPPORT_URL}" allow="autoplay; encrypted-media" referrerpolicy="origin"></iframe>`;
  unlockEl.classList.add("open");
  const iframe = unlockEl.querySelector("iframe");
  let readySeen = false;
  const loadTimer = setTimeout(() => {
    if (!readySeen) finish("error");
  }, 20000);
  // Nobody gets stuck: if the ad never finishes (frozen video…), unlock anyway.
  const safetyTimer = setTimeout(() => finish("nofill"), 90000);

  async function finish(result) {
    if (!unlockEl.classList.contains("open")) return;
    clearTimeout(loadTimer);
    clearTimeout(safetyTimer);
    window.removeEventListener("message", onMsg);
    closeUnlockModal();
    if (result === "error") {
      toast("No se pudo cargar el anuncio. Revisa tu conexión.");
      return;
    }
    const before = unlockedCount(item, total);
    const next = await grantUnlock(item, total);
    const a = current?.episodes[before]?.number ?? before + 1;
    const b = current?.episodes[next - 1]?.number ?? next;
    toast(result === "nofill" ? `Hoy va por nuestra cuenta 🎁 Episodios ${a}–${b}` : `🔓 Episodios ${a}–${b} desbloqueados. ¡Gracias!`);
    refreshLocks();
  }
  function onMsg(ev) {
    if (ev.origin !== SUPPORT_ORIGIN || ev.source !== iframe.contentWindow) return;
    const d = ev.data;
    if (!d || d.sf !== "support") return;
    if (d.event === "ready") readySeen = true;
    else if (d.event === "done") finish("done");
    else if (d.event === "nofill") finish("nofill");
  }
  window.addEventListener("message", onMsg);
}

function closeUnlockModal() {
  if (!unlockEl?.classList.contains("open")) return false;
  unlockEl.classList.remove("open");
  unlockEl.innerHTML = ""; // detiene el anuncio
  return true;
}

// ── aviso propio si el vídeo no carga (en vez de "Página web no disponible") ──
const FRAME_TIMEOUT = 15000;
let frameTimer = null;
let frameReady = false;
// UnlimPlayer says "ready" even when the video then fails ("Server error!"):
// only timeupdate progress proves it is really playing.
let lastProgressAt = 0;
const isPlaying = () => Date.now() - lastProgressAt < 5000;

function showFrameError(frame, offline) {
  if (!frame || frame.querySelector(".sfv-error")) return;
  const box = document.createElement("div");
  box.className = "sfv-error";
  box.innerHTML = offline
    ? `<i class="fa-solid fa-wifi"></i><strong>Sin conexión a internet</strong><p>El episodio seguirá cuando vuelva la red.</p><button type="button">Reintentar</button>`
    : `<i class="fa-solid fa-circle-exclamation"></i><strong>No se pudo cargar el episodio</strong><p>Prueba de nuevo o pasa al siguiente.</p><button type="button">Reintentar</button>`;
  box.querySelector("button").addEventListener("click", () => {
    const iframe = frame.querySelector("iframe");
    if (!iframe) return;
    const src = iframe.src;
    frame.classList.remove("ready");
    iframe.src = "about:blank";
    setTimeout(() => {
      iframe.src = src;
      iframe.addEventListener("load", () => frame.classList.add("ready"), { once: true });
      watchFrame(frame);
    }, 50);
  });
  frame.appendChild(box);
}

function watchFrame(frame) {
  clearTimeout(frameTimer);
  frameReady = false;
  frame.querySelector(".sfv-error")?.remove();
  if (!navigator.onLine) return showFrameError(frame, true);
  frameTimer = setTimeout(() => {
    if (!frameReady && frame.isConnected && frame.querySelector("iframe")) showFrameError(frame, !navigator.onLine);
  }, FRAME_TIMEOUT);
}

function activeFrame() {
  return playerEl?.querySelector(`.sfv-slide[data-i="${current?.index}"] .sfv-frame`) || null;
}

window.addEventListener("offline", () => {
  const f = activeFrame();
  if (f && !isPlaying()) showFrameError(f, true);
});
window.addEventListener("online", () => setTimeout(onBackOnline, 1500)); // let DNS/route settle first
function onBackOnline() {
  const f = activeFrame();
  if (!f?.querySelector("iframe")) return;
  // Back online: reload the episode unless it was really playing (otherwise it
  // stays on "Página web no disponible" / "Server error!").
  if (!f.querySelector(".sfv-error") && !isPlaying()) showFrameError(f, true);
  f.querySelector(".sfv-error button")?.click();
}

// ── puente con el reproductor ──
function activeIframe() {
  return playerEl?.querySelector(`.sfv-slide[data-i="${current?.index}"] iframe`) || null;
}
function post(msg) {
  const iframe = activeIframe();
  if (!iframe?.contentWindow) return;
  try {
    iframe.contentWindow.postMessage(msg, new URL(iframe.src).origin);
  } catch {
    /* iframe de otro reproductor o aún sin cargar */
  }
}
function sendConfig() {
  if (!current) return;
  post({
    sf: "config",
    hasNext: autoNextOn() && current.index < current.episodes.length - 1,
    showBeforeEnd: 0, // episodios cortos: sin aviso, cambia al terminar
    countdown: 3,
    autoSkipIntro: false,
  });
}

let toastTimer = null;
function toast(text) {
  const el = playerEl?.querySelector(".sfv-toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

function goNextAuto() {
  if (!current || !autoNextOn()) return;
  const next = current.index + 1;
  if (next >= current.episodes.length) {
    toast("Fin de la serie");
    return;
  }
  autoAdvanced = true;
  toast(`Episodio ${current.episodes[next].number}`);
  goTo(next);
}

window.addEventListener("message", (ev) => {
  if (ev.origin !== PLAYER_ORIGIN || !current) return;
  const iframe = activeIframe();
  if (!iframe || ev.source !== iframe.contentWindow) return;
  const d = ev.data;
  if (!d || typeof d !== "object" || d.sf !== "player") return;
  // The player answered: it loaded fine.
  frameReady = true;
  clearTimeout(frameTimer);
  activeFrame()?.querySelector(".sfv-error")?.remove();
  const t = Number(d.currentTime);

  if (d.event === "ready") {
    sendConfig();
    if (pendingSeek && pendingSeek.index === current.index && pendingSeek.t > 3) {
      post({ sf: "seek", time: pendingSeek.t });
    }
    pendingSeek = null;
    // After an automatic jump (or once the user already started watching) play without another tap.
    if (autoAdvanced || userStarted) post({ sf: "play" });
    autoAdvanced = false;
  } else if (d.event === "timeupdate" && Number.isFinite(t)) {
    if (t > 0) {
      userStarted = true;
      lastProgressAt = Date.now();
    }
    if (Date.now() - lastStateSave > 5000) {
      lastStateSave = Date.now();
      saveState({ layer: "player", id: current.item.id, t: Math.floor(t) });
    }
  } else if (d.event === "ended" || d.event === "next") {
    goNextAuto();
  }
});

function goTo(i, smooth = true) {
  if (!current || i < 0 || i >= current.episodes.length) return;
  const slide = playerEl.querySelector(`.sfv-slide[data-i="${i}"]`);
  slide?.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "start" });
  if (!smooth) {
    activate(i);
    return;
  }
  // Some WebViews drop the smooth scroll (or never fire the observer): jump directly.
  setTimeout(() => {
    if (current && current.index !== i) {
      snapToCurrent(i);
      activate(i);
    }
  }, 1000);
}

/** Place the feed exactly on slide i (no animation). */
function snapToCurrent(i = current?.index) {
  const feed = playerEl?.querySelector(".sfv-feed");
  const slide = playerEl?.querySelector(`.sfv-slide[data-i="${i}"]`);
  if (feed && slide) feed.scrollTop = slide.offsetTop;
}

// When coming back from the background the scroll position may have been lost: without
// this, the observer would see the first slide and jump back to episode 1.
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !current || !playerEl?.classList.contains("open")) return;
  ignoreObserverUntil = Date.now() + 800;
  snapToCurrent();
});

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
  autoAdvanced = false;
  pendingSeek = null;
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

// ── panel de administración (vertical-admin.js, solo se descarga para el admin) ──
let adminBack = null; // (fromHistory) => true si cerró una capa del panel

async function openAdminPanel() {
  if (!isAdmin) return;
  try {
    const mod = await import("./vertical-admin.js");
    mod.openAdmin({
      db,
      esc,
      episodesOf,
      genresOf,
      isolateGestures,
      pushLayer,
      popLayer,
      setBackHandler: (fn) => (adminBack = fn),
      getAll: async () => {
        await loadItems();
        return allItems;
      },
      // Tras guardar o borrar: recargar desde Firestore y repintar el catálogo.
      reload: async () => {
        items = null;
        await loadItems();
        if (catalogEl?.classList.contains("open")) renderCatalog(items);
        if (items.length) mountFab();
        return allItems;
      },
      play: (it) => openPlayer(it),
    });
  } catch (err) {
    console.error("[vertical] no se pudo abrir el panel", err);
    alert("No se pudo abrir el panel de verticales.");
  }
}

// ── arranque: el botón solo aparece si hay contenido vertical ──────────────
async function init() {
  try {
    localStorage.removeItem(STATE_KEY); // older versions kept it here
  } catch {
    /* storage unavailable */
  }
  try {
    const list = await loadItems();
    if (list.length) mountFab();
    // Android reloaded the app while it was minimized: go back to where the user was.
    const state = readState();
    if (state && list.length) {
      await openCatalog();
      const item = state.layer === "player" && list.find((x) => x.id === state.id);
      if (item) {
        const index = readProgress()[item.id];
        if (index != null && state.t) pendingSeek = { index, t: state.t };
        openPlayer(item);
      }
    }
  } catch (err) {
    console.warn("[vertical] catálogo no disponible", err);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

// Para abrirlo desde otros botones/menús: window.sfOpenVertical()
window.sfOpenVertical = openCatalog;
