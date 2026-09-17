import assert from "node:assert/strict";
import { test } from "node:test";
import { reservePort } from "./capture-harness.mjs";

test("capture CDP reservation is loopback, dynamic and exclusive while held", async () => {
  const first = await reservePort();
  try {
    assert.ok(first.port > 0);
    await assert.rejects(reservePort(first.port), { code: "EADDRINUSE" });
    const other = await reservePort();
    try { assert.notEqual(first.port, other.port); }
    finally { await other.release(); }
  } finally { await first.release(); }
});

test("capture CDP reservation releases only its own port", async () => {
  const first = await reservePort();
  const port = first.port;
  await first.release();
  const reclaimed = await reservePort(port);
  try { assert.equal(reclaimed.port, port); }
  finally { await reclaimed.release(); }
});
