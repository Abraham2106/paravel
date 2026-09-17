import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, tempRoot, runtime, reservePort, killTree, pause, reporter } from "./capture-harness.mjs";
import { assertPreparation, fixtureUrl, privateMarker, runContractSuite, validateCatalog } from "./templates.test.mjs";

const script = fileURLToPath(import.meta.url);
const exe = path.join(app, "src-tauri", "target", "debug", "launch-host.exe");
const mcpExe = path.resolve(process.env.TEMPLATES_MCP_EXE ?? path.join(app, "crates", "paravel-mcp", "target", "debug", "paravel-mcp.exe"));
const ids = { group: randomUUID(), destination: randomUUID(), legacy: randomUUID(), piece: randomUUID(), closure: randomUUID() };
const groupName = "P03 synthetic group";
const destinationName = "P03 alternate destination";
const audit = [];
const pageErrors = [];

function seed(directory) {
  const db = new DatabaseSync(path.join(directory, "paravel.sqlite3"));
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE grupo (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, icono TEXT NOT NULL DEFAULT 'folder', orden INTEGER NOT NULL, creado_en TEXT NOT NULL, editado_en TEXT NOT NULL);
      CREATE TABLE espacio (id TEXT PRIMARY KEY, grupo_id TEXT NOT NULL REFERENCES grupo(id) ON DELETE CASCADE, nombre TEXT NOT NULL, nota TEXT, bot_activo INTEGER NOT NULL DEFAULT 0, creado_en TEXT NOT NULL, editado_en TEXT NOT NULL);
      CREATE TABLE pieza (id TEXT PRIMARY KEY, espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE, kind TEXT NOT NULL, nombre TEXT NOT NULL, payload TEXT NOT NULL, marcada INTEGER NOT NULL DEFAULT 1, orden INTEGER NOT NULL, creado_en TEXT NOT NULL, editado_en TEXT NOT NULL);
      CREATE TABLE pack_pieza (espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE, pieza_id TEXT NOT NULL REFERENCES pieza(id) ON DELETE CASCADE, PRIMARY KEY(espacio_id,pieza_id));
      CREATE TABLE cierre (id TEXT PRIMARY KEY NOT NULL, espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE, objective TEXT NOT NULL, progress TEXT NOT NULL, next_action TEXT NOT NULL, blocker TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revision INTEGER NOT NULL);`);
    for (const [index, id, name] of [[0, ids.group, groupName], [1, ids.destination, destinationName]]) {
      db.prepare("INSERT INTO grupo VALUES (?, ?, 'folder', ?, '1800000000', '1800000000')").run(id, name, index);
    }
    db.prepare("INSERT INTO espacio VALUES (?, ?, 'P03 legacy mesa', 'P03 public note unchanged', 1, '1800000000', '1800000000')").run(ids.legacy, ids.group);
    db.prepare("INSERT INTO pieza VALUES (?, ?, 'firefox', 'P03 legacy reference', ?, 1, 0, '1800000000', '1800000000')")
      .run(ids.piece, ids.legacy, JSON.stringify({ urls: ["https://example.com/legacy-fixture"] }));
    db.prepare("INSERT INTO pack_pieza VALUES (?, ?)").run(ids.legacy, ids.piece);
    db.prepare("INSERT INTO cierre VALUES (?, ?, 'Legacy objective', 'Legacy progress unchanged', 'Legacy next action', '', 1800000000000, 1800000000000, 1)").run(ids.closure, ids.legacy);
  } finally { db.close(); }
}

async function rows(directory, sql, params = []) {
  const deadline = Date.now() + 5000;
  for (;;) {
    let db;
    try {
      db = new DatabaseSync(path.join(directory, "paravel.sqlite3"), { readOnly: true });
      return db.prepare(sql).all(...params).map((row) => ({ ...row }));
    } catch (error) {
      if (!/locked|busy/i.test(error.message) || Date.now() >= deadline) throw error;
      await pause(100);
    } finally { db?.close(); }
  }
}

async function snapshot(directory) {
  const tables = await rows(directory, "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const result = {};
  for (const { name } of tables) result[name] = await rows(directory, `SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`);
  return result;
}

async function legacySnapshot(directory) {
  return {
    groups: await rows(directory, "SELECT * FROM grupo ORDER BY id"),
    spaces: await rows(directory, "SELECT * FROM espacio WHERE id=?", [ids.legacy]),
    pieces: await rows(directory, "SELECT * FROM pieza WHERE id=?", [ids.piece]),
    pack: await rows(directory, "SELECT * FROM pack_pieza ORDER BY espacio_id,pieza_id"),
    closures: await rows(directory, "SELECT * FROM cierre ORDER BY id"),
  };
}

function verifyCdpOwner(port, child) {
  const command = `$listeners = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction Stop); if (!$listeners.Count) { throw 'No CDP listener' }; foreach ($listener in $listeners) { if ($listener.LocalAddress -ne '127.0.0.1' -and $listener.LocalAddress -ne '::1') { throw 'CDP listener is not loopback' }; $owner = [int]$listener.OwningProcess; $seen = @{}; while ($owner -ne ${child.pid}) { if ($owner -le 0 -or $seen.ContainsKey($owner)) { throw 'CDP belongs to another process tree' }; $seen[$owner] = $true; $process = Get-CimInstance Win32_Process -Filter "ProcessId=$owner"; if (!$process) { throw 'CDP owner disappeared' }; $owner = [int]$process.ParentProcessId } }`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", timeout: 20000 });
  assert.equal(result.status, 0, `CDP ownership check failed: ${result.stderr || result.error || result.stdout}`);
}

function verifyAuditSurface() {
  return Boolean(window.__PARAVEL_INVOKES__);
}

async function launch(chromium, directory) {
  const reservation = await reservePort();
  const port = reservation.port;
  assert.notEqual(port, 9223);
  await reservation.release();
  const out = openSync(path.join(directory, "native-stdout.log"), "a");
  const err = openSync(path.join(directory, "native-stderr.log"), "a");
  let child;
  let browser;
  let spawnError;
  try {
    child = spawn(exe, [], { cwd: app, stdio: ["ignore", out, err], env: { ...process.env,
      PARAVEL_TEST_DATA_DIR: directory, WEBVIEW2_USER_DATA_FOLDER: path.join(directory, "webview-profile"),
      LAUNCH_HOST_ALLOWED_ROOTS: directory,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}` } });
    child.once("error", (error) => { spawnError = error; });
    const deadline = Date.now() + 60000;
    let ready = false;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      assert.ok(child.exitCode === null && child.signalCode === null, "Native app exited before CDP");
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) { ready = true; break; }
      } catch {}
      await pause(200);
    }
    assert.ok(ready, "Owned WebView2 endpoint did not start");
    verifyCdpOwner(port, child);
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 60000 });
    } catch {
      await pause(2000);
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 60000 });
    }
    const context = browser.contexts()[0];
    assert.ok(context, "Real WebView2 context required");
    let page;
    const pageDeadline = Date.now() + 30000;
    while (Date.now() < pageDeadline) {
      page = context.pages().find((candidate) => /^https?:\/\/(localhost:1420|127\.0\.0\.1:1420|tauri\.localhost)(\/|$)/.test(candidate.url()));
      if (page) break;
      await pause(200);
    }
    assert.ok(page, "Must attach to the existing native page, never create a browser page");
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.__TAURI_INTERNALS__?.invoke));
    const dbPath = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("db_path"));
    assert.equal(path.resolve(dbPath).toLowerCase(), path.join(directory, "paravel.sqlite3").toLowerCase(), "Refuse to test a personal DB");
    console.log(JSON.stringify({ nativePid: child.pid, cdpPort: port, dbPath, transport: "Tauri/WebView2 real; dynamic loopback CDP; audit via invokeSafe command names; launch/picker never invoked by suite" }));
    return { child, browser, page };
  } catch (error) {
    killTree(child);
    await browser?.close().catch(() => {});
    throw error;
  } finally { closeSync(out); closeSync(err); }
}

async function collectAudit(session) {
  if (!session?.page || session.page.isClosed()) return;
  const commands = await session.page.evaluate(() => window.__PARAVEL_INVOKES__ ?? []);
  audit.push({ calls: commands.map((command) => ({ command, args: null })), blocked: [] });
}

async function stop(session) {
  killTree(session?.child);
  await session?.browser?.close().catch(() => {});
  await pause(600);
}

async function readMcp(directory, spaceId, pieceId) {
  const child = spawn(mcpExe, ["--db", path.join(directory, "paravel.sqlite3"), "--espacio", spaceId], { cwd: app, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PARAVEL_TEST_DATA_DIR: directory } });
  const pending = new Map();
  let sequence = 0;
  let stderr = "";
  let fatal;
  const fail = (error) => { fatal = error; for (const item of pending.values()) item.reject(error); pending.clear(); };
  child.on("error", fail);
  child.on("exit", (code) => fail(new Error(`MCP exited (${code}): ${stderr.slice(-500)}`)));
  child.stdin.on("error", fail);
  child.stderr.on("data", (data) => { stderr = (stderr + data.toString()).slice(-4000); });
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    try {
      assert.ok(Buffer.byteLength(line) <= 256 * 1024);
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result);
    } catch (error) { fail(error); }
  });
  const request = async (method, params = {}) => {
    if (fatal) throw fatal;
    const id = ++sequence;
    let timer;
    try {
      return await new Promise((resolve, reject) => {
        timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP timeout: ${method}`)); }, 10000);
        pending.set(id, { resolve, reject });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    } finally { clearTimeout(timer); }
  };
  const content = (result) => result.structuredContent ?? JSON.parse(result.content.find((item) => item.type === "text").text);
  try {
    await request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "paravel-p03-fixture", version: "1.0.0" } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const toolList = await request("tools/list");
    const space = await request("tools/call", { name: "leer_espacio", arguments: {} });
    const pieces = await request("tools/call", { name: "listar_piezas", arguments: {} });
    const piece = await request("tools/call", { name: "leer_contexto_pieza", arguments: { pieza_id: pieceId } });
    assert.notEqual(space.isError, true);
    assert.notEqual(pieces.isError, true);
    return { tools: toolList.tools, space: content(space), pieces: content(pieces), piece: content(piece), pieceError: piece.isError === true };
  } finally {
    lines.close();
    child.stdin.end();
    killTree(child);
  }
}

async function runVisibleSuite(h, catalog, expect) {
  const { scenario, invoke, rows, snapshot } = h;
  const page = h.page();
  const dialog = () => page.getByRole("dialog", { name: "Crear espacio", exact: true });
  const panel = () => page.getByRole("region", { name: "Preparación inicial", exact: true });
  const choose = async (template) => {
    await page.getByRole("button", { name: groupName, exact: true }).first().click();
    await page.getByRole("button", { name: "Crear espacio", exact: true }).first().click();
    await expect(dialog()).toBeVisible();
    await dialog().getByRole("button", { name: new RegExp(`^${template.name}`) }).click();
  };
  const enter = async (name) => page.getByRole("button", { name, exact: true }).first().click();
  const review = async (name, destination = groupName) => {
    await dialog().getByRole("button", { name: "Revisar espacio", exact: true }).click();
    const preview = dialog().getByRole("region", { name: "Vista previa validada", exact: true });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(name);
    await expect(preview).toContainText(destination);
    for (const text of ["No se abrirán aplicaciones ni archivos", "No se configurará MCP", "Esto no cifra los datos locales", "Nota vacía y sin cierres"]) await expect(preview).toContainText(text);
  };
  const create = async (name) => {
    await dialog().getByRole("button", { name: "Crear espacio", exact: true }).click();
    await expect(dialog()).not.toBeVisible();
    await expect(panel()).toBeVisible();
    const spaces = await rows("SELECT * FROM espacio WHERE nombre=?", [name]);
    assert.equal(spaces.length, 1);
    return spaces[0];
  };

  await scenario("A01/A24/A27 visible wizard: all templates, keyboard submit, back and dirty cancel", async () => {
    for (const template of catalog) {
      const name = `P03 UI ${template.name}`;
      const before = await snapshot();
      await choose(template);
      await dialog().getByLabel(/^Nombre del espacio/).fill(name);
      await expect(dialog().getByLabel(/^Grupo de destino/)).toHaveValue(ids.group);
      await dialog().getByRole("button", { name: "Atrás", exact: true }).click();
      await dialog().getByRole("button", { name: new RegExp(`^${template.name}`) }).click();
      await expect(dialog().getByLabel(/^Nombre del espacio/)).toHaveValue(name);
      page.once("dialog", (prompt) => prompt.dismiss());
      await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(dialog()).toBeVisible();
      assert.deepEqual(await snapshot(), before);
      const button = dialog().getByRole("button", { name: "Revisar espacio", exact: true });
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(dialog().getByRole("region", { name: "Vista previa validada" })).toContainText("Pendiente · sin pieza");
      const stored = await create(name);
      assert.equal(stored.grupo_id, ids.group);
      assert.equal((await rows("SELECT * FROM pieza WHERE espacio_id=?", [stored.id])).length, 0);
      const preparation = await invoke("get_space_preparation", { spaceId: stored.id });
      assertPreparation(preparation, template, stored.id);
      assert.ok(Object.values(preparation.fields).every((value) => value === ""));
    }
  });

  await scenario("A02/A07 visible web resource validation, correction, exact destination and preview", async () => {
    const template = catalog.find(({ name }) => name === "Desarrollo");
    const web = template.slots.find(({ kinds }) => kinds.includes("firefox"));
    const other = template.slots.find(({ key }) => key !== web.key);
    const name = "P03 visible populated mesa";
    await choose(template);
    await dialog().getByLabel(/^Nombre del espacio/).fill(name);
    await dialog().getByLabel(/^Grupo de destino/).selectOption(ids.destination);
    for (const field of template.fields) await dialog().getByLabel(new RegExp(`^${field.label} \\(opcional\\)`)).fill(`${privateMarker}_visible_${field.key}`);
    const resource = dialog().getByRole("group", { name: web.label, exact: true });
    await resource.getByLabel(/^Tipo de recurso/).selectOption("firefox");
    await resource.getByRole("button", { name: "Añadir recurso", exact: true }).click();
    await resource.getByLabel("Nombre del recurso", { exact: true }).fill("P03 visible inert link");
    await resource.getByLabel(/^URLs/).fill("not-a-url");
    const before = await snapshot();
    await dialog().getByRole("button", { name: "Revisar espacio", exact: true }).click();
    await expect(dialog().getByRole("alert")).toContainText(/\S/);
    assert.deepEqual(await snapshot(), before);
    await expect(resource.getByLabel(/^URLs/)).toHaveValue("not-a-url");
    await resource.getByLabel(/^URLs/).fill(fixtureUrl);
    await dialog().getByLabel(`Omitir ${other.label}`, { exact: true }).check();
    await review(name, destinationName);
    await expect(dialog().getByRole("region", { name: "Vista previa validada" })).toContainText(fixtureUrl);
    const stored = await create(name);
    assert.equal(stored.grupo_id, ids.destination);
    assert.equal((await rows("SELECT * FROM pieza WHERE espacio_id=?", [stored.id])).length, 1);
    await expect(panel()).toContainText(`${privateMarker}_visible_${template.fields[0].key}`);
    h.visible = { spaceId: stored.id, name, template };
  });

  await scenario("A13/A15 visible preparation: edit, hide/show, omit and resolve pending resource", async () => {
    assert.ok(h.visible);
    const { template, name, spaceId } = h.visible;
    await enter(name);
    await panel().getByRole("button", { name: "Editar textos iniciales", exact: true }).click();
    await panel().getByLabel(new RegExp(`^${template.fields[0].label} \\(opcional\\)`)).fill(`${privateMarker}_visible_edited`);
    await panel().getByRole("button", { name: "Guardar textos iniciales", exact: true }).click();
    await expect(panel()).toContainText(`${privateMarker}_visible_edited`);
    await panel().getByRole("button", { name: "Ocultar preparación", exact: true }).click();
    await expect.poll(async () => (await invoke("get_space_preparation", { spaceId })).hidden).toBe(true);
    await page.getByRole("button", { name: "Mostrar preparación", exact: true }).click();
    await expect(panel()).toContainText(`${privateMarker}_visible_edited`);
    await expect.poll(async () => (await invoke("get_space_preparation", { spaceId })).hidden).toBe(false);

    const pendingName = "P03 UI Investigación";
    await enter(pendingName);
    const research = catalog.find(({ name }) => name === "Investigación");
    const web = research.slots.find(({ kinds }) => kinds.includes("firefox"));
    const other = research.slots.find(({ key }) => key !== web.key);
    const suggestion = (label) => panel().getByRole("listitem").filter({ has: page.locator("strong").filter({ hasText: label }) });
    await suggestion(other.label).getByRole("button", { name: `Omitir: ${other.label}`, exact: true }).click();
    await expect(suggestion(other.label)).toContainText("Omitida");
    await suggestion(web.label).getByRole("button", { name: `Añadir recurso: ${web.label}`, exact: true }).click();
    const resource = panel().getByRole("group", { name: web.label, exact: true });
    await resource.getByLabel(/^Tipo de recurso/).selectOption("firefox");
    await resource.getByRole("button", { name: "Añadir recurso", exact: true }).click();
    await resource.getByLabel("Nombre del recurso", { exact: true }).fill("P03 visible resolved resource");
    await resource.getByLabel(/^URLs/).fill(fixtureUrl);
    await panel().getByRole("button", { name: "Completar sugerencia", exact: true }).click();
    await expect(suggestion(web.label)).toContainText("P03 visible resolved resource");
    const saved = (await rows("SELECT * FROM espacio WHERE nombre=?", [pendingName]))[0];
    const preparation = await invoke("get_space_preparation", { spaceId: saved.id });
    const linkedId = preparation.slots.find(({ key }) => key === web.key).pieceId;
    assert.ok(linkedId);
    assert.equal(preparation.slots.find(({ key }) => key === other.key).omitted, true);
    page.once("dialog", (prompt) => prompt.accept());
    await page.getByRole("button", { name: "Quitar P03 visible resolved resource", exact: true }).click();
    await expect(suggestion(web.label)).toContainText("Pendiente · sin pieza");
    assert.deepEqual(await rows("SELECT * FROM pieza WHERE id=?", [linkedId]), []);
    await enter(name);
    h.visible.preparation = await invoke("get_space_preparation", { spaceId });
  });

  await scenario("A24 switch-template confirmation and discard do not write; empty-space flow remains first class", async () => {
    const before = await snapshot();
    await choose(catalog[0]);
    await dialog().getByLabel(/^Nombre del espacio/).fill("P03 discarded draft");
    await dialog().getByLabel(new RegExp(`^${catalog[0].fields[0].label} \\(opcional\\)`)).fill("P03 draft field");
    await dialog().getByRole("button", { name: "Atrás", exact: true }).click();
    page.once("dialog", (prompt) => prompt.dismiss());
    await dialog().getByRole("button", { name: new RegExp(`^${catalog[1].name}`) }).click();
    await dialog().getByRole("button", { name: new RegExp(`^${catalog[0].name}`) }).click();
    await expect(dialog().getByLabel(new RegExp(`^${catalog[0].fields[0].label} \\(opcional\\)`))).toHaveValue("P03 draft field");
    await dialog().getByRole("button", { name: "Atrás", exact: true }).click();
    page.once("dialog", (prompt) => prompt.accept());
    await dialog().getByRole("button", { name: new RegExp(`^${catalog[1].name}`) }).click();
    await expect(dialog().getByLabel(new RegExp(`^${catalog[1].fields[0].label} \\(opcional\\)`))).toHaveValue("");
    page.once("dialog", (prompt) => prompt.accept());
    await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(dialog()).not.toBeVisible();
    assert.deepEqual(await snapshot(), before);
    await page.getByRole("button", { name: "Crear espacio", exact: true }).first().click();
    await dialog().getByRole("button", { name: /^Espacio vacío/ }).click();
    const empty = page.getByRole("dialog", { name: "Crear espacio", exact: true });
    await empty.getByLabel("Nombre", { exact: true }).fill("P03 empty-space regression");
    await empty.getByRole("button", { name: "Crear espacio", exact: true }).click();
    await expect(empty).not.toBeVisible();
    const saved = (await rows("SELECT * FROM espacio WHERE nombre='P03 empty-space regression'"))[0];
    assert.ok(saved);
    assert.equal(await invoke("get_space_preparation", { spaceId: saved.id }), null);
    assert.deepEqual(await rows("SELECT * FROM pieza WHERE espacio_id=?", [saved.id]), []);
  });
}

async function worker() {
  assert.equal(process.platform, "win32", "Native suite requires Windows/Tauri/WebView2");
  const directory = process.env.TEMPLATES_TEMP;
  assert.ok(directory && path.dirname(directory).toLowerCase() === tempRoot.toLowerCase() && path.basename(directory).startsWith("templates-native-"));
  assert.ok((await stat(directory)).isDirectory());
  const binary = await stat(exe);
  for (const source of ["src-tauri/src/templates.rs", "src-tauri/src/lib.rs", "src-tauri/src/db.rs"]) {
    assert.ok(binary.mtimeMs >= (await stat(path.join(app, source))).mtimeMs, `BLOCKED: rebuild debug launch-host after integrating ${source}; harness never builds`);
  }
  await access(mcpExe);
  for (const source of ["src/TemplateWizard.tsx", "src/PreparationPanel.tsx", "src/templates.ts"]) await access(path.join(app, source));
  seed(directory);
  const legacy = await legacySnapshot(directory);
  if (process.env.TEMPLATES_PLAYWRIGHT) process.env.CAPTURE_PLAYWRIGHT = process.env.TEMPLATES_PLAYWRIGHT;
  const { chromium, expect, version, resolved } = await runtime();
  const { createServer } = await import("vite");
  const server = await createServer({ root: app, cacheDir: path.join(directory, "vite-cache"), clearScreen: false,
    server: { host: "127.0.0.1", port: 1420, strictPort: true, hmr: false, open: false } });
  const report = reporter("P03 NATIVE Tauri/WebView2/SQLite/MCP");
  let session;
  const invoke = async (command, args) => {
    const result = await session.page.evaluate(async ({ command, args }) => {
      try { return { ok: true, value: await window.__TAURI_INTERNALS__.invoke(command, args) }; }
      catch (error) { return { ok: false, error: typeof error === "string" ? error : JSON.parse(JSON.stringify(error)) }; }
    }, { command, args });
    if (result.ok) return result.value;
    let error = result.error;
    if (typeof error === "string") { try { error = JSON.parse(error); } catch {} }
    throw error;
  };
  const h = { invoke, rows: (sql, params) => rows(directory, sql, params), snapshot: () => snapshot(directory),
    scenario: report.scenario, groupId: ids.group, legacySpaceId: ids.legacy, legacyPieceId: ids.piece,
    page: () => session.page, readMcp: (spaceId, pieceId) => readMcp(directory, spaceId, pieceId),
    withRollbackTrigger: async (body) => {
      const db = new DatabaseSync(path.join(directory, "paravel.sqlite3"));
      try {
        db.exec("PRAGMA busy_timeout=5000; CREATE TRIGGER p03_test_rollback BEFORE INSERT ON pieza BEGIN SELECT RAISE(ABORT, 'P03_FORCED_ROLLBACK'); END;");
        try { await body(); } finally { db.exec("DROP TRIGGER p03_test_rollback"); }
      } finally { db.close(); }
    },
  };
  try {
    if (process.env.TEMPLATES_EMBEDDED !== "1") await server.listen();
    session = await launch(chromium, directory);
    const catalog = await invoke("list_space_templates");
    validateCatalog(catalog);
    if (process.env.TEMPLATES_AUDIT_ONLY === "1") {
      const template = catalog[0];
      const input = { requestId: randomUUID(), templateId: template.templateId, templateRevision: template.revision, schemaVersion: 1, groupId: ids.group, name: "Audit fixture", fields: {}, slots: [] };
      await invoke("preview_space_template", { input });
      const created = await invoke("create_space_from_template", { input });
      await invoke("update_space_preparation", { input: { spaceId: created.space.id, expectedRevision: created.preparation.revision, fields: {}, hidden: true } });
      const slot = created.preparation.slots[0];
      await invoke("resolve_preparation_slot", { input: { spaceId: created.space.id, slotId: slot.id, expectedRevision: slot.revision, omitted: true, piece: null } });
      console.log(JSON.stringify({ invokes: await session.page.evaluate(() => window.__PARAVEL_INVOKES__), verifySurface: await session.page.evaluate(verifyAuditSurface) }, null, 2));
      return;
    }
    h.legacyMcp = await readMcp(directory, ids.legacy, ids.piece);
    assert.equal(h.legacyMcp.space.nota, "P03 public note unchanged");
    assert.equal(h.legacyMcp.space.piezas_compartidas, 1);
    assert.equal(h.legacyMcp.pieceError, false);
    assert.equal(await invoke("get_space_preparation", { spaceId: ids.legacy }), null);
    await runVisibleSuite(h, catalog, expect);
    await runContractSuite(h);
    await report.scenario("A02/A20 restart actual host preserves preparation, slots, IDs, rows and legacy P01 data", async () => {
      assert.ok(h.persisted && h.visible);
      const before = await snapshot(directory);
      const apiPreparation = await invoke("get_space_preparation", { spaceId: h.persisted.result.space.id });
      const visiblePreparation = await invoke("get_space_preparation", { spaceId: h.visible.spaceId });
      await collectAudit(session);
      await stop(session);
      session = await launch(chromium, directory);
      assert.deepEqual(await snapshot(directory), before);
      assert.deepEqual(await invoke("get_space_preparation", { spaceId: h.persisted.result.space.id }), apiPreparation);
      assert.deepEqual(await invoke("get_space_preparation", { spaceId: h.visible.spaceId }), visiblePreparation);
      const replay = await invoke("create_space_from_template", { input: h.persisted.input });
      assert.equal(replay.space.id, h.persisted.result.space.id);
      assert.deepEqual(replay.preparation, apiPreparation);
      assert.deepEqual(await snapshot(directory), before);
      await session.page.getByRole("button", { name: h.visible.name, exact: true }).first().click();
      await expect(session.page.getByRole("region", { name: "Preparación inicial", exact: true })).toContainText(Object.values(visiblePreparation.fields)[0]);
      await session.page.getByRole("button", { name: /^P03 legacy mesa(?:\s*Pack)?$/, exact: false }).first().click();
      await expect(session.page.locator(".continuity-panel")).toContainText("Legacy progress unchanged");
      assert.deepEqual(await legacySnapshot(directory), legacy);
    });
    await report.scenario("A21/A22/A30 final negative privacy/launch audit and unchanged note, pack, marked selection, closures", async () => {
      await collectAudit(session);
      assert.deepEqual(audit.flatMap(({ blocked }) => blocked), [], "Any attempted native side effect fails the suite");
      const calls = audit.flatMap(({ calls }) => calls);
      for (const command of ["preview_space_template", "create_space_from_template", "update_space_preparation", "resolve_preparation_slot"]) assert.ok(calls.some((call) => call.command === command), `Missing audit ${command}; recorded ${JSON.stringify(calls.map((call) => call.command))}`);
      assert.ok(!calls.some(({ command }) => /launch_|set_marked|set_invite|clear_invite|save_closure|delete_closure/.test(command)));
      let launchLog = "";
      try { launchLog = await readFile(path.join(directory, "launch.log"), "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
      assert.equal(launchLog, "", "No resource or program may be launched");
      assert.equal(await invoke("read_launch_log", { lines: 100 }), "");
      assert.deepEqual(await legacySnapshot(directory), legacy);
      for (const space of await rows(directory, "SELECT * FROM espacio WHERE id<>?", [ids.legacy])) {
        assert.ok(space.nota === null || space.nota === "");
        assert.equal(space.bot_activo, 0);
        assert.deepEqual(await rows(directory, "SELECT * FROM pack_pieza WHERE espacio_id=?", [space.id]), []);
        assert.deepEqual(await rows(directory, "SELECT * FROM cierre WHERE espacio_id=?", [space.id]), []);
      }
      assert.deepEqual(await rows(directory, "SELECT * FROM pieza WHERE id<>? AND marcada<>0", [ids.piece]), []);
      assert.deepEqual(await rows(directory, "PRAGMA foreign_key_check"), []);
      assert.equal((await rows(directory, "PRAGMA integrity_check"))[0].integrity_check, "ok");
      assert.deepEqual(pageErrors, []);
    });
  } finally {
    report.finish({ playwright: { version, resolved }, executable: exe, executableMtime: binary.mtime.toISOString(), mcpExecutable: mcpExe,
      fixture: directory, fixtureMode: "synthetic pre-P03 DB with P01 data; deleted by supervisor", buildsRunByHarness: false,
      gaps: ["No OS picker interaction or native close event", "No Iniciar test: all launch commands blocked", "No forced late response or lost UI refresh response", "No new-empty-DB migration or cascade deletion test", "No exhaustive Unicode boundaries or zoom/screen-reader audit"],
      selectors: "Matched to integrated TemplateWizard, TemplateResource, PreparationPanel and Workspace source; runtime verification pending" });
    await stop(session);
    await server.close().catch(() => {});
  }
}

async function supervise() {
  assert.ok((await stat(tempRoot)).isDirectory());
  const directory = await mkdtemp(path.join(tempRoot, "templates-native-"));
  let child;
  let timer;
  let expired = false;
  const interrupt = () => { process.exitCode = 130; killTree(child); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    child = spawn(process.execPath, [script, "--worker"], { cwd: app, stdio: "inherit", env: { ...process.env,
      TEMPLATES_TEMP: directory, TEMP: directory, TMP: directory, TMPDIR: directory } });
    timer = setTimeout(() => { expired = true; console.error("FAIL P03 native deadline (480000ms); stopping only owned process tree"); killTree(child); }, 480000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    process.exitCode = process.exitCode || (expired ? 1 : code ?? 1);
  } finally {
    clearTimeout(timer);
    killTree(child);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

if (process.argv.includes("--worker")) await worker();
else await supervise();
