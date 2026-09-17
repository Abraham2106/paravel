export const fixture = {
  groupTrabajo: "11111111-1111-4111-8111-111111111111",
  groupEmpty: "22222222-2222-4222-8222-222222222222",
  groupUni: "33333333-3333-4333-8333-333333333333",
  spaceAtlas: "44444444-4444-4444-8444-444444444444",
  spaceDiseno: "55555555-5555-4555-8555-555555555555",
  spaceBeta: "66666666-6666-4666-8666-666666666666",
  pieceManual: "77777777-7777-4777-8777-777777777777",
  pieceRepoA: "88888888-8888-4888-8888-888888888888",
  pieceRepoB: "99999999-9999-4999-8999-999999999999",
  pieceHidden: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  pieceInert: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

export function installNavigationMock(ids) {
  const copy = (value) => structuredClone(value);
  const groups = [
    { id: ids.groupTrabajo, name: "P04 Trabajo", icon: "briefcase", order: 0 },
    { id: ids.groupEmpty, name: "P04 Investigacion", icon: "flask-conical", order: 1 },
    { id: ids.groupUni, name: "P04 Universidad", icon: "graduation-cap", order: 2 },
  ];
  const spaces = [
    { id: ids.spaceAtlas, groupId: ids.groupTrabajo, name: "P04 Atlas", note: "NOTE_ONLY_SENTINEL hidden from search", pack: [ids.pieceInert], botActive: true },
    { id: ids.spaceDiseno, groupId: ids.groupTrabajo, name: "P04 Diseno", note: null, pack: [], botActive: false },
    { id: ids.spaceBeta, groupId: ids.groupUni, name: "P04 Beta", note: "Synthetic note unchanged", pack: [], botActive: false },
  ];
  const pieces = [
    { id: ids.pieceManual, spaceId: ids.spaceAtlas, kind: "firefox", name: "P04 Manual Atlas", payload: { urls: ["https://example.com"], secret: "PAYLOAD_ONLY_SENTINEL" }, marked: false, order: 0 },
    { id: ids.pieceRepoA, spaceId: ids.spaceAtlas, kind: "folder", name: "P04 Repositorio", payload: { path: "/tmp/fixture" }, marked: true, order: 1 },
    { id: ids.pieceRepoB, spaceId: ids.spaceDiseno, kind: "file", name: "P04 Repositorio", payload: { path: "/tmp/other" }, marked: false, order: 0 },
    { id: ids.pieceHidden, spaceId: ids.spaceAtlas, kind: "firefox", name: "P04 Oculta", payload: { urls: ["https://example.com"] }, marked: false, order: 2 },
    { id: ids.pieceInert, spaceId: ids.spaceAtlas, kind: "firefox", name: "P04 Inerte", payload: { urls: ["https://example.com"] }, marked: true, order: 3 },
  ];
  const rows = [];
  const calls = [];
  const unexpected = [];
  const gates = [];
  let catalogError = null;
  let clock = 1800000000000;
  const allowed = [
    "list_groups", "list_spaces", "list_pieces", "list_navigation_catalog", "resolve_navigation_target",
    "list_closures", "get_closure", "save_closure", "delete_closure", "get_space_preparation", "probe_paths",
  ];
  const catalogOf = () => ({
    groups: groups.map(({ id, name, icon }) => ({ id, name, icon })),
    spaces: spaces.map(({ id, groupId, name }) => ({ id, groupId, name })),
    pieces: pieces.map(({ id, spaceId, name, kind }) => ({ id, spaceId, name, kind })),
  });
  const state = {
    coverage: "MOCK invoke only; no Tauri IPC or SQLite",
    calls, unexpected, rows, groups, spaces, pieces,
    hold(command, key, fail = false) {
      const token = crypto.randomUUID();
      gates.push({ token, command, key, fail, started: false });
      return token;
    },
    release(token) {
      const gate = gates.find((item) => item.token === token);
      if (!gate?.started) throw new Error("Mock gate has not started");
      gate.release();
    },
    started(token) { return Boolean(gates.find((item) => item.token === token)?.started); },
    failCatalog(message) { catalogError = message; },
    deletePiece(id) { const index = pieces.findIndex((piece) => piece.id === id); if (index >= 0) pieces.splice(index, 1); },
    renameSpace(id, name) { const space = spaces.find((item) => item.id === id); if (space) space.name = name; },
    snapshot() { return copy({ spaces, pieces, rows, calls, unexpected, catalog: catalogOf() }); },
  };
  window.__NAVIGATION_MOCK__ = state;
  window.__TAURI_INTERNALS__ = {
    async invoke(command, args = {}) {
      calls.push(copy({ command, args }));
      if (!allowed.includes(command)) {
        unexpected.push(command);
        throw new Error(`MOCK BLOCKED unexpected command: ${command}`);
      }
      const spaceId = args.spaceId ?? args.input?.spaceId;
      let result;
      if (command === "list_groups") result = groups;
      if (command === "list_spaces") result = spaces;
      if (command === "list_pieces") result = pieces.filter((item) => item.spaceId === spaceId);
      if (command === "probe_paths") result = (args.items ?? []).map((item) => ({ id: item.id, ok: true }));
      if (command === "get_space_preparation") result = null;
      if (command === "list_navigation_catalog") {
        if (catalogError) throw new Error(catalogError);
        result = catalogOf();
      }
      if (command === "resolve_navigation_target") {
        const target = args.target;
        if (target.type === "group") {
          const group = groups.find((item) => item.id === target.groupId);
          result = group
            ? { status: "found", target: { type: "group", groupId: group.id, name: group.name, icon: group.icon } }
            : { status: "notFound" };
        } else if (target.type === "space") {
          const space = spaces.find((item) => item.id === target.spaceId);
          const group = groups.find((item) => item.id === space?.groupId);
          result = space && group
            ? { status: "found", target: { type: "space", spaceId: space.id, groupId: space.groupId, name: space.name, groupName: group.name } }
            : { status: "notFound" };
        } else {
          const piece = pieces.find((item) => item.id === target.pieceId);
          const space = spaces.find((item) => item.id === piece?.spaceId);
          const group = groups.find((item) => item.id === space?.groupId);
          result = piece && space && group
            ? { status: "found", target: { type: "piece", pieceId: piece.id, spaceId: space.id, groupId: group.id, name: piece.name, kind: piece.kind, spaceName: space.name, groupName: group.name } }
            : { status: "notFound" };
        }
      }
      if (command === "list_closures") {
        const sorted = rows.filter((item) => item.spaceId === spaceId).sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
        result = { items: sorted.slice(0, 20), nextCursor: sorted.length > 20 ? "20" : null };
      }
      if (command === "save_closure") {
        const input = args.input;
        result = { ...input, createdAt: ++clock, updatedAt: clock, revision: 1 };
        rows.push(result);
      }
      result = copy(result);
      const gate = gates.find((item) => !item.started && item.command === command && (!item.key || item.key === spaceId || item.key === command));
      if (gate) {
        gate.started = true;
        await new Promise((resolve) => { gate.release = resolve; });
        if (gate.fail) throw new Error(catalogError || "Fallo sintetico de catalogo.");
      }
      return result;
    },
  };
}
