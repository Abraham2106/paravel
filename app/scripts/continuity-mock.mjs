export const fixture = {
  groupId: "11111111-1111-4111-8111-111111111111",
  spaceA: "22222222-2222-4222-8222-222222222222",
  spaceB: "33333333-3333-4333-8333-333333333333",
  pieceId: "44444444-4444-4444-8444-444444444444",
};

export function installContinuityMock(ids) {
  const copy = (value) => structuredClone(value);
  const groups = [{ id: ids.groupId, name: "P01 synthetic group", icon: "folder", order: 0 }];
  const spaces = [ids.spaceA, ids.spaceB].map((id, index) => ({
    id, groupId: ids.groupId, name: `P01 ${index ? "Beta" : "Alpha"}`,
    note: "Synthetic note unchanged", pack: index ? [] : [ids.pieceId], botActive: !index,
  }));
  const pieces = [{ id: ids.pieceId, spaceId: ids.spaceA, kind: "firefox", name: "Synthetic inert piece",
    payload: { urls: ["https://example.com"] }, marked: true, order: 0 }];
  const rows = [];
  const calls = [];
  const unexpected = [];
  const gates = [];
  let clock = 1800000000000;
  const state = {
    coverage: "MOCK invoke only; no Tauri IPC or SQLite",
    calls, unexpected, rows,
    hold(command, spaceId, fail = false) {
      const token = crypto.randomUUID();
      gates.push({ token, command, spaceId, fail, started: false });
      return token;
    },
    release(token) {
      const gate = gates.find((item) => item.token === token);
      if (!gate?.started) throw new Error("Mock gate has not started");
      gate.release();
    },
    started(token) { return Boolean(gates.find((item) => item.token === token)?.started); },
    seed(spaceId, count) {
      for (let index = 0; index < count; index += 1) {
        rows.push({ id: crypto.randomUUID(), spaceId, objective: `Synthetic session ${index + 1}`,
          progress: `Synthetic progress ${index + 1}`, nextAction: "", blocker: "",
          createdAt: ++clock, updatedAt: clock, revision: 1 });
      }
      return copy(rows.filter((item) => item.spaceId === spaceId));
    },
    snapshot() { return copy({ spaces, pieces, rows, calls, unexpected }); },
  };
  window.__CONTINUITY_MOCK__ = state;
  window.__TAURI_INTERNALS__ = {
    async invoke(command, args = {}) {
      calls.push(copy({ command, args }));
      const allowed = ["list_groups", "list_spaces", "list_pieces", "list_closures", "get_closure", "save_closure", "delete_closure", "get_space_preparation"];
      if (!allowed.includes(command)) {
        unexpected.push(command);
        throw new Error(`MOCK BLOCKED unexpected command: ${command}`);
      }
      if (command === "get_space_preparation") { result = null; return copy(result); }
      const spaceId = args.spaceId ?? args.input?.spaceId;
      let result;
      if (command === "list_groups") result = groups;
      if (command === "list_spaces") result = spaces;
      if (command === "list_pieces") result = pieces.filter((item) => item.spaceId === spaceId);
      if (command === "list_closures") {
        if (args.limit !== 20) throw new Error("Mock contract: UI page size must be 20");
        const sorted = rows.filter((item) => item.spaceId === spaceId)
          .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
        const offset = args.cursor ? Number(args.cursor) : 0;
        const items = sorted.slice(offset, offset + args.limit);
        result = { items, nextCursor: offset + items.length < sorted.length ? String(offset + items.length) : null };
      }
      if (command === "get_closure") {
        result = rows.find((item) => item.id === args.id && item.spaceId === spaceId);
        if (!result) throw new Error("Cierre no encontrado.");
      }
      result = copy(result);
      const gate = gates.find((item) => !item.started && item.command === command && (!item.spaceId || item.spaceId === spaceId));
      if (gate) {
        gate.started = true;
        await new Promise((resolve) => { gate.release = resolve; });
        if (gate.fail) throw new Error("Fallo sintético de guardado. Reintenta.");
      }
      if (command === "save_closure") {
        const input = args.input;
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) throw new Error("Mock contract: stable UUID required");
        if (!spaces.some((item) => item.id === spaceId)) throw new Error("Mesa no encontrada.");
        if (!input.progress?.trim()) throw new Error("Último avance obligatorio.");
        for (const [key, limit] of Object.entries({ objective: 500, progress: 4000, nextAction: 2000, blocker: 2000 })) {
          if (typeof input[key] !== "string" || [...input[key]].length > limit) throw new Error(`Límite de ${key}.`);
        }
        const previous = rows.find((item) => item.id === input.id);
        if (previous && previous.spaceId !== spaceId) throw new Error("Cierre no encontrado.");
        if (previous && input.expectedRevision !== previous.revision) throw new Error("El cierre cambió. Vuelve a cargarlo.");
        if (!previous && input.expectedRevision !== null) throw new Error("Mock contract: null revision on create");
        const { expectedRevision, ...fields } = input;
        result = { ...fields, createdAt: previous?.createdAt ?? ++clock, updatedAt: ++clock, revision: previous ? previous.revision + 1 : 1 };
        if (previous) Object.assign(previous, result);
        else rows.push(result);
      }
      if (command === "delete_closure") {
        const index = rows.findIndex((item) => item.id === args.id && item.spaceId === spaceId);
        if (index < 0) throw new Error("Cierre no encontrado.");
        if (rows[index].revision !== args.revision) throw new Error("El cierre cambió. Vuelve a cargarlo.");
        rows.splice(index, 1);
        result = null;
      }
      return copy(result);
    },
  };
}
