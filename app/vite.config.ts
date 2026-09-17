import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Cargo/`tauri dev` still rebuilds on Rust edits. This only stops the
      // webview from treating src-tauri artifacts (and SQLite sidecars) as
      // frontend files — those matches used to fall through to a full reload,
      // which remounts Workspace back on Sede.
      ignored: (path: string) => {
        const normalized = path.replace(/\\/g, "/");
        return (
          normalized.includes("/src-tauri/") ||
          /\/src-tauri$/.test(normalized) ||
          /\.sqlite3(-wal|-shm|-journal)?$/i.test(normalized)
        );
      },
    },
  },
}));
