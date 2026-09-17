export type Closure = {
  id: string;
  spaceId: string;
  objective: string;
  progress: string;
  nextAction: string;
  blocker: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
};

export type ClosureFields = Pick<Closure, "objective" | "progress" | "nextAction" | "blocker">;
export type ClosurePage = { items: Closure[]; nextCursor: string | null };
export type ClosureDraft = ClosureFields & { id: string; expectedRevision: number | null };
export type ContinuityGuard = () => Promise<boolean>;
export type RegisterContinuityGuard = (guard: ContinuityGuard) => () => void;
export type ClosureErrors = Partial<Record<keyof ClosureFields | "total", string>>;

export const closureFields = [
  { key: "objective", label: "Objetivo", limit: 500, rows: 2 },
  { key: "progress", label: "Último avance", limit: 4000, rows: 4 },
  { key: "nextAction", label: "Siguiente acción", limit: 2000, rows: 3 },
  { key: "blocker", label: "Bloqueo", limit: 2000, rows: 2 },
] as const;

export function trimClosure(fields: ClosureFields): ClosureFields {
  return {
    objective: fields.objective.trim(),
    progress: fields.progress.trim(),
    nextAction: fields.nextAction.trim(),
    blocker: fields.blocker.trim(),
  };
}

export function validateClosure(fields: ClosureFields): ClosureErrors {
  const trimmed = trimClosure(fields);
  const errors: ClosureErrors = {};
  let bytes = 0;
  for (const { key, label, limit } of closureFields) {
    const value = trimmed[key];
    if (Array.from(value).length > limit) errors[key] = `${label}: máximo ${limit} caracteres.`;
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) {
      errors[key] = `${label}: contiene un carácter Unicode no válido.`;
    }
    bytes += new TextEncoder().encode(value).length;
  }
  if (!trimmed.progress) errors.progress = "Escribe el último avance, aunque el trabajo haya terminado.";
  if (bytes > 32 * 1024) errors.total = "El cierre supera 32 KiB. Acorta el texto antes de guardar.";
  return errors;
}

export function sameClosureFields(left: ClosureFields, right: ClosureFields): boolean {
  return closureFields.every(({ key }) => left[key] === right[key]);
}

export function orderClosures(items: Closure[]): Closure[] {
  return [...items].sort((left, right) => right.createdAt - left.createdAt
    || (left.id < right.id ? 1 : left.id > right.id ? -1 : 0));
}

export function closureError(reason: unknown): string {
  const text = reason instanceof Error ? reason.message : String(reason);
  if (/revision|conflict|revisi[oó]n|modificado|obsolet/i.test(text)) {
    return "Este cierre cambió en otra vista. Tu borrador sigue aquí. Recarga el cierre para revisar la versión actual antes de editar de nuevo.";
  }
  if (/capacity|1000|1\.000|capacidad/i.test(text)) {
    return "Esta mesa alcanzó el límite de 1000 cierres. Elimina uno del historial y vuelve a intentar; tu borrador se conserva.";
  }
  if (/not.?found|no existe|no encontrado/i.test(text)) {
    return "El cierre ya no está disponible. Tu borrador se conserva; actualiza el historial para comprobarlo.";
  }
  if (/busy|locked|ocupada|bloqueada/i.test(text)) {
    return "El almacenamiento está ocupado. Espera un momento y vuelve a intentar; tu borrador se conserva.";
  }
  return "No se pudo completar la operación del historial local. Tu borrador se conserva. Comprueba que la app de escritorio esté disponible y vuelve a intentar.";
}
