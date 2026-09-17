import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixture, installContinuityMock, installCaptureMock } from "./capture-mock.mjs";
import { app, runtime, supervise, reporter, requireCaptureSources } from "./capture-harness.mjs";

const script = fileURLToPath(import.meta.url);
const dialog = (page) => page.getByRole("dialog", { name: "Añadir recursos", exact: true });
const input = (page) => dialog(page).getByLabel("URLs (una por línea)");
const prepare = (page) => dialog(page).getByRole("button", { name: "Vista previa", exact: true });
const addUrls = (page) => dialog(page).getByRole("button", { name: "Preparar enlaces", exact: true }).click();
const commit = (page) => dialog(page).getByRole("button", { name: /^Añadir \d+ recursos$|^Reintentar misma operación$/ });
const enter = (page, name = "Alpha") => page.getByRole("button", { name: new RegExp(`P01 ${name}`) }).first().click();
const open = (page) => page.getByRole("button", { name: "Añadir recursos", exact: true }).first().click();
const state = (page) => page.evaluate(() => window.__CAPTURE_MOCK__.snapshot());
const hold = (page, command, fail = false) => page.evaluate(({ command, fail, spaceId }) => window.__CAPTURE_MOCK__.hold(command, spaceId, fail), { command, fail, spaceId: fixture.spaceA });
const started = (page, token) => page.waitForFunction((token) => window.__CAPTURE_MOCK__.started(token), token);
const release = (page, token) => page.evaluate((token) => window.__CAPTURE_MOCK__.release(token), token);

async function worker() {
  await requireCaptureSources();
  const { chromium, expect, version } = await runtime();
  const { createServer } = await import("vite");
  const server = await createServer({ root: app, cacheDir: path.join(process.env.CAPTURE_TEMP, "vite-cache"), clearScreen: false,
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, open: false } });
  const report = reporter("MOCK browser UI; no native IPC or SQLite");
  let browser;
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true, ...(process.env.CAPTURE_BROWSER_CHANNEL ? { channel: process.env.CAPTURE_BROWSER_CHANNEL } : {}) });
    const scenario = (name, body) => report.scenario(name, async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", acceptDownloads: false });
      const errors = [];
      const blocked = [];
      let page;
      try {
        await context.route("**/*", (route) => {
          if (new URL(route.request().url()).origin === origin) return route.continue();
          blocked.push(route.request().url());
          return route.abort();
        });
        await context.addInitScript(installContinuityMock, fixture);
        await context.addInitScript(installCaptureMock, fixture);
        page = await context.newPage();
        page.setDefaultTimeout(7000);
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30000 });
        await enter(page);
        await body(page);
        const continuity = await page.evaluate(() => window.__CONTINUITY_MOCK__.snapshot());
        const capture = await state(page);
        assert.deepEqual(continuity.unexpected, []);
        assert.deepEqual(capture.unexpected, []);
        assert.deepEqual(blocked, []);
        assert.deepEqual(errors, []);
        assert.equal(continuity.spaces[0].note, "Synthetic note unchanged");
        assert.deepEqual(continuity.spaces[0].pack, [fixture.pieceId]);
        assert.equal(continuity.pieces[0].marked, true);
        assert.equal(continuity.rows.length, 0, "Capture must not save a P01 closure");
        assert.ok(capture.pieces.every((piece) => !piece.marked));
        assert.ok(capture.pieces.every((piece) => piece.spaceId === fixture.spaceA));
      } catch (error) {
        if (page) {
          console.error(`UI DIAGNOSTIC ${name}: ${await page.locator("body").innerText().catch(() => "unavailable")}`);
          console.error(JSON.stringify(await state(page).catch(() => null)));
        }
        throw error;
      } finally { await context.close(); }
    });

    await scenario("P01 unsaved draft survives capture and cancelled navigation", async (page) => {
      await page.locator(".continuity-panel").getByRole("button", { name: "Cerrar sesión de trabajo" }).click();
      const progress = page.getByLabel(/Último avance/);
      await progress.fill("P01 draft alongside P02");
      await open(page);
      await input(page).fill("https://example.com/p01-survives");
      await addUrls(page);
      await prepare(page).click();
      await expect(commit(page)).toBeEnabled();
      await commit(page).click();
      await expect.poll(async () => (await state(page)).pieces.length).toBe(1);
      if (await dialog(page).isVisible()) await dialog(page).getByRole("button", { name: /Cerrar|Listo|Hecho/i }).last().click();
      await expect(progress).toHaveValue("P01 draft alongside P02");
      page.once("dialog", (prompt) => prompt.dismiss());
      await enter(page, "Beta");
      await expect(progress).toHaveValue("P01 draft alongside P02");
      page.once("dialog", (prompt) => prompt.accept());
      await enter(page, "Beta");
      await expect(page.getByRole("heading", { name: "P01 Beta" })).toBeVisible();
      assert.equal((await page.evaluate(() => window.__CONTINUITY_MOCK__.snapshot())).calls.filter((call) => call.command === "save_closure").length, 0);
    });

    await scenario("dirty capture escape cancel preserves candidates; confirmed discard writes nothing", async (page) => {
      await open(page);
      await input(page).fill("https://example.com/unsaved-capture");
      page.once("dialog", (prompt) => prompt.dismiss());
      await page.keyboard.press("Escape");
      await expect(dialog(page)).toBeVisible();
      await expect(input(page)).toHaveValue("https://example.com/unsaved-capture");
      page.once("dialog", (prompt) => prompt.accept());
      await page.keyboard.press("Escape");
      await expect(dialog(page)).not.toBeVisible();
      await enter(page, "Beta");
      await expect(page.getByRole("heading", { name: "P01 Beta" })).toBeVisible();
      const snapshot = await state(page);
      assert.equal(snapshot.pieces.length, 0);
      assert.equal(snapshot.calls.filter((call) => call.command === "commit_capture").length, 0);
    });

    await scenario("stale preview cannot approve edited capture candidates", async (page) => {
      await open(page);
      await input(page).fill("https://example.com/old-preview");
      await addUrls(page);
      const pending = await hold(page, "preview_capture");
      await prepare(page).click();
      await started(page, pending);
      const reference = dialog(page).getByLabel("Referencia (URL o ruta nativa)");
      await expect(reference).toBeDisabled();
      await expect(commit(page)).toBeDisabled();
      await release(page, pending);
      await expect(reference).toBeEnabled();
      await reference.fill("https://example.com/new-preview");
      await expect(commit(page)).toBeDisabled();
      await prepare(page).click();
      await expect(commit(page)).toBeEnabled();
      await commit(page).click();
      await expect.poll(async () => (await state(page)).pieces.length).toBe(1);
      const saved = await state(page);
      const commits = saved.calls.filter((call) => call.command === "commit_capture");
      assert.equal(commits.length, 1);
      assert.deepEqual(commits[0].args.input.items.map((item) => item.reference), ["https://example.com/new-preview"]);
    });

    await scenario("pending preview blocks close and destination edits; completed preview invalidates on mesa change", async (page) => {
      await open(page);
      await input(page).fill("https://example.com/late-alpha");
      await addUrls(page);
      const pending = await hold(page, "preview_capture");
      await prepare(page).click();
      await started(page, pending);
      await page.keyboard.press("Escape");
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page).getByRole("alert")).toContainText("Espera a que termine");
      const destination = dialog(page).getByLabel("Mesa / espacio");
      await expect(destination).toBeDisabled();
      await release(page, pending);
      await expect(destination).toBeEnabled();
      await expect(commit(page)).toBeEnabled();
      await destination.selectOption(fixture.spaceB);
      await expect(commit(page)).toBeDisabled();
      await prepare(page).click();
      await expect(commit(page)).toBeEnabled();
      const previews = (await state(page)).calls.filter((call) => call.command === "preview_capture");
      assert.deepEqual(previews.map((call) => call.args.input.spaceId), [fixture.spaceA, fixture.spaceB]);
      assert.equal((await state(page)).calls.filter((call) => call.command === "commit_capture").length, 0);
    });

    await scenario("commit retry keeps operation UUID and suppresses double-submit", async (page) => {
      await open(page);
      await input(page).fill("https://example.com/retry-capture");
      await addUrls(page);
      await prepare(page).click();
      await expect(commit(page)).toBeEnabled();
      const failed = await hold(page, "commit_capture", true);
      await commit(page).click();
      await started(page, failed);
      await expect(commit(page)).toBeDisabled();
      await release(page, failed);
      await expect(dialog(page).getByRole("alert")).toBeVisible();
      const pending = await hold(page, "commit_capture");
      await commit(page).click();
      await started(page, pending);
      await commit(page).evaluate((button) => { button.click(); button.click(); });
      await release(page, pending);
      await expect.poll(async () => (await state(page)).pieces.length).toBe(1);
      const calls = (await state(page)).calls.filter((call) => call.command === "commit_capture");
      assert.equal(calls.length, 2);
      assert.deepEqual(calls[0].args.input, calls[1].args.input);
    });
  } finally {
    await browser?.close();
    await server.close();
    report.finish({ playwright: version, native: "Not covered by this mock suite; run capture-native.test.mjs", explorerDrag: "NOT TESTED" });
  }
}

await (process.argv.includes("--worker") ? worker() : supervise(script, "ui"));
