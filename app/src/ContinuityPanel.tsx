import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import capabilities from "../src-tauri/capabilities/default.json";
import { invokeSafe, isTauri } from "./tauri";
import {
  closureError, closureFields, orderClosures, sameClosureFields, trimClosure, validateClosure,
  type Closure, type ClosureDraft, type ClosureFields, type ClosurePage, type RegisterContinuityGuard,
} from "./continuity";
import type { RegisterExitGuard } from "./capture";
import "./Continuity.css";

const emptyFields: ClosureFields = { objective: "", progress: "", nextAction: "", blocker: "" };
const dateFormat = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });
const nativeCloseAllowed = capabilities.permissions.some((permission: string) =>
  permission === "core:window:allow-destroy" || permission === "core:window:allow-all");

function currentWindowSafe() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

function confirmAction(message: string): boolean {
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const accepted = window.confirm(message);
  if (!accepted) focused?.focus();
  return accepted;
}

function ClosureDate({ closure }: { closure: Closure }) {
  return <p className="continuity-date"><time dateTime={new Date(closure.createdAt).toISOString()}>{dateFormat.format(closure.createdAt)}</time>
    {closure.updatedAt !== closure.createdAt && <> · Editado <time dateTime={new Date(closure.updatedAt).toISOString()}>{dateFormat.format(closure.updatedAt)}</time></>}</p>;
}

function ClosureText({ closure }: { closure: Closure }) {
  return <dl className="continuity-text">{closureFields.map(({ key, label }) => closure[key]
    ? <div key={key}><dt>{label}</dt><dd>{closure[key]}</dd></div> : null)}</dl>;
}

export default function ContinuityPanel({ spaceId, registerDirtyGuard, registerExitGuard }: {
  spaceId: string;
  registerDirtyGuard: RegisterContinuityGuard;
  registerExitGuard?: RegisterExitGuard;
}) {
  const [items, setItems] = useState<Closure[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selected, setSelected] = useState<Closure | null>(null);
  const [draft, setDraft] = useState<ClosureDraft | null>(null);
  const [baseline, setBaseline] = useState<ClosureFields>(emptyFields);
  const [touched, setTouched] = useState<Partial<Record<keyof ClosureFields, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [nativeWarning, setNativeWarning] = useState(() => isTauri() && !nativeCloseAllowed);
  const alive = useRef(false);
  const generation = useRef(0);
  const listOperation = useRef(false);
  const retryCursor = useRef<string | null>(null);
  const operation = useRef(false);
  const writePending = useRef(false);
  const dirtyRef = useRef(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const detail = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const dirty = draft !== null && !sameClosureFields(draft, baseline);
  const errors = draft ? validateClosure(draft) : {};

  const allowDiscard = useCallback(async () => {
    if (writePending.current) {
      setStatus("Espera a que termine el guardado o la eliminación antes de salir.");
      return false;
    }
    return !dirtyRef.current || confirmAction("Hay cambios sin guardar en el cierre. ¿Descartarlos y continuar?");
  }, []);

  const loadPage = useCallback(async (nextCursor: string | null = null) => {
    if (listOperation.current) return;
    listOperation.current = true;
    retryCursor.current = nextCursor;
    const request = ++generation.current;
    setLoading(true);
    setListError("");
    try {
      const page = await invokeSafe<ClosurePage>("list_closures", { spaceId, cursor: nextCursor, limit: 20 });
      if (!alive.current || request !== generation.current) return;
      const safeItems = page.items.filter((item) => item.spaceId === spaceId);
      setItems((current) => nextCursor === null ? orderClosures(safeItems)
        : orderClosures([...current, ...safeItems.filter((item) => !current.some((old) => old.id === item.id))]));
      setCursor(page.nextCursor);
      setLoaded(true);
    } catch (reason) {
      if (alive.current && request === generation.current) setListError(closureError(reason));
    } finally {
      if (request === generation.current) {
        listOperation.current = false;
        if (alive.current) setLoading(false);
      }
    }
  }, [spaceId]);

  useEffect(() => {
    alive.current = true;
    void loadPage();
    return () => {
      alive.current = false;
      generation.current += 1;
      listOperation.current = false;
    };
  }, [loadPage]);

  useEffect(() => registerDirtyGuard(allowDiscard), [allowDiscard, registerDirtyGuard]);
  useEffect(() => registerExitGuard?.({ label: "el cierre de continuidad", state: () => ({ dirty: dirtyRef.current, busy: writePending.current }) }), [registerExitGuard]);

  useEffect(() => {
    if (registerExitGuard) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current && !writePending.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const appWindow = isTauri() && nativeCloseAllowed ? currentWindowSafe() : null;
    if (appWindow) {
      void appWindow.onCloseRequested(async (event) => {
        if (disposed) return;
        if (!await allowDiscard()) event.preventDefault();
      }).then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      }).catch(() => { if (!disposed) setNativeWarning(true); });
    }
    return () => {
      disposed = true;
      window.removeEventListener("beforeunload", beforeUnload);
      unlisten?.();
    };
  }, [allowDiscard, registerExitGuard]);

  useEffect(() => {
    if (draft) form.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }, [draft?.id]);

  function restoreFocus() {
    const target = returnFocus.current;
    requestAnimationFrame(() => {
      if (!alive.current) return;
      if (target?.isConnected && !target.matches(":disabled")) target.focus();
      else newButton.current?.focus();
    });
  }

  async function startNew() {
    if (operation.current) return;
    operation.current = true;
    try {
      if (!await allowDiscard() || !alive.current) return;
      returnFocus.current = newButton.current;
      setDraft({ ...emptyFields, id: crypto.randomUUID(), expectedRevision: null });
      dirtyRef.current = false;
      setBaseline(emptyFields);
      setTouched({});
      setSubmitted(false);
      setError("");
      setStatus("");
      setSelected(null);
    } catch { setError("No se pudo crear un identificador local. Vuelve a abrir la app de escritorio."); }
    finally { operation.current = false; }
  }

  async function openClosure(closure: Closure, edit = false) {
    if (operation.current) return;
    operation.current = true;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      if (!await allowDiscard() || !alive.current) return;
      setBusy(true);
      setError("");
      const current = await invokeSafe<Closure>("get_closure", { spaceId, id: closure.id });
      if (!alive.current) return;
      if (current.spaceId !== spaceId || current.id !== closure.id) throw new Error("not found");
      returnFocus.current = origin;
      setSelected(current);
      setDraft(edit ? { ...current, expectedRevision: current.revision } : null);
      setBaseline(current);
      dirtyRef.current = false;
      setTouched({});
      setSubmitted(false);
      setStatus("");
      requestAnimationFrame(() => {
        if (!alive.current) return;
        if (edit) form.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
        else detail.current?.focus();
      });
    } catch (reason) { if (alive.current) setError(closureError(reason)); }
    finally { operation.current = false; if (alive.current) setBusy(false); }
  }

  async function cancelDraft() {
    if (operation.current || !await allowDiscard() || !alive.current) return;
    setDraft(null);
    dirtyRef.current = false;
    setError("");
    restoreFocus();
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || operation.current) return;
    setSubmitted(true);
    const validation = validateClosure(draft);
    if (Object.keys(validation).length) {
      const first = closureFields.find(({ key }) => validation[key]);
      requestAnimationFrame(() => {
        if (first && alive.current) form.current?.querySelector<HTMLTextAreaElement>(`[name="${first.key}"]`)?.focus();
      });
      return;
    }
    operation.current = true;
    writePending.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const saved = await invokeSafe<Closure>("save_closure", {
        input: { id: draft.id, spaceId, ...trimClosure(draft), expectedRevision: draft.expectedRevision },
      });
      if (!alive.current) return;
      if (saved.spaceId !== spaceId || saved.id !== draft.id) throw new Error("Unexpected closure");
      generation.current += 1;
      listOperation.current = false;
      setLoading(false);
      setItems((current) => orderClosures([saved, ...current.filter((item) => item.id !== saved.id)]));
      setDraft(null);
      dirtyRef.current = false;
      setSelected(saved);
      setStatus("Cierre guardado en este equipo.");
      restoreFocus();
      void loadPage();
    } catch (reason) { if (alive.current) setError(closureError(reason)); }
    finally { operation.current = false; writePending.current = false; if (alive.current) setBusy(false); }
  }

  async function remove(closure: Closure) {
    if (operation.current) return;
    operation.current = true;
    try {
      if (!confirmAction(`¿Eliminar el cierre del ${dateFormat.format(closure.createdAt)}? Esta acción no se puede deshacer.`)) return;
      writePending.current = true;
      setBusy(true);
      setError("");
      setStatus("");
      await invokeSafe("delete_closure", { spaceId, id: closure.id, revision: closure.revision });
      if (!alive.current) return;
      generation.current += 1;
      listOperation.current = false;
      setLoading(false);
      setItems((current) => current.filter((item) => item.id !== closure.id));
      if (selected?.id === closure.id) setSelected(null);
      setStatus("Cierre eliminado.");
      historyButton.current?.focus();
      void loadPage();
    } catch (reason) { if (alive.current) setError(closureError(reason)); }
    finally { operation.current = false; writePending.current = false; if (alive.current) setBusy(false); }
  }

  const latest = items[0];
  return <section className="continuity-panel" aria-labelledby="continuity-title">
    <header className="continuity-header"><div><h2 id="continuity-title">Continuidad</h2>
      <p className="continuity-muted">Historial local · no compartido por MCP</p></div>
      <div className="continuity-actions"><button ref={newButton} className="secondary" type="button" disabled={busy || draft !== null} onClick={() => void startNew()}>Cerrar sesión de trabajo</button>
        <button ref={historyButton} className="secondary" type="button" aria-expanded={historyOpen} aria-controls="continuity-history" onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? "Ocultar historial de cierres" : "Ver historial de cierres"}</button></div></header>
    <details className="continuity-help"><summary>Privacidad y borradores</summary><p>Guardar es voluntario: no cambia la nota, el pack ni las piezas marcadas y no abre programas. Este historial no está cifrado en disco; otros programas con acceso a tu cuenta pueden leerlo. Los borradores solo viven en memoria y se pierden tras un cierre abrupto. Máximo 1000 cierres por mesa, sin borrado automático.</p>
      {nativeWarning && <p>Esta instalación no permite proteger el cierre nativo de la ventana. Guarda o descarta el borrador antes de cerrar Paravel.</p>}</details>
    {loading && <p className="continuity-muted" role="status">Cargando cierres…</p>}
    {listError && <div className="continuity-error" role="alert"><p>{listError}</p><button className="secondary" type="button" disabled={loading || busy} onClick={() => void loadPage(retryCursor.current)}>Reintentar carga de cierres</button></div>}
    {latest ? <div className="continuity-latest"><div><strong>Último cierre</strong><ClosureDate closure={latest} /></div>
      <p className="continuity-preview">{latest.progress}</p>{latest.nextAction && <p className="continuity-preview"><strong>Siguiente acción: </strong>{latest.nextAction}</p>}
      <button className="secondary" type="button" disabled={busy} onClick={() => void openClosure(latest)}>Ver último cierre</button></div>
      : loaded && !loading && !listError ? <p className="continuity-muted">Todavía no hay cierres. Puedes dejar un avance para cuando vuelvas, también si terminaste el trabajo.</p> : null}
    {historyOpen && <section id="continuity-history" className="continuity-history" aria-label="Historial de cierres">
      <div className="continuity-header"><h3>Historial de cierres</h3><button className="secondary" type="button" disabled={loading || busy} onClick={() => void loadPage()}>Actualizar historial</button></div>
      <ol>{items.map((closure) => <li key={closure.id}><ClosureDate closure={closure} /><p className="continuity-preview">{closure.progress}</p>
        <div className="continuity-actions"><button className="secondary" type="button" disabled={busy} aria-label={`Ver cierre del ${dateFormat.format(closure.createdAt)}`} onClick={() => void openClosure(closure)}>Ver cierre</button>
          <button className="secondary" type="button" disabled={busy} aria-label={`Editar cierre del ${dateFormat.format(closure.createdAt)}`} onClick={() => void openClosure(closure, true)}>Editar cierre</button>
          <button className="secondary continuity-danger" type="button" disabled={busy || draft?.id === closure.id} aria-label={`Eliminar cierre del ${dateFormat.format(closure.createdAt)}`} onClick={() => void remove(closure)}>Eliminar cierre</button></div></li>)}</ol>
      {cursor && <button className="secondary" type="button" disabled={loading || busy} onClick={() => void loadPage(cursor)}>Cargar más cierres</button>}
    </section>}
    {selected && !draft && <section ref={detail} tabIndex={-1} className="continuity-detail" aria-label="Detalle del cierre"><div className="continuity-header"><h3>Cierre de trabajo</h3><button className="secondary" type="button" onClick={() => { setSelected(null); restoreFocus(); }}>Cerrar detalle</button></div><ClosureDate closure={selected} /><ClosureText closure={selected} />
      <div className="continuity-actions"><button className="secondary" type="button" disabled={busy} onClick={() => void openClosure(selected, true)}>Editar este cierre</button><button className="secondary continuity-danger" type="button" disabled={busy} onClick={() => void remove(selected)}>Eliminar este cierre</button></div></section>}
    {draft && <form ref={form} className="continuity-form" noValidate onSubmit={(event) => void save(event)} aria-labelledby="continuity-form-title" aria-describedby="continuity-draft-hint">
      <h3 id="continuity-form-title">{draft.expectedRevision === null ? "Nuevo cierre de trabajo" : "Editar cierre de trabajo"}</h3>
      {draft.expectedRevision !== null && selected && <ClosureDate closure={selected} />}
      <p id="continuity-draft-hint" className="continuity-muted">Solo Último avance es obligatorio. Puedes dejar Siguiente acción vacía si terminaste. {dirty ? "Cambios sin guardar." : "Borrador en memoria."}</p>
      {nativeWarning && <p className="continuity-muted">Guarda o descarta antes de cerrar la ventana: esta instalación no tiene permiso para proteger el cierre nativo.</p>}
      {closureFields.map(({ key, label, limit, rows }) => {
        const fieldError = (submitted || touched[key]) ? errors[key] : undefined;
        return <div className="continuity-field" key={key}><label htmlFor={`continuity-${key}`}>{label}{key === "progress" ? " (obligatorio)" : " (opcional)"}</label>
          <textarea id={`continuity-${key}`} name={key} rows={rows} required={key === "progress"} value={draft[key]} disabled={busy}
            aria-invalid={fieldError ? true : undefined} aria-describedby={`continuity-${key}-hint${fieldError ? ` continuity-${key}-error` : ""}`}
            onBlur={() => setTouched((current) => ({ ...current, [key]: true }))}
            onChange={(event) => { const next = { ...draft, [key]: event.target.value }; setDraft(next); dirtyRef.current = !sameClosureFields(next, baseline); }} />
          <small id={`continuity-${key}-hint`} className="continuity-muted">{Array.from(draft[key].trim()).length} / {limit} caracteres</small>
          {fieldError && <p id={`continuity-${key}-error`} className="continuity-error">{fieldError}</p>}</div>;
      })}
      {submitted && errors.total && <p className="continuity-error" role="alert">{errors.total}</p>}
      <div className="continuity-actions"><button type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar cierre"}</button>
        <button className="secondary" type="button" disabled={busy} onClick={() => void cancelDraft()}>Cancelar cierre</button>
        {draft.expectedRevision !== null && selected && <button className="secondary" type="button" disabled={busy} onClick={() => void openClosure(selected, true)}>Recargar cierre</button>}</div>
    </form>}
    {error && <p className="continuity-error" role="alert">{error}</p>}
    <p className="continuity-status" role="status">{status}</p>
  </section>;
}
