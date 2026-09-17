import { useCallback, useEffect, useRef, useState } from "react";
import { invokeSafe } from "./tauri";

export type CaptureKind = "firefox" | "file" | "folder" | "vscode" | "cursor";
export type Candidate = { itemId: string; kind: CaptureKind; reference: string; name: string };
export type CaptureError = { code: string; message: string };
export type PreviewItem = { itemId: string; status: "ready" | "duplicate" | "invalid"; normalizedName?: string; duplicatePieceIds?: string[]; error?: CaptureError };
export type CommitItem = { itemId: string; status: "created" | "skipped_duplicate" | "rejected"; pieceId?: string; error?: CaptureError };
export type CommitInput = { operationId: string; spaceId: string; items: (Candidate & { duplicatePolicy: "skip" | "allow" })[] };
export type CommitResult = { operationId: string; items: CommitItem[] };
export type CaptureRow = Candidate & { included: boolean; duplicatePolicy: "skip" | "allow"; result?: CommitItem };
export type CaptureGroup = { id: string; name: string };
export type CaptureSpace = { id: string; groupId: string; name: string };
export type ExitGuard = { label: string; state: () => { dirty: boolean; busy: boolean; blocked?: boolean } };
export type RegisterExitGuard = (guard: ExitGuard) => () => void;
export const captureKinds: { value: CaptureKind; label: string }[] = [
  { value: "firefox", label: "Enlace web (Firefox)" }, { value: "file", label: "Archivo" },
  { value: "folder", label: "Carpeta" }, { value: "vscode", label: "Proyecto de VS Code" }, { value: "cursor", label: "Proyecto de Cursor" },
];
const bytes = (text: string) => new TextEncoder().encode(text).length;
const validUnicode = (text: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);
export function candidateOnly(row: Candidate): Candidate {
  return { itemId: row.itemId, kind: row.kind, reference: row.reference, name: row.name };
}
export function validateCandidate(row: Candidate): string {
  if (!validUnicode(row.name) || !validUnicode(row.reference)) return "Contiene un carácter Unicode no válido.";
  const length = Array.from(row.name.trim()).length;
  if (length < 1 || length > 80) return "El nombre debe tener entre 1 y 80 caracteres Unicode.";
  if (!row.reference.trim()) return "Escribe una referencia.";
  if (bytes(row.reference) > 32 * 1024) return "La referencia supera 32 KiB.";
  return "";
}
export function validateCaptureFrame(value: unknown, count: number): string {
  if (count > 50) return "Máximo 50 recursos por captura. No se ha truncado la entrada.";
  if (bytes(JSON.stringify(value)) > 256 * 1024) return "La captura supera 256 KiB. Reduce la entrada.";
  return "";
}
function sourceName(reference: string): string {
  try { return Array.from(new URL(reference).hostname || "Enlace web").slice(0, 80).join(""); }
  catch { return "Enlace web"; }
}
export function parseCaptureUrls(text: string): Candidate[] {
  const references = text.split(/\r\n|\n|\r/).map((line) => line.trim()).filter(Boolean);
  const error = validateCaptureFrame({ text }, references.length);
  if (error) throw new Error(error);
  if (references.some((reference) => bytes(reference) > 32 * 1024 || !validUnicode(reference))) throw new Error("Una referencia supera 32 KiB o contiene Unicode no válido.");
  return references.map((reference) => ({ itemId: crypto.randomUUID(), kind: "firefox", reference, name: sourceName(reference) }));
}
function message(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "object" && reason !== null && "message" in reason && typeof reason.message === "string") return reason.message;
  return String(reason);
}
function checkResponse(items: { itemId: string; status: string }[], expected: Candidate[], statuses: string[]) {
  const ids = new Set(expected.map((item) => item.itemId));
  const allowed = new Set(statuses);
  if (!Array.isArray(items) || items.length !== ids.size || items.some((item) => !ids.delete(item.itemId) || !allowed.has(item.status))) {
    throw new Error("El host devolvió una respuesta incompleta o no válida.");
  }
}
type CaptureState = {
  groupId: string; spaceId: string; groups: CaptureGroup[]; spaces: CaptureSpace[];
  rows: CaptureRow[]; text: string; preview: PreviewItem[] | null; pending: string | null;
  pendingId: string; pendingPaths: string[]; receipts: CommitResult[]; busy: boolean; loading: boolean;
  loadError: string; error: string; status: string;
};
export function useCapture(initialGroupId: string, initialSpaceId: string, onCommitted: (spaceId: string) => void, registerExitGuard: RegisterExitGuard) {
  const [state, setState] = useState<CaptureState>(() => ({ groupId: initialGroupId, spaceId: initialSpaceId, groups: [], spaces: [], rows: [], text: "", preview: null, pending: null, pendingId: "", pendingPaths: [], receipts: [], busy: false, loading: true, loadError: "", error: "", status: "" }));
  const current = useRef(state);
  const alive = useRef(false);
  const generation = useRef(0);
  const destinationGeneration = useRef(0);
  const operation = useRef(false);
  useEffect(() => registerExitGuard({ label: "la captura", state: () => ({
    dirty: current.current.rows.length > 0 || current.current.text.length > 0 || current.current.pendingPaths.length > 0,
    busy: operation.current, blocked: Boolean(current.current.pending),
  }) }), [registerExitGuard]);
  const update = useCallback((patch: Partial<CaptureState>) => {
    current.current = { ...current.current, ...patch };
    if (alive.current) setState(current.current);
  }, []);
  const loadDestinations = useCallback(async () => {
    const request = ++destinationGeneration.current;
    update({ loading: true, loadError: "" });
    try {
      const [groups, spaces] = await Promise.all([invokeSafe<CaptureGroup[]>("list_groups"), invokeSafe<CaptureSpace[]>("list_spaces")]);
      if (!alive.current || request !== destinationGeneration.current) return;
      update({ groups, spaces });
    } catch (reason) {
      if (alive.current && request === destinationGeneration.current) update({ loadError: `No se pudieron cargar los destinos. El borrador se conserva. ${message(reason)}` });
    } finally {
      if (alive.current && request === destinationGeneration.current) update({ loading: false });
    }
  }, [update]);
  useEffect(() => {
    alive.current = true;
    void loadDestinations();
    return () => { alive.current = false; generation.current += 1; destinationGeneration.current += 1; operation.current = false; };
  }, [loadDestinations]);
  const editable = () => !operation.current && !current.current.pending;
  const invalidate = (patch: Partial<CaptureState>) => {
    if (!editable()) return;
    generation.current += 1;
    update({ ...patch, preview: null, error: "", status: "" });
  };
  const append = (items: Candidate[], remainingText = current.current.text) => {
    const rows = [...current.current.rows, ...items.map((item) => ({ ...candidateOnly(item), included: true, duplicatePolicy: "skip" as const }))];
    const error = validateCaptureFrame({ items: rows.map(candidateOnly), text: remainingText }, rows.length);
    if (error) throw new Error(error);
    if (new Set(rows.map((row) => row.itemId)).size !== rows.length) throw new Error("El host devolvió identificadores repetidos.");
    update({ rows, preview: null, error: "" });
  };
  const begin = () => {
    if (!editable()) return null;
    operation.current = true;
    update({ busy: true, error: "", status: "" });
    return ++generation.current;
  };
  const finish = (request: number) => {
    if (request !== generation.current) return;
    operation.current = false;
    update({ busy: false });
  };
  const preparePaths = async (paths: string[]) => {
    const frameError = validateCaptureFrame({ paths }, paths.length + current.current.rows.length);
    if (frameError) throw new Error(frameError);
    if (paths.some((path) => bytes(path) > 32 * 1024 || !validUnicode(path))) throw new Error("Una ruta supera 32 KiB o contiene Unicode no válido.");
    const prepared = await invokeSafe<{ items: Candidate[] }>("prepare_capture_paths", { paths });
    if (!Array.isArray(prepared.items) || prepared.items.length !== paths.length) throw new Error("No se pudieron preparar todas las rutas. Reintenta la entrada.");
    return prepared.items;
  };
  const addPaths = async (paths?: string[], picker?: "files" | "folders") => {
    const request = begin();
    if (request === null) return;
    try {
      const selected = paths ?? await invokeSafe<string[]>(picker === "folders" ? "pick_capture_folders" : "pick_capture_files");
      if (!alive.current || request !== generation.current || !selected.length) return;
      update({ pendingPaths: selected });
      const items = await preparePaths(selected);
      if (!alive.current || request !== generation.current) return;
      append(items);
      update({ pendingPaths: [], status: `${items.length} recursos preparados. Revisa el destino y la vista previa.` });
    } catch (reason) {
      if (alive.current && request === generation.current) update({ error: message(reason) });
    } finally { finish(request); }
  };
  const destinationValid = () => {
    const value = current.current;
    return !value.loading && !value.loadError && value.groups.some((group) => group.id === value.groupId)
      && value.spaces.some((space) => space.id === value.spaceId && space.groupId === value.groupId);
  };
  const selectedRows = () => current.current.rows.filter((row) => row.included);
  const preview = async () => {
    if (!destinationValid()) { update({ error: "Selecciona un grupo y una mesa disponibles." }); return; }
    const rows = selectedRows();
    if (!rows.length) { update({ error: "Incluye al menos un recurso." }); return; }
    if (current.current.text.trim() || current.current.pendingPaths.length) { update({ error: "Prepara o descarta la entrada pendiente antes de revisar." }); return; }
    const input = { spaceId: current.current.spaceId, items: rows.map(candidateOnly) };
    const error = validateCaptureFrame({ input }, rows.length) || rows.map(validateCandidate).find(Boolean);
    if (error) { update({ error }); return; }
    const request = begin();
    if (request === null) return;
    update({ preview: null });
    try {
      const result = await invokeSafe<{ items: PreviewItem[] }>("preview_capture", { input });
      if (!alive.current || request !== generation.current) return;
      checkResponse(result.items, rows, ["ready", "duplicate", "invalid"]);
      update({ preview: result.items, status: "Vista previa lista. No se ha añadido ninguna pieza." });
    } catch (reason) {
      if (alive.current && request === generation.current) update({ error: message(reason) });
    } finally { finish(request); }
  };
  const commit = async () => {
    if (operation.current) return;
    let frozen = current.current.pending;
    if (!frozen) {
      const value = current.current;
      if (!destinationValid() || !value.preview || value.preview.some((item) => item.status === "invalid") || value.text.trim() || value.pendingPaths.length) return;
      try {
        const input: CommitInput = { operationId: crypto.randomUUID(), spaceId: value.spaceId,
          items: selectedRows().map((row) => ({ ...candidateOnly(row), duplicatePolicy: row.duplicatePolicy })) };
        if (!input.items.length) return;
        const error = validateCaptureFrame({ input }, input.items.length);
        if (error) { update({ error }); return; }
        frozen = JSON.stringify(input);
      } catch (reason) { update({ error: message(reason) }); return; }
    }
    operation.current = true;
    const request = ++generation.current;
    const input = JSON.parse(frozen) as CommitInput;
    update({ busy: true, pending: frozen, pendingId: input.operationId, error: "", status: "Guardando captura…" });
    try {
      const result = await invokeSafe<CommitResult>("commit_capture", { input });
      if (!alive.current || request !== generation.current) return;
      if (result.operationId !== input.operationId) throw new Error("El recibo no corresponde a esta operación.");
      checkResponse(result.items, input.items, ["created", "skipped_duplicate", "rejected"]);
      if (result.items.some((item) => item.status === "created" && !item.pieceId)) throw new Error("Falta el identificador de una pieza creada.");
      const results = new Map(result.items.map((item) => [item.itemId, item]));
      const rows = current.current.rows.flatMap((row) => {
        const receipt = results.get(row.itemId);
        if (!receipt) return [row];
        return receipt.status === "rejected" ? [{ ...row, result: receipt }] : [];
      });
      const created = result.items.filter((item) => item.status === "created").length;
      const skipped = result.items.filter((item) => item.status === "skipped_duplicate").length;
      update({ pending: null, rows, preview: null, receipts: [...current.current.receipts, result], status: `${created} creados · ${skipped} duplicados omitidos · ${result.items.length - created - skipped} rechazados. Los recursos resueltos no se reenviarán.` });
      onCommitted(input.spaceId);
    } catch (reason) {
      if (alive.current && request === generation.current) update({ error: `Resultado sin confirmar. Reintenta la misma operación antes de editar o salir. ${message(reason)}`, status: "El identificador y los argumentos permanecen congelados para evitar duplicados." });
    } finally { finish(request); }
  };
  const editRow = (itemId: string, patch: Partial<Pick<CaptureRow, "kind" | "name" | "reference" | "included" | "duplicatePolicy">>) => {
    invalidate({ rows: current.current.rows.map((row) => row.itemId === itemId ? { ...row, ...patch, result: undefined } : row) });
  };
  const addUrls = () => {
    if (!editable()) return;
    try {
      const items = parseCaptureUrls(current.current.text);
      if (!items.length) return;
      append(items, "");
      update({ text: "", status: "Enlaces preparados; revisa cada fila antes de añadir." });
    } catch (reason) { update({ error: message(reason) }); }
  };
  return { state, current, operation, loadDestinations, addPaths, preview, commit, editRow, addUrls,
    setText: (text: string) => invalidate({ text }),
    setDestination: (groupId: string, spaceId: string) => invalidate({ groupId, spaceId }),
    removeRow: (itemId: string) => invalidate({ rows: current.current.rows.filter((row) => row.itemId !== itemId) }),
    discardPaths: () => invalidate({ pendingPaths: [] }),
  };
}
