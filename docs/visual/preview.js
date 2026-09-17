/* Guía UI temporal. Paleta/grupos: UI.md. Argv: Code.exe / Cursor.exe — nunca .cmd */

const svg = (paths, size = 16, filled = false) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="${filled ? "none" : "currentColor"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  home: svg('<path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/>'),
  terminal: svg('<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>'),
  folder: svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
  beaker: svg('<path d="M9 3h6v5l4 12H5L9 8z"/><line x1="9" y1="3" x2="15" y2="3"/><line x1="7.5" y1="13" x2="16.5" y2="13"/>'),
  book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  flask: svg('<path d="M10 2v6.5L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 8.5V2"/><line x1="8.5" y1="2" x2="15.5" y2="2"/><line x1="7" y1="14" x2="17" y2="14"/>'),
  code: svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  globe: svg('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
  file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
  database: svg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>'),
  play: svg('<polygon points="6 4 20 12 6 20 6 4"/>', 14, true),
  playSm: svg('<polygon points="6 4 20 12 6 20 6 4"/>', 12, true),
  chevDown: svg('<polyline points="6 9 12 15 18 9"/>', 12),
  check: svg('<polyline points="20 6 9 17 4 12"/>', 12),
  bot: svg('<rect x="4" y="8" width="16" height="12" rx="2"/><circle cx="9" cy="14" r="1.2" fill="currentColor"/><circle cx="15" cy="14" r="1.2" fill="currentColor"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1"/>'),
  sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
  alert: svg('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  inbox: svg('<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>'),
  moon: svg('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'),
  close: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 14),
  zap: svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 12, true),
  spinner: `<svg class="spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>`
};

const DEFAULT_SPACES = [
  {
    id: "sanctum", name: "Sanctum", group: "trabajo", kind: "Proyecto",
    note: "Codebase y site. El repo vive en C:\\dev\\sanctum.",
    bot: false, icon: "folder",
    pieces: [
      { id: "cursor",  label: "Cursor",  icon: "code",   meta: "código",   group: "código",   op: "open", kind: "cursor",  payload: { path: "C:\\dev\\sanctum" } },
      { id: "web",     label: "Web",     icon: "globe",  meta: "site",     group: "web",      op: "open", kind: "firefox", payload: { urls: ["https://sanctum.dev", "https://vercel.com/sanctum"] } },
      { id: "carpeta", label: "Carpeta", icon: "folder", meta: "archivos", group: "archivos", op: "open", kind: "folder",  payload: { path: "C:\\dev\\sanctum" } }
    ]
  },
  {
    id: "alaira", name: "Alaira", group: "trabajo", kind: "Investigación",
    note: "Dossier de startup. Bot de mesa invitado.",
    bot: true, icon: "beaker",
    pieces: [
      { id: "notion",  label: "Notion",  icon: "database", meta: "base",     group: "papeles", op: "open", kind: "firefox", payload: { urls: ["https://notion.so/alaira-dossier"] } },
      { id: "docs",    label: "Docs",    icon: "file",     meta: "papeles",  group: "papeles", op: "open", kind: "folder",  payload: { path: "C:\\Users\\dani\\Documents\\alaira\\docs" } },
      { id: "browser", label: "Browser", icon: "globe",    meta: "pestañas", group: "web",     op: "open", kind: "firefox", payload: { urls: ["https://crunchbase.com/organization/alaira", "https://pitchbook.com/profiles/alaira"] } }
    ]
  },
  {
    id: "compiladores", name: "Compiladores", group: "universidad", kind: "Curso",
    note: "Material del semestre. Todo local.",
    bot: false, icon: "book",
    pieces: [
      { id: "vscode",  label: "VS Code", icon: "code",   meta: "código",   group: "código",   op: "open", kind: "vscode", payload: { path: "C:\\Users\\dani\\Projects\\compiladores" } },
      { id: "carpeta", label: "Carpeta", icon: "folder", meta: "archivos", group: "archivos", op: "open", kind: "folder", payload: { path: "C:\\Users\\dani\\Projects\\compiladores" } },
      { id: "pdf",     label: "PDF",     icon: "file",   meta: "apunte",   group: "papeles",  op: "open", kind: "file",   payload: { path: "C:\\Users\\dani\\Documents\\compiladores.pdf" } }
    ]
  },
  {
    id: "taller", name: "Taller", group: "universidad", kind: "Prueba",
    note: "Una pieza apunta fuera de la allowlist. El host debe rechazarla.",
    bot: false, icon: "flask",
    pieces: [
      { id: "fuera", label: "Fuera de root",  icon: "alert",  meta: "prueba",   group: "prueba",   op: "open", kind: "folder", payload: { path: "C:\\Windows\\System32" } },
      { id: "ok",    label: "Carpeta válida", icon: "folder", meta: "archivos", group: "archivos", op: "open", kind: "folder", payload: { path: "C:\\Users\\dani\\Documents" } }
    ]
  }
];

const ROOTS = ["C:\\dev", "C:\\Users\\dani\\Documents", "C:\\Users\\dani\\Projects"];
const BIN = {
  cursor: "Cursor.exe",
  vscode: "Code.exe",
  firefox: "firefox.exe",
  folder: "explorer.exe",
  file: "ShellExecuteW"
};

function normalizePath(p) {
  const parts = p.replace(/\//g, "\\").split("\\");
  const out = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") { out.pop(); continue; }
    out.push(part);
  }
  return out.join("\\");
}
function underRoot(path) {
  const a = path.toLowerCase();
  return ROOTS.some(r => { const b = r.toLowerCase(); return a === b || a.startsWith(b + "\\"); });
}
function buildArgv(kind, payload) {
  if (payload.path) {
    switch (kind) {
      case "cursor": return ["Cursor.exe", payload.path];
      case "vscode": return ["Code.exe", "--new-window", payload.path];
      case "folder": return ["explorer.exe", payload.path];
      case "file":   return ["ShellExecuteW", payload.path];
      default:       return null;
    }
  }
  if (payload.urls) return ["firefox.exe", "--new-window", ...payload.urls];
  return null;
}
function hostHandle(req) {
  if (!BIN[req.kind]) return { status: "rejected", reason: "kind no permitido: " + req.kind, argv: null };
  if (req.op !== "open") return { status: "rejected", reason: "op no soportada: " + req.op, argv: null };
  const p = req.payload || {};
  if (p.path) {
    const norm = normalizePath(p.path);
    if (!underRoot(norm)) return { status: "rejected", reason: "path fuera de la allowlist: " + norm, argv: null };
    const argv = buildArgv(req.kind, { path: norm });
    if (!argv) return { status: "rejected", reason: "adaptador sin argv para " + req.kind, argv: null };
    return { status: "ok", argv };
  }
  if (Array.isArray(p.urls)) {
    if (!p.urls.length) return { status: "rejected", reason: "urls vacío", argv: null };
    const bad = p.urls.find(u => !/^https?:\/\//i.test(u));
    if (bad) return { status: "rejected", reason: "url no http(s): " + bad, argv: null };
    return { status: "ok", argv: buildArgv(req.kind, { urls: p.urls }) };
  }
  return { status: "rejected", reason: "payload sin path ni urls", argv: null };
}

const STORAGE_KEY = "paravel.demo.v4";
function loadPersisted() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function savePersisted() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: state.theme,
      homeView: state.homeView,
      selections: Object.fromEntries(Object.entries(state.selections).map(([k, v]) => [k, [...v]])),
      invitations: state.invitations,
      audit: state.audit.slice(-200),
      sidebarCollapsed: state.sidebarCollapsed,
      hostOnline: state.hostOnline
    }));
  } catch {}
}

const persisted = loadPersisted() || {};
const state = {
  view: "home",
  currentSpaceId: null,
  theme: persisted.theme || "dark",
  homeView: persisted.homeView || "gallery",
  hostOnline: persisted.hostOnline !== false,
  sidebarCollapsed: persisted.sidebarCollapsed || {},
  selections: {},
  invitations: persisted.invitations || {},
  audit: persisted.audit || [],
  pieceStates: {},
  playState: "idle",
  logDrawerOpen: false,
  logFilters: { status: "all", kind: "all" },
  modal: { open: false, kind: null, spaceId: null, pack: [], editing: false },
  cmdk: { open: false, query: "", selIndex: 0, items: [] },
  kbFocusIndex: 0
};

for (const [spaceId, arr] of Object.entries(persisted.selections || {})) {
  state.selections[spaceId] = new Set(arr);
}
for (const s of DEFAULT_SPACES) {
  if (s.bot && !state.invitations[s.id]) {
    state.invitations[s.id] = { botId: "bot-" + s.id, pack: s.pieces.map(p => p.id), invitedAt: Date.now() };
  }
}

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rid = () => Math.random().toString(16).slice(2, 8);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const now = () => new Date().toLocaleTimeString("es-ES", { hour12: false });
const spaces = () => DEFAULT_SPACES;
const getSpace = id => DEFAULT_SPACES.find(s => s.id === id);
const currentSpace = () => state.currentSpaceId ? getSpace(state.currentSpaceId) : null;

function toast(msg, kind = "info", icon = "sparkle") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.innerHTML = `<span class="ic">${ICONS[icon] || ICONS.sparkle}</span><span>${esc(msg)}</span>`;
  $("toasts").appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .2s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

function pieceHealth(piece) {
  const dry = hostHandle({ op: piece.op, kind: piece.kind, payload: piece.payload, request_id: "dry" });
  if (dry.status !== "ok") return "bad";
  if (piece.lastLaunchedAt) return "ok";
  return "unknown";
}
function spaceHealth(space) {
  const hs = space.pieces.map(pieceHealth);
  if (hs.includes("bad")) return "bad";
  if (hs.every(h => h === "unknown")) return "unknown";
  return "ok";
}
function healthLabel(h) {
  return h === "ok" ? "operativa" : h === "bad" ? "atención" : h === "warn" ? "atención" : "sin verificar";
}
function healthCls(h) { return h === "ok" ? "" : h === "unknown" ? "unknown" : h; }

function predictRejections(pieces) {
  return pieces.filter(p => hostHandle({ op: p.op, kind: p.kind, payload: p.payload, request_id: "dry" }).status !== "ok");
}
function getSelection(spaceId) {
  if (!state.selections[spaceId]) {
    const s = getSpace(spaceId);
    state.selections[spaceId] = new Set(s ? s.pieces.map(p => p.id) : []);
  }
  return state.selections[spaceId];
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  $("btn-theme").innerHTML = state.theme === "dark" ? ICONS.sun : ICONS.moon;
}
$("btn-theme").addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme(); savePersisted();
});

function renderSidebar() {
  $("sidebar-header").innerHTML = `
    <div class="avatar">P</div>
    <div class="name">Paravel</div>
    <div class="chev">${ICONS.chevDown}</div>`;

  $("sidebar-nav").innerHTML = `<button class="nav-item ${state.view === "home" ? "active" : ""}" data-view="home">
      <span class="icon">${ICONS.home}</span> Sede
    </button>`;

  const groups = ["trabajo", "universidad"];
  $("sidebar-spaces").innerHTML = groups.map(g => {
    const items = spaces().filter(s => s.group === g);
    if (!items.length) return "";
    const collapsed = !!state.sidebarCollapsed[g];
    const list = items.map(s => {
      const isActive = state.currentSpaceId === s.id;
      const h = spaceHealth(s);
      return `<button class="space-item ${isActive ? "active" : ""}" data-open="${s.id}">
        <span class="hb ${healthCls(h)}" title="${esc(healthLabel(h))}"></span>
        <span>${esc(s.name)}</span>
        ${state.invitations[s.id] ? '<span class="badge">Bot</span>' : ""}
      </button>`;
    }).join("");
    return `<div class="sidebar-section ${collapsed ? "collapsed" : ""}" data-section="${g}">
      <div class="sidebar-section-title" data-toggle-section="${g}">
        <span class="tw">${ICONS.chevDown}</span>
        ${esc(g)}
      </div>
      <div class="spaces-list">${list}</div>
    </div>`;
  }).join("");
}

$("sidebar").addEventListener("click", e => {
  const navBtn = e.target.closest("[data-view]");
  if (navBtn) { renderHome(); return; }
  const toggle = e.target.closest("[data-toggle-section]");
  if (toggle) {
    const g = toggle.dataset.toggleSection;
    state.sidebarCollapsed[g] = !state.sidebarCollapsed[g];
    savePersisted(); renderSidebar();
    return;
  }
  const spaceBtn = e.target.closest("[data-open]");
  if (spaceBtn) openSpace(spaceBtn.dataset.open);
});

function setBreadcrumbs(html) { $("breadcrumbs").innerHTML = html; }

function renderHome() {
  state.view = "home";
  state.currentSpaceId = null;
  state.playState = "idle";
  state.pieceStates = {};
  setBreadcrumbs(`<span class="b">Sede</span>`);
  renderSidebar();
  renderChips();

  const gallery = spaces().map((s, idx) => {
    const h = spaceHealth(s);
    const invited = !!state.invitations[s.id];
    const pcs = s.pieces.map(p => p.label).join(" · ");
    return `<article class="space-card ${idx === state.kbFocusIndex ? "kb-focus" : ""}" data-open="${s.id}" data-h="${h}" tabindex="0">
      <div class="card-head">
        <span class="ico">${ICONS[s.icon] || ICONS.folder}</span>
        <h3 class="card-title">${esc(s.name)}</h3>
        <span class="kind">${esc(s.kind)}</span>
      </div>
      <div class="card-desc">${esc(s.note)}</div>
      <div class="card-foot">
        <span class="lbl">Mesa</span>
        <span class="pcs">${esc(pcs)}</span>
        ${invited ? '<span class="bot-tag">Bot</span>' : ""}
      </div>
    </article>`;
  }).join("");

  const table = `<table class="space-table">
    <thead>
      <tr>
        <th>Nombre</th>
        <th>Grupo</th>
        <th>Tipo</th>
        <th>Mesa</th>
        <th>Bot</th>
      </tr>
    </thead>
    <tbody>
      ${spaces().map(s => {
        const h = spaceHealth(s);
        const invited = state.invitations[s.id] ? "Sí" : "—";
        const pcs = s.pieces.map(p => p.label).join(", ");
        return `<tr data-open="${s.id}" tabindex="0" aria-label="Abrir ${esc(s.name)}">
          <td class="name"><span class="hb ${healthCls(h)}"></span>${esc(s.name)}</td>
          <td>${esc(s.group)}</td>
          <td>${esc(s.kind)}</td>
          <td>${esc(pcs)}</td>
          <td>${invited}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>`;

  $("content").innerHTML = `
    <div class="gallery-header">
      <div class="htxt">
        <h1>Espacios</h1>
        <p>Entra a un espacio, marca las piezas de su mesa y dale Iniciar. Un Bot se puede invitar aparte.</p>
      </div>
      <div class="view-toggles">
        <button data-home-view="gallery" class="${state.homeView === "gallery" ? "active" : ""}">Galería</button>
        <button data-home-view="table" class="${state.homeView === "table" ? "active" : ""}">Tabla</button>
      </div>
    </div>
    ${state.homeView === "table" ? table : `<div class="card-grid" id="card-grid">${gallery}</div>`}
  `;
}

function renderSpace(id) {
  const s = getSpace(id);
  if (!s) return;

  state.view = "space";
  state.currentSpaceId = id;
  state.playState = "idle";
  getSelection(id);

  setBreadcrumbs(`<span class="b">Sede</span> <span class="sep">/</span> <span>${esc(s.group)}</span> <span class="sep">/</span> <span class="b">${esc(s.name)}</span>`);
  renderSidebar();
  renderChips();

  const h = spaceHealth(s);
  const hbCls = healthCls(h);

  const tiles = s.pieces.map(p => {
    const norm = p.payload.path ? normalizePath(p.payload.path) : null;
    const isBad = norm && !underRoot(norm);
    const targetText = p.payload.path
      ? `${p.kind} → ${norm}`
      : `${p.kind} → ${p.payload.urls.length} url${p.payload.urls.length === 1 ? "" : "s"}`;
    const ph = pieceHealth(p);
    const phCls = healthCls(ph);
    const ps = state.pieceStates[p.id] || "";
    const selected = state.selections[id].has(p.id);
    const indicator = ps === "running"
      ? ICONS.spinner
      : `<span class="piece-hb ${ps === "ok" ? "" : ps === "rejected" ? "bad" : phCls}"></span>`;
    return `<button class="piece-tile ${ps}" type="button" aria-pressed="${selected}" data-piece="${p.id}" aria-label="Alternar ${esc(p.label)}">
      <span class="piece-check">${ICONS.check}</span>
      <div class="piece-body">
        <div class="piece-head">
          <span class="piece-icon">${ICONS[p.icon] || ICONS.file}</span>
          <span class="piece-name">${esc(p.label)}</span>
          ${indicator}
        </div>
        <span class="piece-meta">${esc(p.meta)}</span>
        <span class="piece-target ${isBad ? "bad" : ""}">${esc(targetText)}</span>
      </div>
      <span class="piece-mini" data-mini="${p.id}" title="Lanzar sólo esta">${ICONS.playSm}</span>
    </button>`;
  }).join("");

  const groupsSet = [...new Set(s.pieces.map(p => p.group).filter(Boolean))];
  const groupBar = `<div class="group-bar" id="group-bar">
    <span class="lbl">Selección</span>
    <button class="grp-btn" data-grp="all">Todo <span class="ct">${s.pieces.length}</span></button>
    <button class="grp-btn" data-grp="none">Ninguno</button>
    ${groupsSet.map(g => {
      const n = s.pieces.filter(p => p.group === g).length;
      return `<button class="grp-btn" data-grp="${esc(g)}">${esc(g)} <span class="ct">${n}</span></button>`;
    }).join("")}
  </div>`;

  const invited = state.invitations[id];
  const invite = invited
    ? `<div class="invite-box">
        <span class="ib-icon">${ICONS.bot}</span>
        <div class="main-txt">
          <div>Bot de mesa invitado. Ve sólo el pack de <b>${esc(s.name)}</b>, no el resto de Paravel.</div>
          <div class="pack-chips">
            ${invited.pack.map(pid => {
              const pc = s.pieces.find(p => p.id === pid);
              return pc ? `<span class="pack-chip">${ICONS[pc.icon] || ICONS.file}<span>${esc(pc.label)}</span></span>` : "";
            }).join("")}
          </div>
        </div>
        <div class="actions">
          <button class="btn-sm" data-invite-edit="${id}">Editar pack</button>
          <button class="btn-sm" data-invite-revoke="${id}">Expulsar</button>
        </div>
      </div>`
    : `<div class="invite-box">
        <span class="ib-icon">${ICONS.inbox}</span>
        <div class="main-txt">Sin Bot invitado. La mesa igual sirve: marca piezas e inicia.</div>
        <div class="actions">
          <button class="btn-sm primary" data-invite="${id}">Invitar Bot</button>
        </div>
      </div>`;

  $("content").innerHTML = `
    <div class="space-detail">
      <div class="space-head">
        <div class="kicker"><span class="hb ${hbCls}"></span>${esc(healthLabel(h))} · ${esc(s.kind)} · ${esc(s.group)}</div>
        <div class="space-title">
          <span class="ico-lg">${ICONS[s.icon] || ICONS.folder}</span>
          <h1>${esc(s.name)}</h1>
        </div>
        <p class="desc">${esc(s.note)}</p>
        <div class="space-meta">
          <div class="m"><span class="l">Piezas</span><span class="v" id="piece-count"></span></div>
          <div class="m"><span class="l">Compañía</span><span class="v">${invited ? "Bot de mesa" : "Sin bot"}</span></div>
        </div>
      </div>
      ${invite}
      ${groupBar}
      <div class="pieces-grid" id="pieces-grid">${tiles}</div>
      <div class="play-bar hidden" id="play-bar">
        <div class="preview" id="play-preview"></div>
        <button class="play-btn" id="play-btn">
          <span class="play-icon">${ICONS.play}</span>
          <span class="play-label">Iniciar</span>
        </button>
      </div>
    </div>
  `;
  syncPlay();
}

function syncPlay() {
  const s = currentSpace();
  if (!s || state.view !== "space") return;

  const bar = $("play-bar");
  const btn = $("play-btn");
  const preview = $("play-preview");
  const count = $("piece-count");
  const sel = state.selections[s.id];
  const n = sel.size;
  const total = s.pieces.length;

  bar.classList.toggle("hidden", n === 0 && state.playState !== "busy");

  btn.disabled = n === 0 || state.playState === "busy";
  btn.className = "play-btn " + state.playState;
  btn.querySelector(".play-label").textContent =
    state.playState === "busy" ? "Lanzando" :
    state.playState === "done" ? "Listo" : "Iniciar";

  $$(".piece-tile").forEach(tile => {
    const id = tile.dataset.piece;
    tile.setAttribute("aria-pressed", sel.has(id) ? "true" : "false");
    tile.classList.remove("running", "ok", "rejected");
    const ps = state.pieceStates[id];
    if (ps) tile.classList.add(ps);
  });

  if (count) count.textContent = n === total ? `Todas (${total})` : `${n} de ${total}`;

  if (preview) {
    if (state.playState === "busy") preview.innerHTML = `<span>lanzando…</span>`;
    else if (state.playState === "done") preview.innerHTML = `<span>hecho</span>`;
    else {
      const pieces = s.pieces.filter(p => sel.has(p.id));
      const rej = predictRejections(pieces);
      let html = `<span><span class="num">${n}</span> ${n === 1 ? "pieza" : "piezas"}</span>`;
      if (rej.length) {
        html += `<span class="rej" title="${esc(rej.map(r => r.label).join(", "))}">${ICONS.alert}${rej.length} rechazo${rej.length === 1 ? "" : "s"}</span>`;
      }
      preview.innerHTML = html;
    }
  }
}

async function launchPieces(pieces) {
  const s = currentSpace();
  if (!s || !pieces.length) return;

  if (!state.hostOnline) {
    say("CTO", "Host no disponible. La UI <b>no</b> intenta shell por su cuenta. Eso es el diseño, no un fallo.", "bot");
    toast("Host caído. No se lanzó nada.", "bad", "alert");
    return;
  }

  state.playState = "busy";
  syncPlay();

  for (const piece of pieces) {
    state.pieceStates[piece.id] = "running";
    syncPlay();
    await sleep(500 + Math.random() * 300);

    const req = { op: piece.op, kind: piece.kind, payload: piece.payload, request_id: rid() };
    const t0 = performance.now();
    const res = hostHandle(req);
    res.durationMs = Math.max(1, Math.round(performance.now() - t0)) + 1;

    state.audit.push({ t: now(), req, res, durationMs: res.durationMs });
    state.pieceStates[piece.id] = res.status === "ok" ? "ok" : "rejected";
    if (res.status === "ok") piece.lastLaunchedAt = Date.now();

    syncPlay();
    if (state.logDrawerOpen) renderLogDrawer();
  }

  state.playState = "done";
  syncPlay();
  savePersisted();

  const recent = state.audit.slice(-pieces.length);
  const okN = recent.filter(e => e.res.status === "ok").length;
  const badN = recent.length - okN;

  if (badN === 0) toast(`${okN} lanzada${okN === 1 ? "" : "s"}.`, "ok", "check");
  else toast(`${okN} ok, ${badN} rechazada${badN === 1 ? "" : "s"}. Ver log.`, "bad", "alert");
}

$("content").addEventListener("click", e => {
  const hv = e.target.closest("[data-home-view]");
  if (hv) {
    state.homeView = hv.dataset.homeView;
    savePersisted();
    renderHome();
    return;
  }
  if (e.target.closest("#play-btn")) {
    const s = currentSpace();
    if (!s) return;
    const pieces = s.pieces.filter(p => state.selections[s.id].has(p.id));
    const rej = predictRejections(pieces);
    if (rej.length > 0 && !confirm(`Hay ${rej.length} rechazo(s) previsto(s). ¿Lanzar igual?`)) return;
    launchPieces(pieces);
    return;
  }
  const mini = e.target.closest("[data-mini]");
  if (mini) {
    e.stopPropagation();
    const s = currentSpace();
    if (!s) return;
    const piece = s.pieces.find(p => p.id === mini.dataset.mini);
    if (piece) launchPieces([piece]);
    return;
  }
  const grp = e.target.closest("[data-grp]");
  if (grp && currentSpace()) {
    const s = currentSpace();
    const v = grp.dataset.grp;
    if (v === "all") state.selections[s.id] = new Set(s.pieces.map(p => p.id));
    else if (v === "none") state.selections[s.id] = new Set();
    else state.selections[s.id] = new Set(s.pieces.filter(p => p.group === v).map(p => p.id));
    state.playState = "idle";
    syncPlay();
    savePersisted();
    return;
  }
  const inv = e.target.closest("[data-invite]");
  if (inv) { openInviteModal(inv.dataset.invite); return; }
  const invEdit = e.target.closest("[data-invite-edit]");
  if (invEdit) { openInviteModal(invEdit.dataset.inviteEdit, true); return; }
  const invRev = e.target.closest("[data-invite-revoke]");
  if (invRev) {
    delete state.invitations[invRev.dataset.inviteRevoke];
    savePersisted(); renderSpace(invRev.dataset.inviteRevoke);
    toast("Bot expulsado de la mesa.");
    return;
  }
  const row = e.target.closest("tr[data-open]");
  if (row) { openSpace(row.dataset.open); return; }
  const card = e.target.closest(".space-card[data-open]");
  if (card) { openSpace(card.dataset.open); return; }
  const tile = e.target.closest(".piece-tile[data-piece]");
  if (tile && currentSpace()) {
    const s = currentSpace();
    const id = tile.dataset.piece;
    const sel = state.selections[s.id];
    if (sel.has(id)) sel.delete(id); else sel.add(id);
    state.playState = "idle";
    syncPlay();
    savePersisted();
  }
});

$("content").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const card = e.target.closest(".space-card[data-open], tr[data-open]");
    if (card) openSpace(card.dataset.open);
  }
});

function openSpace(id) { renderSpace(id); }

function openLogDrawer() {
  state.logDrawerOpen = true;
  $("log-drawer").classList.add("open");
  renderLogDrawer();
}
function closeLogDrawer() {
  state.logDrawerOpen = false;
  $("log-drawer").classList.remove("open");
}
$("log-close").addEventListener("click", closeLogDrawer);
$("btn-log").addEventListener("click", () => state.logDrawerOpen ? closeLogDrawer() : openLogDrawer());

function filteredAudit() {
  return state.audit.filter(e =>
    (state.logFilters.status === "all" || e.res.status === state.logFilters.status) &&
    (state.logFilters.kind === "all" || e.req.kind === state.logFilters.kind)
  );
}

function renderLogEntry(e) {
  const r = e.res;
  const cls = r.status === "ok" ? "ok" : "rejected";
  const json = JSON.stringify(e.req, null, 2);
  const argv = r.argv ? `argv = ${JSON.stringify(r.argv)}` : "";
  const why = r.reason ? `rechazo: ${r.reason}` : "";
  const dur = e.durationMs ? `${e.durationMs}ms` : "—";
  const argvEsc = r.argv ? JSON.stringify(r.argv).replace(/"/g, "&quot;") : "";
  return `<article class="log-entry ${cls}">
    <header>
      <span class="rid">#${e.req.request_id}</span>
      <span>${e.t}</span>
      <span class="op">${esc(e.req.op)} · ${esc(e.req.kind)}</span>
      <span class="dur">${dur}</span>
      <span class="st">${r.status}</span>
    </header>
    <pre>${esc(json)}</pre>
    ${argv ? `<pre><b>${esc(argv)}</b>
      <button class="copy" data-copy="${argvEsc}">copiar argv</button>
      <button class="replay" data-replay="${esc(e.req.request_id)}">reproducir</button>
    </pre>` : ""}
    ${why ? `<pre class="why">${esc(why)}</pre>` : ""}
  </article>`;
}

function renderGhostEntry() {
  return `<article class="log-entry ok">
    <header>
      <span class="rid">#a1b2c3</span>
      <span>12:04:02</span>
      <span class="op">open · vscode</span>
      <span class="dur">142ms</span>
      <span class="st">ok</span>
    </header>
    <pre>{
  "op": "open",
  "kind": "vscode",
  "payload": { "path": "C:\\\\dev\\\\proyecto" },
  "request_id": "a1b2c3"
}</pre>
    <pre><b>argv = ["Code.exe","--new-window","C:\\\\dev\\\\proyecto"]</b></pre>
  </article>`;
}

function renderLogDrawer() {
  const kinds = [...new Set(state.audit.map(e => e.req.kind))];
  const kindSel = $("log-f-kind");
  const currentKind = state.logFilters.kind;
  kindSel.innerHTML = `<option value="all">kind: all</option>` +
    kinds.map(k => `<option value="${esc(k)}" ${currentKind === k ? "selected" : ""}>kind: ${esc(k)}</option>`).join("");

  const list = filteredAudit();
  $("log-count").textContent = `${list.length} / ${state.audit.length}`;

  if (!state.audit.length) {
    $("log-body").innerHTML = `
      <div class="empty-state" style="padding:24px;">
        <div class="ghost">${renderGhostEntry()}</div>
        <div class="hint">Cuando lances algo, aparecerá acá. El argv es Code.exe, no code.cmd.</div>
      </div>
    `;
    return;
  }

  $("log-body").innerHTML = list.length
    ? [...list].reverse().map(renderLogEntry).join("")
    : `<div class="empty">Sin entradas con ese filtro.</div>`;
}
$("log-f-status").addEventListener("change", e => { state.logFilters.status = e.target.value; renderLogDrawer(); });
$("log-f-kind").addEventListener("change", e => { state.logFilters.kind = e.target.value; renderLogDrawer(); });

document.addEventListener("click", e => {
  const copy = e.target.closest("[data-copy]");
  if (copy) {
    navigator.clipboard?.writeText(copy.dataset.copy.replace(/&quot;/g, '"'));
    toast("argv copiado", "ok", "check");
    return;
  }
  const replay = e.target.closest("[data-replay]");
  if (replay) {
    const rid_ = replay.dataset.replay;
    const entry = state.audit.find(en => en.req.request_id === rid_);
    if (!entry) return;
    const res = hostHandle(entry.req);
    res.durationMs = 1;
    state.audit.push({ t: now(), req: { ...entry.req, request_id: rid() }, res, durationMs: res.durationMs });

    const s = currentSpace();
    if (s) {
      const piece = s.pieces.find(p =>
        p.kind === entry.req.kind &&
        JSON.stringify(p.payload) === JSON.stringify(entry.req.payload)
      );
      if (piece) {
        state.pieceStates[piece.id] = res.status === "ok" ? "ok" : "rejected";
        if (res.status === "ok") piece.lastLaunchedAt = Date.now();
        syncPlay();
        renderSidebar();
      }
    }
    savePersisted();
    if (state.logDrawerOpen) renderLogDrawer();
    toast(`Reproducido #${rid_} → ${res.status}`, res.status === "ok" ? "ok" : "bad", res.status === "ok" ? "check" : "alert");
  }
});

function openInviteModal(spaceId, editing = false) {
  const s = getSpace(spaceId);
  if (!s) return;
  const existing = state.invitations[spaceId];
  state.modal = {
    open: true, kind: "invite", spaceId,
    pack: existing ? [...existing.pack] : s.pieces.map(p => p.id),
    editing
  };
  renderModal();
  $("modal-scrim").classList.add("open");
}
function closeModal() {
  state.modal.open = false;
  $("modal-scrim").classList.remove("open");
}
$("modal-scrim").addEventListener("click", e => {
  if (e.target === $("modal-scrim")) closeModal();
});

function renderModal() {
  if (!state.modal.open || state.modal.kind !== "invite") return;
  renderInviteModal();
}

function renderInviteModal() {
  const s = getSpace(state.modal.spaceId);
  const pack = new Set(state.modal.pack);
  const rows = s.pieces.map(p => {
    const on = pack.has(p.id);
    const target = p.payload.path
      ? normalizePath(p.payload.path)
      : `${p.payload.urls.length} url${p.payload.urls.length === 1 ? "" : "s"}`;
    return `<div class="pack-row ${on ? "on" : ""}" data-pack-toggle="${p.id}">
      <span class="ck">${ICONS.check}</span>
      <span class="ic">${ICONS[p.icon] || ICONS.file}</span>
      <div class="info">
        <div class="nm">${esc(p.label)}</div>
        <div class="mt">${esc(p.meta)} · ${esc(target)}</div>
      </div>
    </div>`;
  }).join("");

  const isEdit = state.modal.editing;
  const emptyPack = pack.size === 0;

  $("modal").innerHTML = `
    <header>
      <div class="htxt">
        <h2>${ICONS.bot} ${isEdit ? "Editar pack del Bot" : "Invitar Grok Bot"}</h2>
        <p>El Bot verá <b>sólo</b> las piezas marcadas abajo. Nunca el resto de Paravel, ni otras mesas, ni el disco de la cuenta.</p>
      </div>
      <button class="close" data-close-modal>${ICONS.close}</button>
    </header>
    <div class="body">
      <div class="pack-list">${rows}</div>
      <div class="pack-note">
        ${ICONS.alert}
        <div>xAI avisa que <b>bots distintos no son un límite de seguridad</b>. El aislamiento de esta mesa lo pone Paravel: el pack que elijas es lo único que se le pasa.</div>
      </div>
    </div>
    <footer>
      <button class="btn" data-close-modal>Cancelar</button>
      <button class="btn primary" id="invite-confirm" ${emptyPack ? "disabled" : ""}>
        ${isEdit ? "Guardar pack" : "Invitar Bot"}
      </button>
    </footer>
  `;

  $("modal").querySelectorAll("[data-close-modal]").forEach(b => b.addEventListener("click", closeModal));
  $("modal").querySelectorAll("[data-pack-toggle]").forEach(row => {
    row.addEventListener("click", () => {
      const id = row.dataset.packToggle;
      const i = state.modal.pack.indexOf(id);
      if (i >= 0) state.modal.pack.splice(i, 1);
      else state.modal.pack.push(id);
      renderInviteModal();
    });
  });
  const btn = $("invite-confirm");
  if (btn) btn.addEventListener("click", () => {
    if (!state.modal.pack.length) return;
    const spaceId = state.modal.spaceId;
    state.invitations[spaceId] = {
      botId: "bot-" + spaceId,
      pack: [...state.modal.pack],
      invitedAt: Date.now()
    };
    const wasEditing = state.modal.editing;
    savePersisted();
    closeModal();
    if (state.view === "space") renderSpace(spaceId);
    renderSidebar();
    toast(wasEditing ? "Pack actualizado." : "Bot invitado a la mesa.", "ok", "bot");
  });
}

function say(who, html, cls) {
  const el = document.createElement("div");
  el.className = "cto-msg " + cls;
  el.innerHTML = `<div class="who">${who}</div><div class="bubble">${html}</div>`;
  $("cto-messages").appendChild(el);
  $("cto-messages").scrollTop = $("cto-messages").scrollHeight;
}

function orchestrationBlock(botName, packChips) {
  return `<div class="orch">
    <div class="lane"><span class="lbl">CTO</span><span class="nm">Director</span><span style="margin-left:auto;color:var(--faint);font-size:10px;">abre hilo</span></div>
    <div class="flow">↓ handoff ↑</div>
    <div class="lane"><span class="lbl">Bot mesa</span><span class="nm">${esc(botName)}</span></div>
    <div class="pack">
      <span class="plbl">pack</span>
      ${packChips.map(c => `<span class="pk">${esc(c)}</span>`).join("")}
    </div>
  </div>`;
}

function route(text) {
  const t = text.toLowerCase().trim();
  say("Tú", esc(text), "me");

  if (/alaira/.test(t) && /(contacto|convers|orquest|bot|ponme|hila|handoff)/.test(t)) {
    const s = getSpace("alaira");
    const inv = state.invitations.alaira;
    const packChips = inv
      ? inv.pack.map(pid => { const p = s.pieces.find(x => x.id === pid); return p ? p.label : pid; })
      : s.pieces.map(p => p.label);
    say("CTO",
      `Orquesto: <b>CTO ↔ Bot de Alaira</b>. Yo no investigo la startup — abro el hilo y coordino el handoff. Al Bot le paso <b>sólo su pack</b>; no ve Sanctum ni Compiladores.` +
      orchestrationBlock("Alaira", packChips),
      "bot");
    return;
  }

  const hit = spaces().find(s => {
    const n = s.name.toLowerCase();
    if (t.includes(n)) return true;
    if (s.kind === "Investigación" && /investiga|dossier|startup/.test(t)) return true;
    if (s.kind === "Curso" && /compila|curso|universidad|semestre/.test(t)) return true;
    if (s.kind === "Proyecto" && /código|code|repo|sanctum|site/.test(t)) return true;
    if (s.kind === "Prueba" && /taller|prueba|allowlist/.test(t)) return true;
    return false;
  });

  if (hit) {
    say("CTO", `Ve a <b>${esc(hit.name)}</b> (${esc(hit.kind)}, ${esc(hit.group)}). Ahí marcas piezas y das a Iniciar. Yo no abro ${esc(hit.pieces[0].label)}.`, "bot");
    openSpace(hit.id);
    return;
  }

  const candidatos = spaces().slice(0, 4).map(s => `<b>${esc(s.name)}</b>`).join(", ");
  say("CTO", `No matchea un espacio. Conozco el mapa: ${candidatos}. ¿A cuál vas?`, "bot");
}

function renderChips() {
  const s = currentSpace();
  let chips;
  if (s) {
    chips = ["iniciar todo", "sólo código", "sólo web",
      state.invitations[s.id] ? "ver pack del bot" : "invitar bot"];
  } else {
    chips = ["¿dónde está Alaira?", "ponme con el bot de Alaira", "compiladores", "algo de código"];
  }
  $("cto-chips").innerHTML = chips.map(c => `<button class="cto-chip" type="button">${esc(c)}</button>`).join("");
  $("cto-chips").querySelectorAll(".cto-chip").forEach(b => {
    b.addEventListener("click", () => {
      const txt = b.textContent;
      if (s && txt === "iniciar todo") { state.selections[s.id] = new Set(s.pieces.map(p => p.id)); syncPlay(); savePersisted(); return; }
      if (s && txt === "sólo código") { state.selections[s.id] = new Set(s.pieces.filter(p => p.group === "código").map(p => p.id)); syncPlay(); savePersisted(); return; }
      if (s && txt === "sólo web") { state.selections[s.id] = new Set(s.pieces.filter(p => p.group === "web").map(p => p.id)); syncPlay(); savePersisted(); return; }
      if (s && txt === "ver pack del bot") {
        const inv = state.invitations[s.id];
        if (inv) {
          const labels = inv.pack.map(pid => { const p = s.pieces.find(x => x.id === pid); return p ? p.label : pid; });
          say("CTO", `El Bot de <b>${esc(s.name)}</b> ve: ${labels.map(esc).join(", ")}. Nada más.`, "bot");
        }
        return;
      }
      if (s && txt === "invitar bot") { openInviteModal(s.id); return; }
      $("cto-input").value = txt;
      $("cto-form").requestSubmit();
    });
  });
}

$("cto-form").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("cto-input").value.trim();
  if (!v) return;
  $("cto-input").value = "";
  route(v);
});

function buildCmdkItems(query) {
  const items = [];
  for (const s of spaces()) items.push({ label: `Ir a ${s.name}`, kat: "ir", icon: ICONS[s.icon] || ICONS.folder, action: () => openSpace(s.id) });
  items.push({ label: "Ver Sede", kat: "ir", icon: ICONS.home, action: () => renderHome() });
  items.push({ label: state.logDrawerOpen ? "Cerrar log del host" : "Abrir log del host", kat: "host", icon: ICONS.terminal,
    action: () => state.logDrawerOpen ? closeLogDrawer() : openLogDrawer() });
  items.push({ label: state.theme === "dark" ? "Tema claro" : "Tema oscuro", kat: "sistema", icon: state.theme === "dark" ? ICONS.sun : ICONS.moon,
    action: () => { state.theme = state.theme === "dark" ? "light" : "dark"; applyTheme(); savePersisted(); } });
  items.push({ label: state.homeView === "gallery" ? "Vista tabla" : "Vista galería", kat: "sede", icon: ICONS.database,
    action: () => { state.homeView = state.homeView === "gallery" ? "table" : "gallery"; savePersisted(); if (state.view === "home") renderHome(); } });
  items.push({ label: state.hostOnline ? "Simular host caído" : "Simular host conectado", kat: "host", icon: ICONS.zap,
    action: () => { state.hostOnline = !state.hostOnline; renderHostBtn(); savePersisted(); toast(state.hostOnline ? "Host conectado." : "Host caído.", state.hostOnline ? "ok" : "bad", "zap"); } });
  items.push({ label: "Limpiar log del host", kat: "host", icon: ICONS.close,
    action: () => { state.audit = []; savePersisted(); if (state.logDrawerOpen) renderLogDrawer(); toast("Log limpiado."); } });

  const q = query.toLowerCase().trim();
  if (!q) return items.slice(0, 12);
  return items.filter(it => it.label.toLowerCase().includes(q) || it.kat.includes(q)).slice(0, 14);
}

function openCmdk() {
  state.cmdk.open = true; state.cmdk.query = ""; state.cmdk.selIndex = 0;
  $("cmdk-scrim").classList.add("open");
  $("cmdk-input").value = "";
  renderCmdk();
  setTimeout(() => $("cmdk-input").focus(), 30);
}
function closeCmdk() {
  state.cmdk.open = false;
  $("cmdk-scrim").classList.remove("open");
}
function renderCmdk() {
  const items = buildCmdkItems(state.cmdk.query);
  state.cmdk.items = items;
  if (state.cmdk.selIndex >= items.length) state.cmdk.selIndex = 0;
  $("cmdk-list").innerHTML = items.length
    ? items.map((it, i) => `<div class="item ${i === state.cmdk.selIndex ? "sel" : ""}" data-cmdk-idx="${i}">
        <span class="ic">${it.icon}</span><span>${esc(it.label)}</span>
        <span class="kat">${esc(it.kat)}</span>
      </div>`).join("")
    : `<div class="empty">Sin resultados.</div>`;
}
$("btn-cmdk").addEventListener("click", openCmdk);
$("cmdk-scrim").addEventListener("click", e => { if (e.target === $("cmdk-scrim")) closeCmdk(); });
$("cmdk-input").addEventListener("input", e => { state.cmdk.query = e.target.value; state.cmdk.selIndex = 0; renderCmdk(); });
$("cmdk-input").addEventListener("keydown", e => {
  if (e.key === "ArrowDown") { e.preventDefault(); state.cmdk.selIndex = Math.min(state.cmdk.items.length - 1, state.cmdk.selIndex + 1); renderCmdk(); }
  if (e.key === "ArrowUp") { e.preventDefault(); state.cmdk.selIndex = Math.max(0, state.cmdk.selIndex - 1); renderCmdk(); }
  if (e.key === "Enter") { e.preventDefault(); const it = state.cmdk.items[state.cmdk.selIndex]; if (it) { closeCmdk(); it.action(); } }
});
$("cmdk-list").addEventListener("click", e => {
  const item = e.target.closest("[data-cmdk-idx]");
  if (!item) return;
  const it = state.cmdk.items[parseInt(item.dataset.cmdkIdx, 10)];
  if (it) { closeCmdk(); it.action(); }
});

function renderHostBtn() {
  const el = $("hostbtn");
  el.classList.toggle("off", !state.hostOnline);
  el.innerHTML = `<span class="dot"></span> host · ${state.hostOnline ? "conectado" : "caído"}`;
}
$("hostbtn").addEventListener("click", () => {
  state.hostOnline = !state.hostOnline;
  renderHostBtn(); savePersisted();
  toast(state.hostOnline ? "Host conectado." : "Host caído. La UI no hará shell.", state.hostOnline ? "ok" : "bad", "zap");
});

document.addEventListener("keydown", e => {
  const inField = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault(); state.cmdk.open ? closeCmdk() : openCmdk(); return;
  }
  if (e.ctrlKey && e.key === "`") {
    e.preventDefault(); state.logDrawerOpen ? closeLogDrawer() : openLogDrawer(); return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && state.view === "space") {
    e.preventDefault();
    const s = currentSpace();
    if (!s) return;
    const pieces = s.pieces.filter(p => state.selections[s.id].has(p.id));
    if (!pieces.length) return;
    const rej = predictRejections(pieces);
    if (rej.length > 0 && !confirm(`Hay ${rej.length} rechazo(s) previsto(s). ¿Lanzar igual?`)) return;
    launchPieces(pieces);
    return;
  }
  if (e.key === "Escape") {
    if (state.modal.open) { closeModal(); return; }
    if (state.cmdk.open) { closeCmdk(); return; }
    if (state.logDrawerOpen) { closeLogDrawer(); return; }
    if (state.view === "space") { renderHome(); return; }
    return;
  }

  if (inField) return;

  if (state.view === "home" && (e.key === "j" || e.key === "k")) {
    const total = spaces().length; if (!total) return;
    state.kbFocusIndex = e.key === "j"
      ? Math.min(total - 1, state.kbFocusIndex + 1)
      : Math.max(0, state.kbFocusIndex - 1);
    renderHome();
    document.querySelectorAll(".space-card, .space-table tbody tr")[state.kbFocusIndex]?.scrollIntoView({ block: "nearest" });
    return;
  }
  if (state.view === "home" && e.key === "Enter") {
    const focused = document.querySelector(".space-card.kb-focus") || document.querySelector(".space-table tbody tr");
    if (focused) openSpace(focused.dataset.open);
  }
});

function init() {
  applyTheme();
  renderHostBtn();
  $("cto-ico").innerHTML = ICONS.sparkle;
  say("CTO", "Dime en qué andas. Te mando a un espacio o pongo en contacto dos mesas. No abro yo el repo.", "bot");
  if (state.hostOnline === false) toast("Host caído (persistido). La UI no hará shell.", "bad", "alert");
  renderHome();
}
init();

setInterval(savePersisted, 4000);
window.addEventListener("beforeunload", savePersisted);
