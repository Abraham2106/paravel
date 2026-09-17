import { invokeSafe } from "./tauri";

export type TemplateDefinition = {
  schemaVersion: 1; templateId: string; revision: number; name: string; description: string;
  fields: { key: string; label: string; hint: string }[];
  slots: { key: string; label: string; kinds: string[] }[];
};
export type TemplatePiece = { kind: string; name: string; payload: { path?: string; url?: string; urls?: string[] } };
export type TemplateSlotInput = { key: string; omitted: boolean; piece: TemplatePiece | null };
export type TemplateInput = {
  requestId: string; templateId: string; templateRevision: number; schemaVersion: 1;
  groupId: string; name: string; fields: Record<string, string>; slots: TemplateSlotInput[];
};
export type TemplatePreview = Pick<TemplateInput, "name" | "groupId" | "fields" | "slots"> & { template: TemplateDefinition };
export type TemplateSpace = { id: string; groupId: string; name: string; note: string | null; pack: string[]; botActive: boolean };
export type PreparationSlot = { id: string; key: string; label: string; kinds: string[]; order: number; omitted: boolean; pieceId: string | null; revision: number };
export type Preparation = { spaceId: string; template: TemplateDefinition; fields: Record<string, string>; hidden: boolean; revision: number; slots: PreparationSlot[] };
export type TemplateCreated = { space: TemplateSpace; preparation: Preparation };
export type PreparationUpdate = { spaceId: string; expectedRevision: number; fields: Record<string, string>; hidden: boolean };
export type SlotResolution = { spaceId: string; slotId: string; expectedRevision: number; omitted: boolean; piece: TemplatePiece | null };
export type TemplateError = { code: string; message: string; field?: string };
export type TemplateGuard = { label: string; state: () => { dirty: boolean; busy: boolean; blocked?: boolean } };
export type RegisterTemplateGuard = (guard: TemplateGuard) => () => void;
export const templateApi = {
  list: () => invokeSafe<TemplateDefinition[]>("list_space_templates"),
  preview: (input: TemplateInput) => invokeSafe<TemplatePreview>("preview_space_template", { input }),
  create: (input: TemplateInput) => invokeSafe<TemplateCreated>("create_space_from_template", { input }),
  get: (spaceId: string) => invokeSafe<Preparation | null>("get_space_preparation", { spaceId }),
  update: (input: PreparationUpdate) => invokeSafe<Preparation>("update_space_preparation", { input }),
  resolve: (input: SlotResolution) => invokeSafe<Preparation>("resolve_preparation_slot", { input }),
};
export function templateError(reason: unknown): TemplateError {
  if (typeof reason === "string") {
    try { return templateError(JSON.parse(reason)); } catch { return { code: "UNKNOWN", message: reason }; }
  }
  if (reason && typeof reason === "object" && "code" in reason && "message" in reason && typeof reason.code === "string" && typeof reason.message === "string") {
    return { code: reason.code, message: reason.message, field: "field" in reason && typeof reason.field === "string" ? reason.field : undefined };
  }
  return { code: "UNKNOWN", message: reason instanceof Error ? reason.message : "No se pudo confirmar la respuesta del host." };
}
export function uncertainTemplateError(error: TemplateError) {
  return !["TEMPLATE_NOT_FOUND", "TEMPLATE_VERSION_UNSUPPORTED", "GROUP_NOT_FOUND", "INVALID_FIELD", "INVALID_PIECE", "REQUEST_CONFLICT", "REVISION_CONFLICT", "SLOT_STATE_CONFLICT", "DB_BUSY", "STORAGE_ERROR"].includes(error.code);
}
export const templateKindLabels: Record<string, string> = { vscode: "Proyecto de VS Code", cursor: "Proyecto de Cursor", folder: "Carpeta", file: "Archivo o atajo", firefox: "Enlaces web (Firefox)", "firefox-group": "Grupo de Firefox" };
export function pieceReference(piece: TemplatePiece) {
  return piece.payload.path ?? piece.payload.urls?.join("\n") ?? piece.payload.url ?? "";
}
export function templateFieldError(error: TemplateError | null, key: string, index?: number) {
  const field = error?.field;
  return field && (field === key || field === `fields.${key}` || field === `slots.${key}` || field.startsWith(`slots.${key}.`) || (index !== undefined && (field === `slots[${index}]` || field.startsWith(`slots[${index}].`) || field === `slots.${index}` || field.startsWith(`slots.${index}.`)))) ? error.message : "";
}
export function textLimit(value: string, limit: number) {
  return Array.from(value).length > limit ? `Máximo ${limit} caracteres Unicode; no se ha recortado el texto.` : "";
}
