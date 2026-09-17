import assert from "node:assert/strict";
import { test } from "node:test";
import {
  destinationChanged, flattenHits, foldSearchText, hitTarget, indexCatalog, parseSearchQuery,
  SEARCH_PAGE_SIZE, searchCatalog,
} from "../src/navigation.ts";

const ids = {
  trabajo: "11111111-1111-4111-8111-111111111111",
  investigacion: "22222222-2222-4222-8222-222222222222",
  universidad: "33333333-3333-4333-8333-333333333333",
  atlas: "44444444-4444-4444-8444-444444444444",
  diseno: "55555555-5555-4555-8555-555555555555",
  taller: "66666666-6666-4666-8666-666666666666",
  manual: "77777777-7777-4777-8777-777777777777",
  repoA: "88888888-8888-4888-8888-888888888888",
  repoB: "99999999-9999-4999-8999-999999999999",
  repoC: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  percent: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

const catalog = {
  groups: [
    { id: ids.trabajo, name: "Trabajo", icon: "briefcase" },
    { id: ids.investigacion, name: "Investigación", icon: "flask-conical" },
    { id: ids.universidad, name: "Universidad", icon: "graduation-cap" },
  ],
  spaces: [
    { id: ids.atlas, groupId: ids.trabajo, name: "Atlas" },
    { id: ids.diseno, groupId: ids.trabajo, name: "Diseño" },
    { id: ids.taller, groupId: ids.universidad, name: "Taller" },
  ],
  pieces: [
    { id: ids.manual, spaceId: ids.atlas, name: "Manual Atlas", kind: "firefox" },
    { id: ids.repoA, spaceId: ids.atlas, name: "Repositorio", kind: "folder" },
    { id: ids.repoB, spaceId: ids.diseno, name: "Repositorio", kind: "file" },
    { id: ids.repoC, spaceId: ids.taller, name: "Repositorio", kind: "vscode" },
    { id: ids.percent, spaceId: ids.atlas, name: "100% Atlas", kind: "firefox" },
  ],
};

test("T01 exact prefix token and contextual ranking with ID tie-break", () => {
  const atlas = searchCatalog(catalog, "atlas");
  assert.equal(atlas.sections.spaces[0].id, ids.atlas);
  assert.equal(atlas.sections.spaces[0].level, 0);
  assert.equal(atlas.sections.pieces.find((hit) => hit.id === ids.manual).level, 2);
  assert.equal(atlas.sections.groups.length, 0);
  const repos = searchCatalog(catalog, "repositorio").sections.pieces;
  assert.deepEqual(repos.map((hit) => hit.id), [ids.repoA, ids.repoB, ids.repoC]);
  const split = searchCatalog(catalog, "atlas repo");
  assert.equal(split.sections.pieces[0].id, ids.repoA);
  assert.equal(split.sections.pieces[0].level, 3);
  assert.equal(split.sections.pieces[0].reason, "split");
  const prefix = searchCatalog(catalog, "Atl");
  assert.equal(prefix.sections.spaces[0].level, 1);
});

test("T02 case NFC vowels u-umlaut and n-tilde folding", () => {
  assert.equal(foldSearchText("Investigacio" + "\u0301" + "n"), foldSearchText("investigacion"));
  assert.equal(foldSearchText("\u00dc"), "u");
  assert.equal(searchCatalog(catalog, "INVESTIGACION").sections.groups[0].id, ids.investigacion);
  assert.equal(searchCatalog(catalog, "diseno").total, 0);
  assert.equal(searchCatalog(catalog, "dise\u00f1o").sections.spaces[0].id, ids.diseno);
  assert.equal(foldSearchText("n\u0303"), "\u00f1");
  assert.notEqual(foldSearchText("\u00f1"), foldSearchText("n"));
});

test("T03 empty whitespace limits and literal symbols", () => {
  assert.equal(parseSearchQuery("").status, "empty");
  assert.equal(parseSearchQuery("   ").status, "empty");
  assert.equal(searchCatalog(catalog, "").total, 0);
  assert.equal(parseSearchQuery("a".repeat(257)).status, "too-long");
  assert.equal(parseSearchQuery(Array.from({ length: 17 }, (_, i) => `t${i}`).join(" ")).status, "too-many-tokens");
  const percent = searchCatalog(catalog, "%");
  assert.equal(percent.total, 1);
  assert.equal(percent.sections.pieces[0].id, ids.percent);
  assert.equal(searchCatalog(catalog, "_").total, 0);
});

test("T05 excluded note payload and closure text never match", () => {
  const noisy = {
    ...catalog,
    spaces: catalog.spaces.map((space) => space.id === ids.atlas ? { ...space, note: "NOTE_ONLY_SENTINEL" } : space),
    pieces: catalog.pieces.map((piece) => piece.id === ids.manual ? { ...piece, payload: { secret: "PAYLOAD_ONLY_SENTINEL" } } : piece),
  };
  assert.equal(searchCatalog(noisy, "NOTE_ONLY_SENTINEL").total, 0);
  assert.equal(searchCatalog(noisy, "PAYLOAD_ONLY_SENTINEL").total, 0);
  assert.equal(searchCatalog(noisy, "CLOSURE_ONLY_SENTINEL").total, 0);
});

test("pagination counts the full section not only visible rows", () => {
  const many = {
    groups: Array.from({ length: 25 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      name: `Grupo ${index}`, icon: "folder",
    })),
    spaces: [], pieces: [],
  };
  const result = searchCatalog(many, "grupo");
  assert.equal(result.sections.groups.length, 25);
  assert.equal(flattenHits(result.sections, { spaces: 20, pieces: 20, groups: SEARCH_PAGE_SIZE }).length, 20);
});

test("destination identity change is detected before navigation", () => {
  const hit = searchCatalog(catalog, "repositorio").sections.pieces[0];
  assert.equal(destinationChanged(hit, {
    type: "piece", pieceId: hit.id, spaceId: ids.taller, groupId: ids.universidad,
    name: hit.name, kind: hit.kind, spaceName: "Taller", groupName: "Universidad",
  }), true);
  assert.equal(destinationChanged(hit, {
    type: "piece", pieceId: hit.id, spaceId: hit.spaceId, groupId: hit.groupId,
    name: hit.name, kind: hit.kind, spaceName: hit.spaceName, groupName: hit.groupName,
  }), false);
  assert.deepEqual(hitTarget(hit), { type: "piece", pieceId: hit.id });
});

test("indexCatalog folds names once and search does not concatenate fields", () => {
  const indexed = indexCatalog(catalog);
  assert.equal(indexed.spaces.find((space) => space.id === ids.atlas).folded, "atlas");
  assert.equal(searchCatalog(indexed, "trabajatlas").total, 0);
});
