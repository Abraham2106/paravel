export const MAX_QUERY_CHARS = 256;
export const MAX_QUERY_TOKENS = 16;
export const SEARCH_PAGE_SIZE = 20;

const VOWEL_FOLD: Record<string, string> = {
  á: "a",
  à: "a",
  ä: "a",
  â: "a",
  ã: "a",
  é: "e",
  è: "e",
  ë: "e",
  ê: "e",
  í: "i",
  ì: "i",
  ï: "i",
  î: "i",
  ó: "o",
  ò: "o",
  ö: "o",
  ô: "o",
  õ: "o",
  ú: "u",
  ù: "u",
  ü: "u",
  û: "u",
};

export type NavigationCatalog = {
  groups: NavigationGroup[];
  spaces: NavigationSpace[];
  pieces: NavigationPiece[];
};

export type NavigationGroup = { id: string; name: string; icon: string };
export type NavigationSpace = { id: string; groupId: string; name: string };
export type NavigationPiece = { id: string; spaceId: string; name: string; kind: string };

export type NavigationTarget =
  | { type: "group"; groupId: string }
  | { type: "space"; spaceId: string }
  | { type: "piece"; pieceId: string };

export type NavigationResolved =
  | { type: "group"; groupId: string; name: string; icon: string }
  | { type: "space"; spaceId: string; groupId: string; name: string; groupName: string }
  | { type: "piece"; pieceId: string; spaceId: string; groupId: string; name: string; kind: string; spaceName: string; groupName: string };

export type NavigationResolve =
  | { status: "found"; target: NavigationResolved }
  | { status: "notFound"; target?: undefined };

export type NavigationOutcome =
  | { status: "navigated" }
  | { status: "cancelled" }
  | { status: "not-found" }
  | { status: "changed"; target: NavigationResolved }
  | { status: "error"; message: string };

export type QueryStatus = "empty" | "ok" | "too-long" | "too-many-tokens";
export type MatchLevel = 0 | 1 | 2 | 3;
export type MatchReason = "own" | "group" | "space" | "split";
export type SearchHitType = "group" | "space" | "piece";

export type SearchHit = {
  id: string;
  type: SearchHitType;
  name: string;
  groupId: string;
  groupName: string;
  spaceId?: string;
  spaceName?: string;
  kind?: string;
  icon?: string;
  level: MatchLevel;
  reason: MatchReason;
};

export type SearchSections = {
  spaces: SearchHit[];
  pieces: SearchHit[];
  groups: SearchHit[];
};

export type IndexedCatalog = {
  groups: (NavigationGroup & { folded: string })[];
  spaces: (NavigationSpace & { folded: string; groupName: string; groupFolded: string })[];
  pieces: (NavigationPiece & { folded: string; spaceName: string; spaceFolded: string; groupId: string; groupName: string; groupFolded: string })[];
};

export function foldSearchText(raw: string): string {
  const collapsed = raw.normalize("NFC").replace(/^\s+|\s+$/gu, "").replace(/\s+/gu, " ");
  let folded = "";
  for (const char of collapsed.toLowerCase()) folded += VOWEL_FOLD[char] ?? char;
  return folded;
}

export function parseSearchQuery(raw: string): { status: QueryStatus; folded: string; tokens: string[] } {
  if ([...raw].length > MAX_QUERY_CHARS) return { status: "too-long", folded: "", tokens: [] };
  const folded = foldSearchText(raw);
  if (!folded) return { status: "empty", folded: "", tokens: [] };
  const tokens = folded.split(" ").filter(Boolean);
  if (tokens.length > MAX_QUERY_TOKENS) return { status: "too-many-tokens", folded, tokens };
  return { status: "ok", folded, tokens };
}

export function indexCatalog(catalog: NavigationCatalog): IndexedCatalog {
  const groups = catalog.groups.map((group) => ({ ...group, folded: foldSearchText(group.name) }));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const spaces = catalog.spaces.map((space) => {
    const group = groupById.get(space.groupId);
    return {
      ...space,
      folded: foldSearchText(space.name),
      groupName: group?.name ?? "",
      groupFolded: group?.folded ?? "",
    };
  });
  const spaceById = new Map(spaces.map((space) => [space.id, space]));
  const pieces = catalog.pieces.map((piece) => {
    const space = spaceById.get(piece.spaceId);
    return {
      ...piece,
      folded: foldSearchText(piece.name),
      spaceName: space?.name ?? "",
      spaceFolded: space?.folded ?? "",
      groupId: space?.groupId ?? "",
      groupName: space?.groupName ?? "",
      groupFolded: space?.groupFolded ?? "",
    };
  });
  return { groups, spaces, pieces };
}

function tokensMatch(fields: string[], tokens: string[]): boolean {
  return tokens.every((token) => fields.some((field) => field.includes(token)));
}

function matchLevel(own: string, foldedQuery: string, tokens: string[]): MatchLevel | null {
  if (own === foldedQuery) return 0;
  if (own.startsWith(foldedQuery)) return 1;
  if (tokens.every((token) => own.includes(token))) return 2;
  return 3;
}

function matchReason(own: string, group: string, tokens: string[], space?: string): MatchReason {
  if (tokens.every((token) => own.includes(token))) return "own";
  if (tokens.every((token) => group.includes(token))) return "group";
  if (space && tokens.every((token) => space.includes(token))) return "space";
  return "split";
}

function cmp(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareHits(left: SearchHit, right: SearchHit): number {
  if (left.level !== right.level) return left.level - right.level;
  const own = cmp(foldSearchText(left.name), foldSearchText(right.name));
  if (own) return own;
  const group = cmp(foldSearchText(left.groupName), foldSearchText(right.groupName));
  if (group) return group;
  const space = cmp(foldSearchText(left.spaceName ?? ""), foldSearchText(right.spaceName ?? ""));
  if (space) return space;
  const groupId = cmp(left.groupId, right.groupId);
  if (groupId) return groupId;
  const spaceId = cmp(left.spaceId ?? "", right.spaceId ?? "");
  if (spaceId) return spaceId;
  return cmp(left.id, right.id);
}

function asIndexed(catalog: NavigationCatalog | IndexedCatalog): IndexedCatalog {
  const sample = catalog.groups[0] ?? catalog.spaces[0] ?? catalog.pieces[0];
  if (sample && "folded" in sample) return catalog as IndexedCatalog;
  return indexCatalog(catalog as NavigationCatalog);
}

export function searchCatalog(catalog: NavigationCatalog | IndexedCatalog, query: string): {
  status: QueryStatus;
  folded: string;
  tokens: string[];
  sections: SearchSections;
  total: number;
} {
  const parsed = parseSearchQuery(query);
  const empty: SearchSections = { spaces: [], pieces: [], groups: [] };
  if (parsed.status !== "ok") return { ...parsed, sections: empty, total: 0 };
  const indexed = asIndexed(catalog);
  const spaces: SearchHit[] = [];
  for (const space of indexed.spaces) {
    const fields = [space.folded, space.groupFolded];
    if (!tokensMatch(fields, parsed.tokens)) continue;
    spaces.push({
      id: space.id,
      type: "space",
      name: space.name,
      groupId: space.groupId,
      groupName: space.groupName,
      level: matchLevel(space.folded, parsed.folded, parsed.tokens) as MatchLevel,
      reason: matchReason(space.folded, space.groupFolded, parsed.tokens),
    });
  }
  const pieces: SearchHit[] = [];
  for (const piece of indexed.pieces) {
    const fields = [piece.folded, piece.spaceFolded, piece.groupFolded];
    if (!tokensMatch(fields, parsed.tokens)) continue;
    pieces.push({
      id: piece.id,
      type: "piece",
      name: piece.name,
      groupId: piece.groupId,
      groupName: piece.groupName,
      spaceId: piece.spaceId,
      spaceName: piece.spaceName,
      kind: piece.kind,
      level: matchLevel(piece.folded, parsed.folded, parsed.tokens) as MatchLevel,
      reason: matchReason(piece.folded, piece.groupFolded, parsed.tokens, piece.spaceFolded),
    });
  }
  const groups: SearchHit[] = [];
  for (const group of indexed.groups) {
    if (!tokensMatch([group.folded], parsed.tokens)) continue;
    groups.push({
      id: group.id,
      type: "group",
      name: group.name,
      groupId: group.id,
      groupName: group.name,
      icon: group.icon,
      level: matchLevel(group.folded, parsed.folded, parsed.tokens) as MatchLevel,
      reason: "own",
    });
  }
  spaces.sort(compareHits);
  pieces.sort(compareHits);
  groups.sort(compareHits);
  return {
    status: "ok",
    folded: parsed.folded,
    tokens: parsed.tokens,
    sections: { spaces, pieces, groups },
    total: spaces.length + pieces.length + groups.length,
  };
}

export function flattenHits(sections: SearchSections, shown: { spaces: number; pieces: number; groups: number }): SearchHit[] {
  return [
    ...sections.spaces.slice(0, shown.spaces),
    ...sections.pieces.slice(0, shown.pieces),
    ...sections.groups.slice(0, shown.groups),
  ];
}

export function hitTarget(hit: SearchHit): NavigationTarget {
  if (hit.type === "group") return { type: "group", groupId: hit.id };
  if (hit.type === "space") return { type: "space", spaceId: hit.id };
  return { type: "piece", pieceId: hit.id };
}

export function destinationChanged(hit: SearchHit, resolved: NavigationResolved): boolean {
  if (hit.type !== resolved.type) return true;
  if (resolved.type === "group") return hit.id !== resolved.groupId || hit.name !== resolved.name;
  if (resolved.type === "space") {
    return hit.id !== resolved.spaceId || hit.name !== resolved.name
      || hit.groupId !== resolved.groupId || hit.groupName !== resolved.groupName;
  }
  return hit.id !== resolved.pieceId || hit.name !== resolved.name
    || hit.spaceId !== resolved.spaceId || hit.groupId !== resolved.groupId
    || hit.spaceName !== resolved.spaceName || hit.groupName !== resolved.groupName
    || hit.kind !== resolved.kind;
}

export function applyResolvedHit(hit: SearchHit, resolved: NavigationResolved): SearchHit {
  if (resolved.type === "group") {
    return { ...hit, id: resolved.groupId, name: resolved.name, groupId: resolved.groupId, groupName: resolved.name, icon: resolved.icon };
  }
  if (resolved.type === "space") {
    return { ...hit, id: resolved.spaceId, name: resolved.name, groupId: resolved.groupId, groupName: resolved.groupName };
  }
  return {
    ...hit,
    id: resolved.pieceId,
    name: resolved.name,
    groupId: resolved.groupId,
    groupName: resolved.groupName,
    spaceId: resolved.spaceId,
    spaceName: resolved.spaceName,
    kind: resolved.kind,
  };
}

export function catalogErrorKind(message: string): "exceeded" | "inconsistent" | "read" {
  if (message.includes("NAVIGATION_CATALOG_EXCEEDED")) return "exceeded";
  if (message.includes("NAVIGATION_INCONSISTENT")) return "inconsistent";
  return "read";
}

export function catalogErrorMessage(kind: "exceeded" | "inconsistent" | "read"): string {
  if (kind === "exceeded") {
    return "Esta sede supera el límite de búsqueda. Usa la navegación por grupos; no se muestra un catálogo incompleto.";
  }
  if (kind === "inconsistent") {
    return "El catálogo de navegación no es coherente. Actualiza o usa la jerarquía de grupos.";
  }
  return "No se pudo leer el catálogo de nombres. Comprueba que la app de escritorio esté disponible y reintenta.";
}

export const kindLabel = {
  vscode: "VS Code",
  cursor: "Cursor",
  firefox: "web",
  "firefox-group": "Grupo de Firefox",
  folder: "Carpeta",
  file: "archivo",
} as const;

export function pieceKindLabel(kind: string): string {
  return kindLabel[kind as keyof typeof kindLabel] ?? kind;
}

export function matchReasonLabel(hit: SearchHit): string | null {
  if (hit.reason === "group") return "Coincide en el grupo";
  if (hit.reason === "space") return "Coincide en la mesa";
  if (hit.reason === "split") return hit.spaceName ? "Coincide en el grupo y la mesa" : "Coincide en el grupo";
  return null;
}
