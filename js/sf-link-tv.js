// ─── StreamFusion: vincular un TV desde el celular ──────────────────────────
// El TV muestra un código (ABC-1234). Aquí el usuario con sesión lo escribe y el
// servidor de vinculación entrega al TV un acceso a esta cuenta.
// También lista los TV vinculados y permite cerrarles la sesión.
// Se sube a sfusion.netlify.app/js/sf-link-tv.js; script2.js lo carga al tocar
// "Vincular TV" en el menú del perfil.
import { getApps } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";

const PAIR_API = "https://exploracurioso.top/api/pair";

const CSS = `
.sflt-back{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);display:flex;align-items:flex-end;justify-content:center}
.sflt-box{width:100%;max-width:460px;max-height:88vh;overflow:auto;background:#16161c;color:#fff;border-radius:18px 18px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom));box-sizing:border-box;font-family:inherit}
@media (min-width:600px){.sflt-back{align-items:center}.sflt-box{border-radius:18px}}
.sflt-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.sflt-head h3{margin:0;font-size:19px}
.sflt-x{background:none;border:0;color:#aaa;font-size:22px;padding:4px 8px;cursor:pointer}
.sflt-help{color:#aaa;font-size:13.5px;line-height:1.45;margin:0 0 16px}
.sflt-code{width:100%;box-sizing:border-box;font-size:28px;letter-spacing:6px;text-align:center;text-transform:uppercase;padding:14px 10px;border-radius:12px;border:2px solid #333;background:#0d0d12;color:#fff;outline:none;font-family:monospace}
.sflt-code:focus{border-color:#ff6b00}
.sflt-btn{width:100%;margin-top:12px;padding:14px;border:0;border-radius:12px;font-size:16px;font-weight:700;color:#fff;background:linear-gradient(90deg,#ff6b00,#ff2d7a);cursor:pointer}
.sflt-btn[disabled]{opacity:.5;cursor:default}
.sflt-msg{min-height:20px;margin-top:10px;font-size:14px;text-align:center}
.sflt-msg.ok{color:#4ade80}.sflt-msg.err{color:#f87171}
.sflt-sub{margin:22px 0 8px;font-size:15px;color:#ddd}
.sflt-dev{display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;background:#0d0d12;margin-bottom:8px}
.sflt-dev i{font-size:20px;color:#ff6b00}
.sflt-dev div{flex:1;min-width:0}
.sflt-dev b{display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sflt-dev small{color:#888;font-size:12px}
.sflt-out{border:1px solid #444;background:none;color:#f87171;border-radius:10px;padding:8px 10px;font-size:13px;cursor:pointer}
.sflt-empty{color:#777;font-size:13.5px}
`;

function services() {
  const app = getApps()[0];
  return { auth: getAuth(app), db: getFirestore(app) };
}

/** "abc1234" → "ABC-1234" mientras se escribe. */
function formatCode(v) {
  const c = String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 7);
  return c.length > 3 ? c.slice(0, 3) + "-" + c.slice(3) : c;
}

function fmtDate(ts) {
  try {
    const d = ts && typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
  } catch (e) {
    return "";
  }
}

async function loadDevices(listEl) {
  const { auth, db } = services();
  const user = auth.currentUser;
  if (!user) return;
  listEl.innerHTML = '<div class="sflt-empty">Cargando…</div>';
  try {
    const snap = await getDocs(query(collection(db, "tv_devices"), where("uid", "==", user.uid)));
    const devices = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((d) => !d.revoked)
      .sort((a, b) => {
        const ta = a.created_at && a.created_at.seconds ? a.created_at.seconds : 0;
        const tb = b.created_at && b.created_at.seconds ? b.created_at.seconds : 0;
        return tb - ta;
      });
    if (!devices.length) {
      listEl.innerHTML = '<div class="sflt-empty">No tienes ningún TV vinculado.</div>';
      return;
    }
    listEl.innerHTML = "";
    for (const d of devices) {
      const row = document.createElement("div");
      row.className = "sflt-dev";
      row.innerHTML = `<i class="fas fa-tv"></i><div><b></b><small>Vinculado el ${fmtDate(d.created_at)}</small></div><button class="sflt-out" type="button">Cerrar sesión</button>`;
      row.querySelector("b").textContent = d.name || "TV";
      row.querySelector("button").addEventListener("click", async (ev) => {
        const btn = ev.currentTarget;
        if (!confirm(`¿Cerrar la sesión de "${d.name || "TV"}"?`)) return;
        btn.disabled = true;
        try {
          await updateDoc(doc(db, "tv_devices", d.id), { revoked: true });
          row.remove();
          if (!listEl.children.length) listEl.innerHTML = '<div class="sflt-empty">No tienes ningún TV vinculado.</div>';
        } catch (err) {
          btn.disabled = false;
          alert("No se pudo cerrar la sesión de ese TV. Inténtalo de nuevo.");
        }
      });
      listEl.appendChild(row);
    }
  } catch (err) {
    console.warn("[sf-link-tv] lista de TV", err);
    listEl.innerHTML = '<div class="sflt-empty">No se pudo cargar la lista.</div>';
  }
}

/** Abre la ventana "Vincular TV". */
export function openLinkTv() {
  const { auth } = services();
  if (!auth.currentUser) {
    alert("Inicia sesión para vincular un TV.");
    return;
  }
  if (!document.getElementById("sflt-style")) {
    const st = document.createElement("style");
    st.id = "sflt-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const back = document.createElement("div");
  back.className = "sflt-back";
  back.innerHTML = `
    <div class="sflt-box" role="dialog" aria-modal="true">
      <div class="sflt-head"><h3><i class="fas fa-tv"></i> Vincular TV</h3><button class="sflt-x" type="button" aria-label="Cerrar">✕</button></div>
      <p class="sflt-help">Abre StreamFusion en tu TV. Verás un código en pantalla: escríbelo aquí y el TV entrará con tu cuenta, con tu lista y lo que estás viendo.</p>
      <input class="sflt-code" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC-1234" maxlength="8" />
      <button class="sflt-btn" type="button" disabled>Vincular</button>
      <div class="sflt-msg"></div>
      <div class="sflt-sub">Tus TV vinculados</div>
      <div class="sflt-list"></div>
    </div>`;
  document.body.appendChild(back);

  const input = back.querySelector(".sflt-code");
  const btn = back.querySelector(".sflt-btn");
  const msg = back.querySelector(".sflt-msg");
  const list = back.querySelector(".sflt-list");

  const prevBack = window.sfHandleBack;
  function close() {
    back.remove();
    window.sfHandleBack = prevBack;
  }
  // Botón atrás de Android: cerrar esta ventana, no la app.
  window.sfHandleBack = function () {
    close();
    return true;
  };
  back.querySelector(".sflt-x").addEventListener("click", close);
  back.addEventListener("click", (e) => {
    if (e.target === back) close();
  });

  input.addEventListener("input", () => {
    input.value = formatCode(input.value);
    btn.disabled = input.value.replace("-", "").length !== 7;
    msg.textContent = "";
    msg.className = "sflt-msg";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !btn.disabled) btn.click();
  });

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    msg.className = "sflt-msg";
    msg.textContent = "Vinculando…";
    try {
      const user = services().auth.currentUser;
      if (!user) throw new Error("Inicia sesión para vincular un TV.");
      const idToken = await user.getIdToken();
      const r = await fetch(PAIR_API + "/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + idToken },
        body: JSON.stringify({ code: input.value }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.message || "No se pudo vincular. Inténtalo de nuevo.");
      msg.className = "sflt-msg ok";
      msg.textContent = `¡Listo! ${data.device || "Tu TV"} ya está entrando con tu cuenta.`;
      input.value = "";
      loadDevices(list);
    } catch (err) {
      msg.className = "sflt-msg err";
      msg.textContent = err && err.message ? err.message : "No se pudo vincular.";
      btn.disabled = input.value.replace("-", "").length !== 7;
    }
  });

  loadDevices(list);
  setTimeout(() => input.focus(), 50);
}
