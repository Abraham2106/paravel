import assert from "node:assert/strict";
import { test } from "node:test";
import { validateClosure, trimClosure, orderClosures, sameClosureFields, closureError } from "../src/continuity.ts";

const fields = (progress = "Avance sintético", overrides = {}) => ({
  objective: "Objetivo sintético", progress, nextAction: "Siguiente acción sintética", blocker: "", ...overrides,
});

test("progress is mandatory after trimming", () => {
  assert.equal(validateClosure(fields("   ")).progress, "Escribe el último avance, aunque el trabajo haya terminado.");
  assert.ok(!validateClosure(fields()).progress);
});

test("field limits match contract 500/4000/2000/2000", () => {
  const limits = { objective: 500, progress: 4000, nextAction: 2000, blocker: 2000 };
  for (const [key, limit] of Object.entries(limits)) {
    assert.ok(!validateClosure(fields("x", { [key]: "a".repeat(limit) }))[key]);
    assert.ok(validateClosure(fields("x", { [key]: "a".repeat(limit + 1) }))[key]);
  }
});

test("trim is applied before limit checks and storage", () => {
  const padded = fields("x".repeat(4000 - 2), { progress: `  ${"x".repeat(3998)}  ` });
  assert.ok(!validateClosure(padded).progress);
  assert.equal(trimClosure(padded).progress.length, 3998);
});

test("lone surrogates are rejected before persistence", () => {
  assert.ok(validateClosure(fields("a\uDC00b")).progress);
  assert.ok(validateClosure(fields("a\uD83Cb")).progress);
  assert.ok(!validateClosure(fields("a\u{1F600}b")).progress);
});

test("maximum field sizes stay under the 32 KiB total byte cap", () => {
  const maximal = fields("x".repeat(4000), { objective: "y".repeat(500), nextAction: "z".repeat(2000), blocker: "w".repeat(2000) });
  const errors = validateClosure(maximal);
  assert.ok(!errors.total);
  assert.deepEqual(Object.keys(errors), []);
});

test("orderClosures breaks createdAt ties deterministically by descending id", () => {
  const items = [
    { id: "b", createdAt: 200, updatedAt: 200, revision: 1 },
    { id: "a", createdAt: 200, updatedAt: 200, revision: 1 },
    { id: "c", createdAt: 300, updatedAt: 300, revision: 1 },
  ];
  assert.deepEqual(orderClosures(items).map((item) => item.id), ["c", "b", "a"]);
  assert.notEqual(orderClosures(items), items);
  assert.deepEqual(orderClosures(items), orderClosures([...items].reverse()));
});
