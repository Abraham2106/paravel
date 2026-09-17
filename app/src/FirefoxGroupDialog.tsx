import { useEffect, useRef, useState } from "react";
import { parseFirefoxGroup, type FirefoxGroupInput } from "./firefoxGroup";

export default function FirefoxGroupDialog({ onSave, onClose }: {
  onSave: (group: FirefoxGroupInput) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    let group: FirefoxGroupInput;
    try { group = parseFirefoxGroup(text, name); }
    catch (reason) { setError((reason as Error).message); return; }
    submitting.current = true;
    setSaving(true);
    setError("");
    try { await onSave(group); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { submitting.current = false; setSaving(false); }
  }
  return <dialog ref={dialog} className="modal firefox-group-dialog" aria-labelledby="firefox-group-title"
    onCancel={(event) => { if (submitting.current) event.preventDefault(); }}
    onClose={() => { if (!dialog.current?.open) onClose(); }}>
    <form onSubmit={(event) => void submit(event)}>
      <header><div className="htxt"><h2 id="firefox-group-title">Grupo de Firefox</h2>
        <p>Guarda varias páginas bajo un nombre. Al iniciar, se abren juntas en una ventana de Firefox.</p></div>
        <button className="close" type="button" disabled={saving} aria-label="Cerrar" onClick={onClose}>×</button></header>
      <div className="body">
        <label className="dialog-field">Nombre del grupo
          <input value={name} maxLength={80} placeholder="Se puede incluir en la primera línea del bloque" disabled={saving}
            onChange={(event) => { setName(event.target.value); setError(""); }} /></label>
        <p id="firefox-group-hint">Pega una URL por línea, con el nombre opcional al principio. Admite http, https y archivos locales con file:///.</p>
        <label className="dialog-field">Páginas del grupo
          <textarea required rows={9} value={text} disabled={saving} spellCheck={false}
            placeholder={"prueba\nhttps://ejemplo.com\nfile:///C:/Documentos/lectura.pdf"}
            aria-describedby="firefox-group-hint firefox-group-error" aria-invalid={Boolean(error)}
            onChange={(event) => { setText(event.target.value); setError(""); }} /></label>
        <p id="firefox-group-error" className="form-error" role="alert">{error}</p>
      </div>
      <footer><button className="btn" type="button" disabled={saving} onClick={onClose}>Cancelar</button>
        <button className="btn primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar grupo"}</button></footer>
    </form>
  </dialog>;
}
