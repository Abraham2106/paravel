import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const script = fileURLToPath(import.meta.url);
const app = path.resolve(path.dirname(script), "..");
const exe = path.join(app, "src-tauri", "target", "debug", "launch-host.exe");
const tempRoot = process.env.PARAVEL_TEST_TEMP ?? os.tmpdir();
const cdpPort = 9223;
const ids = {
  group: "71111111-1111-4111-8111-111111111111",
  spaceA: "72222222-2222-4222-8222-222222222222",
  spaceB: "73333333-3333-4333-8333-333333333333",
  piece: "74444444-4444-4444-8444-444444444444",
};
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
    id TEXT NOT NULL PRIMARY KEY,
    espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
    objective TEXT NOT NULL CHECK(length(objective) <= 500),
    progress TEXT NOT NULL CHECK(length(progress) BETWEEN 1 AND 4000),
    next_action TEXT NOT NULL CHECK(length(next_action) <= 2000),
    blocker TEXT NOT NULL CHECK(length(blocker) <= 2000),
    created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
    updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN created_at AND 9007199254740991),
    revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 4294967295),
    CHECK(length(CAST(objective AS BLOB)) + length(CAST(progress AS BLOB)) +
          length(CAST(next_action AS BLOB)) + length(CAST(blocker AS BLOB)) <= 32768));
  CREATE INDEX IF NOT EXISTS idx_espacio_grupo ON espacio(grupo_id);
  CREATE INDEX IF NOT EXISTS idx_pieza_espacio ON pieza(espacio_id);
  CREATE INDEX IF NOT EXISTS idx_pack_pieza_pieza ON pack_pieza(pieza_id);
  CREATE INDEX IF NOT EXISTS idx_cierre_espacio_created_id ON cierre(espacio_id, created_at DESC, id DESC);`;

function seedFixture(directory) {
  const db = new DatabaseSync(path.join(directory, "paravel.sqlite3"));
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(schema);
  const stamp = "1800000000";
  db.prepare("INSERT INTO grupo (id, nombre, icono, orden, creado_en, editado_en) VALUES (?, ?, 'folder', 0, ?, ?)")
    .run(ids.group, "Native synthetic group", stamp, stamp);
  for (const [id, name] of [[ids.spaceA, "Native Alpha"], [ids.spaceB, "Native Beta"]]) {
    db.prepare("INSERT INTO espacio (id, grupo_id, nombre, nota, bot_activo, creado_en, editado_en) VALUES (?, ?, ?, 'Synthetic native note', 0, ?, ?)")
      .run(id, ids.group, name, stamp, stamp);
  }
  db.prepare("INSERT INTO pieza (id, espacio_id, kind, nombre, payload, marcada, orden, creado_en, editado_en) VALUES (?, ?, 'firefox', 'Synthetic inert piece', ?, 1, 0, ?, ?)")
    .run(ids.piece, ids.spaceA, JSON.stringify({ urls: ["https://example.com"] }), stamp, stamp);
  const count = db.prepare("SELECT COUNT(*) AS n FROM cierre").get().n;
  db.close();
  return count;
}

async function runtime() {
  const require = createRequire(import.meta.url);
  const candidates = [process.env.CONTINUITY_PLAYWRIGHT];
  try { candidates.push(path.dirname(require.resolve("playwright/package.json"))); } catch {}
  const cache = path.join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  try {
    for (const entry of await stat(cache).then(() => [cache], () => []).then(async () => await import("node:fs").then((fs) => fs.readdirSync(cache)))) {
      candidates.push(path.join(cache, entry, "node_modules", "playwright"));
    }
  } catch {}
  for (const candidate of candidates.filter(Boolean)) {
    try {
      const packageRequire = createRequire(path.join(path.resolve(candidate), "package.json"));
      const { chromium } = packageRequire("./index.js");
      const { expect } = packageRequire("./test.js");
      return { chromium, expect, version: packageRequire("./package.json").version };
    } catch {}
  }
  throw new Error("Playwright unavailable. Set CONTINUITY_PLAYWRIGHT to an installed playwright package directory.");
}

function killTree(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", timeout: 15000 });
  } else {
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
}

async function readDb(dataDir, sql, params = [], all = false) {
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      const statement = new DatabaseSync(path.join(dataDir, "paravel.sqlite3"), { readOnly: true }).prepare(sql);
      return all ? statement.all(...params) : statement.get(...params);
    } catch (error) {
      if (!/locked|busy/i.test(String(error.message)) || Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
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
  throw new Error("WebView2 CDP endpoint did not come up on 127.0.0.1");
}

async function launchApp(chromium, dataDir, env) {
  const out = openSync(path.join(dataDir, "app-stdout.log"), "a");
  const err = openSync(path.join(dataDir, "app-stderr.log"), "a");
  const child = spawn(exe, [], { cwd: app, stdio: ["ignore", out, err],
    env: { ...process.env, ...env, PARAVEL_TEST_DATA_DIR: dataDir,
      WEBVIEW2_USER_DATA_FOLDER: path.join(dataDir, "webview-profile"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}` } });
  child.once("error", (error) => { throw new Error(`launch-host spawn failed: ${error.message}`); });
  child.once("exit", (code, signal) => console.error(`APP EXIT pid=${child.pid} code=${code} signal=${signal}`));
  const consoleMessages = [];
  try {
    await waitCdp();
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 30000 });
    const context = browser.contexts()[0];
    if (!context) throw new Error("No CDP context");
    let page = context.pages().find((candidate) => !candidate.isClosed()) ?? await context.newPage();
    page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));
    await page.waitForLoadState("domcontentloaded", { timeout: 45000 });
    return { child, browser, page };
  } catch (error) {
    let stderrText = "";
    try { stderrText = await readFile(path.join(dataDir, "app-stderr.log"), "utf8"); } catch {}
    console.error(`LAUNCH DIAG cdp=${false} stderr=${stderrText.slice(-1200)} console=${consoleMessages.slice(-10).join(" | ")}`);
    killTree(child.pid);
    throw error;
  } finally {
    try { closeSync(out); } catch {}
    try { closeSync(err); } catch {}
  }
}

const results = [];
const answerDialog = (page, action) => page.once("dialog",
  (dialog) => (action === "accept" ? dialog.accept() : dialog.dismiss()).catch(() => {}));
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

await access(tempRoot);
await access(exe);
const dataDir = await mkdtemp(path.join(tempRoot, "continuity-native-"));
const preexisting = seedFixture(dataDir);
assert.equal(preexisting, 0, "Fixture must start with zero closures");
const { chromium, expect, version } = await runtime();
const viteEnv = { ...process.env, TEMP: dataDir, TMP: dataDir };
const { createServer } = await import("vite");
const server = await createServer({ root: app, clearScreen: false,
  server: { host: "127.0.0.1", port: 1420, strictPort: true, hmr: false, open: false } });
let session;
let timer;
try {
  await server.listen();
  session = await launchApp(chromium, dataDir, viteEnv);
  const { page, browser } = session;
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => console.error(`PAGEERROR: ${error.message}`));
  const enter = async (name) => page.getByRole("button", { name }).first().click();
  const panel = page.locator(".continuity-panel");
  const progress = page.getByLabel(/Último avance/);
  const submit = page.locator(".continuity-form").getByRole("button", { name: /Guardar cierre/ });
  const dbPath = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("db_path"));
  assert.ok(dbPath.toLowerCase().startsWith(dataDir.toLowerCase()), `db must live in test dir, got ${dbPath}`);
  await enter("Native Alpha");
  await expect(panel).toContainText("Todavía no hay cierres");

  await scenario("real SQLite create, empty optional fields, dirty-cancel navigation", async () => {
    await panel.getByRole("button", { name: "Cerrar sesión de trabajo" }).click();
    await progress.fill("Native real advance A1");
    await answerDialog(page, "dismiss");
    await page.getByRole("button", { name: "Native Beta" }).first().click();
    await expect(progress).toHaveValue("Native real advance A1");
    await page.getByRole("button", { name: "Native Alpha" }).first().click();
    await submit.click();
    await expect(panel).toContainText("Native real advance A1");
    await expect(panel).toContainText("Cierre guardado en este equipo.");
    const rows = await readDb(dataDir, "SELECT id, espacio_id, progress, next_action, blocker, revision FROM cierre", [], true);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].espacio_id, ids.spaceA);
    assert.equal(rows[0].next_action, "");
    assert.equal(rows[0].blocker, "");
    assert.equal(rows[0].revision, 1);
    await page.getByRole("button", { name: "Native Beta" }).first().click();
    await expect(panel).toContainText("Todavía no hay cierres");
  });

  await scenario("real edit keeps createdAt and bumps revision; delete confirmed", async () => {
    await enter("Native Alpha");
    await panel.getByRole("button", { name: /Ver historial de cierres/i }).click();
    const entry = page.getByRole("region", { name: "Historial de cierres", exact: true })
      .locator("li").filter({ hasText: "Native real advance A1" });
    await entry.getByRole("button", { name: /Editar cierre del/i }).click();
    await progress.fill("Native real advance A2");
    await submit.click();
    await expect(panel).toContainText("Native real advance A2");
    const row = await readDb(dataDir, "SELECT progress, revision FROM cierre");
    assert.equal(row.progress, "Native real advance A2");
    assert.equal(row.revision, 2);
    const latest = page.getByRole("region", { name: "Historial de cierres", exact: true })
      .locator("li").filter({ hasText: "Native real advance A2" });
    await answerDialog(page, "dismiss");
    await latest.getByRole("button", { name: /Eliminar cierre del/i }).click();
    await expect.poll(() => readDb(dataDir, "SELECT COUNT(*) AS n FROM cierre").then((row) => row.n), { timeout: 5000 }).toBe(1);
    await answerDialog(page, "accept");
    await latest.getByRole("button", { name: /Eliminar cierre del/i }).click();
    await expect(panel).toContainText("Todavía no hay cierres");
    await expect.poll(() => readDb(dataDir, "SELECT COUNT(*) AS n FROM cierre").then((row) => row.n), { timeout: 5000 }).toBe(0);
  });

  await scenario("persistence across real app restart", async () => {
    await enter("Native Alpha");
    await panel.getByRole("button", { name: "Cerrar sesión de trabajo" }).click();
    await progress.fill("Native persisted across restart");
    await submit.click();
    await expect(panel).toContainText("Native persisted across restart");
    const pid = session.child.pid;
    killTree(pid);
    await browser.close();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    session = await launchApp(chromium, dataDir, viteEnv);
    const reopened = session.page;
    reopened.setDefaultTimeout(15000);
    await reopened.getByRole("button", { name: "Native Alpha" }).first().click();
    await expect(reopened.locator(".continuity-panel")).toContainText("Native persisted across restart");
  });

  const logFile = path.join(dataDir, "launch.log");
  let logText = "";
  try { logText = await readFile(logFile, "utf8"); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  assert.equal(logText, "", "No native launches may be recorded during continuity verification");
  const piezas = await readDb(dataDir, "SELECT marcada, payload FROM pieza WHERE id = ?", [ids.piece]);
  assert.equal(piezas.marcada, 1, "Piece marking must be untouched");
  assert.ok(JSON.parse(piezas.payload).urls.includes("https://example.com"), "Piece payload untouched");
  console.log(JSON.stringify({ mode: "NATIVE verification", playwright: version, results,
    dataDir, dbPath, launchLogEntries: logText.length,
    note: "Real Tauri commands against real SQLite fixture over WebView2 CDP loopback; MCP-exposure regression covered by backend cargo tests" }, null, 2));
} finally {
  clearTimeout(timer);
  if (session?.child?.pid) killTree(session.child.pid);
  await session?.browser?.close().catch(() => {});
  await server.close().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 800));
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(() => {});
}
