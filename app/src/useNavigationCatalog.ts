import { useCallback, useEffect, useRef, useState } from "react";
import {
  catalogErrorKind,
  catalogErrorMessage,
  indexCatalog,
  type IndexedCatalog,
  type NavigationCatalog,
} from "./navigation";
import { hostErrorMessage, invokeSafe } from "./tauri";

export type CatalogLoad =
  | { status: "idle" }
  | { status: "loading"; generation: number }
  | { status: "ready"; generation: number; catalog: IndexedCatalog; empty: boolean }
  | { status: "error"; generation: number; kind: "read" | "exceeded" | "inconsistent"; message: string };

export function useNavigationCatalog(open: boolean, epoch: number) {
  const [load, setLoad] = useState<CatalogLoad>({ status: "idle" });
  const [refreshing, setRefreshing] = useState(false);
  const session = useRef(0);

  const fetchCatalog = useCallback(async (generation: number, refresh = false) => {
    if (refresh) setRefreshing(true);
    else {
      setLoad({ status: "loading", generation });
      setRefreshing(false);
    }
    try {
      const catalog = await invokeSafe<NavigationCatalog>("list_navigation_catalog");
      if (session.current !== generation) return;
      const indexed = indexCatalog(catalog);
      const empty = indexed.groups.length + indexed.spaces.length + indexed.pieces.length === 0;
      setLoad({ status: "ready", generation, catalog: indexed, empty });
      setRefreshing(false);
    } catch (reason) {
      if (session.current !== generation) return;
      const text = hostErrorMessage(reason);
      const kind = catalogErrorKind(text);
      setLoad({ status: "error", generation, kind, message: catalogErrorMessage(kind) });
      setRefreshing(false);
    }
  }, []);

  const retry = useCallback(() => {
    const generation = ++session.current;
    void fetchCatalog(generation);
  }, [fetchCatalog]);

  useEffect(() => {
    if (!open) {
      session.current += 1;
      setLoad({ status: "idle" });
      setRefreshing(false);
      return;
    }
    const generation = ++session.current;
    void fetchCatalog(generation);
    return () => { session.current += 1; };
  }, [open, epoch, fetchCatalog]);

  useEffect(() => {
    if (!open) return;
    function onFocus() {
      const generation = ++session.current;
      void fetchCatalog(generation, true);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [open, fetchCatalog]);

  return { load, refreshing, retry };
}
