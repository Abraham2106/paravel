import { useEffect, useLayoutEffect, useRef, useState } from "react";
import TemplateResource, { TemplateFields } from "./TemplateResource";
import { invokeSafe } from "./tauri";
import { pieceReference, templateApi, templateError, templateFieldError, templateKindLabels, textLimit, uncertainTemplateError, type RegisterTemplateGuard, type TemplateCreated, type TemplateDefinition, type TemplateError, type TemplateInput, type TemplatePreview, type TemplateSlotInput } from "./templates";
import "./Templates.css";

type Group = { id: string; name: string };
export default function TemplateWizard({ initialGroupId, registerExitGuard, onClose, onEmpty, onCreateGroup, onCreated, nativeWarning }: {
  initialGroupId: string; registerExitGuard: RegisterTemplateGuard; onClose: () => void; nativeWarning: boolean;
  onEmpty: () => void; onCreateGroup: () => void; onCreated: (result: TemplateCreated) => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<TemplateDefinition[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState<"choose" | "prepare" | "review">("choose");
  const [template, setTemplate] = useState<TemplateDefinition | null>(null);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState(initialGroupId);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [slots, setSlots] = useState<TemplateSlotInput[]>([]);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [pending, setPending] = useState<TemplateInput | null>(null);
  const [created, setCreated] = useState<TemplateCreated | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TemplateError | null>(null);
  const [status, setStatus] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorNode = useRef<HTMLParagraphElement>(null);
  const alive = useRef(false);
  const generation = useRef(0);
  const catalogGeneration = useRef(0);
  const operation = useRef(false);
  const pendingRef = useRef<TemplateInput | null>(null);
  const receipt = useRef<TemplateCreated | null>(null);
  const dirty = Boolean(name || groupId !== initialGroupId || Object.values(fields).some(Boolean) || slots.some((slot) => slot.piece || slot.omitted));
  const dirtyRef = useRef(dirty);
  useLayoutEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  const locked = busy || Boolean(pending) || Boolean(created);
  useEffect(() => registerExitGuard({ label: "el asistente de plantillas", state: () => ({ dirty: !receipt.current && dirtyRef.current, busy: operation.current, blocked: Boolean(pendingRef.current) }) }), [registerExitGuard]);
  useEffect(() => {
    alive.current = true;
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    heading.current?.focus();
    void load();
    return () => { alive.current = false; generation.current += 1; catalogGeneration.current += 1; element?.close(); if (opener?.isConnected && !opener.matches(":disabled")) opener.focus(); };
  }, []);
  useEffect(() => { heading.current?.focus(); }, [step, created]);
  useEffect(() => { if (error) errorNode.current?.focus(); }, [error]);
  async function load() {
    const request = ++catalogGeneration.current;
    setLoading(true); setLoadError("");
    const [templatesResult, groupsResult] = await Promise.allSettled([templateApi.list(), invokeSafe<Group[]>("list_groups")]);
    if (!alive.current || request !== catalogGeneration.current) return;
    if (templatesResult.status === "fulfilled") setCatalog(templatesResult.value);
    if (groupsResult.status === "fulfilled") setGroups(groupsResult.value);
    const reasons = [templatesResult, groupsResult].filter((result) => result.status === "rejected");
    setLoadError(reasons.length ? "No se pudieron cargar las plantillas o los destinos. Reintenta o crea un espacio vacío." : "");
    setLoading(false);
  }
  function close(action = onClose) {
    if (operation.current) { setStatus("Espera a que termine la operación antes de salir."); return; }
    if (pendingRef.current) { setStatus("Resultado incierto: reintenta con la misma solicitud antes de salir. El borrador se conserva en memoria."); return; }
    if (!receipt.current && dirtyRef.current && !window.confirm("Hay cambios sin guardar en el asistente. ¿Descartar el borrador y salir?")) return;
    action();
  }
  function invalidate() {
    if (operation.current || pendingRef.current || receipt.current) return false;
    setPreview(null); setError(null); setStatus("");
    return true;
  }
  function selectTemplate(next: TemplateDefinition) {
    if (!invalidate()) return;
    if (next.templateId !== template?.templateId) {
      if ((Object.values(fields).some(Boolean) || slots.some((slot) => slot.piece || slot.omitted)) && !window.confirm("Cambiar de plantilla descarta sus textos y recursos preparados; conserva nombre y destino. ¿Continuar?")) return;
      setFields(Object.fromEntries(next.fields.map((field) => [field.key, ""])));
      setSlots(next.slots.map((slot) => ({ key: slot.key, omitted: false, piece: null })));
      setTemplate(next);
    }
    setStep("prepare");
  }
  async function review() {
    if (operation.current || pendingRef.current || !template) return;
    if (!groups.some((group) => group.id === groupId)) { setError({ code: "GROUP_NOT_FOUND", field: "groupId", message: "Elige un grupo de destino vigente. No se seleccionará otro automáticamente." }); return; }
    const nameError = !name.trim() ? "Escribe el nombre del espacio." : textLimit(name.trim(), 80);
    const invalidField = template.fields.find((field) => textLimit(fields[field.key] ?? "", 1000));
    if (nameError || invalidField) { setError({ code: "INVALID_FIELD", field: nameError ? "name" : invalidField!.key, message: nameError || "Revisa el texto: máximo 1000 caracteres Unicode." }); return; }
    operation.current = true; setBusy(true); setError(null); setStatus("Validando la vista previa…");
    const request = ++generation.current;
    try {
      const input: TemplateInput = { requestId: crypto.randomUUID(), templateId: template.templateId, templateRevision: template.revision, schemaVersion: 1, groupId, name, fields, slots };
      const plan = await templateApi.preview(input);
      if (!alive.current || request !== generation.current) return;
      setPreview(plan); setStep("review"); setStatus("");
    } catch (reason) { if (alive.current && request === generation.current) { setError(templateError(reason)); setStatus("El borrador se conserva. Corrige o retira el recurso indicado."); } }
    finally { if (alive.current && request === generation.current) { operation.current = false; setBusy(false); } }
  }
  async function openCreated(result: TemplateCreated) {
    setStatus("Espacio creado. Actualizando la vista…");
    try {
      await onCreated(result);
    } catch {
      if (alive.current) setStatus("Espacio creado; no se pudo actualizar la vista. Puedes reintentar abrirlo sin volver a crearlo.");
    }
  }
  async function create() {
    if (operation.current || receipt.current || !preview) return;
    const input = pendingRef.current ?? { requestId: crypto.randomUUID(), templateId: preview.template.templateId, templateRevision: preview.template.revision, schemaVersion: 1 as const, groupId: preview.groupId, name: preview.name, fields: preview.fields, slots: preview.slots };
    pendingRef.current = input; setPending(input);
    operation.current = true; setBusy(true); setError(null); setStatus("Creando espacio… No cierres esta ventana.");
    const request = ++generation.current;
    try {
      const result = await templateApi.create(input);
      if (!alive.current || request !== generation.current) return;
      receipt.current = result; setCreated(result); pendingRef.current = null; setPending(null);
      await openCreated(result);
    } catch (reason) {
      if (!alive.current || request !== generation.current) return;
      const failure = templateError(reason);
      setError(failure);
      if (!uncertainTemplateError(failure)) {
        pendingRef.current = null; setPending(null); setPreview(null); setStep("prepare");
        setStatus("No se confirmó la creación. El borrador se conserva; revisa los datos antes de enviar de nuevo.");
        if (failure.code === "GROUP_NOT_FOUND") void load();
      } else setStatus("Resultado incierto. Conservamos la misma solicitud y sus datos: Reintentar creación no genera una intención nueva.");
    } finally { if (alive.current) { operation.current = false; setBusy(false); } }
  }
  async function retryOpen() {
    if (operation.current || !receipt.current) return;
    operation.current = true; setBusy(true);
    await openCreated(receipt.current);
    if (alive.current) { operation.current = false; setBusy(false); }
  }
  const destination = groups.find((group) => group.id === (preview?.groupId ?? groupId));
  return <dialog ref={dialog} className="modal template-dialog" aria-labelledby="template-title" aria-describedby="template-description" onCancel={(event) => { event.preventDefault(); close(); }} onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}>
    <form onSubmit={(event) => { event.preventDefault(); if (step === "prepare") void review(); else if (step === "review") void create(); }}>
      <header><div className="htxt"><h2 id="template-title" ref={heading} tabIndex={-1}>{created ? "Espacio creado" : "Crear espacio"}</h2><p id="template-description">Elige cómo vas a trabajar, añade lo que ya tienes y completa lo demás cuando lo necesites.</p></div><button className="close" type="button" aria-label="Cerrar asistente" disabled={busy || Boolean(pending)} onClick={() => close()}>×</button></header>
      <div className="body">
        {nativeWarning && <p className="template-error" role="alert">No se pudo activar la protección de cierre nativo. Cancela o termina el asistente antes de cerrar la ventana.</p>}
        <ol className="template-steps" aria-label="Pasos del asistente">{[["choose", "Elegir"], ["prepare", "Preparar"], ["review", "Revisar"], ["created", "Crear"]].map(([key, label]) => <li key={key} aria-current={(created ? key === "created" : step === key) ? "step" : undefined}>{label}</li>)}</ol>
        {!created && <p className="template-destination">Destino: <strong>{destination?.name ?? "Selecciona un grupo"}</strong></p>}
        {step === "choose" && !created && <>
          <div className="template-options"><button className="secondary template-option" type="button" onClick={() => close(onEmpty)}><strong>Espacio vacío</strong><span>Crear con el formulario habitual, sin preparación inicial.</span></button></div>
          <h3>Desde plantilla</h3>
          {loading && <p role="status">Cargando plantillas y grupos…</p>}
          {loadError && <p className="template-error" role="alert">{loadError}</p>}
          {!loading && !groups.length && <p>Necesitas un grupo de destino. Crea uno antes de empezar. <button type="button" className="secondary" onClick={() => close(onCreateGroup)}>Crear grupo</button></p>}
          {!loading && !catalog.length && !loadError && <p>No hay plantillas disponibles. Puedes crear un espacio vacío.</p>}
          <div className="template-options">{catalog.map((item) => <button className="secondary template-option" type="button" key={item.templateId} disabled={loading || !groups.length || item.schemaVersion !== 1 || item.revision !== 1} onClick={() => selectTemplate(item)}><strong>{item.name}</strong><span>{item.description}</span><small>Recursos sugeridos: {item.slots.map((slot) => slot.label).join("; ") || "Ninguno"}</small>{(item.schemaVersion !== 1 || item.revision !== 1) && <small>Versión incompatible</small>}</button>)}</div>
          <button type="button" className="secondary" disabled={loading} onClick={() => void load()}>Reintentar catálogo y destinos</button>
        </>}
        {step === "prepare" && template && !created && <>
          <h3>{template.name}</h3>
          <fieldset className="template-fieldset" disabled={locked}><legend>Nombre y destino</legend>
            <label className="dialog-field" htmlFor="template-name">Nombre del espacio
              <input id="template-name" required value={name} aria-invalid={Boolean(textLimit(name.trim(), 80) || templateFieldError(error, "name"))} aria-describedby="template-name-help" onChange={(event) => { if (invalidate()) setName(event.target.value); }} />
              <span id="template-name-help" className="template-muted">Hasta 80 caracteres Unicode. {textLimit(name.trim(), 80) || templateFieldError(error, "name")}</span>
            </label>
            <label className="dialog-field" htmlFor="template-group">Grupo de destino
              <select id="template-group" required value={groupId} aria-invalid={Boolean(templateFieldError(error, "groupId"))} aria-describedby="template-group-help" onChange={(event) => { if (invalidate()) setGroupId(event.target.value); }}><option value="">Selecciona un grupo</option>{groupId && !groups.some((group) => group.id === groupId) && <option value={groupId} disabled>Grupo no disponible</option>}{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
              <span id="template-group-help" className="template-error">{templateFieldError(error, "groupId")}</span>
            </label><button type="button" className="secondary" disabled={loading} onClick={() => void load()}>Actualizar destinos</button>
            {loadError && <p className="template-error" role="alert">{loadError}</p>}
          </fieldset>
          <TemplateFields template={template} fields={fields} disabled={locked} errors={Object.fromEntries(template.fields.map((field) => [field.key, templateFieldError(error, field.key)]))} onChange={(key, value) => { if (invalidate()) setFields((current) => ({ ...current, [key]: value })); }} />
          <h3>Recursos sugeridos (opcionales)</h3>
          {template.slots.map((definition, index) => {
            const slot = slots.find((item) => item.key === definition.key)!;
            return <div key={definition.key} className="template-slot"><TemplateResource label={definition.label} kinds={definition.kinds} piece={slot.piece} disabled={locked || slot.omitted} error={templateFieldError(error, slot.key, index)} onBusy={(value) => { operation.current = value; setBusy(value); }} onChange={(piece) => { if (operation.current) { setPreview(null); setError(null); } else if (!invalidate()) return; setSlots((current) => current.map((item) => item.key === slot.key ? { ...item, piece, omitted: false } : item)); }} />
              <label className="template-check"><input type="checkbox" checked={slot.omitted} disabled={locked} onChange={(event) => { if (!invalidate()) return; if (event.target.checked && slot.piece && !window.confirm("Omitir retira el recurso de esta sugerencia. ¿Continuar?")) return; setSlots((current) => current.map((item) => item.key === slot.key ? { ...item, omitted: event.target.checked, piece: null } : item)); }} />Omitir {definition.label}</label>
            </div>;
          })}
          <p className="template-muted">Los campos vacíos quedan vacíos. El host valida las rutas y URLs antes de guardar.</p>
        </>}
        {step === "review" && preview && !created && <section aria-label="Vista previa validada">
          <h3>{preview.name}</h3><p>Grupo de destino: <strong>{destination?.name ?? "Grupo no disponible"}</strong></p><p>Plantilla: {preview.template.name}</p>
          <dl className="template-values">{preview.template.fields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{preview.fields[field.key] || "Sin texto"}</dd></div>)}</dl>
          <ul className="template-review-slots">{preview.slots.map((slot) => <li key={slot.key}><strong>{preview.template.slots.find((item) => item.key === slot.key)?.label ?? slot.key}</strong>{slot.piece ? <><p>{slot.piece.name} · {templateKindLabels[slot.piece.kind] ?? slot.piece.kind}</p><pre>{pieceReference(slot.piece)}</pre></> : <p>{slot.omitted ? "Omitida" : "Pendiente · sin pieza"}</p>}</li>)}</ul>
          <ul className="template-muted"><li>No se abrirán aplicaciones ni archivos.</li><li>No se configurará MCP ni se añadirán piezas al pack.</li><li>Las piezas nacen desmarcadas; Iniciar requiere selección posterior.</li><li>La preparación inicial queda fuera del contexto MCP. Esto no cifra los datos locales.</li><li>Nota vacía y sin cierres de Continuidad.</li></ul>
        </section>}
        {created && <p><strong>{created.space.name}</strong> está guardado. No vuelvas a crearlo para actualizar la vista.</p>}
        <p ref={errorNode} tabIndex={-1} className="template-error" role="alert">{error && `${error.message}${error.field ? ` (${error.field})` : ""}`}</p>
        <p className="template-muted" role="status" aria-live="polite">{status}</p>
        {!created && <p className="template-muted">Borrador solo en memoria: no se recupera tras recargar o reiniciar.</p>}
      </div>
      <footer><button className="btn" type="button" disabled={busy || Boolean(pending)} onClick={() => close()}>{created ? "Cerrar" : "Cancelar"}</button>
        {!created && step !== "choose" && <button className="btn" type="button" disabled={locked} onClick={() => { setStep(step === "review" ? "prepare" : "choose"); setError(null); }}>Atrás</button>}
        {!created && step === "prepare" && <button className="btn primary" type="submit" disabled={locked || loading}>{busy ? "Validando…" : "Revisar espacio"}</button>}
        {!created && step === "review" && <button className="btn primary" type="submit" disabled={busy}>{busy ? "Creando…" : pending ? "Reintentar creación" : "Crear espacio"}</button>}
        {created && <button className="btn primary" type="button" disabled={busy} onClick={() => void retryOpen()}>Abrir espacio creado</button>}
      </footer>
    </form>
  </dialog>;
}
