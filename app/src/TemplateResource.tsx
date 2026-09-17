import { useEffect, useId, useRef, useState } from "react";
import { invokeSafe } from "./tauri";
import { pieceReference, templateError, templateKindLabels, textLimit, type TemplatePiece, type TemplateDefinition } from "./templates";

export function TemplateFields({ template, fields, disabled, onChange, errors = {} }: {
  template: TemplateDefinition; fields: Record<string, string>; disabled?: boolean;
  onChange: (key: string, value: string) => void; errors?: Record<string, string>;
}) {
  const prefix = useId();
  return <fieldset className="template-fieldset" disabled={disabled}><legend>Textos iniciales opcionales</legend>
    {template.fields.map((field) => {
      const value = fields[field.key] ?? "";
      const error = textLimit(value, 1000) || errors[field.key];
      return <label className="dialog-field" key={field.key} htmlFor={`${prefix}-${field.key}`}>{field.label} (opcional)
        <textarea id={`${prefix}-${field.key}`} value={value} rows={3} aria-invalid={Boolean(error)} aria-describedby={`${prefix}-${field.key}-help`} onChange={(event) => onChange(field.key, event.target.value)} />
        <span id={`${prefix}-${field.key}-help`} className={error ? "template-error" : "template-muted"}>{field.hint} · {Array.from(value).length}/1000{error && ` · ${error}`}</span>
      </label>;
    })}
  </fieldset>;
}

export default function TemplateResource({ label, kinds, piece, disabled, error, onChange, onBusy }: {
  label: string; kinds: string[]; piece: TemplatePiece | null; disabled?: boolean; error?: string;
  onChange: (piece: TemplatePiece | null) => void; onBusy: (busy: boolean) => void;
}) {
  const prefix = useId();
  const [kind, setKind] = useState(() => piece?.kind ?? kinds[0] ?? "");
  const [picking, setPicking] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const epoch = useRef(0);
  const operation = useRef(false);
  useEffect(() => () => { epoch.current += 1; }, []);
  const selectedKind = piece?.kind ?? kind;
  const local = !["firefox", "firefox-group"].includes(selectedKind);
  async function pick() {
    if (operation.current || disabled) return;
    operation.current = true;
    const request = ++epoch.current;
    setPicking(true); onBusy(true); setPickerError("");
    try {
      const path = await invokeSafe<string | null>(selectedKind === "file" ? "pick_file" : "pick_folder", { title: `Selecciona ${label}` });
      if (request !== epoch.current || !path) return;
      onChange({ kind: selectedKind, name: piece?.name || path.split(/[\\/]/).filter(Boolean).pop() || label, payload: { path } });
    } catch (reason) {
      if (request === epoch.current) setPickerError(templateError(reason).message);
    } finally {
      operation.current = false;
      if (request === epoch.current) { setPicking(false); onBusy(false); }
    }
  }
  function changeKind(next: string) {
    if (piece && !window.confirm("Cambiar el tipo retira el recurso preparado de esta sugerencia. ¿Continuar?")) return;
    setKind(next); onChange(null); setPickerError("");
  }
  const feedback = pickerError || error || (piece ? textLimit(piece.name, 80) : "");
  return <fieldset className="template-resource" disabled={disabled || picking} aria-describedby={`${prefix}-feedback`}>
    <legend>{label}</legend>
    <label className="dialog-field" htmlFor={`${prefix}-kind`}>Tipo de recurso
      <select id={`${prefix}-kind`} value={selectedKind} onChange={(event) => changeKind(event.target.value)}>{kinds.map((value) => <option key={value} value={value}>{templateKindLabels[value] ?? value}</option>)}</select>
    </label>
    {!piece ? <button type="button" className="secondary" disabled={!selectedKind || !templateKindLabels[selectedKind]} onClick={() => local ? void pick() : onChange({ kind: selectedKind, name: "", payload: { urls: [] } })}>{picking ? "Seleccionando…" : "Añadir recurso"}</button> : <>
      <label className="dialog-field" htmlFor={`${prefix}-name`}>Nombre del recurso
        <input id={`${prefix}-name`} required value={piece.name} aria-invalid={Boolean(feedback)} aria-describedby={`${prefix}-feedback`} onChange={(event) => onChange({ ...piece, name: event.target.value })} />
      </label>
      {local ? <><label className="dialog-field" htmlFor={`${prefix}-path`}>Ruta seleccionada
        <input id={`${prefix}-path`} readOnly value={piece.payload.path ?? ""} aria-invalid={Boolean(feedback)} aria-describedby={`${prefix}-feedback`} />
      </label><button type="button" className="secondary" onClick={() => void pick()}>Elegir otra ruta</button></> : <label className="dialog-field" htmlFor={`${prefix}-urls`}>{selectedKind === "firefox-group" ? "URLs del grupo (una por línea; http(s) o file:///C:/…)" : "URLs (una por línea; http(s))"}
        <textarea id={`${prefix}-urls`} required rows={4} spellCheck={false} value={pieceReference(piece)} aria-invalid={Boolean(feedback)} aria-describedby={`${prefix}-feedback`} onChange={(event) => onChange({ ...piece, payload: { urls: event.target.value.split(/\r?\n/) } })} />
      </label>}
      <button type="button" className="secondary" onClick={() => { onChange(null); setPickerError(""); }}>Retirar recurso</button>
    </>}
    <p id={`${prefix}-feedback`} className={feedback ? "template-error" : "template-muted"} aria-live="polite">{feedback || "Solo se guarda la referencia. No se copia, crea ni abre su contenido."}</p>
  </fieldset>;
}
