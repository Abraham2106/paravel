import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import capabilities from "../src-tauri/capabilities/default.json";
import CaptureDialog from "./CaptureDialog";
import type { ExitGuard } from "./capture";
import ContinuityPanel from "./ContinuityPanel";
import TemplateWizard from "./TemplateWizard";
import PreparationPanel from "./PreparationPanel";
import type { TemplateCreated } from "./templates";
import type { ContinuityGuard } from "./continuity";
import FirefoxGroupDialog from "./FirefoxGroupDialog";
import type { FirefoxGroupInput } from "./firefoxGroup";
import { DEFAULT_GROUP_ICON, GROUP_ICONS, GroupGlyph, resolveGroupIcon } from "./groupIcons";
import SettingsDialog from "./SettingsDialog";
import "./Settings.css";
import { destinationChanged, hitTarget, type NavigationOutcome, type NavigationResolve, type SearchHit } from "./navigation";
import GlobalSearchDialog from "./GlobalSearchDialog";
import { hostErrorMessage, invokeSafe, isTauri, TauriRuntimeUnavailableError } from "./tauri";

type Group = { id: string; name: string; icon?: string; order: number };
type Space = { id: string; groupId: string; name: string; note: string | null; pack: string[]; botActive: boolean };
type Piece = {
  id: string;
  spaceId: string;
  kind: "vscode" | "cursor" | "firefox" | "firefox-group" | "folder" | "file";
  name: string;
  payload: { path?: string; url?: string; urls?: string[] };
  marked: boolean;
  order: number;
};
type LaunchResult = { requestId: string; argv: string[]; logPath: string };
type HomeView = "gallery" | "table";
type PieceRun = { ok: true } | { ok: false; error: string };
type PathCheck = { ok: true } | { ok: false; error: string };
type PathProbeResult = { id: string; ok: boolean; error?: string | null };

const kindLabel = { vscode: "VS Code", cursor: "Cursor", firefox: "web", "firefox-group": "Grupo de Firefox", folder: "Carpeta", file: "archivo" };

function mesaPrompt(spaceName: string, groupName: string) {
  return `Eres un Bot de mesa de Paravel. Trabajas solo esta mesa.

Mesa: ${spaceName}
Grupo: ${groupName} (etiqueta, no destino)

Tu único contexto es el pack de esta mesa: nota del espacio, lista de piezas y payloads, excerpts y adjuntos.
Los paths locales son etiquetas. No tienes el disco de la cuenta.

No eres el CTO de Paravel.
No diriges Paravel ni a otros espacios.
No orquestas Bots de otras mesas.
No mezclas esta mesa con otra.
No pides otras mesas, el mapa de espacios, ni el disco.

Si el pack no alcanza, dilo. No inventes mesas ni hagas de CTO.
Haz el trabajo de esta mesa. Nada más.`;
}

function pathLabel(path?: string) {
  if (!path) return "";
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function packPayload(piece: Piece) {
  if (piece.kind === "firefox" || piece.kind === "firefox-group") {
    const urls = piece.payload.urls ?? (piece.payload.url ? [piece.payload.url] : []);
    return JSON.stringify({ urls });
  }
  return JSON.stringify({ path: pathLabel(piece.payload.path) });
}

function formatMesaPack(space: Space, groupName: string, packPieces: Piece[]) {
  const rows = packPieces.map((piece) =>
    `| ${piece.name} | ${piece.kind} | \`${packPayload(piece)}\` | no | no |`,
  );
  const pack = `# Pack — ${space.name}
Grupo: ${groupName}   (etiqueta)
Nota:
${space.note?.trim() || "(sin nota)"}

## Piezas
| nombre | kind | payload | excerpt | adjunto |
| --- | --- | --- | --- | --- |
${rows.join("\n") || "|  |  |  |  |  |"}

## Excerpts
Ninguno.

## Adjuntos
Ninguno.`;
  return `${mesaPrompt(space.name, groupName)}\n\n${pack}`;
}

function shortError(error: unknown) {
  if (error instanceof TauriRuntimeUnavailableError) return "Host desconectado";
  const text = error instanceof Error ? error.message : String(error);
  const cleaned = text.replace(/^Host no disponible:\s*/i, "").trim();
  return cleaned.length > 72 ? `${cleaned.slice(0, 69)}…` : cleaned || "Error";
}

function pieceUrls(piece: Piece) {
  return piece.payload.urls ?? (piece.payload.url ? [piece.payload.url] : []);
}

const SPACE_SESSION_KEY = "paravel.spaceId";
const GROUP_SESSION_KEY = "paravel.groupId";
const nativeCloseAllowed = capabilities.permissions.some((permission: string) =>
  permission === "core:window:allow-destroy" || permission === "core:window:allow-all");

function readStoredId(key: string): string | null {
  try {
    const id = sessionStorage.getItem(key);
    return id || null;
  } catch {
    return null;
  }
}

function writeStoredId(key: string, id: string | null) {
  try {
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch {
    /* sessionStorage can throw in a locked-down webview */
  }
}

export default function Workspace() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [groupId, setGroupId] = useState<string | null>(() => readStoredId(GROUP_SESSION_KEY));
  const [spaceId, setSpaceId] = useState<string | null>(() => readStoredId(SPACE_SESSION_KEY));
  const [homeView, setHomeView] = useState<HomeView>("table");
  const [searchOpen, setSearchOpen] = useState(false);
  const [catalogEpoch, setCatalogEpoch] = useState(0);
  const [focusPieceId, setFocusPieceId] = useState<string | null>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const addMenu = useRef<HTMLDetailsElement>(null);
  const [filter, setFilter] = useState<"all" | "marked">("all");
  const [pieceGroup, setPieceGroup] = useState("all");
  const [status, setStatus] = useState(
    isTauri()
      ? "Cargando tu sede…"
      : "Abre la app con npm run tauri dev (ventana Tauri). El navegador no es el host.",
  );
  const [lastResult, setLastResult] = useState<LaunchResult | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logText, setLogText] = useState("");
  const [packOpen, setPackOpen] = useState(false);
  const [pack, setPack] = useState<string[]>([]);
  const [homeLoading, setHomeLoading] = useState(true);
  const [spaceLoading, setSpaceLoading] = useState(() => Boolean(readStoredId(SPACE_SESSION_KEY)));
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const activeSpace = useRef(spaceId);
  const operation = useRef(false);
  const [urlsOpen, setUrlsOpen] = useState(false);
  const [firefoxGroupOpen, setFirefoxGroupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const captureActive = useRef(false);
  const [nativeWarning, setNativeWarning] = useState(() => isTauri() && !nativeCloseAllowed);
  const [urlName, setUrlName] = useState("");
  const [urlText, setUrlText] = useState("");
  const [pieceRun, setPieceRun] = useState<Record<string, PieceRun>>({});
  const [pathCheck, setPathCheck] = useState<Record<string, PathCheck>>({});
  const [groupForm, setGroupForm] = useState<"create" | "edit" | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupIcon, setGroupIcon] = useState<string>(DEFAULT_GROUP_ICON);
  const [spaceFormOpen, setSpaceFormOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const templateActive = useRef(false);
  const [spaceName, setSpaceName] = useState("");
  const [spaceNote, setSpaceNote] = useState("");

  function resetPieceFilters() {
    setFilter("all");
    setPieceGroup("all");
    setPieceRun({});
    setPathCheck({});
  }

  const continuityGuard = useRef<ContinuityGuard | null>(null);
  const navigating = useRef(false);
  const pieceGeneration = useRef(0);
  const navAttempt = useRef(0);
  const focusHeading = useRef(false);
  const exitGuards = useRef<Set<ExitGuard>>(new Set());
  const registerDirtyGuard = useCallback((guard: ContinuityGuard) => {
    continuityGuard.current = guard;
    return () => { if (continuityGuard.current === guard) continuityGuard.current = null; };
  }, []);
  const registerExitGuard = useCallback((guard: ExitGuard) => {
    exitGuards.current.add(guard);
    return () => { exitGuards.current.delete(guard); };
  }, []);
  const allowExit = useCallback(async () => {
    if (navigating.current) return false;
    navigating.current = true;
    try {
      const guards = [...exitGuards.current].map((guard) => ({ label: guard.label, ...guard.state() }));
      if (guards.some((guard) => guard.busy || guard.blocked)) {
        setStatus("Espera a que terminen las operaciones y reintenta cualquier solicitud sin confirmar antes de salir.");
        return false;
      }
      const dirty = guards.filter((guard) => guard.dirty);
      if (!dirty.length) return guards.length ? true : await continuityGuard.current?.() ?? true;
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const accepted = window.confirm(`Hay cambios sin guardar en ${dirty.map((guard) => guard.label).join(" y ")}. ¿Descartarlos y continuar?`);
      if (!accepted) focused?.focus();
      return accepted;
    } finally { navigating.current = false; }
  }, []);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (![...exitGuards.current].some((guard) => { const state = guard.state(); return state.dirty || state.busy || state.blocked; })) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (isTauri() && nativeCloseAllowed) {
      try {
        void getCurrentWindow().onCloseRequested(async (event) => {
          event.preventDefault();
          if (disposed || !await allowExit()) return;
          try { await getCurrentWindow().destroy(); }
          catch { if (!disposed) setNativeWarning(true); }
        }).then((stop) => { if (disposed) stop(); else unlisten = stop; })
          .catch(() => { if (!disposed) setNativeWarning(true); });
      } catch { setNativeWarning(true); }
    }
    return () => { disposed = true; unlisten?.(); window.removeEventListener("beforeunload", beforeUnload); };
  }, [allowExit]);

  function bumpCatalog() {
    setCatalogEpoch((current) => current + 1);
  }
  function blockingOverlay() {
    return captureActive.current || templateActive.current || settingsOpen || firefoxGroupOpen
      || urlsOpen || packOpen || Boolean(groupForm) || spaceFormOpen || logOpen;
  }
  function openSearch() {
    if (blockingOverlay()) return;
    setSearchOpen(true);
  }
  function closeSearch() {
    navAttempt.current += 1;
    setSearchOpen(false);
  }

  async function allowNavigation() {
    if (!await allowExit()) return false;
    captureActive.current = false;
    setCaptureOpen(false);
    templateActive.current = false;
    setTemplateOpen(false);
    return true;
  }
  function openTemplates() {
    if (operation.current || templateActive.current || captureActive.current) return;
    templateActive.current = true;
    setTemplateOpen(true);
  }
  function closeTemplates() {
    templateActive.current = false;
    setTemplateOpen(false);
  }
  async function openTemplateSpace(result: TemplateCreated) {
    const [nextGroups, nextSpaces, nextPieces] = await Promise.all([
      invokeSafe<Group[]>("list_groups"), invokeSafe<Space[]>("list_spaces"),
      invokeSafe<Piece[]>("list_pieces", { spaceId: result.space.id }),
    ]);
    if (!templateActive.current) return;
    if (!nextSpaces.some((space) => space.id === result.space.id)) throw new Error("El espacio creado ya no está disponible.");
    setGroups(nextGroups); setSpaces(nextSpaces); setPieces(nextPieces);
    activeSpace.current = result.space.id;
    setGroupId(result.space.groupId); setSpaceId(result.space.id);
    resetPieceFilters(); setFocusPieceId(null); setSpaceLoading(false);
    bumpCatalog();
    setStatus("Espacio creado. Preparación privada y pack vacío; selecciona piezas antes de Iniciar.");
    closeTemplates();
    requestAnimationFrame(() => document.getElementById("content")?.focus());
  }
  async function refreshPreparationPieces(id: string) {
    const next = await invokeSafe<Piece[]>("list_pieces", { spaceId: id });
    if (activeSpace.current !== id) return;
    setPieces(next);
    await probePaths(id, next);
  }
  function openCapture() {
    if (operation.current || captureActive.current || templateActive.current) return;
    captureActive.current = true;
    setCaptureOpen(true);
  }
  function closeCapture() {
    captureActive.current = false;
    setCaptureOpen(false);
  }

  async function goSede(skipGuard = false) {
    if (!skipGuard && !await allowNavigation()) return false;
    pieceGeneration.current += 1;
    activeSpace.current = null;
    setFocusPieceId(null);
    setGroupId(null);
    setSpaceId(null);
    setPieces([]);
    setSpaceLoading(false);
    resetPieceFilters();
    return true;
  }

  async function goGroup(id: string, skipGuard = false) {
    if (!skipGuard && !await allowNavigation()) return false;
    pieceGeneration.current += 1;
    activeSpace.current = null;
    setFocusPieceId(null);
    setGroupId(id);
    setSpaceId(null);
    setPieces([]);
    setSpaceLoading(false);
    resetPieceFilters();
    return true;
  }

  async function goSpace(id: string, nextGroupId?: string, skipGuard = false) {
    if (id === activeSpace.current) {
      if (nextGroupId) setGroupId(nextGroupId);
      return true;
    }
    if (!skipGuard && !await allowNavigation()) return false;
    pieceGeneration.current += 1;
    if (nextGroupId) setGroupId(nextGroupId);
    activeSpace.current = id;
    setSpaceId(id);
    setPieces([]);
    setFocusPieceId(null);
    resetPieceFilters();
    setSpaceLoading(true);
    return true;
  }

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (searchOpen) return;
        if (blockingOverlay()) return;
        setSearchOpen(true);
        return;
      }
      if (searchOpen || captureActive.current || templateActive.current) return;
      if (event.key !== "Escape") return;
      if (addMenu.current?.open) {
        addMenu.current.open = false;
        addMenu.current.querySelector("summary")?.focus();
      }
      setPackOpen(false);
      setUrlsOpen(false);
      setGroupForm(null);
      setSpaceFormOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [searchOpen, settingsOpen, firefoxGroupOpen, urlsOpen, packOpen, groupForm, spaceFormOpen, logOpen]);

  const currentSpace = spaces.find((space) => space.id === spaceId);
  const currentGroup = groups.find((group) => group.id === groupId) ?? (currentSpace
    ? groups.find((group) => group.id === currentSpace.groupId)
    : undefined);
  const inSpace = spaceId !== null;
  const inGroup = groupId !== null && spaceId === null;
  const groupSpaces = currentGroup ? spaces.filter((space) => space.groupId === currentGroup.id) : [];
  const markedCount = pieces.filter((piece) => piece.marked).length;
  const failedPieces = pieces.filter((piece) => pieceRun[piece.id]?.ok === false);
  const groupsInPieces = [...new Set(pieces.map((piece) => piece.kind))];
  const visiblePieces = useMemo(() => pieces.filter((piece) =>
    (filter === "all" || piece.marked) && (pieceGroup === "all" || piece.kind === pieceGroup),
  ), [filter, pieceGroup, pieces]);
  const packPreview = useMemo(() => {
    if (!currentSpace) return "";
    const groupName = groups.find((group) => group.id === currentSpace.groupId)?.name ?? "";
    return formatMesaPack(currentSpace, groupName, pieces.filter((piece) => pack.includes(piece.id)));
  }, [currentSpace, groups, pack, pieces]);

  async function probePaths(id: string, next: Piece[], mode: "replace" | "merge" = "replace", generation = pieceGeneration.current) {
    const items = next
      .filter((piece) => piece.kind !== "firefox" && piece.kind !== "firefox-group")
      .map((piece) => ({ id: piece.id, kind: piece.kind, path: piece.payload.path }));
    if (!items.length) {
      if (mode === "replace" && activeSpace.current === id && pieceGeneration.current === generation) setPathCheck({});
      return;
    }
    try {
      const probes = await invokeSafe<PathProbeResult[]>("probe_paths", { items });
      if (activeSpace.current !== id || pieceGeneration.current !== generation) return;
      const map: Record<string, PathCheck> = {};
      for (const probe of probes) {
        map[probe.id] = probe.ok ? { ok: true } : { ok: false, error: probe.error?.trim() || "Ruta rota" };
      }
      if (mode === "replace") setPathCheck(map);
      else setPathCheck((current) => ({ ...current, ...map }));
    } catch {
      if (mode === "replace" && activeSpace.current === id && pieceGeneration.current === generation) setPathCheck({});
    }
  }
  async function loadPieces(id: string, generation = pieceGeneration.current) {
    try {
      const next = await invokeSafe<Piece[]>("list_pieces", { spaceId: id });
      if (activeSpace.current !== id || pieceGeneration.current !== generation) return;
      setPieces(next);
      await probePaths(id, next, "replace", generation);
    }
    catch (error) {
      if (activeSpace.current !== id || pieceGeneration.current !== generation) return;
      setPieces([]);
      setPathCheck({});
      setStatus(hostErrorMessage(error));
    }
    finally { if (activeSpace.current === id && pieceGeneration.current === generation) setSpaceLoading(false); }
  }
  useEffect(() => { writeStoredId(SPACE_SESSION_KEY, spaceId); }, [spaceId]);
  useEffect(() => { writeStoredId(GROUP_SESSION_KEY, groupId); }, [groupId]);
  useEffect(() => {
    void Promise.all([invokeSafe<Group[]>("list_groups"), invokeSafe<Space[]>("list_spaces")])
      .then(([nextGroups, nextSpaces]) => {
        setGroups(nextGroups); setSpaces(nextSpaces); setConnected(true); setStatus("Sede local lista.");
      }).catch((error) => setStatus(hostErrorMessage(error))).finally(() => setHomeLoading(false));
  }, []);
  useEffect(() => {
    if (!spaceId) {
      setSpaceLoading(false);
      return;
    }
    const generation = ++pieceGeneration.current;
    setSpaceLoading(true);
    void loadPieces(spaceId, generation);
    return () => { pieceGeneration.current += 1; };
  }, [spaceId]);
  useEffect(() => {
    if (homeLoading || !connected) return;
    if (spaceId) {
      const space = spaces.find((item) => item.id === spaceId);
      if (!space) {
        activeSpace.current = null;
        setSpaceId(null);
        setSpaceLoading(false);
        if (groupId && !groups.some((group) => group.id === groupId)) setGroupId(null);
        return;
      }
      if (space.groupId !== groupId) setGroupId(space.groupId);
      return;
    }
    if (groupId && !groups.some((group) => group.id === groupId)) setGroupId(null);
  }, [connected, groupId, groups, homeLoading, spaceId, spaces]);

  useEffect(() => {
    if (!focusPieceId || spaceLoading) return;
    const card = document.getElementById(`piece-${focusPieceId}`);
    if (!card) {
      setStatus("La pieza ya no está en esta mesa.");
      setFocusPieceId(null);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    card.focus();
  }, [focusPieceId, spaceLoading, visiblePieces]);
  useEffect(() => {
    if (!focusHeading.current || homeLoading || spaceLoading) return;
    focusHeading.current = false;
    document.querySelector<HTMLElement>(".workspace h1")?.focus();
  }, [groupId, spaceId, homeLoading, spaceLoading, inSpace, inGroup]);
  async function togglePiece(piece: Piece) {
    const marked = !piece.marked;
    setPieces((current) => current.map((item) => item.id === piece.id ? { ...item, marked } : item));
    try { await invokeSafe("set_marked", { pieceId: piece.id, marked }); }
    catch (error) { setStatus(hostErrorMessage(error)); await loadPieces(piece.spaceId); }
  }
  async function setAll(marked: boolean, kind?: string) {
    if (operation.current) return;
    operation.current = true;
    const target = pieces.filter((piece) => !kind || piece.kind === kind);
    setPieces((current) => current.map((piece) => target.some((item) => item.id === piece.id) ? { ...piece, marked } : piece));
    try {
      await Promise.all(target.map((piece) => invokeSafe("set_marked", { pieceId: piece.id, marked })));
    } catch (error) {
      setStatus(hostErrorMessage(error));
      if (target[0]) await loadPieces(target[0].spaceId);
    }
    finally { operation.current = false; }
  }
  async function removePiece(piece: Piece) {
    if (operation.current || !window.confirm("¿Quitar esta pieza?")) return;
    operation.current = true; setBusy(true);
    try {
      await invokeSafe("delete_piece", { id: piece.id });
      bumpCatalog();
      setPieces((current) => current.filter((item) => item.id !== piece.id));
      setPieceRun((current) => {
        const next = { ...current };
        delete next[piece.id];
        return next;
      });
      setPathCheck((current) => {
        const next = { ...current };
        delete next[piece.id];
        return next;
      });
      setSpaces((current) => current.map((space) => space.id === piece.spaceId
        ? { ...space, pack: space.pack.filter((id) => id !== piece.id) }
        : space));
      setStatus("Pieza quitada.");
    } catch (error) { setStatus(hostErrorMessage(error)); }
    finally { operation.current = false; setBusy(false); }
  }
  async function launchOne(piece: Piece): Promise<PieceRun> {
    try {
      let result: LaunchResult;
      if (piece.kind === "firefox" || piece.kind === "firefox-group") {
        const urls = pieceUrls(piece);
        if (!urls.length) return { ok: false, error: "Sin URL." };
        result = await invokeSafe<LaunchResult>(piece.kind === "firefox-group" ? "launch_firefox_group" : "launch_firefox", { urls });
      } else if (!piece.payload.path) {
        return { ok: false, error: "Sin ruta." };
      } else if (piece.kind === "vscode") {
        result = await invokeSafe<LaunchResult>("launch_vscode", { path: piece.payload.path });
      } else if (piece.kind === "cursor") {
        result = await invokeSafe<LaunchResult>("launch_cursor", { path: piece.payload.path });
      } else if (piece.kind === "folder") {
        result = await invokeSafe<LaunchResult>("launch_folder", { path: piece.payload.path });
      } else if (piece.kind === "file") {
        result = await invokeSafe<LaunchResult>("launch_file", { path: piece.payload.path });
      } else {
        return { ok: false, error: "Kind no permitido." };
      }
      setLastResult(result);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: shortError(error) };
    }
  }
  async function launch(pieceList: Piece[]) {
    if (!pieceList.length || operation.current) return;
    operation.current = true; setBusy(true); setStatus("Iniciando piezas…");
    let ok = 0;
    let fail = 0;
    try {
      for (const piece of pieceList) {
        const run = await launchOne(piece);
        setPieceRun((current) => ({ ...current, [piece.id]: run }));
        if (run.ok) ok += 1;
        else fail += 1;
      }
      setStatus(fail
        ? `Iniciado · ${ok} ok, ${fail} con error`
        : `Iniciado · ${ok} pieza${ok === 1 ? "" : "s"}`);
    } finally { operation.current = false; setBusy(false); }
  }
  async function openLog() {
    try { setLogText(await invokeSafe<string>("read_launch_log", { lines: 100 })); setLogOpen(true); }
    catch (error) { setStatus(hostErrorMessage(error)); }
  }
  async function ingestPiece(created: Piece, message: string) {
    bumpCatalog();
    if (activeSpace.current !== created.spaceId) return;
    setPieces((current) => current.some((piece) => piece.id === created.id) ? current : [...current, created]);
    await probePaths(created.spaceId, [created], "merge");
    setStatus(message);
  }
  async function addFolder() {
    if (!spaceId || operation.current) return;
    operation.current = true;
    try {
      const path = await invokeSafe<string | null>("pick_folder", { title: "Selecciona una carpeta" });
      if (!path) return;
      setBusy(true);
      const created = await invokeSafe<Piece>("add_piece", { input: { spaceId, kind: "folder", name: path.split(/[\\/]/).pop() || "Carpeta", payload: { path } } });
      await ingestPiece(created, "Carpeta agregada.");
    } catch (error) { setStatus(hostErrorMessage(error)); }
    finally { operation.current = false; setBusy(false); }
  }
  async function addProject() {
    if (!spaceId || operation.current) return;
    operation.current = true;
    try {
      const path = await invokeSafe<string | null>("pick_folder", { title: "Selecciona un proyecto para VS Code" });
      if (!path) return;
      setBusy(true);
      const created = await invokeSafe<Piece>("add_piece", { input: { spaceId, kind: "vscode", name: path.split(/[\\/]/).pop() || "Proyecto VS Code", payload: { path } } });
      await ingestPiece(created, "Proyecto VS Code agregado.");
    } catch (error) { setStatus(hostErrorMessage(error)); }
    finally { operation.current = false; setBusy(false); }
  }
  async function addCursorProject() {
    if (!spaceId || operation.current) return;
    operation.current = true;
    try {
      const path = await invokeSafe<string | null>("pick_folder", { title: "Selecciona un proyecto para Cursor" });
      if (!path) return;
      setBusy(true);
      const created = await invokeSafe<Piece>("add_piece", { input: { spaceId, kind: "cursor", name: path.split(/[\\/]/).pop() || "Proyecto Cursor", payload: { path } } });
      await ingestPiece(created, "Proyecto Cursor agregado.");
    } catch (error) { setStatus(hostErrorMessage(error)); }
    finally { operation.current = false; setBusy(false); }
  }
  async function addFile() {
    if (!spaceId || operation.current) return;
    operation.current = true;
    try {
      const path = await invokeSafe<string | null>("pick_file", { title: "Selecciona un archivo o atajo" });
      if (!path) return;
      setBusy(true);
      const created = await invokeSafe<Piece>("add_piece", { input: { spaceId, kind: "file", name: path.split(/[\\/]/).pop() || "Archivo", payload: { path } } });
      await ingestPiece(created, "Archivo agregado.");
    } catch (error) { setStatus(hostErrorMessage(error)); }
    finally { operation.current = false; setBusy(false); }
  }
  async function addFirefoxGroup(group: FirefoxGroupInput) {
    if (!spaceId || operation.current) throw new Error("Espera a que termine la operación actual.");
    operation.current = true; setBusy(true);
    try {
      const created = await invokeSafe<Piece>("add_piece", {
        input: { spaceId, kind: "firefox-group", name: group.name, payload: { urls: group.urls } },
      });
      await ingestPiece(created, `Grupo guardado · ${group.urls.length} páginas`);
      setFirefoxGroupOpen(false);
    } finally { operation.current = false; setBusy(false); }
  }
  function validUrls() {
    return urlText.split(/\r?\n/).map((url) => url.trim()).filter((url) => /^https?:\/\/\S+$/i.test(url));
  }
  async function addUrls() {
    if (!spaceId || operation.current) return;
    const urls = validUrls();
    if (!urls.length) return;
    operation.current = true; setBusy(true);
    try {
      const created = await invokeSafe<Piece>("add_piece", {
        input: {
          spaceId,
          kind: "firefox",
          name: urlName.trim() || "URLs",
          payload: { urls },
        },
      });
      await ingestPiece(created, "URLs agregadas.");
      setUrlsOpen(false); setUrlName(""); setUrlText("");
    } catch (error) { setStatus(hostErrorMessage(error)); }
    finally { operation.current = false; setBusy(false); }
  }
  async function copyPackText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Pack copiado. Pégalo en un Bot.");
    } catch {
      setStatus("No se pudo copiar. Selecciona el texto del pack y copialo a mano.");
    }
  }
  async function openPack() {
    if (!spaceId || !currentSpace || operation.current) return;
    try {
      const savedPack = await invokeSafe<string[]>("get_invite", { spaceId });
      setPack(savedPack.length || currentSpace.botActive ? savedPack : pieces.map((piece) => piece.id));
      setPackOpen(true);
    } catch (error) { setStatus(hostErrorMessage(error)); }
  }
  async function savePack() {
    if (!spaceId || operation.current) return;
    operation.current = true; setBusy(true);
    try {
      const savedPack = await invokeSafe<string[]>("set_invite", { input: { spaceId, pieceIds: pack } });
      setPack(savedPack);
      setSpaces((current) => current.map((space) => space.id === spaceId ? { ...space, pack: savedPack, botActive: true } : space));
      setStatus(`Pack guardado · ${savedPack.length} pieza${savedPack.length === 1 ? "" : "s"}`);
    } catch (error) { setStatus(hostErrorMessage(error)); }
    finally { operation.current = false; setBusy(false); }
  }
  async function copySavedPack() {
    if (!currentSpace) return;
    const groupName = groups.find((group) => group.id === currentSpace.groupId)?.name ?? "";
    const selected = pieces.filter((piece) => currentSpace.pack.includes(piece.id));
    await copyPackText(formatMesaPack(currentSpace, groupName, selected));
  }
  async function clearPack() {
    if (!spaceId || operation.current) return;
    operation.current = true; setBusy(true);
    try {
      await invokeSafe("clear_invite", { spaceId });
      setPack([]);
      setSpaces((current) => current.map((space) => space.id === spaceId ? { ...space, pack: [], botActive: false } : space));
      setStatus("Pack quitado.");
    } catch (error) { setStatus(hostErrorMessage(error)); }
    finally { operation.current = false; setBusy(false); }
  }
  function tileState(piece: Piece): PieceRun | PathCheck | undefined {
    return pieceRun[piece.id] ?? (pathCheck[piece.id]?.ok === false ? pathCheck[piece.id] : undefined);
  }
  function closeAddMenu() {
    if (!addMenu.current) return;
    addMenu.current.open = false;
    addMenu.current.querySelector("summary")?.focus();
  }
  function openCreateGroup() {
    setGroupName("");
    setGroupIcon(DEFAULT_GROUP_ICON);
    setGroupForm("create");
  }
  function openEditGroup() {
    if (!currentGroup) return;
    setGroupName(currentGroup.name);
    setGroupIcon(resolveGroupIcon(currentGroup.icon));
    setGroupForm("edit");
  }
  async function saveGroup() {
    const name = groupName.trim();
    if (!name || operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      if (groupForm === "edit" && currentGroup) {
        const updated = await invokeSafe<Group>("update_group", { id: currentGroup.id, name, icon: groupIcon });
        setGroups((current) => current.map((group) => group.id === updated.id ? updated : group));
        bumpCatalog();
        setStatus("Grupo actualizado.");
      } else {
        const created = await invokeSafe<Group>("create_group", { name, icon: groupIcon });
        setGroups((current) => [...current, created].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "es")));
        bumpCatalog();
        await goGroup(created.id);
        setStatus("Grupo creado.");
      }
      setGroupForm(null);
    } catch (error) {
      setStatus(hostErrorMessage(error));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function saveSpace() {
    if (!groupId || operation.current) return;
    const name = spaceName.trim();
    if (!name) return;
    operation.current = true;
    setBusy(true);
    try {
      const created = await invokeSafe<Space>("create_space", { groupId, name, note: spaceNote.trim() || null });
      setSpaces((current) => [...current, created]);
      bumpCatalog();
      setSpaceFormOpen(false);
      setSpaceName("");
      setSpaceNote("");
      setStatus("Espacio creado.");
    } catch (error) {
      setStatus(hostErrorMessage(error));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function activateSearchResult(hit: SearchHit): Promise<NavigationOutcome> {
    const attempt = ++navAttempt.current;
    const resolve = () => invokeSafe<NavigationResolve>("resolve_navigation_target", { target: hitTarget(hit) });
    try {
      const first = await resolve();
      if (attempt !== navAttempt.current) return { status: "cancelled" };
      if (first.status !== "found" || !first.target) return { status: "not-found" };
      if (destinationChanged(hit, first.target)) return { status: "changed", target: first.target };
      const leaves = first.target.type === "group"
        ? Boolean(activeSpace.current)
        : first.target.spaceId !== activeSpace.current;
      if (leaves) {
        if (!await allowNavigation()) return { status: "cancelled" };
        if (attempt !== navAttempt.current) return { status: "cancelled" };
        const second = await resolve();
        if (attempt !== navAttempt.current) return { status: "cancelled" };
        if (second.status !== "found" || !second.target) return { status: "not-found" };
        if (destinationChanged(hit, second.target)) return { status: "changed", target: second.target };
        return commitSearchTarget(second.target, attempt);
      }
      return commitSearchTarget(first.target, attempt);
    } catch (error) {
      return { status: "error", message: hostErrorMessage(error) };
    }
  }

  async function commitSearchTarget(target: NonNullable<NavigationResolve["target"]>, attempt: number): Promise<NavigationOutcome> {
    if (attempt !== navAttempt.current) return { status: "cancelled" };
    const groupKnown = (id: string) => groups.some((group) => group.id === id);
    const spaceKnown = (id: string) => spaces.some((space) => space.id === id);
    const needsRefresh = target.type === "group" ? !groupKnown(target.groupId)
      : target.type === "space" ? !spaceKnown(target.spaceId) || !groupKnown(target.groupId)
      : !spaceKnown(target.spaceId) || !groupKnown(target.groupId);
    if (needsRefresh) {
      const [nextGroups, nextSpaces] = await Promise.all([
        invokeSafe<Group[]>("list_groups"), invokeSafe<Space[]>("list_spaces"),
      ]);
      if (attempt !== navAttempt.current) return { status: "cancelled" };
      setGroups(nextGroups);
      setSpaces(nextSpaces);
    }
    if (target.type === "group") {
      focusHeading.current = true;
      setFocusPieceId(null);
      await goGroup(target.groupId, true);
      return { status: "navigated" };
    }
    if (target.type === "space") {
      focusHeading.current = true;
      setFocusPieceId(null);
      await goSpace(target.spaceId, target.groupId, true);
      return { status: "navigated" };
    }
    const sameMesa = target.spaceId === activeSpace.current;
    if (filter !== "all" || pieceGroup !== "all") {
      setFilter("all");
      setPieceGroup("all");
      setStatus("Se muestran todas las piezas para localizar el destino.");
    }
    if (!sameMesa) {
      await goSpace(target.spaceId, target.groupId, true);
    }
    setFocusPieceId(target.pieceId);
    return { status: "navigated" };
  }

  return (
    <div className="app-shell"><a className="skip-link" href="#content">Ir al contenido</a>
      <aside className="sidebar" aria-label="Grupos y espacios">
        <div className="brand"><span className="brand-mark">P</span><span>Paravel</span></div>
        <button className={`space-link home-link ${!groupId && !spaceId ? "active" : ""}`} type="button" aria-current={!groupId && !spaceId ? "page" : undefined} onClick={() => goSede()}><span aria-hidden="true">⌂</span> Sede</button>
        <button ref={searchTrigger} className="workspace-search search-trigger" type="button" onClick={openSearch}>
          <span aria-hidden="true">⌕</span>
          Buscar en Paravel
          <kbd>Ctrl K</kbd>
        </button>
        <p className="sidebar-label">Grupos</p>
        {groups.map((group) => <section className="group" key={group.id}>
          <button className={`space-link group-link ${group.id === groupId && !spaceId ? "active" : ""}`} type="button" aria-current={group.id === groupId && !spaceId ? "page" : undefined} onClick={() => goGroup(group.id)}><GroupGlyph id={group.icon} />{group.name}</button>
          {spaces.filter((space) => space.groupId === group.id).map((space) =>
            <button className={`space-link nested ${space.id === spaceId ? "active" : ""}`} key={space.id} type="button" aria-current={space.id === spaceId ? "page" : undefined} onClick={() => goSpace(space.id, space.groupId)}><span className="space-dot" aria-hidden="true" />{space.name}{space.botActive && <span className="badge">Pack</span>}</button>
          )}
        </section>)}
        <button className="space-link create-link" type="button" disabled={!connected} onClick={openCreateGroup}>＋ Crear grupo</button>
        <p className="sidebar-foot">Guardado en este equipo</p>
      </aside>
      <main className="workspace" id="content" tabIndex={-1}>
        <header className="topbar"><span className="breadcrumb"><button type="button" onClick={() => goSede()}>Sede</button>{currentGroup ? <> <span className="sep" aria-hidden="true">/</span> {inSpace ? <button type="button" onClick={() => goGroup(currentGroup.id)}><GroupGlyph id={currentGroup.icon} />{currentGroup.name}</button> : <span className="crumb"><GroupGlyph id={currentGroup.icon} />{currentGroup.name}</span>}</> : !inSpace ? <> <span className="sep" aria-hidden="true">/</span> <span>Grupos</span></> : null}{currentSpace ? <> <span className="sep" aria-hidden="true">/</span> <span>{currentSpace.name}</span></> : inSpace ? <> <span className="sep" aria-hidden="true">/</span> <span>…</span></> : null}</span><div className="top-actions"><button className="secondary" type="button" disabled={!connected || busy} onClick={openCapture}>Añadir recursos</button><button className="secondary" type="button" disabled={!connected} onClick={() => setSettingsOpen(true)}>Este equipo</button><button className="secondary" type="button" disabled={!connected} onClick={() => void openLog()}>Historial</button><span className={`host-status ${connected ? "connected" : ""}`}><span className="space-dot" />{connected ? "En este equipo" : "Host desconectado"}</span></div></header>
        {!inSpace ? <section className="home-view"><div className="gallery-header"><div>{inGroup ? <><p className="eyebrow">GRUPO</p><h1 tabIndex={-1}><GroupGlyph id={currentGroup?.icon} large /> {currentGroup?.name ?? "Grupo"}</h1><p>Espacios de este grupo. Cada espacio es una mesa con sus piezas.</p></> : <><p className="eyebrow">TU SEDE LOCAL</p><h1 tabIndex={-1}>Grupos</h1><p>Un grupo es una página principal. Entrá para ver sus espacios.</p></>}</div><div className="home-toolbar">{inGroup && <button className="secondary" type="button" disabled={!connected || !currentGroup} onClick={openEditGroup}>Editar grupo</button>}{inGroup && <button className="secondary" type="button" disabled={!connected || !groupId} onClick={openTemplates}>Crear espacio</button>}{!inGroup && <button className="secondary" type="button" disabled={!connected} onClick={openCreateGroup}>Crear grupo</button>}<div className="view-toggles" role="group" aria-label={inGroup ? "Vista del grupo" : "Vista de sede"}><button aria-pressed={homeView === "gallery"} className={homeView === "gallery" ? "active" : ""} type="button" onClick={() => setHomeView("gallery")}>Galería</button><button aria-pressed={homeView === "table"} className={homeView === "table" ? "active" : ""} type="button" onClick={() => setHomeView("table")}>Tabla</button></div></div></div>
          {homeLoading ? <p className="empty" role="status">{inGroup ? "Cargando espacios…" : "Cargando tus grupos…"}</p>
            : inGroup
              ? !groupSpaces.length ? <div className="empty"><h2>{connected ? "Este grupo todavía no tiene espacios" : "Tu sede vive en Paravel"}</h2><p>{connected ? "Creá un espacio para armar la mesa de este grupo." : "Abre la aplicación de escritorio para acceder a tus espacios."}</p>{connected && <button className="secondary" type="button" onClick={openTemplates}>Crear espacio</button>}</div>
                : homeView === "gallery" ? <div className="card-grid">{groupSpaces.map((space) => <button className="space-card" key={space.id} type="button" onClick={() => goSpace(space.id, space.groupId)}><strong>{space.name}</strong><small>{currentGroup?.name}</small><span className="space-note">{space.note || "Sin descripción"}</span><span className="space-card-meta"><span>{space.pack.length ? `${space.pack.length} pieza${space.pack.length === 1 ? "" : "s"} en pack` : "Mesa local"}</span>{space.botActive && <span className="mini-badge">Pack listo</span>}</span><span className="space-card-open">Abrir espacio →</span></button>)}</div>
                : <div className="table-scroll"><table className="space-table"><thead><tr><th scope="col">Espacio</th><th scope="col">Descripción</th></tr></thead><tbody>{groupSpaces.map((space) => <tr key={space.id}><td><button className="table-link" type="button" onClick={() => goSpace(space.id, space.groupId)}>{space.name}</button></td><td>{space.note}</td></tr>)}</tbody></table></div>
              : !groups.length ? <div className="empty"><h2>{connected ? "Todavía no hay grupos" : "Tu sede vive en Paravel"}</h2><p>{connected ? "Creá un grupo para ordenar tus espacios." : "Abre la aplicación de escritorio para acceder a tus grupos y espacios."}</p>{connected && <button className="secondary" type="button" onClick={openCreateGroup}>Crear grupo</button>}</div>
                : homeView === "gallery" ? <div className="card-grid">{groups.map((group) => { const count = spaces.filter((space) => space.groupId === group.id).length; return <button className="space-card group-card" key={group.id} type="button" onClick={() => goGroup(group.id)}><GroupGlyph id={group.icon} large /><strong>{group.name}</strong><span className="space-note">{count === 0 ? "Sin espacios todavía" : `${count} espacio${count === 1 ? "" : "s"}`}</span><span className="space-card-open">Abrir grupo →</span></button>; })}</div>
                : <div className="table-scroll"><table className="space-table"><thead><tr><th scope="col">Grupo</th><th scope="col">Espacios</th></tr></thead><tbody>{groups.map((group) => { const count = spaces.filter((space) => space.groupId === group.id).length; return <tr key={group.id}><td><button className="table-link" type="button" onClick={() => goGroup(group.id)}><GroupGlyph id={group.icon} /> {group.name}</button></td><td>{count}</td></tr>; })}</tbody></table></div>}
        </section> : <section className="space-view"><header className="workspace-header"><div className="space-heading"><h1 tabIndex={-1}>{currentSpace?.name ?? "Espacio"}</h1><p className="note">{currentSpace?.note}</p><div className="space-meta" aria-label="Resumen del espacio"><span className="space-meta-item"><strong>{pieces.length}</strong><span>piezas</span></span><span className={`space-meta-item ${currentSpace?.botActive ? "ready" : ""}`}><span className="meta-dot" aria-hidden="true" />{currentSpace?.botActive ? "Pack listo" : "Sin pack"}</span></div></div><div className="header-actions" role="group" aria-label="Acciones del espacio">
            <details className="add-menu" ref={addMenu}>
              <summary>＋ Agregar <span aria-hidden="true">⌄</span></summary>
              <div className="command-menu">
                <span className="menu-caption">Agregar a este espacio</span>
                <button type="button" disabled={busy || spaceLoading} onClick={() => { closeAddMenu(); void addFolder(); }}>Carpeta</button>
                <button type="button" disabled={busy || spaceLoading} onClick={() => { closeAddMenu(); void addProject(); }}>Proyecto de VS Code</button>
                <button type="button" disabled={busy || spaceLoading} onClick={() => { closeAddMenu(); void addCursorProject(); }}>Proyecto de Cursor</button>
                <button type="button" disabled={busy || spaceLoading} onClick={() => { closeAddMenu(); void addFile(); }}>Archivo o atajo</button>
                <button type="button" disabled={busy || spaceLoading} onClick={() => { closeAddMenu(); setUrlsOpen(true); }}>Enlaces web</button>
                <button type="button" disabled={busy || spaceLoading} onClick={() => { closeAddMenu(); setFirefoxGroupOpen(true); }}>Grupo de Firefox</button>
              </div>
            </details>
            <span className="command-divider" aria-hidden="true" />
            <button className="secondary" type="button" disabled={busy || spaceLoading || !pieces.length} onClick={() => void openPack()}>{currentSpace?.botActive ? "Editar pack" : "Preparar pack"}</button>
            {currentSpace?.botActive && <><button className="secondary" type="button" disabled={busy || spaceLoading || !currentSpace.pack.length} onClick={() => void copySavedPack()}>Copiar pack</button><button className="secondary command-danger" type="button" disabled={busy || spaceLoading} onClick={() => void clearPack()}>Quitar pack</button></>}
          </div></header>
          {currentSpace && <PreparationPanel key={`preparation-${currentSpace.id}`} spaceId={currentSpace.id} pieces={pieces} registerExitGuard={registerExitGuard} onRefreshPieces={refreshPreparationPieces} />}
          {currentSpace && <ContinuityPanel key={currentSpace.id} spaceId={currentSpace.id} registerDirtyGuard={registerDirtyGuard} registerExitGuard={registerExitGuard} />}
          <div className="group-bar" role="group" aria-label="Filtrar y seleccionar piezas"><span className="toolbar-label">Piezas</span><button aria-pressed={filter === "all" && pieceGroup === "all"} className={filter === "all" && pieceGroup === "all" ? "active" : ""} type="button" disabled={spaceLoading || !pieces.length} onClick={() => { setFilter("all"); setPieceGroup("all"); }}>Todas <span>{pieces.length}</span></button><button className="clear-selection" type="button" disabled={busy || spaceLoading || !pieces.length} onClick={() => void setAll(markedCount !== pieces.length)}>{markedCount === pieces.length && pieces.length > 0 ? "Desmarcar todas" : "Marcar todas"}</button><button aria-pressed={filter === "marked"} className={filter === "marked" ? "active" : ""} type="button" onClick={() => { setFilter("marked"); setPieceGroup("all"); }}>Marcadas <span>{markedCount}</span></button>{groupsInPieces.map((kind) => <button key={kind} aria-pressed={pieceGroup === kind} className={pieceGroup === kind ? "active" : ""} type="button" onClick={() => { setPieceGroup(kind); setFilter("all"); }}>{kindLabel[kind as keyof typeof kindLabel] ?? kind}</button>)}</div>
          <div className="piece-grid" aria-busy={spaceLoading}>{spaceLoading ? <p className="empty">Cargando piezas…</p> : !visiblePieces.length ? <div className="empty"><h2>{pieces.length ? "No hay piezas con este filtro" : "Prepara tu espacio"}</h2><p>{pieces.length ? "Prueba Todas para ver las piezas disponibles." : "Agrega una carpeta para empezar."}</p></div> : visiblePieces.map((piece) => {
            const state = tileState(piece);
            const tone = state?.ok === true ? "healthy" : state?.ok === false ? "error" : "";
            return <article className={`piece-tile ${piece.marked ? "selected" : ""} ${piece.id === focusPieceId ? "destination" : ""} ${tone}`} key={piece.id} id={`piece-${piece.id}`} tabIndex={-1}><button className="piece-main" type="button" disabled={spaceLoading} aria-pressed={piece.marked} onClick={() => void togglePiece(piece)}><span aria-hidden="true" className={`piece-icon ${piece.kind}`}>{(piece.kind === "firefox" || piece.kind === "firefox-group") ? <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg> : piece.kind === "vscode" || piece.kind === "cursor" ? "</>" : piece.kind === "file" ? <svg viewBox="0 0 24 24"><path d="M14 3H5v18h14V8zm0 0v5h5M8 12h8M8 16h6" /></svg> : <svg viewBox="0 0 24 24"><path d="M3 7V5h6l2 2h10v13H3z" /></svg>}</span><span className="piece-copy"><strong>{piece.name}</strong><small>{kindLabel[piece.kind]}</small><small className="piece-path">{piece.payload.urls ? `${piece.payload.urls.length} url${piece.payload.urls.length === 1 ? "" : "s"}` : piece.payload.path || piece.payload.url}</small>{state ? <small className={`piece-state ${state.ok ? "ok" : "err"}`} title={state.ok ? "ok" : state.error}>{state.ok ? "ok" : state.error}</small> : null}</span><span className="checkmark" aria-hidden="true">{piece.marked ? "✓" : ""}</span></button><button className="mini-play" type="button" disabled={busy || spaceLoading} aria-label={`Iniciar ${piece.name}`} onClick={() => void launch([piece])}>▶</button><button className="mini-remove" type="button" disabled={busy || spaceLoading} aria-label={`Quitar ${piece.name}`} onClick={() => void removePiece(piece)}>Quitar</button></article>;
          })}</div>
          {(markedCount > 0 || failedPieces.length > 0) && <div className="play-bar">{markedCount > 0 && <span>{markedCount} marcada{markedCount === 1 ? "" : "s"}</span>}{failedPieces.length > 0 && <span>{failedPieces.length} con error</span>}{failedPieces.length > 0 && <button className="secondary" type="button" disabled={busy || spaceLoading} onClick={() => void launch(failedPieces)}>Reintentar fallidas</button>}{markedCount > 0 && <button type="button" disabled={busy || spaceLoading} onClick={() => void launch(pieces.filter((piece) => piece.marked))}>{busy ? "Iniciando…" : "▶ Iniciar"}</button>}</div>}
        </section>}
        <p className="status" aria-live="polite">{status}</p>
        {lastResult && <details className="launch-log"><summary>Último lanzamiento · {lastResult.requestId}</summary><pre>{lastResult.argv.join("\n")}</pre><small>{lastResult.logPath}</small></details>}
      </main>
      {logOpen && <aside className="log-drawer" aria-label="Log del host"><header><h2>Host · launch.log</h2><button type="button" onClick={() => setLogOpen(false)}>Cerrar</button></header><div className="log-body">{logText ? logText.split("\n").reverse().map((line, index) => <LogLine key={`${line}-${index}`} line={line} pieces={pieces} onReplay={(payload) => { void launch([payload]); }} />) : <p>Sin lanzamientos.</p>}</div></aside>}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {captureOpen && <CaptureDialog initialGroupId={currentSpace?.groupId ?? currentGroup?.id ?? ""} initialSpaceId={currentSpace?.id ?? ""} registerExitGuard={registerExitGuard} onClose={closeCapture} onCommitted={(destinationId) => { bumpCatalog(); if (activeSpace.current === destinationId) void loadPieces(destinationId, ++pieceGeneration.current); }} nativeWarning={nativeWarning} />}
      {searchOpen && <GlobalSearchDialog open={searchOpen} epoch={catalogEpoch} returnFocus={searchTrigger} onClose={closeSearch} onActivate={activateSearchResult} />}
      {templateOpen && <TemplateWizard initialGroupId={currentGroup?.id ?? ""} registerExitGuard={registerExitGuard} onClose={closeTemplates} onCreated={openTemplateSpace} onCreateGroup={() => { closeTemplates(); openCreateGroup(); }} onEmpty={() => { closeTemplates(); if (!groupId) { openCreateGroup(); setStatus("Crea o selecciona un grupo antes de crear un espacio vacío."); return; } setSpaceName(""); setSpaceNote(""); setSpaceFormOpen(true); }} nativeWarning={nativeWarning} />}
      {firefoxGroupOpen && <FirefoxGroupDialog onSave={addFirefoxGroup} onClose={() => setFirefoxGroupOpen(false)} />}
      {urlsOpen && <div className="scrim" role="presentation" onClick={() => setUrlsOpen(false)}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="urls-title" onClick={(event) => event.stopPropagation()}>
          <header><div className="htxt"><h2 id="urls-title">Agregar URLs</h2><p>Solo http o https. Cada línea es una pestaña.</p></div><button className="close" type="button" aria-label="Cerrar" onClick={() => setUrlsOpen(false)}>×</button></header>
          <div className="body">
            <label className="dialog-field">Nombre (opcional)<input value={urlName} onChange={(event) => setUrlName(event.target.value)} /></label>
            <label className="dialog-field">URLs (una por línea, http(s))<textarea value={urlText} onChange={(event) => setUrlText(event.target.value)} rows={5} /></label>
          </div>
          <footer><button className="btn" type="button" onClick={() => setUrlsOpen(false)}>Cancelar</button><button className="btn primary" type="button" disabled={!validUrls().length || busy} onClick={() => void addUrls()}>Agregar URLs</button></footer>
        </section>
      </div>}
      {packOpen && <div className="scrim" role="presentation" onClick={() => setPackOpen(false)}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="pack-title" onClick={(event) => event.stopPropagation()}>
          <header><div className="htxt"><h2 id="pack-title">Pack de esta mesa</h2><p>Elige las piezas, guarda el pack y cópialo. Es texto para pegar en un Bot; no abre chat ni conecta nada.</p></div><button className="close" type="button" aria-label="Cerrar" onClick={() => setPackOpen(false)}>×</button></header>
          <div className="body"><div className="pack-items">{pieces.map((piece) => <label key={piece.id}><input type="checkbox" checked={pack.includes(piece.id)} onChange={() => setPack((current) => current.includes(piece.id) ? current.filter((id) => id !== piece.id) : [...current, piece.id])} /> {piece.name}</label>)}</div>
            <label className="dialog-field">Texto para pegar (PROMPT-MESA + pack)<textarea readOnly rows={8} value={packPreview} /></label>
          </div>
          <footer><button className="btn" type="button" onClick={() => setPackOpen(false)}>Cancelar</button><button className="btn" type="button" disabled={!pack.length} onClick={() => void copyPackText(packPreview)}>Copiar pack</button><button className="btn primary" type="button" disabled={busy} onClick={() => void savePack()}>Guardar · {pack.length} pieza{pack.length === 1 ? "" : "s"}</button></footer>
        </section>
      </div>}
      {groupForm && <div className="scrim" role="presentation" onClick={() => setGroupForm(null)}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="group-title" onClick={(event) => event.stopPropagation()}>
          <header><div className="htxt"><h2 id="group-title">{groupForm === "edit" ? "Editar grupo" : "Crear grupo"}</h2><p>Nombre e icono de esta página principal. Los espacios viven adentro.</p></div><button className="close" type="button" aria-label="Cerrar" onClick={() => setGroupForm(null)}>×</button></header>
          <div className="body">
            <label className="dialog-field">Nombre<input value={groupName} onChange={(event) => setGroupName(event.target.value)} autoFocus maxLength={80} /></label>
            <fieldset className="dialog-field icon-field"><legend>Icono</legend><IconPicker value={groupIcon} onChange={setGroupIcon} /></fieldset>
          </div>
          <footer><button className="btn" type="button" onClick={() => setGroupForm(null)}>Cancelar</button><button className="btn primary" type="button" disabled={!groupName.trim() || busy} onClick={() => void saveGroup()}>{groupForm === "edit" ? "Guardar" : "Crear grupo"}</button></footer>
        </section>
      </div>}
      {spaceFormOpen && <div className="scrim" role="presentation" onClick={() => setSpaceFormOpen(false)}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="space-title" onClick={(event) => event.stopPropagation()}>
          <header><div className="htxt"><h2 id="space-title">Crear espacio</h2><p>Queda dentro de {currentGroup?.name ?? "este grupo"}.</p></div><button className="close" type="button" aria-label="Cerrar" onClick={() => setSpaceFormOpen(false)}>×</button></header>
          <div className="body">
            <label className="dialog-field">Nombre<input value={spaceName} onChange={(event) => setSpaceName(event.target.value)} autoFocus maxLength={80} /></label>
            <label className="dialog-field">Nota (opcional)<textarea value={spaceNote} onChange={(event) => setSpaceNote(event.target.value)} rows={3} /></label>
          </div>
          <footer><button className="btn" type="button" onClick={() => setSpaceFormOpen(false)}>Cancelar</button><button className="btn primary" type="button" disabled={!spaceName.trim() || busy} onClick={() => void saveSpace()}>Crear espacio</button></footer>
        </section>
      </div>}
    </div>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const selected = resolveGroupIcon(value);
  return (
    <div className="icon-picker" role="listbox" aria-label="Iconos del grupo">
      {GROUP_ICONS.map((icon) => (
        <button key={icon} type="button" role="option" aria-label={icon} aria-selected={selected === icon} aria-pressed={selected === icon} className={selected === icon ? "active" : ""} onClick={() => onChange(icon)}><GroupGlyph id={icon} /></button>
      ))}
    </div>
  );
}

function LogLine({ line, pieces, onReplay }: { line: string; pieces: Piece[]; onReplay: (piece: Piece) => void }) {
  let entry: { argv?: string[] } | null = null;
  try { entry = JSON.parse(line); } catch { return <pre>{line}</pre>; }
  if (!entry) return <pre>{line}</pre>;
  const argv = entry.argv ?? [];
  const piece = pieces.find((candidate) => {
    if (candidate.kind === "firefox" || candidate.kind === "firefox-group") return pieceUrls(candidate).some((url) => argv.includes(url));
    return candidate.payload.path ? argv.includes(candidate.payload.path) : false;
  });
  return <article className="log-entry"><pre>{line}</pre>{entry.argv && <div className="log-actions"><button type="button" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(entry.argv))}>Copiar argv</button>{piece && <button type="button" onClick={() => onReplay(piece)}>Reproducir pieza</button>}</div>}</article>;
}
