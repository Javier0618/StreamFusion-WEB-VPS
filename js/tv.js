/* ================================================================
   StreamFusion TV  —  interfaz para televisor, manejada con el control
   Mismos datos que la app del celular (Firestore: content y home_sections)
   y las mismas claves de progreso. La lógica sin DOM está en tv-core.js.

   PRUEBA EN EL COMPUTADOR: abre tv.html en Chrome y usa el teclado:
     flechas = navegar · Enter = OK · Escape o Retroceso = Atrás
   ================================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import {
  getFirestore, collection, getDocs, query, orderBy,
} from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";
import { firebaseConfig } from "https://sfusion.netlify.app/js/config.js";
import * as core from "https://sfusion.netlify.app/js/tv-core.js";

// ---------------- Configuración ----------------
const IMG = "https://image.tmdb.org/t/p";
const HERO_COUNT = 6;            // cuántos títulos rotan en el banner principal
const HERO_SECONDS = 8;          // segundos entre cada uno
const GRID_STEP = 24;            // tarjetas que se cargan cada vez en "Ver todo"
const SF_NEXT_BEFORE_END = 50;   // el aviso "Siguiente episodio" aparece cuando faltan estos segundos
const SF_NEXT_COUNTDOWN = 10;    // segundos de cuenta regresiva
const SF_AUTO_SKIP_INTRO = false; // true = salta la intro sola
const SF_AD_SKIP_SELECTOR = "";  // selector CSS del botón "Omitir" de TU anuncio (ej. ".ad-skip")
const SF_HIDE_SELECTORS = "";    // elementos del reproductor a ocultar en TV (ej. el cuadro "Volver a")
const SF_TV_RESUME_SEEK = true;  // reanudar en el minuto guardado (el cuadro "Volver a" no se puede pulsar con el control)

const PROGRESS_KEY = "sf_progress_v1";
const WATCHED_KEY = "sf_watched_v1";

// ---------------- Utilidades ----------------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const readJson = (k) => {
  try {
    const v = JSON.parse(localStorage.getItem(k) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
};
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}
function setLoading(on) { $("#loading").classList.toggle("off", !on); }

// ---------------- Progreso (mismas claves que el celular) ----------------
const getProgress = (id) => readJson(PROGRESS_KEY)[String(id)] || null;
function saveProgress(id, data) {
  const all = readJson(PROGRESS_KEY);
  all[String(id)] = { ...data, ts: Date.now() };
  const keys = Object.keys(all);
  if (keys.length > 100) {
    keys.sort((a, b) => (all[a].ts || 0) - (all[b].ts || 0)).slice(0, keys.length - 100).forEach((k) => delete all[k]);
  }
  writeJson(PROGRESS_KEY, all);
}
function isWatched(id, s, e) {
  const w = readJson(WATCHED_KEY)[String(id)];
  return Array.isArray(w) && w.includes(`${s}-${e}`);
}
function markWatched(id, s, e) {
  const all = readJson(WATCHED_KEY);
  const list = Array.isArray(all[String(id)]) ? all[String(id)] : [];
  if (list.includes(`${s}-${e}`)) return;
  list.push(`${s}-${e}`);
  all[String(id)] = list;
  writeJson(WATCHED_KEY, all);
}

// ---------------- Firebase ----------------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const state = {
  content: [], byId: new Map(), sections: [],
  screen: "browse", section: "inicio",
  baseRows: {}, rows: new Map(),
  heroItems: [], heroIdx: 0, heroTimer: null,
  grid: null, detail: null, stack: [],
  play: null, ui: {}, pendingSeek: null,
};

const isPlayable = (item) =>
  item.media_type === "tv"
    ? core.getValidSeasons(item.seasons).length > 0
    : !!String(item.video_url || "").trim();

async function loadContent() {
  const snap = await getDocs(query(collection(db, "content"), orderBy("imported_at", "desc")));
  state.content = snap.docs.map((d) => d.data()).filter((i) => i && i.id != null && isPlayable(i));
  state.byId = new Map(state.content.map((i) => [String(i.id), i]));
  // Secciones del inicio configuradas en tu panel (si fallan, el inicio sigue funcionando)
  try {
    const sec = await getDocs(query(collection(db, "home_sections"), orderBy("order")));
    state.sections = sec.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn("No se pudieron cargar las secciones del inicio", err); state.sections = []; }
}

// ---------------- Foco y navegación con el control ----------------
// La navegación es por GRUPOS (fila de tarjetas, botones del banner, episodios...). Es más predecible
// y más rápida que calcular distancias entre todos los elementos de la pantalla.
const nav = { focus: null, memo: {}, groups: null, lastRow: null };
const invalidateNav = () => { nav.groups = null; };

function focusables(name = state.screen) {
  const roots = [$(`#screen-${name}`)];
  const bar = $("#nav");
  if (bar && !bar.hidden) roots.push(bar);
  return roots.filter(Boolean).flatMap((r) => [...r.querySelectorAll(".focusable")]).filter((el) => el.getClientRects().length > 0);
}

const live = (els) => els.filter((el) => el.getClientRects().length > 0);
const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
// columnas de una cuadrícula: cuántos elementos comparten la primera línea
function colsOf(els) {
  if (els.length < 2) return 1;
  const top = els[0].offsetTop;
  let n = 0;
  while (n < els.length && els[n].offsetTop === top) n++;
  return Math.max(1, n);
}
function navGroup() {
  return { id: "nav", els: live([...qa("#tabs .focusable"), ...qa("#search-btn")]) };
}
function buildGroups(name) {
  const g = [];
  switch (name) {
    case "browse": {
      g.push(navGroup());
      if (!$("#hero").hidden) g.push({ id: "hero", els: live(qa("#hero .focusable")) });
      qa("#rows .cards").forEach((row, k) => g.push({ id: `row${k}`, els: live(qa(".focusable", row)), row: true }));
      const loose = live(qa("#rows .login-box .focusable"));
      if (loose.length) g.push({ id: "loose", els: loose });
      break;
    }
    case "grid": {
      g.push(navGroup());
      const els = live(qa("#grid .focusable"));
      g.push({ id: "grid", els, cols: colsOf(els) });
      break;
    }
    case "search": {
      const keys = live(qa("#keys .focusable")), keyx = live(qa("#keyx .focusable")), res = live(qa("#search-results .focusable"));
      g.push(navGroup());
      g.push({ id: "keys", els: keys, cols: 6, edge: { right: "results" } });
      g.push({ id: "keyx", els: keyx, edge: { right: "results", down: null } });
      g.push({ id: "results", els: res, cols: colsOf(res), edge: { up: "nav", left: "keys" } });
      break;
    }
    case "detail": {
      g.push({ id: "actions", els: live(qa("#screen-detail .actions .focusable")) });
      g.push({ id: "head", els: live(qa("#screen-detail .dhead .focusable")), row: true }); // pestañas + temporadas en una línea
      const eps = live(qa("#screen-detail .eps .focusable"));
      g.push({ id: "eps", els: eps, cols: colsOf(eps) });
      g.push({ id: "rel", els: live(qa("#screen-detail .cards.rel .focusable")), row: true });
      break;
    }
    default:
      focusables(name).forEach((el, k) => g.push({ id: `f${k}`, els: [el] }));
  }
  return g.filter((x) => x.els.length);
}
const groupsNow = () => nav.groups || (nav.groups = buildGroups(state.screen));

const centerOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right }; };
// El elemento del grupo más alineado con "ref" (por x o por y). En filas solo cuenta lo que se ve en pantalla.
function nearest(els, ref, axis, onlyVisible) {
  const c = centerOf(ref);
  const vw = window.innerWidth || 960;
  let best = null, bd = Infinity;
  for (const el of els) {
    const e = centerOf(el);
    if (onlyVisible && (e.r < 0 || e.l > vw)) continue;
    const d = Math.abs(axis === "y" ? e.y - c.y : e.x - c.x);
    if (d < bd) { bd = d; best = el; }
  }
  return best || els[0];
}

// Mantiene a la vista lo enfocado, moviendo lo mínimo
function ensureVisible(el) {
  try {
    const name = state.screen;
    const row = el.parentNode;
    // fila de tarjetas: desplazamiento horizontal mínimo (queda un asomo de la siguiente tarjeta)
    if (row && row.classList && (row.classList.contains("cards") || row.classList.contains("seasons"))) {
      const pad = parseFloat(getComputedStyle(row).paddingLeft) || 0;
      const left = el.offsetLeft, right = left + el.offsetWidth;
      if (left - row.scrollLeft < pad) row.scrollLeft = Math.max(0, left - pad);
      else if (right - row.scrollLeft > row.clientWidth - pad) row.scrollLeft = right - row.clientWidth + pad;
    }
    const inTop = el.classList.contains("tab") || el.classList.contains("hbtn");
    const vh = window.innerHeight || 540;
    const bar = $("#nav");

    if (name === "browse" || name === "grid") {
      const screen = $(`#screen-${name}`);
      const holder = inTop ? null : el.closest(".row") || el;
      if (inTop) { if (screen.scrollTop !== 0) screen.scrollTop = 0; nav.lastRow = null; }
      else if (holder !== nav.lastRow || name === "grid") {
        nav.lastRow = holder;
        const r = holder.getBoundingClientRect();
        const sr = screen.getBoundingClientRect();
        const top = Math.max(0, screen.scrollTop + (r.top - sr.top) - vh * (name === "grid" ? 0.3 : 0.2));
        screen.scrollTop = top;
        if (bar) bar.classList.toggle("solid", top > 40);
      }
      if (inTop && bar) bar.classList.remove("solid");
    } else if (name === "detail") {
      // La ficha NO se desplaza: solo el cajón de episodios, y lo que sale queda recortado dentro del cajón
      const box = el.closest(".eps");
      if (box) {
        // Se desplaza de a filas completas (nunca queda una fila cortada arriba)
        const cs = getComputedStyle(box);
        const pad = parseFloat(cs.paddingTop) || 0, gap = parseFloat(cs.rowGap) || 0;
        const pitch = el.offsetHeight + gap;
        const top = el.offsetTop, bottom = top + el.offsetHeight;
        if (top - box.scrollTop < pad) box.scrollTop = Math.max(0, top - pad);
        else if (bottom + pad - box.scrollTop > box.clientHeight) box.scrollTop = Math.ceil((bottom + pad - box.clientHeight) / pitch) * pitch;
        box.classList.toggle("scrolled", box.scrollTop > 2); // difumina el borde superior cuando hay episodios ocultos arriba
      }
    } else if (name === "search") {
      const box = el.closest("#search-results");
      if (box) {
        const r = el.getBoundingClientRect(), br = box.getBoundingClientRect();
        if (r.top < br.top + 8 || r.bottom > br.bottom - 8) box.scrollTop = Math.max(0, box.scrollTop + (r.top - br.top) - 40);
      }
    }
  } catch {}
}

function setFocus(el) {
  if (nav.focus && nav.focus !== el) nav.focus.classList.remove("focused");
  nav.focus = el || null;
  if (!el) return;
  el.classList.add("focused");
  if (el.dataset.key) nav.memo[state.screen] = el.dataset.key;
  ensureVisible(el);
  // Carga progresiva en "Ver todo": al acercarse al final se agregan más tarjetas
  if (state.screen === "grid" && state.grid && el.dataset.kind === "card" &&
      core.shouldLoadMore(Number(el.dataset.idx), state.grid.shown, state.grid.items.length)) appendGrid();
}
function restoreFocus(name) {
  const list = focusables(name);
  let target = null;
  const memo = nav.memo[name];
  if (memo) target = list.find((el) => el.dataset.key === memo);
  if (!target) {
    if (name === "detail") target = list.find((el) => el.dataset.kind === "play") || list[0];
    else if (name === "browse") target = list.find((el) => el.dataset.kind === "hero-play") || list.find((el) => el.dataset.kind === "card") || list[0];
    else if (name === "search") target = list.find((el) => el.dataset.kind === "key") || list[0];
    else target = list.find((el) => el.dataset.kind === "card") || list[0];
  }
  setFocus(target || null);
}

function move(dir) {
  const groups = groupsNow();
  if (!groups.length) return;
  const gi = groups.findIndex((g) => nav.focus && g.els.includes(nav.focus));
  if (gi < 0) { setFocus(groups[0].els[0]); return; }
  const g = groups[gi], els = g.els, n = els.length, i = els.indexOf(nav.focus), cols = g.cols || 0;

  if (dir === "left" || dir === "right") {
    const j = i + (dir === "left" ? -1 : 1);
    const rowEdge = cols ? (dir === "left" ? i % cols === 0 : i % cols === cols - 1) : false;
    if (j >= 0 && j < n && !rowEdge) return setFocus(els[j]);
    // En los extremos NO se pasa a otra fila/carrusel; solo hay salto lateral donde el grupo lo define (teclado ↔ resultados)
    const link = g.edge && g.edge[dir];
    const t = link && groups.find((x) => x.id === link);
    if (t) setFocus(nearest(t.els, nav.focus, "y"));
    return;
  }

  // arriba / abajo
  if (cols > 1 || (cols === 1 && n > 1 && g.id === "grid")) {
    const j = i + (dir === "down" ? cols : -cols);
    if (j >= 0 && j < n) return setFocus(els[j]);
    if (dir === "down" && Math.floor(i / cols) < Math.floor((n - 1) / cols)) return setFocus(els[n - 1]);
  }
  let target = null;
  if (g.edge && dir in g.edge) target = g.edge[dir] ? groups.find((x) => x.id === g.edge[dir]) : null;
  else target = groups[gi + (dir === "down" ? 1 : -1)];
  if (!target) return;
  let cand = target.els;
  if (target.cols > 1) cand = dir === "down" ? cand.slice(0, target.cols) : cand.slice(Math.floor((cand.length - 1) / target.cols) * target.cols);
  setFocus(nearest(cand, nav.focus, "x", !!target.row));
}

function showScreen(name) {
  ["browse", "grid", "search", "detail", "player", "login"].forEach((s) => { $(`#screen-${s}`).hidden = s !== name; });
  state.screen = name;
  // Android TV: mientras se reproduce, la app nativa captura el control y nos lo reenvía (sfNativeKey)
  try { if (window.SFTV) window.SFTV.setPlayer(name === "player"); } catch {}
  $("#nav").hidden = !(name === "browse" || name === "grid" || name === "search");
  $("#nav").classList.toggle("solid", name === "search");
  const sb = $("#search-btn"); if (sb) sb.classList.toggle("sel", name === "search");
  nav.lastRow = null;
  invalidateNav();
  restoreFocus(name);
}

// ---------------- Tarjetas y filas ----------------
function cardHtml(item, rowId, kind, progress, idx) {
  const wide = kind === "wide";
  const img = wide && item.backdrop_path ? `${IMG}/w780${item.backdrop_path}` : item.poster_path ? `${IMG}/w342${item.poster_path}` : "";
  const poster = img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async">` : `<div class="noimg">${esc(item.title)}</div>`;
  const pct = progress ? core.progressPercent(progress) : 0;
  const badge = progress && progress.s && progress.e ? `<span class="badge">T${esc(progress.s)} · E${esc(progress.e)}</span>` : "";
  const bar = pct > 0 ? `<div class="card-prog"><i style="width:${pct}%"></i></div>` : "";
  const extra = idx !== undefined ? ` data-idx="${idx}"` : "";
  return `<div class="card${wide ? " wide" : ""} focusable" data-kind="card" data-id="${esc(item.id)}" data-key="${esc(rowId)}:${esc(item.id)}"${extra}>
      <div class="poster">${poster}${badge}${bar}</div>
      <div class="card-title">${esc(item.title)}</div>
    </div>`;
}
function moreHtml(row) {
  return `<div class="card more${row.kind === "wide" ? " wide" : ""} focusable" data-kind="more" data-row="${esc(row.id)}" data-key="${esc(row.id)}:more">
      <div class="poster"><div class="moretxt">Ver todo<span>›</span></div></div><div class="card-title">&nbsp;</div>
    </div>`;
}
function rowHtml(r) {
  const cards = r.cards.map((c) => cardHtml(c.item, r.id, r.kind, c.progress)).join("");
  return `<section class="row"><h2>${esc(r.title)}</h2><div class="cards">${cards}${r.all ? moreHtml(r) : ""}</div></section>`;
}

// Filas de la sección actual (se calculan una vez por sesión; "Continuar viendo" siempre fresco)
function currentRows() {
  const key = state.section;
  if (!state.baseRows[key]) {
    state.baseRows[key] = key === "inicio"
      ? core.buildHomeRows({ content: state.content, sections: state.sections })
      : core.buildSectionRows({ content: state.content, key });
  }
  const rows = [...state.baseRows[key]];
  if (key === "inicio") {
    const cont = core.buildContinueRow(readJson(PROGRESS_KEY), state.byId);
    if (cont) rows.unshift(cont);
  }
  return rows;
}
function renderRows() {
  const rows = currentRows();
  state.rows = new Map(rows.map((r) => [r.id, r]));
  $("#rows").innerHTML = rows.length
    ? rows.map(rowHtml).join("")
    : `<div class="login-box"><h1>Sin contenido</h1><p>Esta sección todavía no tiene títulos con enlace.</p></div>`;
  nav.lastRow = null;
  invalidateNav();
}

// ---------------- Menú de secciones ----------------
function renderTabs() {
  const has = (k) => k === "inicio" || state.content.some((i) => core.inSection(i, k));
  $("#tabs").innerHTML = core.MAIN_SECTIONS.filter(([k]) => has(k))
    .map(([k, label]) => `<div class="tab focusable${k === state.section ? " sel" : ""}" data-kind="tab" data-section="${k}" data-key="tab:${k}">${esc(label)}</div>`)
    .join("");
  invalidateNav();
}
function selectSection(key) {
  state.section = key;
  renderTabs();
  renderRows();
  setHero(heroCandidates());
  nav.memo.browse = `tab:${key}`;
  const bar = $("#nav");
  if (bar) bar.classList.remove("solid");
  const screen = $("#screen-browse");
  if (screen && typeof screen.scrollTop === "number") screen.scrollTop = 0;
  state.grid = null;
  state.stack = [];
  showScreen("browse"); // (también vuelve desde Buscar o Ver todo)
}

// ---------------- Banner principal (héroe) ----------------
function heroCandidates() {
  const pool = state.section === "inicio" ? state.content : state.content.filter((i) => core.inSection(i, state.section));
  return core.pickHero(pool, HERO_COUNT);
}
const currentHero = () => state.heroItems[state.heroIdx] || null;

function heroShow(i) {
  const items = state.heroItems;
  const hero = $("#hero");
  if (!items.length) { hero.hidden = true; return; }
  hero.hidden = false;
  state.heroIdx = ((i % items.length) + items.length) % items.length;
  const it = items[state.heroIdx];
  const a = $("#hero-bg-a"), b = $("#hero-bg-b");
  const useA = !a.classList.contains("on");
  const on = useA ? a : b, off = useA ? b : a;
  const my = (state.heroSeq = (state.heroSeq || 0) + 1);
  const swap = () => {
    if (my !== state.heroSeq) return; // llegó tarde: ya hay otro título
    on.style.backgroundImage = `url('${IMG}/w1280${esc(it.backdrop_path)}')`;
    on.classList.add("on");
    off.classList.remove("on");
  };
  if (it.backdrop_path) { const im = new Image(); im.onload = swap; im.onerror = swap; im.src = `${IMG}/w1280${it.backdrop_path}`; } else swap();

  const year = String(it.release_date || "").slice(0, 4);
  const rating = Number(it.vote_average) > 0 ? `<b>★ ${Number(it.vote_average).toFixed(1)}</b>` : "";
  const genres = core.genreLabels(it, 3).map(esc).join(" · ");
  $("#hero-kind").textContent = it.media_type === "tv" ? "Serie" : "Película";
  $("#hero-title").textContent = it.title || "";
  $("#hero-meta").innerHTML = [year ? esc(year) : "", rating, genres].filter(Boolean).join(" &nbsp;·&nbsp; ");
  $("#hero-overview").textContent = it.overview || "";
  const t = playTarget(it);
  const pb = $("#hero-play");
  pb.textContent = t ? t.label : "Ver ficha";
  $("#hero-dots").innerHTML = items.map((_, k) => `<i class="${k === state.heroIdx ? "on" : ""}"></i>`).join("");
}
function setHero(items) {
  state.heroItems = items;
  state.heroIdx = 0;
  clearInterval(state.heroTimer);
  heroShow(0);
  if (items.length > 1) {
    state.heroTimer = setInterval(() => {
      const sc = $("#screen-browse");
      if (state.screen === "browse" && sc && sc.scrollTop < 120) heroShow(state.heroIdx + 1); // si no se ve, no se gasta
    }, HERO_SECONDS * 1000);
  }
}

// ---------------- Ver todo: cuadrícula con carga progresiva ----------------
function appendGrid() {
  const g = state.grid;
  if (!g || g.shown >= g.items.length) return;
  const batch = g.items.slice(g.shown, g.shown + GRID_STEP);
  $("#grid").insertAdjacentHTML("beforeend", batch.map((item, k) => cardHtml(item, "grid", "poster", null, g.shown + k)).join(""));
  g.shown += batch.length;
  invalidateNav();
  $("#grid-count").textContent = `${g.shown} de ${g.items.length}`;
}
function openGrid(rowId) {
  const r = state.rows.get(rowId);
  if (!r || !r.all) return;
  state.stack.push(state.screen);
  state.grid = { title: r.title, items: r.all, shown: 0 };
  $("#grid-title").textContent = r.title;
  $("#grid").innerHTML = "";
  nav.memo.grid = null;
  appendGrid();
  showScreen("grid");
}

// ---------------- Buscador ----------------
const KEY_ROWS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890".split("");
let searchTimer = null;
function buildKeys() {
  $("#keys").innerHTML = KEY_ROWS.map((ch) => `<div class="key focusable" data-kind="key" data-ch="${ch}" data-key="key:${ch}">${ch}</div>`).join("");
  $("#keyx").innerHTML =
    `<div class="key wide focusable" data-kind="key-space" data-key="key:space">Espacio</div>` +
    `<div class="key wide focusable" data-kind="key-del" data-key="key:del">Borrar</div>` +
    `<div class="key wide focusable" data-kind="key-clear" data-key="key:clear">Limpiar</div>`;
}
function renderSearch() {
  const sr = state.search || (state.search = { q: "", results: [] });
  $("#search-text").textContent = sr.q;
  const box = $("#search-results");
  box.innerHTML = sr.results.map((item, k) => cardHtml(item, "search", "poster", null, k)).join("");
  box.scrollTop = 0;
  $("#search-hint").textContent = !sr.q.trim() ? "Escribe para buscar películas, series, animes y doramas"
    : sr.results.length ? `${sr.results.length} resultado${sr.results.length === 1 ? "" : "s"}` : `Sin resultados para «${sr.q.trim()}»`;
  invalidateNav();
}
function runSearch() {
  const sr = state.search;
  sr.results = core.searchItems(state.content, sr.q, 60);
  // se actualiza sin tocar el teclado (el foco no se pierde)
  renderSearch();
}
function typeKey(action, ch) {
  const sr = state.search || (state.search = { q: "", results: [] });
  if (action === "char") { if (sr.q.length < 40) sr.q += ch; }
  else if (action === "space") { if (sr.q && !sr.q.endsWith(" ")) sr.q += " "; }
  else if (action === "del") sr.q = sr.q.slice(0, -1);
  else if (action === "clear") sr.q = "";
  $("#search-text").textContent = sr.q;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 160); // espera un momento por si sigues escribiendo
}
function openSearch() {
  if (state.screen === "search") return;
  if (!state.search) state.search = { q: "", results: [] };
  if (!$("#keys").children.length) buildKeys();
  state.stack.push(state.screen);
  renderSearch();
  showScreen("search");
}

// ---------------- Detalle ----------------
function playTarget(item) {
  const prog = getProgress(item.id);
  if (item.media_type !== "tv") {
    if (!String(item.video_url || "").trim()) return null;
    return { label: prog && Number(prog.t) > 10 ? "▶ Continuar" : "▶ Reproducir", season: null, episode: null };
  }
  const seasons = core.getValidSeasons(item.seasons);
  if (!seasons.length) return null;
  if (prog && prog.s && prog.e) {
    const s = seasons.find((x) => Number(x.season_number) === Number(prog.s));
    const ep = s && core.getValidEpisodes(s.episodes).find((e) => e.episode_number === Number(prog.e));
    if (ep) return { label: `▶ Continuar T${prog.s} · E${prog.e}`, season: Number(prog.s), episode: Number(prog.e) };
  }
  const first = core.getValidEpisodes(seasons[0].episodes)[0];
  return { label: `▶ Reproducir T${seasons[0].season_number} · E${first.episode_number}`, season: Number(seasons[0].season_number), episode: first.episode_number };
}

function renderDetail() {
  const d = state.detail;
  const item = d.item;
  const isTv = item.media_type === "tv";
  const seasons = isTv ? core.getValidSeasons(item.seasons) : [];
  const prog = getProgress(item.id);
  if (isTv && !seasons.some((s) => Number(s.season_number) === d.season)) {
    d.season = prog && seasons.some((s) => Number(s.season_number) === Number(prog.s)) ? Number(prog.s) : Number(seasons[0].season_number);
  }
  if (!d.rel) d.rel = core.relatedItems(item, state.content, 20);
  if (!d.tab || (d.tab === "rel" && !d.rel.length)) d.tab = "eps";
  const target = playTarget(item);
  const year = String(item.release_date || "").slice(0, 4);
  const rating = Number(item.vote_average) > 0 ? `<b>★ ${Number(item.vote_average).toFixed(1)}</b>` : "";
  const meta = [year ? esc(year) : "", rating, isTv ? "Serie" : "Película"].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const genres = core.genreLabels(item, 4).map(esc).join(" · ");

  const root = $("#screen-detail");
  root.style.backgroundImage = item.backdrop_path ? `url('${IMG}/w1280${esc(item.backdrop_path)}')` : "none";

  const relCards = `<div class="cards rel">${d.rel.map((r) => cardHtml(r, "rel", "poster")).join("")}</div>`;
  let panel = "";
  if (isTv) {
    const tabs = d.rel.length
      ? `<div class="dtabs"><div class="dtab focusable${d.tab === "eps" ? " sel" : ""}" data-kind="dtab" data-tab="eps" data-key="dtab:eps">Episodios</div>` +
        `<div class="dtab focusable${d.tab === "rel" ? " sel" : ""}" data-kind="dtab" data-tab="rel" data-key="dtab:rel">Contenido relacionado</div></div>`
      : `<div class="dtabs"><div class="dtitle">Episodios</div></div>`;
    const chips = d.tab === "eps" ? `<div class="seasons">${seasons
      .map((s) => `<div class="chip focusable${Number(s.season_number) === d.season ? " sel" : ""}" data-kind="season" data-season="${esc(s.season_number)}" data-key="season:${esc(s.season_number)}">Temporada ${esc(s.season_number)}</div>`)
      .join("")}</div>` : "";
    let body = "";
    if (d.tab === "eps") {
      const cur = seasons.find((s) => Number(s.season_number) === d.season);
      body = `<div class="eps">${core.getValidEpisodes(cur.episodes)
        .map((ep) => {
          const seen = isWatched(item.id, d.season, ep.episode_number);
          const here = prog && Number(prog.s) === d.season && Number(prog.e) === ep.episode_number;
          const pct = here ? core.progressPercent(prog) : 0;
          const img = ep.still_path ? `<img src="${IMG}/w300${esc(ep.still_path)}" alt="" loading="lazy" decoding="async">` : `<span class="noimg">▶</span>`;
          return `<div class="ep focusable" data-kind="episode" data-season="${esc(d.season)}" data-episode="${esc(ep.episode_number)}" data-key="ep:${esc(d.season)}-${esc(ep.episode_number)}">
            <div class="ep-img">${img}${pct > 0 ? `<div class="card-prog"><i style="width:${pct}%"></i></div>` : ""}</div>
            <div class="ep-txt"><div class="n">E${esc(ep.episode_number)}${seen ? '<span class="ok">✓</span>' : ""}</div><div class="t">${esc(ep.name || "")}</div></div>
          </div>`;
        })
        .join("")}</div>`;
    } else body = relCards;
    panel = `<div class="detail-panel"><div class="dhead">${tabs}${chips}</div>${body}</div>`;
  } else if (d.rel.length) {
    panel = `<div class="detail-panel"><div class="dhead"><div class="dtitle">Películas similares</div></div>${relCards}</div>`;
  }

  root.innerHTML = `
    <div class="detail-shade"></div>
    <div class="detail-body">
      <div class="detail-top">
        <div class="detail-poster"><div class="poster">${item.poster_path ? `<img src="${IMG}/w500${esc(item.poster_path)}" alt="">` : `<div class="noimg">${esc(item.title)}</div>`}</div></div>
        <div class="detail-info">
          <h1>${esc(item.title)}</h1>
          <div class="meta">${meta}</div>
          ${genres ? `<div class="genres">${genres}</div>` : ""}
          <p class="overview">${esc(item.overview || "")}</p>
          <div class="actions">
            ${target ? `<button class="btn primary focusable" data-kind="play" data-key="play">${esc(target.label)}</button>` : ""}
            <button class="btn focusable" data-kind="back" data-key="back">Volver</button>
          </div>
        </div>
      </div>
      ${panel}
    </div>`;
  nav.lastRow = null;
  invalidateNav();
}

function openDetail(id) {
  const item = state.byId.get(String(id));
  if (!item) return;
  if (state.screen === "detail" && state.detail) (state.detailHist = state.detailHist || []).push(state.detail); // viene de "relacionado"
  else { state.stack.push(state.screen); state.detailHist = []; }
  state.detail = { item, season: null, tab: "eps" };
  nav.memo.detail = null;
  renderDetail();
  showScreen("detail");
}

function selectSeason(n) {
  state.detail.season = n;
  nav.memo.detail = `season:${n}`;
  renderDetail();
  restoreFocus("detail");
}

// Reproducir directo desde el banner principal (sin pasar por el detalle)
function playFromHero() {
  const it = currentHero();
  if (!it) return;
  const t = playTarget(it);
  if (!t) return openDetail(it.id);
  state.detail = null; // al salir del reproductor se vuelve al Inicio, no a la ficha
  startPlayback(it, t.season, t.episode);
}

function playFromDetail() {
  const t = playTarget(state.detail.item);
  if (t) startPlayback(state.detail.item, t.season, t.episode);
}

// ---------------- Reproductor ----------------
function startPlayback(item, season, episode) {
  const isTv = item.media_type === "tv";
  let url = "", ep = null;
  if (isTv) {
    const s = core.getValidSeasons(item.seasons).find((x) => Number(x.season_number) === season);
    ep = s ? core.getValidEpisodes(s.episodes).find((e) => e.episode_number === episode) : null;
    url = ep ? ep.video_url : "";
  } else {
    url = String(item.video_url || "").trim();
  }
  if (!url) { toast("Este contenido aún no tiene enlace de video"); return; }

  const prev = getProgress(item.id);
  const same = !!prev && (isTv ? Number(prev.s) === season && Number(prev.e) === episode : true);
  const finished = !!prev && Number(prev.d) > 0 && Number(prev.t) / Number(prev.d) >= 0.95;
  state.play = { id: String(item.id), item, type: item.media_type, season: isTv ? season : null, episode: isTv ? episode : null, ep };
  state.ui = {};
  state.pendingSeek = SF_TV_RESUME_SEEK && same && Number(prev.t) > 10 && !finished ? { time: Number(prev.t) } : null;

  if (isTv) markWatched(item.id, season, episode);
  saveProgress(item.id, { s: isTv ? season : null, e: isTv ? episode : null, t: same ? Number(prev.t) || 0 : 0, d: same ? Number(prev.d) || 0 : 0 });

  showScreen("player");
  $("#tv-player").src = url;
  try { window.focus(); } catch {}
}

function closePlayer() {
  $("#tv-player").src = "about:blank";
  state.play = null;
  state.ui = {};
  state.pendingSeek = null;
  if (state.detail) { renderDetail(); showScreen("detail"); }
  else showScreen("browse");
}

function neighbor(dir) {
  const p = state.play;
  if (!p || p.type !== "tv") return null;
  return dir > 0 ? core.findNextEpisode(p.item.seasons, p.season, p.episode) : core.findPrevEpisode(p.item.seasons, p.season, p.episode);
}
function goNext() { const n = neighbor(1); if (n) startPlayback(state.play.item, n.season, n.episode); }
function goPrev() { const n = neighbor(-1); if (n) startPlayback(state.play.item, n.season, n.episode); }

function postToPlayer(msg) {
  const f = $("#tv-player");
  try { f.contentWindow.postMessage(msg, new URL(f.src).origin); } catch {}
}

function sendConfig() {
  const p = state.play;
  const next = neighbor(1);
  const marks = p.type === "tv" ? core.getEpisodeMarks(p.ep) : { introStart: null, introEnd: null, creditsStart: null };
  postToPlayer({
    sf: "config", tvMode: true, hasNext: !!next,
    showBeforeEnd: SF_NEXT_BEFORE_END, countdown: SF_NEXT_COUNTDOWN, autoSkipIntro: SF_AUTO_SKIP_INTRO,
    adSkipSelector: SF_AD_SKIP_SELECTOR, hideSelectors: SF_HIDE_SELECTORS, ...marks,
  });
}

function applyPendingSeek() {
  if (!state.pendingSeek) return;
  postToPlayer({ sf: "seek", time: state.pendingSeek.time });
  state.pendingSeek = null;
}

// Franja de diagnóstico (arriba a la izquierda, solo en el reproductor). Ponla en false cuando todo funcione.
const SF_DEBUG = false;
const dbgState = { key: "-", src: "-", bridge: "sin señal del reproductor", cmd: "-" };
function dbgRender() {
  if (!SF_DEBUG) return;
  let el = document.getElementById("tv-debug");
  if (!el) {
    el = document.createElement("div");
    el.id = "tv-debug";
    el.style.cssText = "position:fixed;left:8px;top:8px;z-index:2147483647;background:rgba(0,0,0,.75);color:#7CFC9A;" +
      "font:14px/1.4 monospace;padding:6px 10px;border-radius:6px;pointer-events:none;max-width:60vw";
    document.body.appendChild(el);
  }
  el.hidden = state.screen !== "player";
  el.textContent = `tecla: ${dbgState.key} (${dbgState.src}) | puente: ${dbgState.bridge} | orden: ${dbgState.cmd}`;
}
setInterval(dbgRender, 500);

// Qué hace cada botón del control con el reproductor en pantalla
const accel = core.createSeekAccel();
function onPlayerAction(action) {
  if (!action || !state.play) return;
  const step = action === "left" || action === "right" ? accel(performance.now()) : 0;
  const r = core.routePlayerAction(action, state.ui, step);
  dbgState.key = action; dbgState.cmd = r ? (r.cmd || (r.exit ? "salir" : r.app) || "-") : "nada"; dbgRender();
  if (!r) return;
  if (r.exit) return closePlayer();
  if (r.app === "next") return goNext();
  if (r.app === "prev") return goPrev();
  if (r.cmd) postToPlayer({ sf: "cmd", ...r });
}

// Mensajes que llegan del reproductor (puente inyectado en unlimplayer.top)
window.addEventListener("message", (ev) => {
  const f = $("#tv-player");
  if (!f || ev.source !== f.contentWindow) return;
  const d = ev.data;
  if (!d || typeof d !== "object" || d.sf !== "player" || !state.play) return;
  const t = Number(d.currentTime);
  const dur = Number(d.duration);
  const hasDur = Number.isFinite(dur) && dur > 0;
  const p = state.play;
  dbgState.bridge = `${d.event} t=${Number.isFinite(t) ? Math.round(t) : "?"}s${state.ui && state.ui.adSkip ? " [anuncio-omitir]" : ""}`;

  switch (d.event) {
    case "ready":
      sendConfig();
      applyPendingSeek();
      break;
    case "timeupdate":
      if (Number.isFinite(t) && t >= 0) {
        saveProgress(p.id, { s: p.season, e: p.episode, t: Math.floor(t), d: hasDur ? Math.floor(dur) : 0 });
        if (p.type === "tv" && (t >= 60 || (hasDur && t / dur >= 0.9))) markWatched(p.id, p.season, p.episode);
      }
      break;
    case "ended":
      saveProgress(p.id, { s: p.season, e: p.episode, t: 0, d: hasDur ? Math.floor(dur) : 0 });
      if (p.type === "tv") markWatched(p.id, p.season, p.episode);
      if (neighbor(1)) goNext(); else closePlayer();
      break;
    case "next":
      if (p.type === "tv") markWatched(p.id, p.season, p.episode);
      goNext();
      break;
    case "menu":
      dbgState.bridge = d.count < 0 ? "no encontre el icono del menu" : `menu: ${d.count} servidores`;
      if (d.count <= 0) toast(d.count < 0 ? "No hay menú de servidores" : "No hay otros servidores");
      break;
    case "ui":
      state.ui = d.ui && typeof d.ui === "object" ? d.ui : {};
      break;
    case "key": // tecla pulsada DENTRO del reproductor, reenviada por el puente
      dbgState.src = "puente";
      onPlayerAction(core.normalizeKey({ key: d.key, keyCode: d.keyCode }));
      break;
  }
});

// ---------------- Acciones de la interfaz ----------------
function activate(el) {
  if (!el) return;
  if (el.tagName === "INPUT") { el.focus(); return; }
  switch (el.dataset.kind) {
    case "tab": selectSection(el.dataset.section); break;
    case "search": openSearch(); break;
    case "key": typeKey("char", el.dataset.ch); break;
    case "key-space": typeKey("space"); break;
    case "key-del": typeKey("del"); break;
    case "key-clear": typeKey("clear"); break;
    case "hero-play": playFromHero(); break;
    case "hero-info": { const it = currentHero(); if (it) openDetail(it.id); break; }
    case "card": openDetail(el.dataset.id); break;
    case "more": openGrid(el.dataset.row); break;
    case "play": playFromDetail(); break;
    case "back": goBack(); break;
    case "season": selectSeason(Number(el.dataset.season)); break;
    case "dtab": state.detail.tab = el.dataset.tab; nav.memo.detail = `dtab:${el.dataset.tab}`; renderDetail(); restoreFocus("detail"); break;
    case "episode": startPlayback(state.detail.item, Number(el.dataset.season), Number(el.dataset.episode)); break;
    case "login": doLogin(); break;
    case "retry": boot(); break;
  }
}

// Atrás. Devuelve true si la app lo consumió (false = en Inicio: que salga la app)
function goBack() {
  switch (state.screen) {
    case "player": {
      // Atrás con un menú abierto (servidores / calidad) o el aviso de siguiente episodio: lo cierra, no sale
      const r = core.routePlayerAction("back", state.ui, 0);
      if (r && r.cmd) { postToPlayer({ sf: "cmd", ...r }); return true; }
      closePlayer();
      return true;
    }
    case "detail": {
      if (state.detailHist && state.detailHist.length) { // volver al título anterior
        state.detail = state.detailHist.pop();
        nav.memo.detail = null;
        renderDetail();
        showScreen("detail");
        return true;
      }
      const prev = state.stack.pop() || "browse";
      state.detail = null;
      if (prev === "browse") renderRows(); // refresca "Continuar viendo"
      showScreen(prev);
      return true;
    }
    case "grid":
      state.stack.pop();
      state.grid = null;
      showScreen("browse");
      return true;
    case "search": {
      const prev = state.stack.pop() || "browse";
      showScreen(prev);
      return true;
    }
    case "browse":
      if (state.section !== "inicio") { selectSection("inicio"); return true; }
      return false;
    default: return false;
  }
}
// Teclas del control reenviadas por MainActivity (acciones ya normalizadas: up/down/left/right/ok/...)
window.sfNativeKey = (action) => {
  dbgState.src = "nativa";
  if (state.screen === "player") onPlayerAction(String(action));
};
window.sfIsPlayer = () => state.screen === "player"; // MainActivity lo consulta cada ~0.4 s
window.sfHandleBack = goBack; // la versión Android lo llama desde el botón Atrás del control

document.addEventListener("keydown", (e) => {
  if (state.screen === "search" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === "Backspace") { e.preventDefault(); return typeKey("del"); }
    if (e.key.length === 1 && /[a-z0-9ñ]/i.test(e.key)) { e.preventDefault(); return typeKey("char", e.key.toUpperCase()); }
  }
  const action = core.normalizeKey(e);
  if (!action) return;

  // Escribiendo en un campo (inicio de sesión): dejar pasar las teclas de texto
  const ae = document.activeElement;
  if (ae && ae.tagName === "INPUT") {
    if (e.key === "Backspace" || action === "left" || action === "right") return;
    e.preventDefault();
    if (action === "back") ae.blur();
    else if (action === "up" || action === "down") { ae.blur(); move(action); }
    else if (action === "ok") { ae.blur(); move("down"); }
    return;
  }

  e.preventDefault();
  if (state.screen === "player") { dbgState.src = "pagina"; return onPlayerAction(action); }
  if (action === "up" || action === "down" || action === "left" || action === "right") move(action);
  else if (action === "ok") activate(nav.focus);
  else if (action === "back") goBack();
}, true);

// ---------------- Sesión y arranque ----------------
async function doLogin() {
  const email = $("#login-email").value.trim();
  const pass = $("#login-pass").value;
  if (!email || !pass) { toast("Escribe tu correo y tu contraseña"); return; }
  setLoading(true);
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    await boot();
  } catch {
    setLoading(false);
    toast("No se pudo iniciar sesión. Revisa tus datos.");
  }
}

async function boot() {
  setLoading(true);
  try {
    await loadContent();
    state.baseRows = {};
    state.stack = [];
    state.section = "inicio";
    state.screen = "browse";
    renderTabs();
    renderRows();
    setHero(heroCandidates());
    nav.memo.browse = null;
    showScreen("browse");
  } catch (err) {
    console.error(err);
    if (err && err.code === "permission-denied") {
      showScreen("login");
      toast("Inicia sesión para ver el contenido");
    } else {
      $("#rows").innerHTML = `<div class="login-box"><h1>No se pudo cargar</h1><p>Revisa la conexión a internet e inténtalo de nuevo.</p>
        <button class="focusable btn" data-kind="retry" data-key="retry">Reintentar</button></div>`;
      $("#hero").hidden = true;
      $("#tabs").innerHTML = "";
      showScreen("browse");
    }
  } finally {
    setLoading(false);
  }
}

window.__sfTv = { state, nav, move, openSearch, typeKey, heroShow, setFocus, openDetail, activate }; // para depurar desde la consola
boot();
