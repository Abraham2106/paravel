import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const script = fileURLToPath(import.meta.url);
const app = path.resolve(path.dirname(script), "..");
const exeName = process.platform === "win32" ? "launch-host.exe" : "launch-host";
const exe = path.join(app, "src-tauri", "target", "debug", exeName);
const tempRoot = process.env.PARAVEL_TEST_TEMP ?? os.tmpdir();
const cdpPort = 9223;
const ids = {
  group: "81111111-1111-4111-8111-111111111111",
  empty: "82222222-2222-4222-8222-222222222222",
  spaceA: "83333333-3333-4333-8333-333333333333",
  spaceB: "84444444-4444-4444-8444-444444444444",
  piece: "85555555-5555-4555-8555-555555555555",
  hidden: "86666666-6666-4666-8666-666666666666",
};

function skip(reason) {
  console.log(JSON.stringify({
    mode: "NATIVE skipped",
    reason,
    coverage: "Harness present; run on Windows with debug launch-host, WebView2 and Playwright. Do not run in parallel with continuity-native (CDP 9223).",
  }, null, 2));
}

try {
  await access(exe);
} catch {
  skip(`No debug binary at ${exe}. Build with cargo tauri build --debug on Windows, then rerun.`);
  process.exit(0);
}

const schema = `CREATE TABLE IF NOT EXISTS grupo (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL, icono TEXT NOT NULL DEFAULT 'folder',
    orden INTEGER NOT NULL, creado_en TEXT NOT NULL, editado_en TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS espacio (
    id TEXT PRIMARY KEY, grupo_id TEXT NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL, nota TEXT, bot_activo INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT NOT NULL, editado_en TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS pieza (
    id TEXT PRIMARY KEY, espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, nombre TEXT NOT NULL, payload TEXT NOT NULL,
    marcada INTEGER NOT NULL DEFAULT 1, orden INTEGER NOT NULL,
    creado_en TEXT NOT NULL, editado_en TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS pack_pieza (
    espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
    pieza_id TEXT NOT NULL REFERENCES pieza(id) ON DELETE CASCADE,
    PRIMARY KEY (espacio_id, pieza_id));
  CREATE TABLE IF NOT EXISTS cierre (
    id TEXT NOT NULL PRIMARY KEY, espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
    objective TEXT NOT NULL, progress TEXT NOT NULL, next_action TEXT NOT NULL, blocker TEXT NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revision INTEGER NOT NULL);`;

function seedFixture(directory) {
  const db = new DatabaseSync(path.join(directory, "paravel.sqlite3"));
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(schema);
  const stamp = "1800000000";
  db.prepare("INSERT INTO grupo VALUES (?, 'Native P04 Trabajo', 'folder', 0, ?, ?)").run(ids.group, stamp, stamp);
  db.prepare("INSERT INTO grupo VALUES (?, 'Native P04 Vacio', 'folder', 1, ?, ?)").run(ids.empty, stamp, stamp);
  db.prepare("INSERT INTO espacio VALUES (?, ?, 'Native P04 Atlas', 'NOTE_ONLY_SENTINEL', 0, ?, ?)").run(ids.spaceA, ids.group, stamp, stamp);
  db.prepare("INSERT INTO espacio VALUES (?, ?, 'Native P04 Beta', 'Synthetic native note', 0, ?, ?)").run(ids.spaceB, ids.group, stamp, stamp);
  db.prepare("INSERT INTO pieza VALUES (?, ?, 'firefox', 'Native P04 Inerte', ?, 1, 0, ?, ?)")
    .run(ids.piece, ids.spaceA, JSON.stringify({ urls: ["https://example.com"] }), stamp, stamp);
  db.prepare("INSERT INTO pieza VALUES (?, ?, 'firefox', 'Native P04 Oculta', ?, 0, 1, ?, ?)")
    .run(ids.hidden, ids.spaceA, JSON.stringify({ urls: ["https://example.com"] }), stamp, stamp);
  db.close();
}

async function runtime() {
  const require = createRequire(import.meta.url);
  const candidates = [process.env.CONTINUITY_PLAYWRIGHT, process.env.NAVIGATION_PLAYWRIGHT];
  try { candidates.push(path.dirname(require.resolve("playwright/package.json"))); } catch {}
  for (const candidate of candidates.filter(Boolean)) {
    try {
      const packageRequire = createRequire(path.join(path.resolve(candidate), "package.json"));
      const { chromium } = packageRequire("./index.js");
      const { expect } = packageRequire("./test.js");
      return { chromium, expect, version: packageRequire("./package.json").version };
    } catch {}
  }
  throw new Error("Playwright unavailable");
}

function killTree(pid) {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", timeout: 15000 });
  else try { process.kill(pid, "SIGKILL"); } catch {}
}

async function waitCdp(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("WebView2 CDP endpoint did not come up on 127.0.0.1:9223");
}

async function launchApp(chromium, dataDir, env) {
  const out = openSync(path.join(dataDir, "app-stdout.log"), "a");
  const err = openSync(path.join(dataDir, "app-stderr.log"), "a");
  const child = spawn(exe, [], { cwd: app, stdio: ["ignore", out, err],
    env: { ...process.env, ...env, PARAVEL_TEST_DATA_DIR: dataDir,
      WEBVIEW2_USER_DATA_FOLDER: path.join(dataDir, "webview-profile"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}` } });
  try {
    await waitCdp();
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 30000 });
    const context = browser.contexts()[0];
    if (!context) throw new Error("No CDP context");
    const page = context.pages().find((candidate) => !candidate.isClosed()) ?? await context.newPage();
    await page.waitForLoadState("domcontentloaded", { timeout: 45000 });
    return { child, browser, page };
  } catch (error) {
    killTree(child.pid);
    throw error;
  } finally {
    try { closeSync(out); } catch {}
    try { closeSync(err); } catch {}
  }
}

let chromiumRuntime;
try {
  chromiumRuntime = await runtime();
} catch (error) {
  skip(error.message);
  process.exit(0);
}

await access(tempRoot);
const dataDir = await mkdtemp(path.join(tempRoot, "navigation-native-"));
seedFixture(dataDir);
const { chromium, expect, version } = chromiumRuntime;
const { createServer } = await import("vite");
const server = await createServer({ root: app, clearScreen: false,
  server: { host: "127.0.0.1", port: 1420, strictPort: true, hmr: false, open: false } });
const results = [];
let session;
try {
  await server.listen();
  session = await launchApp(chromium, dataDir, { TEMP: dataDir, TMP: dataDir });
  const { page, browser } = session;
  page.setDefaultTimeout(15000);
  const search = page.getByRole("dialog", { name: "Buscar en Paravel" });
  const field = page.getByLabel("Buscar grupos, espacios y piezas por nombre");

  async function scenario(name, body) {
    try {
      await body();
      results.push({ name, status: "PASS", coverage: "NATIVE Tauri + WebView2 CDP + real SQLite fixture" });
      console.log(`PASS NATIVE ${name}`);
    } catch (error) {
      results.push({ name, status: "FAIL", error: String(error.message).slice(0, 1800), coverage: "NATIVE" });
      console.error(`FAIL NATIVE ${name}: ${String(error.message).slice(0, 1800)}`);
      process.exitCode = 1;
    }
  }

  await scenario("T11 T19 T20 open search, enter space and piece, no launch", async () => {
    await page.getByRole("button", { name: "Buscar en Paravel" }).click();
    await expect(search).toBeVisible();
    await field.fill("atlas");
    await search.getByRole("option").first().click();
    await expect(page.getByRole("heading", { name: "Native P04 Atlas" })).toBeVisible();
    await page.getByRole("button", { name: "Buscar en Paravel" }).click();
    await field.fill("oculta");
    await search.getByRole("option").first().click();
    await expect(page.locator(`#piece-${ids.hidden}`)).toBeVisible();
  });

  await scenario("T16 cancel dirty search navigation keeps the mesa", async () => {
    await page.getByRole("button", { name: "Cerrar sesión de trabajo" }).click();
    await page.getByLabel(/Último avance/).fill("Native P04 draft");
    await page.getByRole("button", { name: "Buscar en Paravel" }).click();
    await field.fill("beta");
    page.once("dialog", (dialog) => dialog.dismiss());
    await search.getByRole("option").first().click();
    await expect(page.getByLabel(/Último avance/)).toHaveValue("Native P04 draft");
  });

  await scenario("T05 T24 notes do not match; query is not persisted", async () => {
    await page.getByRole("button", { name: "Buscar en Paravel" }).click();
    await field.fill("NOTE_ONLY_SENTINEL");
    await expect(search).toContainText("No hay resultados por nombre");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Buscar en Paravel" }).click();
    await expect(field).toHaveValue("");
  });

  const logFile = path.join(dataDir, "launch.log");
  let logText = "";
  try { logText = await readFile(logFile, "utf8"); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  assert.equal(logText, "", "No native launches may be recorded during P04 verification");
  console.log(JSON.stringify({ mode: "NATIVE verification", playwright: version, results, dataDir,
    launchLogEntries: logText.length }, null, 2));
} finally {
  if (session?.child?.pid) killTree(session.child.pid);
  await session?.browser?.close().catch(() => {});
  await server.close().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 800));
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(() => {});
}
