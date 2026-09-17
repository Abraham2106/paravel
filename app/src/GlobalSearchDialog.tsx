import { useEffect, useMemo, useRef, useState } from "react";
import { GroupGlyph } from "./groupIcons";
import {
  SEARCH_PAGE_SIZE,
  flattenHits,
  matchReasonLabel,
  pieceKindLabel,
  searchCatalog,
  type NavigationOutcome,
  type SearchHit,
} from "./navigation";
import { useNavigationCatalog } from "./useNavigationCatalog";

export default function GlobalSearchDialog({
  open,
  epoch,
  returnFocus,
  onClose,
  onActivate,
}: {
  open: boolean;
  epoch: number;
  returnFocus: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onActivate: (hit: SearchHit) => Promise<NavigationOutcome>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const { load, refreshing, retry } = useNavigationCatalog(open, epoch);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState({ spaces: SEARCH_PAGE_SIZE, pieces: SEARCH_PAGE_SIZE, groups: SEARCH_PAGE_SIZE });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [resolving, setResolving] = useState(false);
  const canActivate = load.status === "ready" && !refreshing && !resolving;

  const results = useMemo(() => {
    if (load.status !== "ready") return searchCatalog({ groups: [], spaces: [], pieces: [] }, query);
    return searchCatalog(load.catalog, query);
  }, [load, query]);
  const visible = useMemo(() => flattenHits(results.sections, shown), [results, shown]);

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    if (!element.open) element.showModal();
    setQuery("");
    setShown({ spaces: SEARCH_PAGE_SIZE, pieces: SEARCH_PAGE_SIZE, groups: SEARCH_PAGE_SIZE });
    setActiveId(null);
    setStatus("");
    setResolving(false);
    requestAnimationFrame(() => input.current?.focus());
    return () => { if (element.open) element.close(); };
  }, [open]);

  useEffect(() => {
    setShown({ spaces: SEARCH_PAGE_SIZE, pieces: SEARCH_PAGE_SIZE, groups: SEARCH_PAGE_SIZE });
  }, [query]);

  useEffect(() => {
    if (results.status !== "ok" || !visible.length) {
      setActiveId(null);
      return;
    }
    setActiveId((current) => current && visible.some((hit) => `${hit.type}:${hit.id}` === current)
      ? current
      : `${visible[0].type}:${visible[0].id}`);
  }, [results, visible]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      input.current?.focus();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  function close() {
    if (resolving) setResolving(false);
    onClose();
    const trigger = returnFocus.current;
    requestAnimationFrame(() => trigger?.focus());
  }

  async function activate(hit: SearchHit) {
    if (!canActivate || composing.current) return;
    setResolving(true);
    setStatus("Resolviendo destino…");
    try {
      const outcome = await onActivate(hit);
      if (outcome.status === "navigated") {
        onClose();
        return;
      }
      if (outcome.status === "cancelled") setStatus("");
      else if (outcome.status === "not-found") {
        setStatus("Ese destino ya no existe. El catálogo se actualizó.");
        retry();
      } else if (outcome.status === "changed") {
        setStatus("Este destino cambió. Vuelve a elegirlo para ir al contexto actual.");
        retry();
      } else setStatus(outcome.message);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setResolving(false);
    }
  }

  function moveActive(delta: number) {
    if (!visible.length) return;
    const index = Math.max(0, visible.findIndex((hit) => `${hit.type}:${hit.id}` === activeId));
    const next = Math.min(visible.length - 1, Math.max(0, index + delta));
    setActiveId(`${visible[next].type}:${visible[next].id}`);
  }

  function onInputKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || composing.current) return;
    if (event.key === "ArrowDown") { event.preventDefault(); moveActive(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); moveActive(-1); }
    else if (event.key === "Enter") {
      event.preventDefault();
      const hit = visible.find((item) => `${item.type}:${item.id}` === activeId);
      if (hit) void activate(hit);
    }
  }

  const listId = "paravel-search-results";
  const activeDomId = activeId ? `search-option-${activeId.replace(":", "-")}` : undefined;
  const loading = load.status === "loading" || (load.status === "idle" && open);
  const emptySede = load.status === "ready" && load.empty;
  const queryHint = results.status === "too-long"
    ? "Reduce la consulta a 256 caracteres. No se trunca sola."
    : results.status === "too-many-tokens"
      ? "Usa como máximo 16 palabras. No se trunca la consulta."
      : results.status === "empty"
        ? emptySede
          ? "Esta sede todavía no tiene grupos, espacios ni piezas."
          : "Escribe el nombre de un grupo, espacio o pieza"
        : results.total === 0 && load.status === "ready" && !refreshing
          ? "No hay resultados por nombre"
          : "";

  if (!open) return null;
  return <dialog ref={dialog} className="modal search-dialog" aria-labelledby="search-title"
    onCancel={(event) => {
      if (composing.current) event.preventDefault();
      else close();
    }}
    onClose={() => { if (!dialog.current?.open) onClose(); }}>
    <header>
      <div className="htxt">
        <h2 id="search-title">Buscar en Paravel</h2>
        <p>Buscar grupos, espacios y piezas por nombre. Entrar no abre recursos ni cambia lo marcado.</p>
      </div>
      <button className="close" type="button" aria-label="Cerrar" onClick={close}>×</button>
    </header>
    <div className="body">
      <label className="dialog-field">Nombre
        <input ref={input} value={query} type="search" autoComplete="off" spellCheck={false}
          placeholder="Buscar grupos, espacios y piezas por nombre"
          aria-label="Buscar grupos, espacios y piezas por nombre"
          role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={listId}
          aria-activedescendant={activeDomId} disabled={resolving}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          onChange={(event) => { setQuery(event.target.value); setStatus(""); }}
          onKeyDown={onInputKey} />
      </label>
      <p className="search-status" role="status">{loading ? "Cargando catálogo…" : refreshing ? "Actualizando catálogo…" : resolving ? "Resolviendo destino…" : status || queryHint}</p>
      {load.status === "error" ? <div className="search-state">
        <p>{load.kind === "exceeded" ? load.message : load.message}</p>
        <button className="btn" type="button" onClick={retry}>Reintentar</button>
      </div> : <div id={listId} className="search-results" role="listbox" aria-label="Resultados de búsqueda">
        {(["spaces", "pieces", "groups"] as const).map((section) => {
          const items = results.sections[section];
          if (!items.length || results.status !== "ok") return null;
          const label = section === "spaces" ? "Espacios" : section === "pieces" ? "Piezas" : "Grupos";
          const count = shown[section];
          return <section key={section} className="search-section" role="group" aria-label={label}>
            <h3>{label} <span>Mostrando {Math.min(count, items.length)} de {items.length}</span></h3>
            {items.slice(0, count).map((hit) => {
              const optionId = `search-option-${hit.type}-${hit.id}`;
              const selected = `${hit.type}:${hit.id}` === activeId;
              const reason = matchReasonLabel(hit);
              return <div key={optionId} id={optionId} role="option" aria-selected={selected}
                className={`search-option ${selected ? "active" : ""} ${canActivate ? "" : "inert"}`}
                onMouseEnter={() => setActiveId(`${hit.type}:${hit.id}`)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void activate(hit)}>
                {hit.type === "group" ? <GroupGlyph id={hit.icon} /> : <span className="search-kind">{hit.type === "piece" ? pieceKindLabel(hit.kind ?? "") : "Espacio"}</span>}
                <span className="search-copy">
                  <strong>{hit.name}</strong>
                  <small>{hit.type === "group" ? "Grupo" : hit.type === "space" ? hit.groupName : `${hit.groupName} / ${hit.spaceName}`}</small>
                  {reason ? <small className="search-reason">{reason}</small> : null}
                </span>
              </div>;
            })}
            {items.length > count && <button className="btn search-more" type="button"
              onClick={() => setShown((current) => ({ ...current, [section]: current[section] + SEARCH_PAGE_SIZE }))}>Mostrar más</button>}
          </section>;
        })}
      </div>}
    </div>
  </dialog>;
}
