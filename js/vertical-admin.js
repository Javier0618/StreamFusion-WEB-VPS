// ─── Panel de administración de Verticales ──────────────────────────────────
// Solo lo descarga vertical.js cuando la cuenta es la del admin. Gestiona las
// series de `vertical_content` (publicadas sin TMDB) y las de `content` marcadas
// como verticales (con TMDB): editar datos y episodios, destacar, ocultar y borrar.
import {
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";

const LANGS = ["Latino", "Castellano", "Subtitulado", "Inglés", "Otro"];

let api = null;
let panelEl = null;
let editorEl = null;
let all = [];
let filter = "all";
let queryText = "";
// { item, draft (form values not saved yet), seasons: [{ number, episodes: [{ number, url, extra }] }] }
let editing = null;

export async function openAdmin(a) {
  api = a;
  api.setBackHandler(back);
  ensurePanel();
  panelEl.classList.add("open");
  api.pushLayer("admin");
  renderList(true);
  all = await api.getAll();
  renderList();
}

/** Back button: editor first, then the panel. fromHistory = the entry was already popped. */
function back(fromHistory) {
  if (editorEl?.classList.contains("open")) {
    closeEditor(fromHistory);
    return true;
  }
  if (panelEl?.classList.contains("open")) {
    closePanel(fromHistory);
    return true;
  }
  return false;
}

// ── panel (lista) ────────────────────────────────────────────────────────────
function ensurePanel() {
  if (panelEl) return;
  panelEl = document.createElement("div");
  panelEl.id = "sfv-admin";
  api.isolateGestures(panelEl);
  panelEl.innerHTML = `
    <div class="sfv-cat-head">
      <button type="button" class="sfv-icon-btn" data-act="close" aria-label="Cerrar"><i class="fa-solid fa-arrow-left"></i></button>
      <div class="sfv-cat-title">
        <h2>Gestionar verticales</h2>
        <p class="sfv-adm-count">Cargando…</p>
      </div>
      <button type="button" class="sfv-icon-btn" data-act="refresh" aria-label="Recargar"><i class="fa-solid fa-rotate"></i></button>
    </div>
    <div class="sfv-search open">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input type="search" placeholder="Buscar por título…" autocomplete="off" />
    </div>
    <div class="sfv-chips">
      ${[
        ["all", "Todas"],
        ["visible", "Visibles"],
        ["hidden", "Ocultas"],
        ["featured", "Destacadas"],
        ["own", "Sin TMDB"],
        ["tmdb", "TMDB"],
      ]
        .map(([k, l]) => `<button type="button" data-filter="${k}" class="${k === filter ? "on" : ""}">${l}</button>`)
        .join("")}
    </div>
    <div class="sfv-cat-body sfv-adm-list"></div>`;
  panelEl.querySelector('[data-act="close"]').addEventListener("click", () => closePanel());
  panelEl.querySelector('[data-act="refresh"]').addEventListener("click", async () => {
    renderList(true);
    all = await api.reload();
    renderList();
  });
  panelEl.querySelector(".sfv-search input").addEventListener("input", (e) => {
    queryText = e.target.value.trim().toLowerCase();
    renderList();
  });
  panelEl.querySelector(".sfv-chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]");
    if (!b) return;
    filter = b.dataset.filter;
    panelEl.querySelectorAll("[data-filter]").forEach((x) => x.classList.toggle("on", x === b));
    renderList();
  });
  panelEl.querySelector(".sfv-adm-list").addEventListener("click", onListClick);
  document.body.appendChild(panelEl);
}

function closePanel(fromHistory = false) {
  panelEl.classList.remove("open");
  if (!fromHistory) api.popLayer();
}

const isTmdb = (it) => it._col === "content";

function filtered() {
  return all.filter((it) => {
    if (queryText && !String(it.title || "").toLowerCase().includes(queryText)) return false;
    if (filter === "visible") return !it.hidden;
    if (filter === "hidden") return !!it.hidden;
    if (filter === "featured") return !!it.featured;
    if (filter === "own") return !isTmdb(it);
    if (filter === "tmdb") return isTmdb(it);
    return true;
  });
}

function renderList(loading = false) {
  const list = panelEl.querySelector(".sfv-adm-list");
  const count = panelEl.querySelector(".sfv-adm-count");
  if (loading) {
    list.innerHTML = `<div class="sfv-empty"><div class="sfv-loader"></div></div>`;
    return;
  }
  const rows = filtered();
  const hidden = all.filter((it) => it.hidden).length;
  count.textContent = `${all.length} series · ${hidden} ocultas`;
  if (!rows.length) {
    list.innerHTML = `<div class="sfv-empty"><i class="fa-solid fa-inbox"></i><p>No hay series con este filtro.</p></div>`;
    return;
  }
  list.innerHTML = rows
    .map((it) => {
      const eps = api.episodesOf(it).length;
      return `
      <article class="sfv-adm-row${it.hidden ? " is-hidden" : ""}" data-id="${api.esc(it.id)}">
        <img src="${api.esc(it.poster_url)}" alt="" loading="lazy" />
        <div class="sfv-adm-info">
          <h4>${api.esc(it.title || "(sin título)")}</h4>
          <div class="sfv-adm-badges">
            <span class="${isTmdb(it) ? "b-tmdb" : "b-own"}">${isTmdb(it) ? "TMDB" : "Sin TMDB"}</span>
            <span>${eps} ep.</span>
            ${it.language ? `<span>${api.esc(it.language)}</span>` : ""}
            ${it.featured ? `<span class="b-feat"><i class="fa-solid fa-star"></i> Destacada</span>` : ""}
            ${it.hidden ? `<span class="b-hidden"><i class="fa-solid fa-eye-slash"></i> Oculta</span>` : ""}
            ${it.free_all ? `<span class="b-feat"><i class="fa-solid fa-unlock"></i> Gratis</span>` : ""}
            ${eps === 0 ? `<span class="b-hidden">Sin enlaces</span>` : ""}
          </div>
          <div class="sfv-adm-actions">
            <button type="button" data-a="edit"><i class="fa-solid fa-pen"></i> Editar</button>
            <button type="button" data-a="play" ${eps ? "" : "disabled"}><i class="fa-solid fa-play"></i> Ver</button>
            <button type="button" data-a="feature" class="${it.featured ? "on" : ""}" title="Destacar en el carrusel"><i class="fa-solid fa-star"></i></button>
            <button type="button" data-a="hide" class="${it.hidden ? "on" : ""}" title="${it.hidden ? "Mostrar a los usuarios" : "Ocultar a los usuarios"}"><i class="fa-solid ${it.hidden ? "fa-eye-slash" : "fa-eye"}"></i></button>
            <button type="button" data-a="delete" class="danger" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      </article>`;
    })
    .join("");
}

async function onListClick(e) {
  const btn = e.target.closest("[data-a]");
  const row = e.target.closest("[data-id]");
  if (!btn || !row) return;
  const it = all.find((x) => x.id === row.dataset.id);
  if (!it) return;
  const a = btn.dataset.a;
  if (a === "edit") return openEditor(it);
  if (a === "play") return api.play(it);
  if (a === "feature") return quickUpdate(it, { featured: !it.featured }, it.featured ? "Ya no está destacada" : "Destacada en el carrusel");
  if (a === "hide") return quickUpdate(it, { hidden: !it.hidden }, it.hidden ? "Visible para los usuarios" : "Oculta para los usuarios");
  if (a === "delete") {
    const msg = isTmdb(it)
      ? `¿Eliminar «${it.title}» de la app?\n\nEs una serie con TMDB: se borra el documento completo (también sus enlaces). Para pasarla a las secciones normales usa exploracurioso.`
      : `¿Eliminar «${it.title}» de Verticales?\n\nSe borra la serie y sus enlaces de la app (los vídeos siguen en UnlimPlayer).`;
    if (!confirm(msg)) return;
    try {
      await deleteDoc(doc(api.db, it._col, it._docId));
      toast("Serie eliminada");
      all = await api.reload();
      renderList();
    } catch (err) {
      failed(err);
    }
  }
}

async function quickUpdate(it, data, okText) {
  try {
    await updateDoc(doc(api.db, it._col, it._docId), { ...data, updated_at: serverTimestamp() });
    toast(okText);
    all = await api.reload();
    renderList();
  } catch (err) {
    failed(err);
  }
}

// ── editor ───────────────────────────────────────────────────────────────────
function ensureEditor() {
  if (editorEl) return;
  editorEl = document.createElement("div");
  editorEl.id = "sfv-editor";
  api.isolateGestures(editorEl);
  editorEl.innerHTML = `
    <div class="sfv-cat-head">
      <button type="button" class="sfv-icon-btn" data-act="close" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
      <div class="sfv-cat-title"><h2>Editar serie</h2><p class="sfv-ed-sub"></p></div>
      <button type="button" class="sfv-ed-save" data-act="save"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
    </div>
    <form class="sfv-cat-body sfv-ed-form" autocomplete="off"></form>`;
  editorEl.querySelector('[data-act="close"]').addEventListener("click", () => closeEditor());
  editorEl.querySelector('[data-act="save"]').addEventListener("click", save);
  const form = editorEl.querySelector("form");
  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("click", onEditorClick);
  form.addEventListener("input", (e) => {
    if (e.target.name === "poster_url") form.querySelector(".sfv-ed-poster img").src = e.target.value;
  });
  document.body.appendChild(editorEl);
}

/** Seasons map → editable arrays, keeping every other field of each episode. */
function toEditable(it) {
  if (it.media_type === "movie") return [];
  return Object.entries(it.seasons || {})
    .map(([sk, s]) => ({
      number: Number(s.season_number ?? sk) || 1,
      episodes: Object.entries(s.episodes || {})
        .map(([ek, ep]) => ({ number: Number(ep.episode_number ?? ek) || 0, url: ep.video_url || "", extra: ep }))
        .sort((a, b) => a.number - b.number),
    }))
    .sort((a, b) => a.number - b.number);
}

function openEditor(it) {
  ensureEditor();
  editing = { item: it, draft: { ...it }, seasons: toEditable(it) };
  if (!editing.seasons.length && it.media_type !== "movie") editing.seasons.push({ number: 1, episodes: [] });
  editorEl.querySelector(".sfv-ed-sub").textContent = isTmdb(it) ? "Serie con TMDB" : "Serie sin TMDB";
  renderEditor();
  editorEl.classList.add("open");
  api.pushLayer("editor");
}

function closeEditor(fromHistory = false) {
  editorEl.classList.remove("open");
  editing = null;
  if (!fromHistory) api.popLayer();
}

function renderEditor() {
  const it = editing.draft;
  const tmdb = isTmdb(it);
  const lock = tmdb ? "readonly" : "";
  const form = editorEl.querySelector("form");
  const lang = it.language || "";
  form.innerHTML = `
    <div class="sfv-ed-top">
      <div class="sfv-ed-poster"><img src="${api.esc(it.poster_url)}" alt="" /></div>
      <div class="sfv-ed-fields">
        <label>Título<input name="title" value="${api.esc(it.title)}" ${lock} /></label>
        <label>Póster (URL)<input name="poster_url" value="${api.esc(it.poster_url)}" ${lock} /></label>
        <div class="sfv-ed-toggles">
          <label class="sfv-switch"><input type="checkbox" name="featured" ${it.featured ? "checked" : ""} /><span></span> Destacada</label>
          <label class="sfv-switch"><input type="checkbox" name="hidden" ${it.hidden ? "checked" : ""} /><span></span> Oculta</label>
          <label class="sfv-switch" title="Sin bloqueo: todos los episodios libres, sin anuncios para desbloquear"><input type="checkbox" name="free_all" ${it.free_all ? "checked" : ""} /><span></span> Gratis</label>
        </div>
      </div>
    </div>
    ${tmdb ? `<p class="sfv-ed-note"><i class="fa-solid fa-circle-info"></i> Título, póster, sinopsis y géneros vienen de TMDB y se reemplazan al republicar; aquí puedes cambiar episodios, destacar u ocultar.</p>` : ""}
    <label>Sinopsis<textarea name="overview" rows="4" ${lock}>${api.esc(it.overview)}</textarea></label>
    <div class="sfv-ed-row2">
      <label>Géneros (separados por comas)<input name="genres" value="${api.esc(api.genresOf(it).join(", "))}" ${lock} /></label>
      <label>Idioma
        <select name="language" ${tmdb ? "disabled" : ""}>
          ${[...new Set([...LANGS, lang].filter(Boolean))]
            .map((l) => `<option ${l === lang ? "selected" : ""}>${api.esc(l)}</option>`)
            .join("")}
        </select>
      </label>
    </div>
    ${it.media_type === "movie" ? movieBlock(it) : seasonsBlock()}`;
}

function movieBlock(it) {
  return `<h4 class="sfv-ed-h">Enlace de la película</h4>
    <label>URL del reproductor<input name="video_url" value="${api.esc(it.video_url)}" /></label>`;
}

function seasonsBlock() {
  return editing.seasons
    .map(
      (s, si) => `
    <section class="sfv-ed-season" data-si="${si}">
      <div class="sfv-ed-h">
        <h4>Temporada ${s.number} <small>${s.episodes.length} episodios</small></h4>
        <button type="button" data-e="add"><i class="fa-solid fa-plus"></i> Episodio</button>
        <button type="button" data-e="paste"><i class="fa-solid fa-paste"></i> Pegar enlaces</button>
      </div>
      <div class="sfv-ed-eps">
        ${
          s.episodes.length
            ? s.episodes
                .map(
                  (ep, ei) => `
          <div class="sfv-ed-ep" data-ei="${ei}">
            <input class="n" type="number" min="1" value="${ep.number}" aria-label="Número" />
            <input class="u" value="${api.esc(ep.url)}" placeholder="https://…" aria-label="Enlace" />
            <button type="button" data-e="open" title="Probar enlace"><i class="fa-solid fa-up-right-from-square"></i></button>
            <button type="button" data-e="del" class="danger" title="Quitar episodio"><i class="fa-solid fa-xmark"></i></button>
          </div>`,
                )
                .join("")
            : `<p class="sfv-ed-note">Sin episodios todavía.</p>`
        }
      </div>
    </section>`,
    )
    .join("");
}

/** Copy what is typed in the episode rows back into `editing` before re-rendering. */
function syncEpisodes() {
  editorEl.querySelectorAll(".sfv-ed-season").forEach((sec) => {
    const s = editing.seasons[Number(sec.dataset.si)];
    sec.querySelectorAll(".sfv-ed-ep").forEach((row) => {
      const ep = s.episodes[Number(row.dataset.ei)];
      ep.number = Number(row.querySelector(".n").value) || 0;
      ep.url = row.querySelector(".u").value.trim();
    });
  });
}

/** Keep what was typed in the general fields across re-renders. */
function syncFields() {
  const f = editorEl.querySelector("form").elements;
  const d = editing.draft;
  for (const k of ["title", "poster_url", "overview", "language", "video_url"]) if (f[k]) d[k] = f[k].value;
  if (f.genres) d.genres = [f.genres.value];
  d.featured = f.featured.checked;
  d.hidden = f.hidden.checked;
  d.free_all = f.free_all.checked;
}

function onEditorClick(e) {
  const b = e.target.closest("[data-e]");
  if (!b) return;
  const sec = b.closest(".sfv-ed-season");
  if (!sec) return;
  syncFields();
  syncEpisodes();
  const s = editing.seasons[Number(sec.dataset.si)];
  const nextNum = () => Math.max(0, ...s.episodes.map((x) => x.number)) + 1;
  const act = b.dataset.e;
  if (act === "add") {
    s.episodes.push({ number: nextNum(), url: "", extra: {} });
  } else if (act === "paste") {
    const text = prompt("Pega los enlaces, uno por línea. Se añaden a partir del siguiente episodio:");
    if (!text) return;
    for (const url of text.split(/\s+/).map((x) => x.trim()).filter((x) => /^https?:\/\//.test(x))) {
      s.episodes.push({ number: nextNum(), url, extra: {} });
    }
  } else if (act === "del") {
    s.episodes.splice(Number(b.closest(".sfv-ed-ep").dataset.ei), 1);
  } else if (act === "open") {
    const url = b.closest(".sfv-ed-ep").querySelector(".u").value.trim();
    if (/^https?:\/\//.test(url)) window.open(url, "_blank");
    return;
  }
  const scroll = editorEl.querySelector("form").scrollTop;
  renderEditor();
  editorEl.querySelector("form").scrollTop = scroll;
}

async function save() {
  if (!editing) return;
  const it = editing.item;
  const form = editorEl.querySelector("form");
  const val = (n) => form.elements[n]?.value?.trim() ?? "";
  const data = {
    featured: form.elements.featured.checked,
    hidden: form.elements.hidden.checked,
    free_all: form.elements.free_all.checked,
    updated_at: serverTimestamp(),
  };
  if (!isTmdb(it)) {
    if (!val("title")) return alert("El título no puede quedar vacío.");
    Object.assign(data, {
      title: val("title"),
      overview: val("overview"),
      poster_url: val("poster_url"),
      genres: [...new Set(val("genres").split(/[,;|/]/).map((g) => g.trim()).filter(Boolean))].slice(0, 8),
      language: val("language"),
    });
  }
  if (it.media_type === "movie") {
    data.video_url = val("video_url");
  } else {
    syncEpisodes();
    const seen = new Set();
    const seasons = {};
    let count = 0;
    for (const s of editing.seasons) {
      const eps = {};
      for (const ep of s.episodes) {
        if (!ep.number || seen.has(`${s.number}-${ep.number}`)) {
          return alert(`Temporada ${s.number}: hay episodios sin número o repetidos (${ep.number || "vacío"}).`);
        }
        seen.add(`${s.number}-${ep.number}`);
        eps[String(ep.number)] = { ...ep.extra, episode_number: ep.number, video_url: ep.url };
        if (ep.url) count++;
      }
      seasons[String(s.number)] = { season_number: s.number, episodes: eps };
    }
    data.seasons = seasons;
    data.episode_count = count;
  }
  const btn = editorEl.querySelector('[data-act="save"]');
  btn.disabled = true;
  try {
    await updateDoc(doc(api.db, it._col, it._docId), data);
    toast("Cambios guardados");
    closeEditor();
    all = await api.reload();
    renderList();
  } catch (err) {
    failed(err);
  } finally {
    btn.disabled = false;
  }
}

// ── avisos ───────────────────────────────────────────────────────────────────
function toast(text) {
  let el = document.getElementById("sfv-adm-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "sfv-adm-toast";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2200);
}

function failed(err) {
  console.error("[vertical-admin]", err);
  const denied = String(err?.code || err?.message || "").includes("permission");
  alert(
    denied
      ? "Firestore no permite el cambio: falta la regla de escritura de admin para esta colección."
      : `No se pudo guardar: ${err?.message || err}`,
  );
}
