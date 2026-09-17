import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { captureKinds, useCapture, validateCandidate, type CaptureRow, type PreviewItem, type RegisterExitGuard } from "./capture";
import { isTauri } from "./tauri";
import "./Capture.css";

function CaptureResource({ row, preview, disabled, onEdit, onRemove }: {
  row: CaptureRow; preview?: PreviewItem; disabled: boolean;
  onEdit: (itemId: string, patch: Partial<Pick<CaptureRow, "kind" | "name" | "reference" | "included" | "duplicatePolicy">>) => void;
  onRemove: (itemId: string) => void;
}) {
  const error = validateCandidate(row) || row.result?.error?.message || preview?.error?.message;
  const prefix = `capture-${row.itemId}`;
  return <li className="capture-row">
    <div className="capture-row-heading"><label htmlFor={`${prefix}-include`} className="capture-check">
      <input id={`${prefix}-include`} type="checkbox" checked={row.included} disabled={disabled} onChange={(event) => onEdit(row.itemId, { included: event.target.checked })} />Incluir recurso</label>
      <button className="secondary" type="button" disabled={disabled} aria-label={`Quitar ${row.name || "recurso"} de la captura`} onClick={() => onRemove(row.itemId)}>Quitar</button></div>
    <div className="capture-row-fields"><label htmlFor={`${prefix}-kind`} className="dialog-field">Tipo
      <select id={`${prefix}-kind`} value={row.kind} disabled={disabled} onChange={(event) => onEdit(row.itemId, { kind: event.target.value as CaptureRow["kind"] })}>
        {captureKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
      </select></label>
      <label htmlFor={`${prefix}-name`} className="dialog-field">Nombre
        <input id={`${prefix}-name`} required value={row.name} disabled={disabled} aria-describedby={`${prefix}-feedback`} aria-invalid={Boolean(error)}
          onChange={(event) => onEdit(row.itemId, { name: event.target.value })} /></label></div>
    <label htmlFor={`${prefix}-reference`} className="dialog-field">Referencia (URL o ruta nativa)
      <input id={`${prefix}-reference`} required value={row.reference} spellCheck={false} disabled={disabled} aria-describedby={`${prefix}-feedback`} aria-invalid={Boolean(error)}
        onChange={(event) => onEdit(row.itemId, { reference: event.target.value })} /></label>
    <label htmlFor={`${prefix}-duplicate`} className="dialog-field">Si ya existe en la mesa
      <select id={`${prefix}-duplicate`} value={row.duplicatePolicy} disabled={disabled} onChange={(event) => onEdit(row.itemId, { duplicatePolicy: event.target.value as "skip" | "allow" })}>
        <option value="skip">Omitir duplicado (predeterminado)</option><option value="allow">Permitir duplicado explícitamente</option>
      </select></label>
    <p id={`${prefix}-feedback`} className={error ? "capture-error" : "capture-muted"}>
      {error || (preview?.status === "duplicate" ? `Duplicado: ${preview.duplicatePieceIds?.length ?? 0} coincidencias en esta mesa.` : preview?.status === "ready" ? "Listo para añadir." : "Pendiente de vista previa.")}
      {preview?.normalizedName && <> Nombre normalizado: {preview.normalizedName}.</>}
    </p>
  </li>;
}

export default function CaptureDialog({ initialGroupId, initialSpaceId, registerExitGuard, onCommitted, onClose, nativeWarning }: {
  initialGroupId: string; initialSpaceId: string; registerExitGuard: RegisterExitGuard;
  onCommitted: (spaceId: string) => void; onClose: () => void; nativeWarning: boolean;
}) {
  const capture = useCapture(initialGroupId, initialSpaceId, onCommitted, registerExitGuard);
  const { state, current, operation } = capture;
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const callbacks = useRef(capture);
  const [dropState, setDropState] = useState<"connecting" | "ready" | "unavailable">("connecting");
  const [hovering, setHovering] = useState(false);
  const [closeMessage, setCloseMessage] = useState("");
  const closing = useRef(false);
  useEffect(() => { callbacks.current = capture; });
  useEffect(() => {
    const element = dialog.current;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    heading.current?.focus();
    return () => {
      element?.close();
      const target = opener.current;
      if (target?.isConnected && !target.matches(":disabled")) target.focus();
    };
  }, []);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (!isTauri()) { setDropState("unavailable"); return; }
    void getCurrentWebview().onDragDropEvent((event) => {
      if (disposed || !dialog.current?.open) return;
      const { payload } = event;
      if (payload.type === "leave") { setHovering(false); return; }
      if (operation.current || current.current.pending || current.current.pendingPaths.length) { setHovering(false); return; }
      if (payload.type === "drop") {
        setHovering(false);
        void callbacks.current.addPaths(payload.paths);
      } else { setHovering(true); }
    }).then((stop) => {
      if (disposed) stop();
      else { unlisten = stop; setDropState("ready"); }
    }).catch(() => { if (!disposed) setDropState("unavailable"); });
    return () => { disposed = true; unlisten?.(); };
  }, [current, operation]);
  function requestClose() {
    if (closing.current) return;
    if (operation.current) { setCloseMessage("Espera a que termine la operación antes de cerrar."); return; }
    if (current.current.pending) { setCloseMessage("Reintenta la operación sin confirmar antes de cerrar. No se puede descartar un resultado desconocido."); return; }
    const value = current.current;
    if ((value.rows.length || value.text.length || value.pendingPaths.length) && !window.confirm("Hay recursos sin añadir en la captura. ¿Descartarlos y cerrar? El borrador de continuidad se conserva.")) return;
    closing.current = true;
    onClose();
  }
  const locked = state.busy || Boolean(state.pending);
  const destinationSpaces = state.spaces.filter((space) => space.groupId === state.groupId);
  const selected = state.rows.filter((row) => row.included);
  const previews = new Map(state.preview?.map((item) => [item.itemId, item]));
  const destination = destinationSpaces.find((space) => space.id === state.spaceId);
  const group = state.groups.find((item) => item.id === state.groupId);
  const canPreview = !locked && !state.loading && !state.loadError && Boolean(group && destination) && selected.length > 0 && !state.text.trim() && !state.pendingPaths.length;
  const canCommit = canPreview && Boolean(state.preview?.length) && !state.preview?.some((item) => item.status === "invalid");
  return <dialog ref={dialog} className="modal capture-dialog" aria-labelledby="capture-title" aria-describedby="capture-description"
    onCancel={(event) => { event.preventDefault(); requestClose(); }}>
    <header><div className="htxt"><h2 id="capture-title" tabIndex={-1} ref={heading}>Añadir recursos</h2>
      <p id="capture-description">Prepara enlaces, archivos y carpetas. Revisa el destino antes de añadir; no se abren programas ni se cambian las piezas marcadas.</p></div>
      <button className="close" type="button" aria-label="Cerrar captura" onClick={requestClose}>×</button></header>
    <div className="body">
      <fieldset className="capture-destination" disabled={locked || state.loading}><legend>Destino explícito</legend>
        <label htmlFor="capture-group" className="dialog-field">Grupo
          <select id="capture-group" required value={state.groupId} onChange={(event) => capture.setDestination(event.target.value, "")}>
            <option value="">Selecciona un grupo</option>{state.groups.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select></label>
        <label htmlFor="capture-space" className="dialog-field">Mesa / espacio
          <select id="capture-space" required value={state.spaceId} disabled={!state.groupId} onChange={(event) => capture.setDestination(state.groupId, event.target.value)}>
            <option value="">Selecciona una mesa</option>{destinationSpaces.map((space) => <option value={space.id} key={space.id}>{space.name}</option>)}
          </select></label>
      </fieldset>
      <p className="capture-muted">{state.loading ? "Cargando destinos…" : group && destination ? `Destino: ${group.name} / ${destination.name}` : "Es obligatorio elegir un grupo y una mesa existentes. No se creará ni se abrirá otra mesa."}</p>
      {state.loadError && <p className="capture-error" role="alert">{state.loadError}</p>}
      <button className="secondary" type="button" disabled={locked || state.loading} onClick={() => void capture.loadDestinations()}>{state.loadError ? "Reintentar carga de destinos" : "Actualizar destinos"}</button>
      <section className="capture-source"><h3>Entrada de recursos</h3>
        <p id="capture-limits" className="capture-muted">Máximo 50 recursos, 256 KiB por captura, 32 KiB por referencia y nombres de 1–80 caracteres Unicode. Pega aquí una URL por línea; no se lee el portapapeles global ni se buscan títulos.</p>
        <label htmlFor="capture-urls" className="dialog-field">URLs (una por línea)
          <textarea id="capture-urls" rows={4} value={state.text} disabled={locked} spellCheck={false} aria-describedby="capture-limits"
            onChange={(event) => capture.setText(event.target.value)} /></label>
        <div className="capture-actions"><button className="secondary" type="button" disabled={locked || !state.text.trim()} onClick={capture.addUrls}>Preparar enlaces</button>
          <button className="secondary" type="button" disabled={locked || !state.text} onClick={() => capture.setText("")}>Descartar texto</button>
          <button className="secondary" type="button" disabled={locked || Boolean(state.pendingPaths.length) || !isTauri()} onClick={() => void capture.addPaths(undefined, "files")}>Seleccionar archivos</button>
          <button className="secondary" type="button" disabled={locked || Boolean(state.pendingPaths.length) || !isTauri()} onClick={() => void capture.addPaths(undefined, "folders")}>Seleccionar carpetas</button></div>
        <p className={`capture-drop ${hovering ? "capture-drop-active" : ""}`}>
          {dropState === "ready" ? "Arrastra archivos o carpetas desde el explorador del sistema sobre este diálogo. Se reciben rutas nativas, no archivos del navegador."
            : dropState === "connecting" ? "Conectando la recepción nativa de rutas…" : "Arrastre nativo no disponible. Usa los selectores en la app de escritorio."}
        </p>
        {state.pendingPaths.length > 0 && <div className="capture-pending-paths"><p>{state.pendingPaths.length} rutas pendientes; se conservan hasta prepararlas o descartarlas.</p>
          <div className="capture-actions"><button className="secondary" type="button" disabled={locked} onClick={() => void capture.addPaths(state.pendingPaths)}>Reintentar rutas</button>
            <button className="secondary" type="button" disabled={locked} onClick={capture.discardPaths}>Descartar rutas pendientes</button></div></div>}
      </section>
      <section className="capture-resources"><h3>Revisión · {selected.length} incluidos / {state.rows.length} recursos</h3>
        {!state.rows.length && <p className="capture-muted">Todavía no hay recursos pendientes. Preparar no añade piezas.</p>}
        <ol>{state.rows.map((row) => <CaptureResource key={row.itemId} row={row} preview={previews.get(row.itemId)} disabled={locked} onEdit={capture.editRow} onRemove={capture.removeRow} />)}</ol>
      </section>
      {state.pending && <section className="capture-unknown"><h3>Operación sin confirmar</h3><p>Destino y filas bloqueados. Reintentar utiliza exactamente el mismo identificador y contenido; no crea una operación nueva.</p><p>Operación: <code>{state.pendingId}</code></p></section>}
      {state.receipts.length > 0 && <details className="capture-receipts"><summary>Recibos de captura ({state.receipts.length})</summary>
        {state.receipts.map((receipt) => <section key={receipt.operationId}><h3>Operación {receipt.operationId}</h3><ul>{receipt.items.map((item) => <li key={item.itemId}>{item.status === "created" ? "Creado" : item.status === "skipped_duplicate" ? "Duplicado omitido" : "Rechazado"} · {item.pieceId || item.itemId}{item.error && <> · {item.error.message}</>}</li>)}</ul></section>)}
      </details>}
      <p className="capture-error" role="alert">{state.error || closeMessage}</p>
      <p className="capture-muted" role="status">{state.busy ? "Procesando captura…" : state.status}</p>
      <p className="capture-muted">Borrador solo en memoria. Un cierre abrupto lo pierde, incluidos los datos necesarios para reintentar una operación sin confirmar.</p>
      {nativeWarning && <p className="capture-error">No se pudo proteger el cierre nativo. No cierres Paravel con una operación sin confirmar; termina o descarta los borradores primero.</p>}
    </div>
    <footer><button className="btn" type="button" onClick={requestClose}>Cerrar</button>
      <button className="btn" type="button" disabled={!canPreview} onClick={() => void capture.preview()}>Vista previa</button>
      <button className="btn primary" type="button" disabled={state.busy || (!state.pending && !canCommit)} onClick={() => void capture.commit()}>
        {state.pending ? "Reintentar misma operación" : `Añadir ${selected.length} recursos`}</button></footer>
  </dialog>;
}
