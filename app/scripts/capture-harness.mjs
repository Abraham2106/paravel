import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer as createNetServer } from "node:net";
import { access, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const tempRoot = process.env.PARAVEL_TEST_TEMP ?? os.tmpdir();
export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runtime() {
  const require = createRequire(import.meta.url);
  const explicit = process.env.CAPTURE_PLAYWRIGHT ?? process.env.CONTINUITY_PLAYWRIGHT;
  const candidates = explicit ? [explicit] : [];
  if (!explicit) {
    try { candidates.push(path.dirname(require.resolve("playwright/package.json"))); } catch {}
    const cache = path.join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
    try {
      for (const entry of (await readdir(cache)).sort()) candidates.push(path.join(cache, entry, "node_modules", "playwright"));
    } catch {}
  }
  for (const candidate of candidates) {
    try {
      const resolved = path.resolve(candidate);
      const packageRequire = createRequire(path.join(resolved, "package.json"));
      const { chromium } = packageRequire("./index.js");
      const { expect } = packageRequire("./test.js");
      const version = packageRequire("./package.json").version;
      console.log(JSON.stringify({ dependency: "playwright", version, resolved,
        reproduce: `Set CAPTURE_PLAYWRIGHT to this installed package directory; provision playwright@${version} and its Chromium browser separately. No dependency is downloaded by this harness.` }));
      return { chromium, expect, version, resolved };
    } catch (error) {
      if (explicit) throw new Error(`CAPTURE_PLAYWRIGHT could not load ${candidate}: ${error.message}`);
    }
  }
  throw new Error("Playwright unavailable. Set CAPTURE_PLAYWRIGHT to an installed playwright package directory; browser installation is a separate prerequisite.");
}

export async function reservePort(port = 0) {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port, exclusive: true }, resolve);
  });
  return { port: server.address().port, release: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

export function killTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", timeout: 10000 });
  } else child.kill("SIGKILL");
}

export async function supervise(script, label, timeout = 240000) {
  assert.ok((await stat(tempRoot)).isDirectory(), "Approved temporary parent must exist");
  const temporary = await mkdtemp(path.join(tempRoot, `capture-${label}-`));
  let child;
  let expired = false;
  const interrupt = () => { process.exitCode = 130; killTree(child); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  let timer;
  try {
    child = spawn(process.execPath, [script, "--worker"], { cwd: app, stdio: "inherit",
      env: { ...process.env, CAPTURE_TEMP: temporary, TEMP: temporary, TMP: temporary, TMPDIR: temporary } });
    timer = setTimeout(() => {
      expired = true;
      console.error(`FAIL ${label}: ${timeout}ms deadline; terminating only owned child tree pid=${child.pid}`);
      killTree(child);
    }, timeout);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    process.exitCode = process.exitCode || (expired ? 1 : code ?? 1);
  } finally {
    clearTimeout(timer);
    killTree(child);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

export function reporter(scope) {
  const results = [];
  return {
    async scenario(name, body) {
      try {
        await body();
        results.push({ name, status: "PASS" });
        console.log(`PASS ${scope}: ${name}`);
      } catch (error) {
        results.push({ name, status: "FAIL", error: String(error.stack ?? error).slice(0, 2400) });
        console.error(`FAIL ${scope}: ${name}: ${error.stack ?? error}`);
        process.exitCode = 1;
      }
    },
    finish(extra = {}) {
      console.log(JSON.stringify({ scope, passed: results.filter((item) => item.status === "PASS").length,
        failed: results.filter((item) => item.status === "FAIL").length, results, ...extra }, null, 2));
    },
  };
}

export async function requireCaptureSources() {
  for (const relative of ["src/capture.ts", "src/CaptureDialog.tsx", "src-tauri/src/capture.rs"]) {
    try { await access(path.join(app, relative)); }
    catch { throw new Error(`BLOCKED: parent-agent implementation not ready: ${relative}`); }
  }
}

export async function assertDevPortFree(port = 1420) {
  const { createServer } = await import("node:net");
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port, exclusive: true }, resolve);
  }).catch((error) => {
    throw new Error(`BLOCKED: dev port ${port} is already in use (${error.code}); kill the stale vite/launch-host process tree before running capture suites`);
  });
  await new Promise((resolve) => server.close(resolve));
}
