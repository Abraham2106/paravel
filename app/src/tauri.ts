import { invoke } from "@tauri-apps/api/core";

export const BROWSER_HOST_MESSAGE =
  "Abre la app con npm run tauri dev (ventana Tauri). El navegador no es el host.";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __PARAVEL_INVOKES__?: string[];
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export class TauriRuntimeUnavailableError extends Error {
  constructor() {
    super(BROWSER_HOST_MESSAGE);
    this.name = "TauriRuntimeUnavailableError";
  }
}

export function hostErrorMessage(error: unknown): string {
  if (error instanceof TauriRuntimeUnavailableError) return error.message;
  return `Host no disponible: ${String(error)}`;
}

export function invokeSafe<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri()) return Promise.reject(new TauriRuntimeUnavailableError());
  (window.__PARAVEL_INVOKES__ ??= []).push(command);
  return invoke<T>(command, args);
}
