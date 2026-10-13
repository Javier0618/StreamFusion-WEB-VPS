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
const nav = { focus: null, memo: {} };

function focusables(name = state.screen) {
  const roots = [$(`#screen-${name}`)];
  const bar = $("#nav");
  if (bar && !bar.hidden) roots.push(bar);
  return roots.filter(Boolean).flatMap((r) => [...r.querySelectorAll(".focusable")]).filter((el) => el.getClientRects().length > 0);
}

// Mantiene a la vista lo enfocado: centra horizontalmente dentro de su fila y desplaza la pantalla
function ensureVisible(el) {
  try {
    const row = el.parentNode;
    if (row && row.classList && row.classList.contains("cards") && typeof el.offsetLeft === "number") {
      row.scrollLeft = Math.max(0, el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2);
    }
    const screen = $(`#screen-${state.screen}`);
    const bar = $("#nav");
    if (!screen) return;
    const inTop = el.classList.contains("tab") || el.classList.contains("hbtn");
    let top = 0;
    if (!inTop && typeof screen.scrollTop === "number") {
      const vh = window.innerHeight || 540;
      const r = el.getBoundingClientRect();
      const sr = screen.getBoundingClientRect();
      top = Math.max(0, screen.scrollTop + (r.top - sr.top) - vh * 0.3);
    }
    if (state.screen === "browse" || state.screen === "grid") screen.scrollTop = inTop ? 0 : top;
    if (bar) bar.classList.toggle("solid", !inTop && top > 40);
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
    else target = list.find((el) => el.dataset.kind === "card") || list[0];
  }
  setFocus(target || null);
}
function move(dir) {
  const list = focusables();
  if (!list.length) return;
  if (!nav.focus || !list.includes(nav.focus)) { setFocus(list[0]); return; }
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const items = list.filter((el) => el !== nav.focus).map((el) => ({ id: el, ...rect(el) }));
  const next = core.pickNext(rect(nav.focus), items, dir);
  if (next) setFocus(next);
}

function showScreen(name) {
  ["browse", "grid", "detail", "player", "login"].forEach((s) => { $(`#screen-${s}`).hidden = s !== name; });
  state.screen = name;
  // Android TV: mientras se reproduce, la app nativa captura el control y nos lo reenvía (sfNativeKey)
  try { if (window.SFTV) window.SFTV.setPlayer(name === "player"); } catch {}
  $("#nav").hidden = !(name === "browse" || name === "grid");
  restoreFocus(name);
}

// ---------------- Tarjetas y filas ----------------
function cardHtml(item, rowId, kind, progress, idx) {
  const wide = kind === "wide";
  const img = wide && item.backdrop_path ? `${IMG}/w780${item.backdrop_path}` : item.poster_path ? `${IMG}/w342${item.poster_path}` : "";
  const poster = img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<div class="noimg">${esc(item.title)}</div>`;
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
}

// ---------------- Menú de secciones ----------------
function renderTabs() {
  const has = (k) => k === "inicio" || state.content.some((i) => core.inSection(i, k));
  $("#tabs").innerHTML = core.MAIN_SECTIONS.filter(([k]) => has(k))
    .map(([k, label]) => `<div class="tab focusable${k === state.section ? " sel" : ""}" data-kind="tab" data-section="${k}" data-key="tab:${k}">${esc(label)}</div>`)
    .join("");
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
  restoreFocus("browse");
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
  on.style.backgroundImage = `url('${IMG}/w1280${esc(it.backdrop_path)}')`;
  on.classList.add("on");
  off.classList.remove("on");

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
    state.heroTimer = setInterval(() => { if (state.screen === "browse") heroShow(state.heroIdx + 1); }, HERO_SECONDS * 1000);
  }
}

// ---------------- Ver todo: cuadrícula con carga progresiva ----------------
function appendGrid() {
  const g = state.grid;
  if (!g || g.shown >= g.items.length) return;
  const batch = g.items.slice(g.shown, g.shown + GRID_STEP);
  $("#grid").insertAdjacentHTML("beforeend", batch.map((item, k) => cardHtml(item, "grid", "poster", null, g.shown + k)).join(""));
  g.shown += batch.length;
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
  const target = playTarget(item);
  const year = String(item.release_date || "").slice(0, 4);
  const rating = Number(item.vote_average) > 0 ? `<b>★ ${Number(item.vote_average).toFixed(1)}</b>` : "";
  const meta = [year ? esc(year) : "", rating, isTv ? "Serie" : "Película"].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const genres = core.genreLabels(item, 4).map(esc).join(" · ");

  const root = $("#screen-detail");
  root.style.backgroundImage = item.backdrop_path ? `url('${IMG}/w1280${esc(item.backdrop_path)}')` : "none";

  let seasonsHtml = "", epsHtml = "";
  if (isTv) {
    seasonsHtml = `<div class="seasons">${seasons
      .map((s) => `<div class="chip focusable${Number(s.season_number) === d.season ? " sel" : ""}" data-kind="season" data-season="${esc(s.season_number)}" data-key="season:${esc(s.season_number)}">Temporada ${esc(s.season_number)}</div>`)
      .join("")}</div>`;
    const cur = seasons.find((s) => Number(s.season_number) === d.season);
    epsHtml = `<div class="eps">${core.getValidEpisodes(cur.episodes)
      .map((ep) => {
        const seen = isWatched(item.id, d.season, ep.episode_number);
        const here = prog && Number(prog.s) === d.season && Number(prog.e) === ep.episode_number;
        const pct = here ? core.progressPercent(prog) : 0;
        return `<div class="ep focusable" data-kind="episode" data-season="${esc(d.season)}" data-episode="${esc(ep.episode_number)}" data-key="ep:${esc(d.season)}-${esc(ep.episode_number)}">
            <div class="n">E${esc(ep.episode_number)}${seen ? '<span class="ok">✓</span>' : ""}</div>
            <div class="t">${esc(ep.name || "")}</div>
            ${pct > 0 ? `<div class="card-prog"><i style="width:${pct}%"></i></div>` : ""}
          </div>`;
      })
      .join("")}</div>`;
  }

  root.innerHTML = `
    <div class="detail-shade"></div>
    <div class="detail-body">
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
        ${seasonsHtml}${epsHtml}
      </div>
    </div>`;
}

function openDetail(id) {
  const item = state.byId.get(String(id));
  if (!item) return;
  state.stack.push(state.screen);
  state.detail = { item, season: null };
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
  state.stack.push(state.screen);
  state.detail = { item: it, season: t.season };
  renderDetail();
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

// Qué hace cada botón del control con el reproductor en pantalla
const accel = core.createSeekAccel();
function onPlayerAction(action) {
  if (!action || !state.play) return;
  const step = action === "left" || action === "right" ? accel(performance.now()) : 0;
  const r = core.routePlayerAction(action, state.ui, step);
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
    case "ui":
      state.ui = d.ui && typeof d.ui === "object" ? d.ui : {};
      break;
    case "key": // tecla pulsada DENTRO del reproductor, reenviada por el puente
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
    case "hero-play": playFromHero(); break;
    case "hero-info": { const it = currentHero(); if (it) openDetail(it.id); break; }
    case "card": openDetail(el.dataset.id); break;
    case "more": openGrid(el.dataset.row); break;
    case "play": playFromDetail(); break;
    case "back": goBack(); break;
    case "season": selectSeason(Number(el.dataset.season)); break;
    case "episode": startPlayback(state.detail.item, Number(el.dataset.season), Number(el.dataset.episode)); break;
    case "login": doLogin(); break;
    case "retry": boot(); break;
  }
}

// Atrás. Devuelve true si la app lo consumió (false = en Inicio: que salga la app)
function goBack() {
  switch (state.screen) {
    case "player": closePlayer(); return true;
    case "detail": {
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
    case "browse":
      if (state.section !== "inicio") { selectSection("inicio"); return true; }
      return false;
    default: return false;
  }
}
// Teclas del control reenviadas por MainActivity (acciones ya normalizadas: up/down/left/right/ok/...)
window.sfNativeKey = (action) => {
  if (state.screen === "player") onPlayerAction(String(action));
};
window.sfHandleBack = goBack; // la versión Android lo llama desde el botón Atrás del control

document.addEventListener("keydown", (e) => {
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
  if (state.screen === "player") return onPlayerAction(action);
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

window.__sfTv = { state, nav, heroShow, setFocus, openDetail, activate }; // para depurar desde la consola
boot();
