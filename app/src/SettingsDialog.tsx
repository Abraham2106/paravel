import { useEffect, useRef, useState } from "react";
import { invokeSafe, isTauri } from "./tauri";

export type HostSettings = {
  extraRoots: string[];
  vscodeExe: string | null;
  cursorExe: string | null;
  firefoxExe: string | null;
  dataDir: string;
  dbPath: string;
  logPath: string;
  homeRoot: string | null;
};

type Draft = {
  extraRoots: string[];
  vscodeExe: string;
  cursorExe: string;
  firefoxExe: string;
};

function toDraft(value: HostSettings): Draft {
  return {
    extraRoots: [...value.extraRoots],
    vscodeExe: value.vscodeExe ?? "",
    cursorExe: value.cursorExe ?? "",
    firefoxExe: value.firefoxExe ?? "",
  };
}

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [loaded, setLoaded] = useState<HostSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const dirty = Boolean(loaded && draft && JSON.stringify(toDraft(loaded)) !== JSON.stringify(draft));

  useEffect(() => {
    const element = dialog.current;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    heading.current?.focus();
    void load();
    return () => {
      element?.close();
      const target = opener.current;
      if (target?.isConnected && !target.matches(":disabled")) target.focus();
    };
  }, []);

  async function load() {
    setError("");
    try {
      const value = await invokeSafe<HostSettings>("get_host_settings");
      setLoaded(value);
      setDraft(toDraft(value));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  function close() {
    if (busy) { setStatus("Espera a que termine de guardar."); return; }
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
    onClose();
  }

  async function addRoot() {
    if (!draft || busy) return;
    const path = await invokeSafe<string | null>("pick_folder", { title: "Carpeta extra permitida" });
    if (!path) return;
    if (draft.extraRoots.some((item) => item.toLowerCase() === path.toLowerCase())) return;
    setDraft({ ...draft, extraRoots: [...draft.extraRoots, path] });
  }

  async function pickExe(field: "vscodeExe" | "cursorExe" | "firefoxExe", title: string) {
    if (!draft || busy) return;
    const path = await invokeSafe<string | null>("pick_executable", { title });
    if (!path) return;
    setDraft({ ...draft, [field]: path });
  }

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const saved = await invokeSafe<Pick<HostSettings, "extraRoots" | "vscodeExe" | "cursorExe" | "firefoxExe">>("save_host_settings", {
        input: {
          extraRoots: draft.extraRoots,
          vscodeExe: draft.vscodeExe.trim() || null,
          cursorExe: draft.cursorExe.trim() || null,
          firefoxExe: draft.firefoxExe.trim() || null,
        },
      });
      setLoaded((current) => current ? { ...current, ...saved } : current);
      setDraft({
        extraRoots: [...saved.extraRoots],
        vscodeExe: saved.vscodeExe ?? "",
        cursorExe: saved.cursorExe ?? "",
        firefoxExe: saved.firefoxExe ?? "",
      });
      setStatus("Guardado en este equipo.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="modal settings-dialog" aria-labelledby="settings-title" aria-describedby="settings-description"
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <header><div className="htxt"><h2 id="settings-title" tabIndex={-1} ref={heading}>Este equipo</h2>
      <p id="settings-description">Paravel usa tu carpeta de usuario por defecto. Aquí solo se configuran excepciones locales; no se suben al repositorio.</p></div>
      <button className="close" type="button" aria-label="Cerrar configuración" onClick={close}>×</button></header>
    <div className="body">
      {!isTauri() && <p className="capture-error">Abre la aplicación de escritorio para cambiar estas rutas.</p>}
      {loaded && draft ? <>
        <section>
          <h3>Dónde guarda Paravel</h3>
          <p className="capture-muted">Sede, SQLite y log de este equipo. No hace falta copiarlas al repo.</p>
          <label className="dialog-field">Carpeta de datos<input readOnly value={loaded.dataDir} /></label>
          <label className="dialog-field">Base de datos<input readOnly value={loaded.dbPath} /></label>
          <label className="dialog-field">Log de Iniciar<input readOnly value={loaded.logPath} /></label>
        </section>
        <section>
          <h3>Carpetas que se pueden abrir</h3>
          <p className="capture-muted">Siempre está permitida tu carpeta de usuario{loaded.homeRoot ? ` (${loaded.homeRoot})` : ""}. Añade otras unidades o discos de trabajo.</p>
          {!draft.extraRoots.length && <p className="capture-muted">No hay carpetas extra.</p>}
          <ul className="settings-roots">{draft.extraRoots.map((root) => <li key={root}>
            <code>{root}</code>
            <button className="secondary" type="button" disabled={busy} onClick={() => setDraft({ ...draft, extraRoots: draft.extraRoots.filter((item) => item !== root) })}>Quitar</button>
          </li>)}</ul>
          <button className="secondary" type="button" disabled={busy || !isTauri()} onClick={() => void addRoot()}>Añadir carpeta</button>
        </section>
        <section>
          <h3>Programas (opcional)</h3>
          <p className="capture-muted">Déjalos vacíos si VS Code, Cursor o Firefox están en la ubicación habitual. Si Iniciar no los encuentra, indica el .exe.</p>
          {([
            ["vscodeExe", "VS Code", "Code.exe"],
            ["cursorExe", "Cursor", "Cursor.exe"],
            ["firefoxExe", "Firefox", "firefox.exe"],
          ] as const).map(([field, label, file]) => <div className="settings-exe" key={field}>
            <label htmlFor={`settings-${field}`} className="dialog-field">{label}
              <input id={`settings-${field}`} value={draft[field]} spellCheck={false} disabled={busy}
                placeholder={`Detectar ${file} automáticamente`}
                onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} />
            </label>
            <button className="secondary" type="button" disabled={busy || !isTauri()} onClick={() => void pickExe(field, `Selecciona ${file}`)}>Examinar</button>
            <button className="secondary" type="button" disabled={busy || !draft[field]} onClick={() => setDraft({ ...draft, [field]: "" })}>Automático</button>
          </div>)}
        </section>
      </> : !error ? <p className="capture-muted">Cargando configuración…</p> : null}
      <p className="capture-error" role="alert">{error}</p>
      <p className="capture-muted" role="status">{busy ? "Guardando…" : status}</p>
    </div>
    <footer>
      <button className="btn" type="button" onClick={close}>Cerrar</button>
      <button className="btn primary" type="button" disabled={busy || !dirty || !isTauri()} onClick={() => void save()}>Guardar</button>
    </footer>
  </dialog>;
}
