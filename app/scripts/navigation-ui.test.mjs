import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixture, installNavigationMock } from "./navigation-mock.mjs";

const script = fileURLToPath(import.meta.url);
const app = path.resolve(path.dirname(script), "..");
const tempRoot = process.env.PARAVEL_TEST_TEMP ?? os.tmpdir();

async function runtime() {
  const require = createRequire(import.meta.url);
  const candidates = [process.env.CONTINUITY_PLAYWRIGHT, process.env.NAVIGATION_PLAYWRIGHT];
  try { candidates.push(path.dirname(require.resolve("playwright/package.json"))); } catch {}
  const cache = path.join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  try {
    for (const entry of await readdir(cache)) candidates.push(path.join(cache, entry, "node_modules", "playwright"));
  } catch {}
  for (const candidate of candidates.filter(Boolean)) {
    try {
      const packageRequire = createRequire(path.join(path.resolve(candidate), "package.json"));
      const { chromium } = packageRequire("./index.js");
      const { expect } = packageRequire("./test.js");
      return { chromium, expect, version: packageRequire("./package.json").version };
    } catch {}
  }
  throw new Error("Playwright unavailable. Set CONTINUITY_PLAYWRIGHT or NAVIGATION_PLAYWRIGHT to an installed playwright package directory.");
}

async function worker() {
  const { chromium, expect, version } = await runtime();
  const { createServer } = await import("vite");
  const server = await createServer({ root: app, cacheDir: path.join(process.env.TEMP ?? tempRoot, "vite-cache"),
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, open: false }, clearScreen: false });
  let browser;
  const results = [];
  try {
    await server.listen();
    const address = server.httpServer.address();
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true, ...(process.env.CONTINUITY_BROWSER_CHANNEL ? { channel: process.env.CONTINUITY_BROWSER_CHANNEL } : {}) });
    async function scenario(name, body) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", acceptDownloads: false });
      const errors = [];
      const blocked = [];
      let page;
      try {
        await context.route("**/*", (route) => {
          if (new URL(route.request().url()).origin === origin) return route.continue();
          blocked.push("external request");
          return route.abort();
        });
        await context.addInitScript(installNavigationMock, fixture);
        page = await context.newPage();
        page.setDefaultTimeout(7000);
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(origin, { timeout: 45000, waitUntil: "domcontentloaded" });
        await expect(page.getByRole("button", { name: "Buscar en Paravel" })).toBeVisible();
        await body(page);
        const snapshot = await page.evaluate(() => window.__NAVIGATION_MOCK__.snapshot());
        assert.deepEqual(snapshot.unexpected, [], "No launch, pack, marking or unknown invoke allowed");
        assert.deepEqual(blocked, [], "No external requests allowed");
        assert.deepEqual(errors, [], "No browser runtime errors");
        const inert = snapshot.pieces.find((piece) => piece.id === fixture.pieceInert);
        assert.equal(inert.marked, true);
        results.push({ name, status: "PASS", coverage: "browser UI + MOCK invoke" });
        console.log(`PASS MOCK ${name}`);
      } catch (error) {
        results.push({ name, status: "FAIL", error: String(error.message).slice(0, 1800), coverage: "browser UI + MOCK invoke" });
        console.error(`FAIL MOCK ${name}: ${String(error.message).slice(0, 1800)}`);
      } finally { await context.close(); }
    }
    const search = (page) => page.getByRole("dialog", { name: "Buscar en Paravel" });
    const field = (page) => page.getByLabel("Buscar grupos, espacios y piezas por nombre");
    const open = async (page) => { await page.getByRole("button", { name: "Buscar en Paravel" }).click(); await expect(search(page)).toBeVisible(); };
    const hold = (page, command, key, fail = false) => page.evaluate(({ command, key, fail }) => window.__NAVIGATION_MOCK__.hold(command, key, fail), { command, key, fail });
    const started = (page, token) => page.waitForFunction((token) => window.__NAVIGATION_MOCK__.started(token), token);
    const release = (page, token) => page.evaluate((token) => window.__NAVIGATION_MOCK__.release(token), token);
    const state = (page) => page.evaluate(() => window.__NAVIGATION_MOCK__.snapshot());

    await scenario("T03 T11 open search, empty state, keyboard navigate to space", async (page) => {
      await open(page);
      await expect(search(page)).toContainText("Escribe el nombre de un grupo, espacio o pieza");
      await field(page).fill("atlas");
      await expect(search(page).getByRole("option").first()).toContainText("P04 Atlas");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "P04 Atlas" })).toBeVisible();
      assert.equal((await state(page)).calls.some((item) => item.command.startsWith("launch_")), false);
    });

    await scenario("T05 notes and payloads do not match; T20 no launch", async (page) => {
      await open(page);
      await field(page).fill("NOTE_ONLY_SENTINEL");
      await expect(search(page)).toContainText("No hay resultados por nombre");
      await field(page).fill("PAYLOAD_ONLY_SENTINEL");
      await expect(search(page)).toContainText("No hay resultados por nombre");
    });

    await scenario("T04 homonyms stay distinct with hierarchy", async (page) => {
      await open(page);
      await field(page).fill("repositorio");
      const options = search(page).getByRole("option");
      await expect(options).toHaveCount(2);
      await expect(options.nth(0)).toContainText("P04 Trabajo / P04 Atlas");
      await expect(options.nth(1)).toContainText("P04 Trabajo / P04 Diseno");
    });

    await scenario("T13 delayed catalog cannot contaminate a new session", async (page) => {
      const pending = await hold(page, "list_navigation_catalog", "list_navigation_catalog");
      await open(page);
      await started(page, pending);
      await page.keyboard.press("Escape");
      await expect(search(page)).toHaveCount(0);
      await open(page);
      await expect(field(page)).toHaveValue("");
      await release(page, pending);
      await field(page).fill("atlas");
      await expect(search(page).getByRole("option").first()).toContainText("P04 Atlas");
    });

    await scenario("T16 dirty cancel keeps draft; accept navigates", async (page) => {
      await page.getByRole("button", { name: "P04 Atlas" }).click();
      await page.getByRole("button", { name: "Cerrar sesión de trabajo" }).click();
      await page.getByLabel(/Último avance/).fill("P04 unsaved draft");
      await open(page);
      await field(page).fill("beta");
      page.once("dialog", (dialog) => dialog.dismiss());
      await search(page).getByRole("option").first().click();
      await expect(page.getByLabel(/Último avance/)).toHaveValue("P04 unsaved draft");
      await open(page);
      await field(page).fill("beta");
      page.once("dialog", (dialog) => dialog.accept());
      await search(page).getByRole("option").first().click();
      await expect(page.getByRole("heading", { name: "P04 Beta" })).toBeVisible();
    });

    await scenario("T18 hidden piece on current mesa focuses without remounting", async (page) => {
      await page.getByRole("button", { name: "P04 Atlas" }).click();
      await page.getByRole("button", { name: "Cerrar sesión de trabajo" }).click();
      await page.getByLabel(/Último avance/).fill("P04 stay on mesa");
      await page.getByRole("button", { name: /Marcadas/ }).click();
      await expect(page.locator("#piece-" + fixture.pieceHidden)).toHaveCount(0);
      await open(page);
      await field(page).fill("oculta");
      await search(page).getByRole("option").first().click();
      await expect(page.locator(`#piece-${fixture.pieceHidden}`)).toBeVisible();
      await expect(page.locator(`#piece-${fixture.pieceHidden}`)).toHaveClass(/destination/);
      await expect(page.getByLabel(/Último avance/)).toHaveValue("P04 stay on mesa");
      assert.equal((await state(page)).pieces.find((piece) => piece.id === fixture.pieceHidden).marked, false);
    });

    await scenario("T15 delayed list_pieces cannot restore a previous mesa", async (page) => {
      const pending = await hold(page, "list_pieces", fixture.spaceAtlas);
      await page.getByRole("button", { name: "P04 Atlas" }).click();
      await started(page, pending);
      await open(page);
      await field(page).fill("beta");
      await search(page).getByRole("option").first().click();
      await expect(page.getByRole("heading", { name: "P04 Beta" })).toBeVisible();
      await release(page, pending);
      await expect(page.locator(`#piece-${fixture.pieceInert}`)).toHaveCount(0);
    });

    await scenario("T21 exceeded catalog is not an empty sede", async (page) => {
      await page.evaluate(() => window.__NAVIGATION_MOCK__.failCatalog("NAVIGATION_CATALOG_EXCEEDED"));
      await open(page);
      await expect(search(page)).toContainText("supera el límite de búsqueda");
      await expect(search(page)).not.toContainText("Todavía no hay grupos");
    });

    await scenario("T24 closing clears the query; T11 Escape restores the trigger", async (page) => {
      const trigger = page.getByRole("button", { name: "Buscar en Paravel" });
      await open(page);
      await field(page).fill("atlas");
      await page.keyboard.press("Escape");
      await expect(search(page)).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await open(page);
      await expect(field(page)).toHaveValue("");
    });

    console.log(JSON.stringify({ mode: "MOCK browser verification", playwright: version, results,
      native: "NOT RUN here; see navigation-native.test.mjs" }, null, 2));
    if (results.some((item) => item.status === "FAIL")) process.exitCode = 1;
  } finally {
    await browser?.close();
    await server.close();
  }
}

async function supervisor() {
  await access(tempRoot);
  const temporary = await mkdtemp(path.join(tempRoot, "navigation-browser-"));
  let child;
  const terminate = () => {
    if (!child || child.exitCode !== null) return;
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", timeout: 10000 });
    else child.kill("SIGKILL");
  };
  const interrupt = () => { process.exitCode = 130; terminate(); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  let timer;
  try {
    child = spawn(process.execPath, [script, "--worker"], { cwd: app, stdio: "inherit",
      env: { ...process.env, TEMP: temporary, TMP: temporary, TMPDIR: temporary } });
    timer = setTimeout(() => { console.error("FAIL MOCK harness exceeded 180 second deadline"); terminate(); }, 180000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    process.exitCode = process.exitCode || code || (code === null ? 1 : 0);
  } finally {
    clearTimeout(timer);
    terminate();
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

await (process.argv.includes("--worker") ? worker() : supervisor());
