import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../src/capture.ts", import.meta.url), "utf8");
const isolated = source.replace('from "react"', `from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)}`)
  .replace('from "./tauri"', `from ${JSON.stringify("data:text/javascript,export function invokeSafe(){throw new Error('Native invoke forbidden in helper unit tests')}")}`);
const { outputText } = ts.transpileModule(isolated, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { candidateOnly, validateCandidate, validateCaptureFrame, parseCaptureUrls } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const candidate = (patch = {}) => ({ itemId: crypto.randomUUID(), kind: "firefox", reference: "https://example.com/fixture", name: "Synthetic name", ...patch });

test("capture parser retains order, query, fragment, and percent encoding with fresh UUIDs", () => {
  const urls = ["https://example.com/a%2Fb?query=1#part", "https://example.com/second"];
  const parsed = parseCaptureUrls(`\r\n ${urls[0]} \r\n\r${urls[1]}\n`);
  assert.deepEqual(parsed.map((item) => item.reference), urls);
  assert.ok(parsed.every((item) => item.kind === "firefox" && item.name === "example.com"));
  assert.ok(parsed.every((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.itemId)));
  assert.equal(new Set([...parsed, ...parseCaptureUrls(urls.join("\n"))].map((item) => item.itemId)).size, 4);
});

test("capture parser preserves duplicate and invalid references for explicit native preview", () => {
  const values = ["https://example.com", "https://example.com", "not-a-url"];
  assert.deepEqual(parseCaptureUrls(values.join("\n")).map((item) => item.reference), values);
  assert.deepEqual(parseCaptureUrls(" \r\n\t"), []);
});

test("capture parser refuses 51 entries rather than silently truncating", () => {
  const urls = Array.from({ length: 50 }, (_, index) => `https://example.com/${index}`);
  assert.equal(parseCaptureUrls(urls.join("\n")).length, 50);
  assert.throws(() => parseCaptureUrls([...urls, "https://example.com/overflow"].join("\n")), /50/);
});

test("candidate transport strips UI flags and receipt fields without changing input", () => {
  const row = { ...candidate(), included: true, duplicatePolicy: "allow", result: { status: "created" } };
  const copy = structuredClone(row);
  assert.deepEqual(Object.keys(candidateOnly(row)), ["itemId", "kind", "reference", "name"]);
  assert.deepEqual(row, copy);
});

test("capture names validate trimmed Unicode scalars at 1 and 80", () => {
  assert.ok(validateCandidate(candidate({ name: "  " })));
  assert.equal(validateCandidate(candidate({ name: `  ${"\u{1F600}".repeat(80)}  ` })), "");
  assert.ok(validateCandidate(candidate({ name: "\u{1F600}".repeat(81) })));
});

test("capture rejects lone surrogates in names, references and pasted input", () => {
  for (const value of ["a\uD800b", "a\uDC00b"]) {
    assert.ok(validateCandidate(candidate({ name: value })));
    assert.ok(validateCandidate(candidate({ reference: value })));
    assert.throws(() => parseCaptureUrls(value), /Unicode/);
  }
});

test("capture reference byte limit is 32 KiB UTF-8, not UTF-16 length", () => {
  assert.equal(validateCandidate(candidate({ reference: "é".repeat(16384) })), "");
  assert.ok(validateCandidate(candidate({ reference: "é".repeat(16385) })));
  assert.ok(validateCandidate(candidate({ reference: " \t " })));
  assert.throws(() => parseCaptureUrls("é".repeat(16385)), /32 KiB/);
});

test("capture frame enforces actual serialized 256 KiB boundary", () => {
  assert.equal(validateCaptureFrame("a".repeat(262142), 50), "");
  assert.ok(validateCaptureFrame("a".repeat(262143), 50));
  assert.ok(validateCaptureFrame({}, 51));
  assert.equal(validateCaptureFrame({ text: "é".repeat(1000) }, 1), "");
});
