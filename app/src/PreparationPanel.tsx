import { useEffect, useLayoutEffect, useRef, useState } from "react";
import TemplateResource, { TemplateFields } from "./TemplateResource";
import { templateApi, templateError, templateFieldError, textLimit, uncertainTemplateError, type Preparation, type PreparationSlot, type PreparationUpdate, type RegisterTemplateGuard, type SlotResolution, type TemplateError, type TemplatePiece } from "./templates";
import "./Templates.css";

type Mutation = { kind: "fields"; input: PreparationUpdate } | { kind: "slot"; input: SlotResolution };
type FieldDraft = { fields: Record<string, string>; revision: number; hidden: boolean; baseline: string };
type ResourceDraft = { slot: PreparationSlot; piece: TemplatePiece | null };
export default function PreparationPanel({ spaceId, pieces, registerExitGuard, onRefreshPieces }: {
  spaceId: string; pieces: { id: string; name: string }[];
  registerExitGuard: RegisterTemplateGuard; onRefreshPieces: (spaceId: string) => Promise<void>;
}) {
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<FieldDraft | null>(null);
  const [resource, setResource] = useState<ResourceDraft | null>(null);
  const [pending, setPending] = useState<Mutation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TemplateError | null>(null);
  const [status, setStatus] = useState("");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const alive = useRef(false);
  const generation = useRef(0);
  const operation = useRef(false);
  const pendingRef = useRef<Mutation | null>(null);
  const dirtyRef = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorNode = useRef<HTMLParagraphElement>(null);
  const dirty = Boolean((draft && JSON.stringify(draft.fields) !== draft.baseline) || resource?.piece);
  useLayoutEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  const pieceIds = pieces.map((piece) => piece.id).sort().join("|");
  useEffect(() => registerExitGuard({ label: "la preparación inicial", state: () => ({ dirty: dirtyRef.current, busy: operation.current, blocked: Boolean(pendingRef.current) }) }), [registerExitGuard]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; generation.current += 1; };
  }, []);
  useEffect(() => { if (!busy) void load(); }, [spaceId, pieceIds, busy]);
  useEffect(() => { if (draft || resource) form.current?.querySelector<HTMLElement>("textarea, select, input")?.focus(); }, [Boolean(draft), resource?.slot.id]);
  useEffect(() => { if (error) errorNode.current?.focus(); }, [error]);
  async function load(review = false) {
    if (operation.current) return;
    const request = ++generation.current;
    setLoading(true); setLoadError("");
    try {
      const next = await templateApi.get(spaceId);
      if (!alive.current || request !== generation.current) return;
      setPreparation(next); setLoaded(true);
      if (review) setReviewed(true);
    } catch (reason) {
      if (alive.current && request === generation.current) setLoadError(templateError(reason).message);
    } finally { if (alive.current && request === generation.current) setLoading(false); }
  }
  function cancelEdit() {
    if (operation.current || pendingRef.current) return;
    if (dirtyRef.current && !window.confirm("¿Descartar los cambios sin guardar de la preparación inicial?")) return;
    setDraft(null); setResource(null); setError(null); setStatus(""); heading.current?.focus();
  }
  async function refreshPieces() {
    try {
      await onRefreshPieces(spaceId);
      if (alive.current) setRefreshFailed(false);
    } catch {
      if (alive.current) { setRefreshFailed(true); setStatus("Preparación guardada; no se pudieron actualizar las piezas. Actualiza la vista, no vuelvas a añadir el recurso."); }
    }
  }
  async function mutate(mutation: Mutation) {
    if (operation.current || (pendingRef.current && pendingRef.current !== mutation)) return;
    operation.current = true; setBusy(true); setError(null); setStatus("Guardando preparación…");
    const request = ++generation.current;
    setLoading(false);
    pendingRef.current = mutation; setPending(mutation);
    try {
      const next = mutation.kind === "fields" ? await templateApi.update(mutation.input) : await templateApi.resolve(mutation.input);
      if (!alive.current || request !== generation.current) return;
      setPreparation(next); setDraft(null); setResource(null);
      pendingRef.current = null; setPending(null);
      setStatus("Preparación guardada. La nota, Continuidad y el pack no cambian.");
      heading.current?.focus();
      if (mutation.kind === "slot") await refreshPieces();
    } catch (reason) {
      if (!alive.current || request !== generation.current) return;
      const failure = templateError(reason);
      setError(failure); setReviewed(false);
      if (uncertainTemplateError(failure)) setStatus("Resultado incierto. Conservamos los datos y la revisión enviados; reintenta la misma operación antes de salir.");
      else {
        pendingRef.current = null; setPending(null);
        setStatus("No se guardaron los cambios. El borrador local se conserva.");
      }
    } finally { if (alive.current && request === generation.current) { operation.current = false; setBusy(false); } }
  }
  function saveFields() {
    if (!draft || !preparation) return;
    const invalid = preparation.template.fields.find((field) => textLimit(draft.fields[field.key] ?? "", 1000));
    if (invalid) { setError({ code: "INVALID_FIELD", field: invalid.key, message: "Máximo 1000 caracteres Unicode por texto." }); return; }
    void mutate({ kind: "fields", input: { spaceId, expectedRevision: draft.revision, fields: draft.fields, hidden: draft.hidden } });
  }
  function resolve(slot: PreparationSlot, omitted: boolean, piece: TemplatePiece | null) {
    void mutate({ kind: "slot", input: { spaceId, slotId: slot.id, expectedRevision: slot.revision, omitted, piece } });
  }
  function toggleHidden() {
    if (!preparation) return;
    void mutate({ kind: "fields", input: { spaceId, expectedRevision: preparation.revision, fields: preparation.fields, hidden: !preparation.hidden } });
  }
  function useCurrentRevision() {
    if (!preparation || operation.current || pendingRef.current) return;
    if (resource) {
      const slot = preparation.slots.find((item) => item.id === resource.slot.id);
      if (!slot || slot.pieceId) { setStatus("La sugerencia ya no está pendiente. Conservamos tu recurso local; cancela la edición para revisar el vínculo actual."); return; }
      setResource({ ...resource, slot });
    }
    if (draft) setDraft({ ...draft, revision: preparation.revision, hidden: preparation.hidden });
    setError(null); setStatus("Revisión vigente adoptada. Revisa el borrador conservado antes de guardar; no se ha escrito nada.");
  }
  const locked = busy || Boolean(pending);
  const editing = Boolean(draft || resource);
  const conflict = error?.code === "REVISION_CONFLICT" || error?.code === "SLOT_STATE_CONFLICT";
  if (loaded && !preparation && !loadError) return null;
  return <section className="preparation-panel" aria-labelledby={`preparation-${spaceId}`} aria-busy={busy || loading}>
    <div className="preparation-header"><div><h3 id={`preparation-${spaceId}`} ref={heading} tabIndex={-1}>Preparación inicial</h3><p className="template-muted">{preparation?.template.name} · Privada respecto de MCP; separada de Continuidad.</p></div>
      {preparation && <div className="template-actions"><button className="secondary" type="button" disabled={locked || editing || loading} onClick={toggleHidden}>{preparation.hidden ? "Mostrar preparación" : "Ocultar preparación"}</button>{!preparation.hidden && <button className="secondary" type="button" disabled={locked || editing || loading} onClick={() => { setDraft({ fields: { ...preparation.fields }, revision: preparation.revision, hidden: preparation.hidden, baseline: JSON.stringify(preparation.fields) }); setError(null); }}>Editar textos iniciales</button>}</div>}
    </div>
    {loading && <p className="template-muted" role="status">Actualizando preparación…</p>}
    {loadError && <div className="template-error" role="alert"><p>No se pudo cargar la preparación. {loadError}</p><button className="secondary" type="button" disabled={locked || loading} onClick={() => void load()}>Reintentar preparación</button></div>}
    {preparation && (!preparation.hidden || editing) && <>
      <p className="template-muted">Esta guía no es un cierre de sesión. No se comparte en el pack ni cifra los datos locales. Puedes dejar sugerencias pendientes sin bloquear Iniciar.</p>
      {!draft && <dl className="template-values">{preparation.template.fields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{preparation.fields[field.key] || "Sin texto"}</dd></div>)}</dl>}
      <ul className="preparation-slots">{[...preparation.slots].sort((a, b) => a.order - b.order).map((slot) => <li key={slot.id}>
        <div><strong>{slot.label}</strong><p className="template-muted">{slot.pieceId ? `Completada · ${pieces.find((piece) => piece.id === slot.pieceId)?.name ?? "Pieza vinculada (actualiza las piezas)"}` : slot.omitted ? "Omitida" : "Pendiente · sin pieza"}</p></div>
        {!slot.pieceId && <div className="template-actions"><button className="secondary" type="button" disabled={locked || editing || loading} aria-label={`Añadir recurso: ${slot.label}`} onClick={() => { setResource({ slot, piece: null }); setError(null); }}>Añadir recurso</button><button className="secondary" type="button" disabled={locked || editing || loading} aria-label={`${slot.omitted ? "Volver a pendiente" : "Omitir"}: ${slot.label}`} onClick={() => resolve(slot, !slot.omitted, null)}>{slot.omitted ? "Volver a pendiente" : "Omitir"}</button></div>}
      </li>)}</ul>
      {editing && <form ref={form} className="preparation-editor" onSubmit={(event) => { event.preventDefault(); if (draft) saveFields(); else if (resource?.piece) resolve(resource.slot, false, resource.piece); }}>
        {draft && <TemplateFields template={preparation.template} fields={draft.fields} disabled={locked} errors={Object.fromEntries(preparation.template.fields.map((field) => [field.key, templateFieldError(error, field.key)]))} onChange={(key, value) => { if (operation.current || pendingRef.current) return; setDraft({ ...draft, fields: { ...draft.fields, [key]: value } }); if (!conflict) setError(null); }} />}
        {resource && <TemplateResource key={resource.slot.id} label={resource.slot.label} kinds={resource.slot.kinds} piece={resource.piece} disabled={locked} error={error?.code === "INVALID_PIECE" ? error.message : templateFieldError(error, resource.slot.key)} onBusy={(value) => { operation.current = value; setBusy(value); }} onChange={(piece) => { setResource({ ...resource, piece }); if (!conflict) setError(null); }} />}
        <p className="template-muted">Borrador solo en memoria. Volver a otra mesa requiere confirmar el descarte.</p>
        <div className="template-actions"><button className="secondary" type="button" disabled={locked} onClick={cancelEdit}>Cancelar edición</button><button type="submit" disabled={locked || Boolean(resource && !resource.piece) || conflict}>{busy ? "Guardando…" : draft ? "Guardar textos iniciales" : "Completar sugerencia"}</button></div>
      </form>}
    </>}
    <p ref={errorNode} tabIndex={-1} className="template-error" role="alert">{error && `${error.message}${error.field ? ` (${error.field})` : ""}`}</p>
    {conflict && <div className="template-conflict"><p>El estado cambió. Tu borrador no se ha sustituido. Carga y compara el estado vigente antes de adoptar su revisión.</p><button className="secondary" type="button" disabled={locked || loading} onClick={() => void load(true)}>Revisar estado vigente</button>
      {preparation && <><dl className="template-values">{preparation.template.fields.map((field) => <div key={field.key}><dt>{field.label} · vigente (revisión {preparation.revision})</dt><dd>{preparation.fields[field.key] || "Sin texto"}</dd></div>)}</dl>{resource && <p>Sugerencia vigente: {preparation.slots.find((slot) => slot.id === resource.slot.id)?.pieceId ? "Completada" : preparation.slots.find((slot) => slot.id === resource.slot.id)?.omitted ? "Omitida" : "Pendiente"}</p>}{editing && <button className="secondary" type="button" disabled={locked || loading || Boolean(loadError) || !reviewed} onClick={useCurrentRevision}>Conservar borrador y usar revisión vigente</button>}</>}
    </div>}
    {pending && !busy && <button className="secondary" type="button" onClick={() => void mutate(pending)}>Reintentar mismo guardado</button>}
    <p className="template-muted" role="status" aria-live="polite">{status}</p>
    {refreshFailed && <button className="secondary" type="button" disabled={busy} onClick={() => void refreshPieces()}>Actualizar piezas</button>}
  </section>;
}
