import { fixture, installContinuityMock } from "./continuity-mock.mjs";

export { fixture, installContinuityMock };

export function installCaptureMock(ids) {
  const original = window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
  const copy = (value) => structuredClone(value);
  const calls = [];
  const gates = [];
  const receipts = new Map();
  const pieces = [];
  const unexpected = [];
  const callbacks = new Map();
  let callbackId = 0;
  const error = { code: "INVALID_REFERENCE", message: "Referencia sintética inválida." };
  function preview(input) {
    const seen = new Set();
    return { items: input.items.map((item) => {
      const duplicatePieceIds = [...window.__CONTINUITY_MOCK__.snapshot().pieces, ...pieces]
        .filter((piece) => piece.spaceId === input.spaceId && piece.kind === item.kind &&
          (piece.payload?.urls?.includes(item.reference) || piece.payload?.path === item.reference)).map((piece) => piece.id);
      const duplicate = seen.has(`${item.kind}:${item.reference}`) || duplicatePieceIds.length > 0;
      seen.add(`${item.kind}:${item.reference}`);
      const valid = item.name.trim() && [...item.name.trim()].length <= 80 &&
        (item.kind !== "firefox" || /^https?:\/\/[^\s]+$/.test(item.reference));
      return { itemId: item.itemId, status: valid ? duplicate ? "duplicate" : "ready" : "invalid",
        normalizedName: item.name.trim(), duplicatePieceIds, ...(valid ? {} : { error }) };
    }) };
  }
  window.__CAPTURE_MOCK__ = {
    hold(command, spaceId, fail = false) {
      const token = crypto.randomUUID();
      gates.push({ token, command, spaceId, fail, started: false, released: false });
      return token;
    },
    started(token) { return Boolean(gates.find((gate) => gate.token === token)?.started); },
    release(token) {
      const gate = gates.find((gate) => gate.token === token);
      if (!gate?.started) throw new Error("Capture mock gate not started");
      gate.release();
    },
    snapshot() { return copy({ calls, pieces, unexpected, gates: gates.map(({ token, started, released }) => ({ token, started, released })) }); },
  };
  window.__TAURI_INTERNALS__.transformCallback = (callback, once = false) => {
    const id = ++callbackId;
    callbacks.set(id, (value) => { if (once) callbacks.delete(id); callback(value); });
    return id;
  };
  window.__TAURI_INTERNALS__.unregisterCallback = (id) => callbacks.delete(id);
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__.metadata = { currentWindow: { label: "main" }, currentWebview: { label: "main" } };
  window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === "plugin:event|listen") return ++callbackId;
    if (command === "plugin:event|unlisten") return;
    if (command === "list_pieces") return [...await original(command, args), ...copy(pieces.filter((piece) => piece.spaceId === args.spaceId))];
    if (command === "get_space_preparation") return null;
    if (command === "list_space_templates") return [];
    if (!["preview_capture", "commit_capture", "pick_capture_files", "pick_capture_folders", "prepare_capture_paths"].includes(command)) return original(command, args);
    calls.push(copy({ command, args }));
    const input = args.input;
    const response = command === "preview_capture" ? preview(input) : undefined;
    const gate = gates.find((gate) => !gate.started && gate.command === command && (!gate.spaceId || gate.spaceId === input?.spaceId));
    if (gate) {
      gate.started = true;
      await new Promise((resolve) => { gate.release = resolve; });
      gate.released = true;
      if (gate.fail) throw new Error("DATABASE_UNAVAILABLE: synthetic capture failure");
    }
    if (command === "preview_capture") return copy(response);
    if (command === "pick_capture_files" || command === "pick_capture_folders") return [];
    if (command === "prepare_capture_paths") {
      unexpected.push(command);
      throw new Error("Path preparation requires the native fixture suite; no fake File.path support");
    }
    if (command === "commit_capture") {
      if (!/^[0-9a-f-]{36}$/i.test(input.operationId)) throw new Error("Stable operation UUID required");
      if (receipts.has(input.operationId)) {
        const prior = receipts.get(input.operationId);
        if (prior.input !== JSON.stringify(input)) throw new Error("CONFLICT: operation arguments changed");
        return copy(prior.result);
      }
      const checked = preview(input);
      const result = { operationId: input.operationId, items: input.items.map((item, index) => {
        const current = checked.items[index];
        if (current.status === "invalid") return { itemId: item.itemId, status: "rejected", error };
        if (current.status === "duplicate" && item.duplicatePolicy === "skip") return { itemId: item.itemId, status: "skipped_duplicate" };
        const pieceId = crypto.randomUUID();
        pieces.push({ id: pieceId, spaceId: input.spaceId, kind: item.kind, name: item.name.trim(), marked: false,
          payload: item.kind === "firefox" ? { urls: [item.reference] } : { path: item.reference } });
        return { itemId: item.itemId, status: "created", pieceId };
      }) };
      receipts.set(input.operationId, { input: JSON.stringify(input), result: copy(result) });
      return result;
    }
  };
}
