import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const privateMarker = "P03_PRIVATE_SENTINEL_6f591e";
export const fixtureUrl = "https://example.com/p03-fixture?source=native#reference";
export const webPiece = (name = "P03 inert web reference", url = fixtureUrl) => ({ kind: "firefox", name, payload: { urls: [url] } });

export function templateInput(template, groupId, name, overrides = {}) {
  return {
    requestId: randomUUID(), templateId: template.templateId, templateRevision: template.revision,
    schemaVersion: 1, groupId, name, fields: {},
    slots: template.slots.map(({ key }) => ({ key, omitted: false, piece: null })),
    ...overrides,
  };
}

export function validateCatalog(catalog) {
  assert.equal(catalog.length, 3);
  assert.deepEqual(catalog.map(({ name }) => name).sort(), ["Cliente", "Desarrollo", "Investigación"].sort());
  assert.equal(new Set(catalog.map(({ templateId }) => templateId)).size, 3);
  for (const template of catalog) {
    assert.equal(template.schemaVersion, 1);
    assert.equal(template.revision, 1);
    assert.ok(template.templateId && template.description);
    assert.equal(template.fields.length, 2);
    assert.equal(template.slots.length, 2);
    assert.equal(new Set(template.fields.map(({ key }) => key)).size, 2);
    assert.equal(new Set(template.slots.map(({ key }) => key)).size, 2);
    for (const field of template.fields) assert.ok(field.key && field.label && field.hint);
    for (const slot of template.slots) {
      assert.ok(slot.key && slot.label && slot.kinds.length);
      for (const kind of slot.kinds) assert.ok(["vscode", "cursor", "folder", "file", "firefox", "firefox-group"].includes(kind));
    }
    assert.ok(template.slots.some(({ kinds }) => kinds.includes("firefox")));
  }
}

export function assertPreparation(preparation, template, spaceId) {
  assert.equal(preparation.spaceId, spaceId);
  assert.equal(preparation.template.templateId, template.templateId);
  assert.equal(preparation.template.revision, template.revision);
  assert.equal(preparation.template.schemaVersion, 1);
  assert.ok(Number.isInteger(preparation.revision) && preparation.revision > 0);
  assert.equal(typeof preparation.hidden, "boolean");
  assert.equal(preparation.slots.length, template.slots.length);
  assert.deepEqual(preparation.slots.map(({ key }) => key), template.slots.map(({ key }) => key));
  assert.equal(new Set(preparation.slots.map(({ id }) => id)).size, template.slots.length);
  for (const [index, slot] of preparation.slots.entries()) {
    assert.match(slot.id, /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
    assert.equal(slot.label, template.slots[index].label);
    assert.deepEqual(slot.kinds, template.slots[index].kinds);
    assert.equal(slot.order, index);
    assert.ok(Number.isInteger(slot.revision) && slot.revision > 0);
    assert.equal(typeof slot.omitted, "boolean");
    assert.ok(!(slot.omitted && slot.pieceId));
  }
}

export async function runContractSuite(h) {
  const { invoke, rows, snapshot, scenario, groupId } = h;
  const catalog = await invoke("list_space_templates");
  validateCatalog(catalog);
  const saved = [];
  const get = (spaceId) => invoke("get_space_preparation", { spaceId });
  const create = (input) => invoke("create_space_from_template", { input });
  const preview = (input) => invoke("preview_space_template", { input });
  const rejectUnchanged = async (command, input, codes) => {
    const before = await snapshot();
    let rejected;
    try { await invoke(command, { input }); } catch (error) { rejected = error; }
    assert.ok(rejected, `${command} must reject`);
    assert.ok(codes.includes(rejected.code), `Expected ${codes.join("/")}, got ${JSON.stringify(rejected)}`);
    assert.equal(typeof rejected.message, "string");
    assert.ok(rejected.message.length > 0);
    assert.ok(!JSON.stringify(rejected).includes(privateMarker), "Errors cannot echo private field values");
    assert.doesNotMatch(rejected.message, /INSERT INTO|SELECT .* FROM|sqlite|constraint failed|P03_FORCED_ROLLBACK/i);
    assert.deepEqual(await snapshot(), before, "Rejected command must not change any fixture table");
  };

  await scenario("A01/A03 catalog, optional values, preview read-only and independent IDs for all three templates", async () => {
    const ids = new Set();
    for (const template of catalog) {
      const input = templateInput(template, groupId, `P03 API ${template.name}`);
      const before = await snapshot();
      const plan = await preview(input);
      assert.equal(plan.name, input.name);
      assert.equal(plan.groupId, groupId);
      assert.equal(plan.template.templateId, template.templateId);
      assert.equal(plan.slots.length, template.slots.length);
      assert.ok(Object.values(plan.fields).every((value) => value === ""));
      assert.deepEqual(await snapshot(), before);
      const result = await create(input);
      assertPreparation(result.preparation, template, result.space.id);
      assert.equal(result.space.name, input.name);
      assert.equal(result.preparation.hidden, false);
      assert.ok(Object.values(result.preparation.fields).every((value) => value === ""));
      assert.ok(result.preparation.slots.every((slot) => slot.pieceId === null && slot.omitted === false));
      assert.deepEqual(await rows("SELECT * FROM pieza WHERE espacio_id=?", [result.space.id]), []);
      for (const id of [result.space.id, ...result.preparation.slots.map((slot) => slot.id)]) {
        assert.ok(!ids.has(id), "All materialized IDs must be fresh");
        ids.add(id);
      }
      assert.deepEqual(await get(result.space.id), result.preparation);
      saved.push({ input, result });
    }
    const second = await create(templateInput(catalog[0], groupId, "P03 independent instance"));
    assert.notEqual(second.space.id, saved[0].result.space.id);
    for (const slot of second.preparation.slots) assert.ok(!ids.has(slot.id));
    h.independent = second;
  });

  await scenario("A02/A09/A10/A11 web resources, omissions, concurrent replay and immutable creation receipt", async () => {
    const template = catalog.find((item) => item.name === "Desarrollo");
    const input = templateInput(template, groupId, "P03 persisted resource", {
      fields: Object.fromEntries(template.fields.map(({ key }, index) => [key, `${privateMarker}_${index}`])),
      slots: template.slots.map(({ key, kinds }) => ({ key, omitted: !kinds.includes("firefox"), piece: kinds.includes("firefox") ? webPiece() : null })),
    });
    const before = await snapshot();
    const plan = await preview(input);
    assert.equal(plan.name, input.name);
    assert.deepEqual(plan.fields, input.fields);
    assert.deepEqual(await snapshot(), before);
    const concurrent = await Promise.allSettled([create(input), create(structuredClone(input))]);
    const completed = [];
    for (const result of concurrent) {
      if (result.status === "fulfilled") completed.push(result.value);
      else {
        assert.equal(result.reason.code, "DB_BUSY", "Concurrent creation may only require a same-intent busy retry");
        completed.push(await create(structuredClone(input)));
      }
    }
    const [first, second] = completed;
    assert.deepEqual(second, first);
    assertPreparation(first.preparation, template, first.space.id);
    const pieces = await rows("SELECT * FROM pieza WHERE espacio_id=? ORDER BY orden", [first.space.id]);
    assert.equal(pieces.length, 1);
    assert.equal(pieces[0].marcada, 0);
    assert.equal(pieces[0].orden, 0);
    assert.deepEqual(JSON.parse(pieces[0].payload), webPiece().payload);
    assert.equal(first.preparation.slots.find((slot) => slot.pieceId).pieceId, pieces[0].id);
    assert.equal(first.preparation.slots.filter((slot) => slot.omitted).length, 1);
    assert.equal((await rows("SELECT * FROM espacio WHERE nombre=?", [input.name])).length, 1);
    const receipt = await snapshot();
    assert.deepEqual(await create(input), first);
    assert.deepEqual(await snapshot(), receipt, "Replay preserves timestamps and all persisted rows");
    await rejectUnchanged("create_space_from_template", { ...input, name: "Changed replay intention" }, ["REQUEST_CONFLICT"]);
    h.persisted = { input, result: first };
  });

  await scenario("A05/A06/A07 invalid version, keys, destination, payload and mixed slots leave no partial rows", async () => {
    const template = catalog[0];
    const base = () => templateInput(template, groupId, "P03 must never exist");
    const invalid = [
      [{ ...base(), templateId: "not-a-template" }, ["TEMPLATE_NOT_FOUND"]],
      [{ ...base(), templateRevision: 999 }, ["TEMPLATE_VERSION_UNSUPPORTED"]],
      [{ ...base(), schemaVersion: 2 }, ["TEMPLATE_VERSION_UNSUPPORTED"]],
      [{ ...base(), groupId: randomUUID() }, ["GROUP_NOT_FOUND"]],
      [{ ...base(), name: "   " }, ["INVALID_FIELD"]],
      [{ ...base(), fields: { unexpected: privateMarker } }, ["INVALID_FIELD"]],
      [{ ...base(), fields: { [template.fields[0].key]: "x".repeat(1001) } }, ["INVALID_FIELD"]],
      [{ ...base(), slots: [{ key: "unknown", omitted: false, piece: null }] }, ["INVALID_FIELD"]],
    ];
    for (const [input, codes] of invalid) {
      await rejectUnchanged("preview_space_template", input, codes);
      await rejectUnchanged("create_space_from_template", input, codes);
    }
    for (const template of catalog) {
      const slots = template.slots.map(({ key, kinds }) => ({ key, omitted: false,
        piece: kinds.includes("firefox") ? webPiece() : { kind: "file", name: "Invalid resource", payload: { path: "relative-does-not-exist" } } }));
      const bad = templateInput(template, groupId, "P03 invalid mixed resources", { slots });
      await rejectUnchanged("create_space_from_template", bad, ["INVALID_PIECE"]);
      const webSlot = template.slots.find(({ kinds }) => kinds.includes("firefox"));
      for (const piece of [webPiece("Invalid URL", "not-a-url"), { kind: "unknown-kind", name: "Invalid kind", payload: {} }]) {
        const input = templateInput(template, groupId, "P03 invalid piece");
        input.slots.find(({ key }) => key === webSlot.key).piece = piece;
        await rejectUnchanged("preview_space_template", input, ["INVALID_PIECE"]);
        await rejectUnchanged("create_space_from_template", input, ["INVALID_PIECE"]);
      }
    }
  });

  await scenario("A08 forced SQLite failure after space insertion rolls back the whole materialization", async () => {
    const template = catalog[0];
    const input = templateInput(template, groupId, "P03 atomic rollback");
    input.slots.find(({ key }) => template.slots.find((slot) => slot.key === key).kinds.includes("firefox")).piece = webPiece();
    await h.withRollbackTrigger(async () => {
      await rejectUnchanged("create_space_from_template", input, ["STORAGE_ERROR"]);
    });
    const retry = await create(input);
    assert.equal(retry.space.name, input.name, "Failed transaction must not reserve its request ID");
  });

  await scenario("A04/A13/A14/A15/A17/A18 edit, CAS, resolve replay, omit and hide preserve unrelated instances", async () => {
    assert.ok(saved.length === 3 && h.persisted && h.independent);
    const { result, input } = h.persisted;
    const unrelated = await get(h.independent.space.id);
    let preparation = await get(result.space.id);
    const old = structuredClone(preparation);
    const edit = { spaceId: result.space.id, expectedRevision: preparation.revision,
      fields: { ...preparation.fields, [Object.keys(preparation.fields)[0]]: `${privateMarker}_edited` }, hidden: true };
    preparation = await invoke("update_space_preparation", { input: edit });
    assert.equal(preparation.revision, old.revision + 1);
    assert.equal(preparation.hidden, true);
    assert.deepEqual(preparation.fields, edit.fields);
    await rejectUnchanged("update_space_preparation", { ...edit, hidden: false }, ["REVISION_CONFLICT"]);
    const stable = await snapshot();
    const replay = await create(input);
    assert.equal(replay.space.id, result.space.id);
    assert.deepEqual(replay.preparation, preparation, "Creation replay cannot restore initial editable fields");
    assert.deepEqual(await snapshot(), stable);
    assert.deepEqual(await get(h.independent.space.id), unrelated);

    const target = saved.find(({ result }) => result.preparation.slots.some(({ kinds }) => kinds.includes("firefox"))).result;
    const slot = target.preparation.slots.find(({ kinds }) => kinds.includes("firefox"));
    const resolve = { spaceId: target.space.id, slotId: slot.id, expectedRevision: slot.revision, omitted: false, piece: webPiece("Resolved later") };
    await rejectUnchanged("resolve_preparation_slot", { ...resolve, piece: webPiece("Invalid later resource", "not-a-url") }, ["INVALID_PIECE"]);
    await h.withRollbackTrigger(async () => {
      await rejectUnchanged("resolve_preparation_slot", resolve, ["STORAGE_ERROR"]);
    });
    const resolved = await invoke("resolve_preparation_slot", { input: resolve });
    const pieceId = resolved.slots.find(({ id }) => id === slot.id).pieceId;
    assert.ok(pieceId);
    assert.equal((await rows("SELECT * FROM pieza WHERE espacio_id=?", [target.space.id])).length, 1);
    const after = await snapshot();
    assert.deepEqual(await invoke("resolve_preparation_slot", { input: resolve }), resolved);
    assert.deepEqual(await snapshot(), after);
    await rejectUnchanged("resolve_preparation_slot", { ...resolve, piece: webPiece("Conflicting resource") }, ["SLOT_STATE_CONFLICT", "REVISION_CONFLICT"]);
    await rejectUnchanged("resolve_preparation_slot", { ...resolve, spaceId: h.independent.space.id }, ["SLOT_STATE_CONFLICT", "INVALID_FIELD"]);
    const pending = resolved.slots.find(({ pieceId }) => !pieceId);
    const omitted = await invoke("resolve_preparation_slot", { input: { spaceId: target.space.id, slotId: pending.id,
      expectedRevision: pending.revision, omitted: true, piece: null } });
    assert.equal(omitted.slots.find(({ id }) => id === pending.id).omitted, true);
    assert.ok((await rows("SELECT * FROM pieza WHERE id=?", [pieceId])).length === 1);
    h.resolved = { spaceId: target.space.id, slotId: slot.id, pieceId };
    h.persisted.preparation = await get(result.space.id);
  });

  await scenario("A16 deleting a linked piece reopens only its suggestion without recreating a resource", async () => {
    assert.ok(h.resolved);
    const { spaceId, slotId, pieceId } = h.resolved;
    await invoke("delete_piece", { id: pieceId });
    const preparation = await get(spaceId);
    const slot = preparation.slots.find(({ id }) => id === slotId);
    assert.equal(slot.pieceId, null);
    assert.equal(slot.omitted, false);
    assert.deepEqual(await rows("SELECT * FROM pieza WHERE id=?", [pieceId]), []);
    assert.ok(preparation.slots.some((item) => item.id !== slotId && item.omitted));
  });

  await scenario("A21 MCP uses the actual read-only stdio reader and excludes preparation sentinels", async () => {
    assert.ok(h.persisted);
    const { result } = h.persisted;
    const pieceId = (await rows("SELECT id FROM pieza WHERE espacio_id=?", [result.space.id]))[0].id;
    const before = await snapshot();
    const exposed = await h.readMcp(result.space.id, pieceId);
    assert.deepEqual(exposed.tools.map(({ name }) => name).sort(), ["leer_contexto_pieza", "leer_espacio", "listar_piezas"]);
    assert.ok(!JSON.stringify(exposed).includes(privateMarker));
    assert.equal(exposed.space.id, result.space.id);
    assert.ok(exposed.space.nota === null || exposed.space.nota === "");
    assert.equal(exposed.space.piezas_compartidas, 0);
    assert.deepEqual(exposed.pieces.piezas, []);
    assert.equal(exposed.pieceError, true, "Unpacked template piece must not be readable through MCP");
    assert.deepEqual(await snapshot(), before, "MCP reader must not mutate the fixture");
    assert.deepEqual(await h.readMcp(h.legacySpaceId, h.legacyPieceId), h.legacyMcp);
  });

  return { catalog, saved };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { test } = await import("node:test");
  const template = { templateId: "development", revision: 1, slots: [{ key: "working" }, { key: "reference" }] };
  test("fixture inputs get new request IDs and do not manufacture optional resources", () => {
    const first = templateInput(template, "fixture-group", "Fixture");
    const second = templateInput(template, "fixture-group", "Fixture");
    assert.notEqual(first.requestId, second.requestId);
    assert.deepEqual(first.fields, {});
    assert.deepEqual(first.slots, [{ key: "working", omitted: false, piece: null }, { key: "reference", omitted: false, piece: null }]);
    first.slots[0].omitted = true;
    assert.equal(second.slots[0].omitted, false);
  });
  test("web fixture is an inert payload with independent nested values", () => {
    const first = webPiece();
    first.payload.urls.push("https://example.com/another");
    assert.deepEqual(webPiece().payload.urls, [fixtureUrl]);
  });
}
