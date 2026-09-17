import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixture, installContinuityMock } from "./continuity-mock.mjs";

const script = fileURLToPath(import.meta.url);
const app = path.resolve(path.dirname(script), "..");
const tempRoot = process.env.PARAVEL_TEST_TEMP ?? os.tmpdir();

async function runtime() {
  const require = createRequire(import.meta.url);
  const candidates = [process.env.CONTINUITY_PLAYWRIGHT];
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
  throw new Error("Playwright unavailable. Set CONTINUITY_PLAYWRIGHT to an installed playwright package directory; no package.json changes needed.");
}

async function worker() {
  const { chromium, expect, version } = await runtime();
  const { createServer } = await import("vite");
  const server = await createServer({ root: app, cacheDir: path.join(process.env.TEMP, "vite-cache"),
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
        await context.addInitScript(installContinuityMock, fixture);
        page = await context.newPage();
        page.setDefaultTimeout(7000);
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(origin, { timeout: 45000, waitUntil: "domcontentloaded" });
        await expect(page.getByRole("button", { name: /P01 Alpha/ })).toBeVisible();
        await body(page);
        const snapshot = await page.evaluate(() => window.__CONTINUITY_MOCK__.snapshot());
        assert.deepEqual(snapshot.unexpected, [], "No launch, pack, marking or unknown invoke allowed");
        assert.deepEqual(blocked, [], "No external requests allowed");
        assert.deepEqual(errors, [], "No browser runtime errors");
        assert.equal(snapshot.spaces[0].note, "Synthetic note unchanged");
        assert.deepEqual(snapshot.spaces[0].pack, [fixture.pieceId]);
        assert.equal(snapshot.pieces[0].marked, true);
        results.push({ name, status: "PASS", coverage: "browser UI + MOCK invoke" });
        console.log(`PASS MOCK ${name}`);
      } catch (error) {
        results.push({ name, status: "FAIL", error: String(error.message).slice(0, 1800), coverage: "browser UI + MOCK invoke" });
        console.error(`FAIL MOCK ${name}: ${String(error.message).slice(0, 1800)}`);
        try {
          const dump = path.join(tempRoot, `continuity-failure-${Date.now()}-${name.replace(/\W+/g, "-").slice(0, 40)}`);
          await page.screenshot({ path: `${dump}.png`, fullPage: true });
          const html = await panel(page).evaluate((element) => element.outerHTML).catch(() => "(panel not mounted)");
          const mock = await page.evaluate(() => JSON.stringify(window.__CONTINUITY_MOCK__.snapshot())).catch(() => "(mock unavailable)");
          console.error(`DIAGNOSTIC ${name}: ${dump}.png\nPANEL: ${html.slice(0, 3000)}\nMOCK: ${mock.slice(0, 2000)}`);
        } catch (diagnosticError) { console.error(`DIAGNOSTIC unavailable: ${diagnosticError}`); }
      } finally { await context.close(); }
    }
    const enter = (page, name = "Alpha") => page.getByRole("button", { name: new RegExp(`P01 ${name}`) }).first().click();
    const panel = (page) => page.locator(".continuity-panel");
    const progress = (page) => page.getByLabel(/Último avance/);
    const newClosure = async (page) => { await panel(page).getByRole("button", { name: "Cerrar sesión de trabajo" }).click(); };
    const submit = (page) => page.locator(".continuity-form").getByRole("button", { name: /Guardar cierre|Guardar cambios/ });
    const hold = (page, command, spaceId, fail = false) => page.evaluate(({ command, spaceId, fail }) => window.__CONTINUITY_MOCK__.hold(command, spaceId, fail), { command, spaceId, fail });
    const started = (page, token) => page.waitForFunction((token) => window.__CONTINUITY_MOCK__.started(token), token);
    const release = (page, token) => page.evaluate((token) => window.__CONTINUITY_MOCK__.release(token), token);
    const state = (page) => page.evaluate(() => window.__CONTINUITY_MOCK__.snapshot());

    if (process.argv.includes("--inspect")) {
      await scenario("inspect actual synthetic continuity DOM", async (page) => {
        await page.evaluate((id) => window.__CONTINUITY_MOCK__.seed(id, 23), fixture.spaceA);
        await enter(page);
        await expect(panel(page)).toContainText("Synthetic progress 23");
        console.log(await panel(page).evaluate((element) => element.outerHTML));
        await panel(page).getByRole("button", { name: "Ver historial de cierres", exact: true }).click();
        await newClosure(page);
        console.log(await panel(page).evaluate((element) => element.outerHTML));
      });
      if (results.some((item) => item.status === "FAIL")) process.exitCode = 1;
      return;
    }

    await scenario("empty, required input, save failure, explicit retry, stable UUID and double-submit", async (page) => {
      await enter(page);
      await newClosure(page);
      for (const [label, limit] of [[/Objetivo/, 500], [/Último avance/, 4000], [/Siguiente acción/, 2000], [/Bloqueo/, 2000]]) {
        await page.getByLabel(label).fill("x".repeat(limit + 1));
        await submit(page).click();
        await expect(page.getByLabel(label)).toHaveAttribute("aria-invalid", "true");
        await page.getByLabel(label).fill("");
      }
      await submit(page).click();
      assert.equal((await state(page)).calls.filter((item) => item.command === "save_closure").length, 0);
      await progress(page).fill("Synthetic completed work");
      const failure = await hold(page, "save_closure", fixture.spaceA, true);
      await submit(page).click();
      await started(page, failure);
      await expect(page.locator(".continuity-form").getByRole("button", { name: /Guardando/ })).toBeDisabled();
      assert.equal((await state(page)).rows.length, 0);
      await release(page, failure);
      await expect(page.getByRole("alert").filter({ hasText: /No se pudo completar la operación del historial local/ })).toBeVisible();
      await expect(page.getByRole("alert").filter({ hasText: /Fallo sintético|DATABASE/ })).toHaveCount(0);
      await expect(progress(page)).toHaveValue("Synthetic completed work");
      const success = await hold(page, "save_closure", fixture.spaceA);
      await submit(page).click();
      await started(page, success);
      await page.locator(".continuity-form").evaluate((form) => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await release(page, success);
      await expect(page.locator(".continuity-form")).toHaveCount(0);
      await expect(panel(page)).toContainText("Synthetic completed work");
      const saved = await state(page);
      const calls = saved.calls.filter((item) => item.command === "save_closure");
      assert.equal(calls.length, 2);
      assert.equal(calls[0].args.input.id, calls[1].args.input.id);
      assert.equal(saved.rows.length, 1);
      assert.equal(saved.rows[0].nextAction, "");
      await enter(page, "Beta");
      await expect(panel(page)).not.toContainText("Synthetic completed work");
      await enter(page);
      await expect(panel(page)).toContainText("Synthetic completed work");
    });

    await scenario("dirty navigation cancel preserves draft; confirmed discard does not save", async (page) => {
      await enter(page);
      await newClosure(page);
      await progress(page).fill("Synthetic unsaved draft");
      page.once("dialog", (dialog) => dialog.dismiss());
      await enter(page, "Beta");
      await expect(progress(page)).toHaveValue("Synthetic unsaved draft");
      page.once("dialog", (dialog) => dialog.accept());
      await enter(page, "Beta");
      await expect(page.getByRole("heading", { name: "P01 Beta" })).toBeVisible();
      assert.equal((await state(page)).calls.filter((item) => item.command === "save_closure").length, 0);
      await enter(page);
      await newClosure(page);
      await expect(progress(page)).toHaveValue("");
    });

    await scenario("delayed cross-space list response cannot replace active space", async (page) => {
      await page.evaluate((ids) => { window.__CONTINUITY_MOCK__.seed(ids.spaceA, 1); }, fixture);
      const pending = await hold(page, "list_closures", fixture.spaceA);
      await enter(page);
      await started(page, pending);
      await enter(page, "Beta");
      await expect(page.getByRole("heading", { name: "P01 Beta" })).toBeVisible();
      await release(page, pending);
      await expect(panel(page)).not.toContainText("Synthetic progress 1");
      await newClosure(page);
      await progress(page).fill("Synthetic Beta work");
      await submit(page).click();
      await expect(panel(page)).toContainText("Synthetic Beta work");
      const saves = (await state(page)).calls.filter((item) => item.command === "save_closure");
      assert.equal(saves.length, 1);
      assert.equal(saves[0].args.input.spaceId, fixture.spaceB);
    });

    await scenario("history pagination, explicit edit and confirmed delete", async (page) => {
      await page.evaluate((id) => window.__CONTINUITY_MOCK__.seed(id, 23), fixture.spaceA);
      await enter(page);
      await expect(panel(page)).toContainText("Synthetic progress 23");
      await panel(page).getByRole("button", { name: /historial de cierres/i }).click();
      const history = page.getByRole("region", { name: "Historial de cierres", exact: true });
      await history.getByRole("button", { name: /Cargar más|Ver más/ }).click();
      await expect(history).toContainText("Synthetic progress 1");
      const before = await state(page);
      assert.ok(before.calls.some((item) => item.command === "list_closures" && item.args.cursor));
      const oldest = before.rows.find((item) => item.progress === "Synthetic progress 1");
      const entry = history.locator("li").filter({ hasText: "Synthetic progress 1" }).last();
      await entry.getByRole("button", { name: /Editar/ }).click();
      await progress(page).fill("Synthetic corrected oldest");
      await submit(page).click();
      await expect(panel(page)).toContainText("Synthetic progress 23");
      const updated = (await state(page)).rows.find((item) => item.id === oldest.id);
      assert.equal(updated.createdAt, oldest.createdAt);
      assert.equal(updated.revision, oldest.revision + 1);
      assert.ok(updated.updatedAt > oldest.updatedAt);
      if (!(await history.count())) await panel(page).getByRole("button", { name: /historial de cierres/i }).click();
      const latestEntry = history.locator("li").filter({ hasText: "Synthetic progress 23" });
      page.once("dialog", (dialog) => dialog.dismiss());
      await latestEntry.getByRole("button", { name: /Eliminar/ }).click();
      assert.equal((await state(page)).rows.length, 23);
      page.once("dialog", (dialog) => dialog.accept());
      await latestEntry.getByRole("button", { name: /Eliminar/ }).click();
      await expect(panel(page)).toContainText("Synthetic progress 22");
      assert.equal((await state(page)).rows.length, 22);
    });
    console.log(JSON.stringify({ mode: "MOCK browser verification", playwright: version, results,
      native: "NOT RUN: requires isolated DB path and disabled native launch hooks; mocks are not native E2E" }, null, 2));
    if (results.some((item) => item.status === "FAIL")) process.exitCode = 1;
  } finally {
    await browser?.close();
    await server.close();
  }
}

async function supervisor() {
  await access(tempRoot);
  const temporary = await mkdtemp(path.join(tempRoot, "continuity-browser-"));
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
