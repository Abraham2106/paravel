import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { openSync, closeSync } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { app, runtime, reservePort, killTree, pause, supervise, reporter, requireCaptureSources, assertDevPortFree } from "./capture-harness.mjs";

const script = fileURLToPath(import.meta.url);
const exe = path.join(app, "src-tauri", "target", "debug", "launch-host.exe");
const ids = { group: randomUUID(), alpha: randomUUID(), beta: randomUUID(), piece: randomUUID(), other: randomUUID(), closure: randomUUID() };
const url = "https://example.com/capture-native?query=1#fixture";
const candidate = (reference, name = "Native captured reference", kind = "firefox") => ({ itemId: randomUUID(), kind, reference, name });

function seed(directory) {
  const db = new DatabaseSync(path.join(directory, "paravel.sqlite3"));
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE grupo (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, icono TEXT NOT NULL DEFAULT 'folder', orden INTEGER NOT NULL, creado_en TEXT NOT NULL, editado_en TEXT NOT NULL);
      CREATE TABLE espacio (id TEXT PRIMARY KEY, grupo_id TEXT NOT NULL REFERENCES grupo(id), nombre TEXT NOT NULL, nota TEXT, bot_activo INTEGER NOT NULL DEFAULT 0, creado_en TEXT NOT NULL, editado_en TEXT NOT NULL);
      CREATE TABLE pieza (id TEXT PRIMARY KEY, espacio_id TEXT NOT NULL REFERENCES espacio(id), kind TEXT NOT NULL, nombre TEXT NOT NULL, payload TEXT NOT NULL, marcada INTEGER NOT NULL DEFAULT 1, orden INTEGER NOT NULL, creado_en TEXT NOT NULL, editado_en TEXT NOT NULL);
      CREATE TABLE pack_pieza (espacio_id TEXT NOT NULL REFERENCES espacio(id), pieza_id TEXT NOT NULL REFERENCES pieza(id), PRIMARY KEY(espacio_id,pieza_id));
      CREATE TABLE cierre (id TEXT PRIMARY KEY NOT NULL, espacio_id TEXT NOT NULL REFERENCES espacio(id), objective TEXT NOT NULL, progress TEXT NOT NULL, next_action TEXT NOT NULL, blocker TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revision INTEGER NOT NULL);`);
    db.prepare("INSERT INTO grupo VALUES (?, 'Capture synthetic group', 'folder', 0, '1800000000', '1800000000')").run(ids.group);
    for (const [id, name] of [[ids.alpha, "Capture Alpha"], [ids.beta, "Capture Beta"]]) {
      db.prepare("INSERT INTO espacio VALUES (?, ?, ?, 'Native note must remain unchanged', 0, '1800000000', '1800000000')").run(id, ids.group, name);
    }
    for (const [id, space, reference] of [[ids.piece, ids.alpha, "https://example.com/existing"], [ids.other, ids.beta, url]]) {
      db.prepare("INSERT INTO pieza VALUES (?, ?, 'firefox', 'Existing inert fixture', ?, 1, 0, '1800000000', '1800000000')")
        .run(id, space, JSON.stringify({ urls: [reference] }));
      db.prepare("INSERT INTO pack_pieza VALUES (?, ?)").run(space, id);
    }
    db.prepare("INSERT INTO cierre VALUES (?, ?, 'Saved objective', 'Saved native progress', '', '', 1800000000000, 1800000000000, 1)").run(ids.closure, ids.alpha);
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
      if (!/locked|busy/i.test(error.message) || Date.now() > deadline) throw error;
      await pause(100);
    } finally { db?.close(); }
  }
}

async function invariantSnapshot(directory) {
  return {
    spaces: await rows(directory, "SELECT * FROM espacio ORDER BY id"),
    packs: await rows(directory, "SELECT * FROM pack_pieza ORDER BY espacio_id,pieza_id"),
    closures: await rows(directory, "SELECT * FROM cierre ORDER BY id"),
    existing: await rows(directory, "SELECT * FROM pieza WHERE id IN (?,?) ORDER BY id", [ids.piece, ids.other]),
    beta: await rows(directory, "SELECT * FROM pieza WHERE espacio_id=? ORDER BY id", [ids.beta]),
  };
}

async function verifySeedUnchanged(directory, before) {
  const current = await invariantSnapshot(directory);
  assert.deepEqual(current, before);
  return current;
}

function verifyCdpOwner(port, child) {
  const command = `$listeners = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction Stop); if (!$listeners.Count) { throw 'No CDP listener' }; foreach ($listener in $listeners) { if ($listener.LocalAddress -ne '127.0.0.1' -and $listener.LocalAddress -ne '::1') { throw 'CDP listener is not loopback' }; $owner = [int]$listener.OwningProcess; $seen = @{}; while ($owner -ne ${child.pid}) { if ($owner -le 0 -or $seen.ContainsKey($owner)) { throw 'CDP port belongs to another process tree' }; $seen[$owner] = $true; $process = Get-CimInstance Win32_Process -Filter "ProcessId=$owner"; if (!$process) { throw 'CDP owner disappeared' }; $owner = [int]$process.ParentProcessId } }`;
  const checked = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", timeout: 20000 });
  assert.equal(checked.status, 0, `Exclusive CDP ownership check failed: ${checked.stderr || checked.error || checked.stdout}`);
}

async function launch(chromium, directory) {
  const reservation = await reservePort();
  const port = reservation.port;
  await reservation.release();
  const exclusive = await reservePort(port);
  await exclusive.release();
  const out = openSync(path.join(directory, "native-stdout.txt"), "a");
  const err = openSync(path.join(directory, "native-stderr.txt"), "a");
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
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Native child exited before CDP: ${child.exitCode}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) { ready = true; break; }
      } catch {}
      await pause(200);
    }
    assert.ok(ready, "Owned WebView2 CDP endpoint did not start");
    const versionBody = await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.json());
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    console.log(JSON.stringify({ cdpProbe: { port, browser: versionBody.Browser, targets: targets.map((item) => `${item.type}:${item.url}`) } }));
    verifyCdpOwner(port, child);
    const connect = async () => {
      const startedAt = Date.now();
      try {
        const connection = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 60000 });
        console.log(JSON.stringify({ cdpConnect: { port, ms: Date.now() - startedAt } }));
        return connection;
      } catch (error) {
        console.error(JSON.stringify({ cdpConnectFailure: { port, ms: Date.now() - startedAt,
          targets: await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json()).then((list) => list.map((item) => `${item.type}:${item.url}`)).catch(() => "unavailable"),
          error: String(error).slice(0, 600) } }));
        throw error;
      }
    };
    try {
      browser = await connect();
    } catch {
      console.error("RETRY: one reconnect attempt after WebView2 cold-start handshake timeout");
      await pause(2000);
      browser = await connect();
    }
    const context = browser.contexts()[0];
    assert.ok(context, "Native CDP context is required");
    const pageDeadline = Date.now() + 30000;
    let page;
    while (Date.now() < pageDeadline) {
      page = context.pages().find((item) => /localhost:1420|127\.0\.0\.1:1420|tauri\.localhost/.test(item.url()));
      if (page) break;
      await pause(200);
    }
    assert.ok(page, "Must attach to the actual native app page, never a new browser page");
    page.setDefaultTimeout(20000);
    await page.waitForFunction(() => Boolean(window.__TAURI_INTERNALS__?.invoke), null, { timeout: 45000 });
    page.on("console", (message) => { if (message.type() === "error") console.error(`PAGE CONSOLE ERROR: ${message.text().slice(0, 400)}`); });
    page.on("pageerror", (error) => console.error(`PAGE RUNTIME ERROR: ${error.message.slice(0, 400)}`));
    console.log(JSON.stringify({ nativePid: child.pid, cdpPort: port, dbPath: (await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("db_path"))), transport: "owned loopback WebView2; direct Tauri invoke; internals are frozen by the app so no JS call-log wrapper is installed" }));
    return { child, browser, page };
  } catch (error) {
    killTree(child);
    await browser?.close().catch(() => {});
    throw error;
  } finally { closeSync(out); closeSync(err); }
}

async function stop(session) {
  killTree(session?.child);
  await session?.browser?.close().catch(() => {});
  await pause(500);
}

async function worker() {
  await requireCaptureSources();
  await assertDevPortFree();
  const binary = await stat(exe);
  for (const source of ["src-tauri/src/capture.rs", "src-tauri/src/lib.rs", "src-tauri/src/db.rs"]) {
    assert.ok(binary.mtimeMs >= (await stat(path.join(app, source))).mtimeMs, `BLOCKED: debug executable predates ${source}; rebuild backend before native verification`);
  }
  const directory = process.env.CAPTURE_TEMP;
  assert.ok(directory && (await stat(directory)).isDirectory());
  seed(directory);
  const before = await invariantSnapshot(directory);
  await mkdir(path.join(directory, "real-folder"));
  const file = path.join(directory, "real-file.txt");
  await writeFile(file, "Synthetic inert capture fixture\n", { flag: "wx" });
  const { chromium, expect, version } = await runtime();
  const { createServer } = await import("vite");
  const server = await createServer({ root: app, cacheDir: path.join(directory, "vite-cache"), clearScreen: false,
    server: { host: "127.0.0.1", port: 1420, strictPort: true, hmr: false, open: false } });
  const report = reporter("NATIVE Tauri/WebView2/SQLite");
  let session;
  let retryInput;
  let retryResult;
  let retryRows;
  const invoke = (command, args) => session.page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  try {
    await server.listen();
    const warmup = await import("node:http").then(({ request }) => new Promise((resolve, reject) => {
      const chunks = [];
      const outgoing = request({ host: "127.0.0.1", port: 1420, path: "/src/main.tsx" }, (response) => {
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", resolve);
      });
      outgoing.once("error", reject);
      outgoing.end();
    }));
    if (warmup?.length === 0) throw new Error("Vite warmup request failed");
    console.log(JSON.stringify({ viteDepsWarm: true }));
    session = await launch(chromium, directory);
    await report.scenario("UI URL capture persists an unmarked piece without altering P01 draft", async () => {
      const page = session.page;
      await page.getByRole("button", { name: "Capture Alpha", exact: true }).first().click({ timeout: 30000 });
      await page.locator(".continuity-panel").getByRole("button", { name: "Cerrar sesión de trabajo" }).click();
      await page.getByLabel(/Último avance/).fill("P01 native unsaved draft");
      await page.getByRole("button", { name: "Añadir recursos", exact: true }).first().click();
      const dialog = page.getByRole("dialog", { name: "Añadir recursos", exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("URLs (una por línea)").fill(url);
      await dialog.getByRole("button", { name: "Preparar enlaces", exact: true }).click();
      await dialog.getByRole("button", { name: "Vista previa", exact: true }).click();
      await expect(dialog).toContainText("Listo para añadir.");
      await dialog.getByRole("button", { name: /^Añadir \d+ recursos$/ }).click();
      await expect.poll(async () => (await rows(directory, "SELECT * FROM pieza WHERE espacio_id=? AND id<>?", [ids.alpha, ids.piece])).length).toBe(1);
      const created = (await rows(directory, "SELECT * FROM pieza WHERE espacio_id=? AND id<>?", [ids.alpha, ids.piece]))[0];
      assert.equal(created.kind, "firefox");
      assert.equal(created.marcada, 0);
      assert.deepEqual(JSON.parse(created.payload), { urls: [url] });
      if (await dialog.isVisible()) await dialog.getByRole("button", { name: /Cerrar|Listo|Hecho/i }).last().click();
      await expect(page.getByLabel(/Último avance/)).toHaveValue("P01 native unsaved draft");
      page.once("dialog", (prompt) => prompt.dismiss());
      await page.getByRole("button", { name: "Capture Beta", exact: true }).first().click();
      await expect(page.getByLabel(/Último avance/)).toHaveValue("P01 native unsaved draft");
      await verifySeedUnchanged(directory, before);
    });

    await report.scenario("mixed native preview and batch commit skip/allow/invalid with isolated mesa", async () => {
      await verifySeedUnchanged(directory, before);
      const items = [candidate("https://example.com/existing", "Existing skip"), candidate("https://example.com/existing", "Existing allow"),
        candidate("https://example.com/batch-new", "  Trimmed capture  "), candidate("not-a-url", "Invalid reference")];
      const preview = await invoke("preview_capture", { input: { spaceId: ids.alpha, items } });
      assert.deepEqual(preview.items.map((item) => item.itemId), items.map((item) => item.itemId));
      assert.deepEqual(preview.items.map((item) => item.status), ["duplicate", "duplicate", "ready", "invalid"]);
      assert.ok(preview.items[0].duplicatePieceIds.includes(ids.piece));
      assert.equal(preview.items[2].normalizedName, "Trimmed capture");
      assert.ok(preview.items[3].error);
      retryInput = { operationId: randomUUID(), spaceId: ids.alpha, items: items.map((item, index) => ({ ...item, duplicatePolicy: index === 1 ? "allow" : "skip" })) };
      retryResult = await invoke("commit_capture", { input: retryInput });
      assert.equal(retryResult.operationId, retryInput.operationId);
      assert.deepEqual(retryResult.items.map((item) => item.status), ["skipped_duplicate", "created", "created", "rejected"]);
      assert.deepEqual(retryResult.items.map((item) => item.itemId), items.map((item) => item.itemId));
      for (const item of retryResult.items.filter((item) => item.status === "created")) {
        const stored = (await rows(directory, "SELECT * FROM pieza WHERE id=?", [item.pieceId]))[0];
        assert.equal(stored.espacio_id, ids.alpha);
        assert.equal(stored.marcada, 0);
      }
      retryRows = await rows(directory, "SELECT * FROM pieza ORDER BY id");
      assert.deepEqual(await invoke("commit_capture", { input: retryInput }), retryResult);
      assert.deepEqual(await rows(directory, "SELECT * FROM pieza ORDER BY id"), retryRows);
      await verifySeedUnchanged(directory, before);
    });

    await report.scenario("same operation after native restart returns persisted receipt without new rows", async () => {
      assert.ok(retryResult && retryRows, "Mixed batch must have completed before restart assertion");
      await stop(session);
      session = await launch(chromium, directory);
      assert.deepEqual(await invoke("commit_capture", { input: retryInput }), retryResult);
      assert.deepEqual(await rows(directory, "SELECT * FROM pieza ORDER BY id"), retryRows);
      await verifySeedUnchanged(directory, before);
    });

    await report.scenario("prepare actual temporary file/folder paths, validate and commit without opening", async () => {
      const folder = path.join(directory, "real-folder");
      const prepared = await invoke("prepare_capture_paths", { paths: [file, folder] });
      assert.equal(prepared.items.length, 2);
      assert.deepEqual(prepared.items.map((item) => item.kind), ["file", "folder"]);
      for (const item of prepared.items) {
        assert.match(item.itemId, /^[0-9a-f-]{36}$/i);
        await access(item.reference);
        assert.ok([file, folder].some((value) => value.toLowerCase() === item.reference.toLowerCase()));
      }
      const preview = await invoke("preview_capture", { input: { spaceId: ids.alpha, items: prepared.items } });
      assert.deepEqual(preview.items.map((item) => item.status), ["ready", "ready"]);
      const committed = await invoke("commit_capture", { input: { operationId: randomUUID(), spaceId: ids.alpha,
        items: prepared.items.map((item) => ({ ...item, duplicatePolicy: "skip" })) } });
      assert.deepEqual(committed.items.map((item) => item.status), ["created", "created"]);
      for (const [index, item] of committed.items.entries()) {
        const stored = (await rows(directory, "SELECT * FROM pieza WHERE id=?", [item.pieceId]))[0];
        assert.equal(stored.marcada, 0);
        assert.equal(JSON.parse(stored.payload).path.toLowerCase(), prepared.items[index].reference.toLowerCase());
      }
      const missing = candidate(path.join(directory, "does-not-exist.txt"), "Missing fixture", "file");
      const invalid = await invoke("preview_capture", { input: { spaceId: ids.alpha, items: [missing] } });
      assert.equal(invalid.items[0].status, "invalid");
    });

    await report.scenario("all native scenarios leave note, pack, closures, other mesa and launch.log untouched", async () => {
      await verifySeedUnchanged(directory, before);
      await assert.rejects(access(path.join(directory, "launch.log")), { code: "ENOENT" });
      const captured = await rows(directory, "SELECT marcada FROM pieza WHERE id NOT IN (?,?)", [ids.piece, ids.other]);
      assert.ok(captured.length >= 4);
      assert.ok(captured.every((row) => row.marcada === 0));
    });
  } finally {
    await stop(session);
    await server.close();
    report.finish({ playwright: version, explorerDrag: "NOT TESTED: no actual Explorer OS drag gesture", nativePickers: "NOT TESTED: no picker UI gesture; real paths passed to actual prepare_capture_paths API" });
  }
}

await (process.argv.includes("--worker") ? worker() : supervise(script, "native", 300000));
