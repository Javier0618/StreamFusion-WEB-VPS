/* ================================================================
   TV-CORE: lógica pura de la versión para TV (sin DOM ni Firebase)
   - navegación espacial con las flechas del control
   - traducción de teclas del control (Android TV, Fire TV, teclado)
   - qué orden mandar al reproductor según el botón pulsado
   - episodios: validar, siguiente, anterior
   Se prueba con Node (ver tests) y la usa tv.js en el navegador.
   ================================================================ */

// ---------- Teclas del control ----------
const KEY_BY_NAME = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  Enter: "ok", NumpadEnter: "ok", " ": "ok", Select: "ok",
  Escape: "back", Backspace: "back", GoBack: "back", BrowserBack: "back", XF86Back: "back",
  MediaPlayPause: "playpause", MediaPlay: "play", MediaPause: "pause",
  MediaRewind: "rewind", MediaFastForward: "forward",
  MediaTrackNext: "next", MediaTrackPrevious: "prev",
};
const KEY_BY_CODE = {
  37: "left", 38: "up", 39: "right", 40: "down",
  13: "ok", 23: "ok",        // 23 = DPAD_CENTER de Android
  27: "back", 8: "back", 4: "back", // 4 = KEYCODE_BACK de Android
  85: "playpause", 126: "play", 127: "pause",
  89: "rewind", 90: "forward", 87: "next", 88: "prev",
};

// Devuelve: up | down | left | right | ok | back | playpause | play | pause |
//           rewind | forward | next | prev | null (tecla que no nos interesa)
export function normalizeKey(e) {
  if (!e) return null;
  if (e.key && KEY_BY_NAME[e.key]) return KEY_BY_NAME[e.key];
  const kc = Number(e.keyCode || e.which);
  if (kc && KEY_BY_CODE[kc]) return KEY_BY_CODE[kc];
  return null;
}

// ---------- Navegación espacial ----------
// cur: {x,y,w,h}   items: [{id,x,y,w,h}] (sin incluir el actual)   dir: up|down|left|right
// Elige el elemento más cercano en esa dirección, prefiriendo los alineados.
export function pickNext(cur, items, dir) {
  const cx = cur.x + cur.w / 2;
  const cy = cur.y + cur.h / 2;
  let best = null;
  let bestScore = Infinity;
  for (const it of items) {
    const dx = it.x + it.w / 2 - cx;
    const dy = it.y + it.h / 2 - cy;
    let primary, secondary;
    if (dir === "right") { if (dx <= 1) continue; primary = dx; secondary = Math.abs(dy); }
    else if (dir === "left") { if (dx >= -1) continue; primary = -dx; secondary = Math.abs(dy); }
    else if (dir === "down") { if (dy <= 1) continue; primary = dy; secondary = Math.abs(dx); }
    else if (dir === "up") { if (dy >= -1) continue; primary = -dy; secondary = Math.abs(dx); }
    else return null;
    const score = primary + secondary * 2.5; // penaliza desviarse de la fila/columna
    if (score < bestScore) { bestScore = score; best = it.id; }
  }
  return best;
}

// ---------- Adelantar / atrasar con el control ----------
// Un toque = 10 s. Si mantienes pulsado, acelera (20 s, luego 40 s) y no satura:
// devuelve 0 cuando hay que ignorar la repetición.
export function createSeekAccel() {
  let start = 0, last = 0, lastSent = 0;
  return function step(now) {
    if (now - last > 400) { start = now; lastSent = 0; }
    last = now;
    if (lastSent && now - lastSent < 180) return 0;
    lastSent = now;
    const held = now - start;
    return held < 1200 ? 10 : held < 3500 ? 20 : 40;
  };
}

// ---------- Qué hacer cuando se pulsa un botón con el reproductor en pantalla ----------
// ui = { skipIntro, next, adSkip }  (lo que el reproductor tiene visible ahora)
// seekStep = segundos a mover (de createSeekAccel; 0 = ignorar)
// Devuelve:  { cmd, ... }  → orden para el reproductor
//            { app: "next"|"prev" } → cambio de episodio hecho por la app
//            { exit: true } → salir del reproductor
//            null → nada
export function routePlayerAction(action, ui, seekStep) {
  const u = ui || {};
  switch (action) {
    case "ok":
      if (u.skipIntro) return { cmd: "skipIntro" };
      if (u.next) return { cmd: "next" };
      if (u.adSkip) return { cmd: "skipAd" };
      return { cmd: "toggle" };
    case "left": return seekStep ? { cmd: "seek", delta: -seekStep } : null;
    case "right": return seekStep ? { cmd: "seek", delta: seekStep } : null;
    case "up":
    case "down": return { cmd: "hud" };
    case "back": return u.next ? { cmd: "keepWatching" } : { exit: true };
    case "playpause": return { cmd: "toggle" };
    case "play": return { cmd: "play" };
    case "pause": return { cmd: "pause" };
    case "rewind": return { cmd: "seek", delta: -30 };
    case "forward": return { cmd: "seek", delta: 30 };
    case "next": return { app: "next" };
    case "prev": return { app: "prev" };
    default: return null;
  }
}

// ---------- Episodios ----------
// Solo episodios con enlace y número válido, ordenados (igual que en la app móvil)
export function getValidEpisodes(episodes) {
  if (!episodes) return [];
  return Object.entries(episodes)
    .map(([key, ep]) => {
      if (!ep || typeof ep !== "object") return null;
      const num = Number(ep.episode_number ?? key);
      const url = typeof ep.video_url === "string" ? ep.video_url.trim() : "";
      if (!Number.isInteger(num) || num <= 0 || !url) return null;
      return { ...ep, episode_number: num, video_url: url };
    })
    .filter(Boolean)
    .sort((a, b) => a.episode_number - b.episode_number);
}

export function getValidSeasons(seasons) {
  if (!seasons) return [];
  return Object.values(seasons)
    .filter((s) => s && Number(s.season_number) > 0 && getValidEpisodes(s.episodes).length > 0)
    .sort((a, b) => Number(a.season_number) - Number(b.season_number));
}

// Siguiente episodio (en la misma temporada o en la siguiente). null si no hay.
export function findNextEpisode(seasons, season, episode) {
  const list = getValidSeasons(seasons);
  const idx = list.findIndex((s) => Number(s.season_number) === season);
  if (idx >= 0) {
    const eps = getValidEpisodes(list[idx].episodes);
    const nx = eps.find((e) => e.episode_number > episode);
    if (nx) return { season, episode: nx.episode_number, ep: nx };
  }
  const nextSeason = list.find((s) => Number(s.season_number) > season);
  if (nextSeason) {
    const first = getValidEpisodes(nextSeason.episodes)[0];
    return { season: Number(nextSeason.season_number), episode: first.episode_number, ep: first };
  }
  return null;
}

// Episodio anterior. null si es el primero.
export function findPrevEpisode(seasons, season, episode) {
  const list = getValidSeasons(seasons);
  const idx = list.findIndex((s) => Number(s.season_number) === season);
  if (idx >= 0) {
    const eps = getValidEpisodes(list[idx].episodes);
    const prev = [...eps].reverse().find((e) => e.episode_number < episode);
    if (prev) return { season, episode: prev.episode_number, ep: prev };
  }
  const prevSeason = [...list].reverse().find((s) => Number(s.season_number) < season);
  if (prevSeason) {
    const eps = getValidEpisodes(prevSeason.episodes);
    const last = eps[eps.length - 1];
    return { season: Number(prevSeason.season_number), episode: last.episode_number, ep: last };
  }
  return null;
}

// Marcas de intro/créditos de un episodio (segundos o null)
export function getEpisodeMarks(ep) {
  const n = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const introEnd = n(ep && ep.intro_end);
  return {
    introStart: introEnd !== null ? (n(ep.intro_start) ?? 0) : null,
    introEnd,
    creditsStart: n(ep && ep.credits_start),
  };
}

// ---------- Formato y progreso ----------
export function formatTime(sec) {
  const total = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// "Continuar viendo": lo último visto con progreso guardado, el más reciente primero
// progress = { [id]: {s,e,t,d,ts} }   byId = Map(id → contenido)
export function buildContinueList(progress, byId, limit = 20) {
  return Object.entries(progress || {})
    .map(([id, p]) => ({ id, p, item: byId.get(String(id)) }))
    .filter((x) => x.item && x.p && Number(x.p.ts) > 0)
    .sort((a, b) => Number(b.p.ts) - Number(a.p.ts))
    .slice(0, limit)
    .map((x) => ({ item: x.item, progress: x.p }));
}

// Porcentaje visto (0-100) para la barrita de la tarjeta
export function progressPercent(p) {
  if (!p || !(Number(p.d) > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(p.t) / Number(p.d)) * 100)));
}
