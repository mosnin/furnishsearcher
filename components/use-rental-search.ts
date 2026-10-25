"use client";
import { useEffect, useRef, useState } from "react";
import { usePaginatedQuery, useQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { SearchFilters } from "@/lib/search";
import { retainedSpatialPages } from "@/lib/spatial-pages";
type Page = FunctionReturnType<typeof api.search.listings>;
/** The spatial component has its own cursors, so do not pass Convex endCursor semantics to it. */
export function useRentalSearch(filters: SearchFilters, skip: boolean) {
  const spatial = !!filters.mapBounds || filters.nearLatitude !== undefined,
    key = JSON.stringify(filters);
  const ordinary = usePaginatedQuery(
    api.search.listings,
    skip || spatial ? "skip" : filters,
    { initialNumItems: 24 },
  );
  const [state, setState] = useState<{
    key: string;
    cursors: (string | null)[];
  }>({ key, cursors: [null] });
  const cursors = state.key === key ? state.cursors : [null],
    previous = useRef<{ key: string; signatures: (string | undefined)[] }>({
      key,
      signatures: [],
    });
  const queries = Object.fromEntries(
    !skip && spatial
      ? cursors.map((cursor, i) => [
          `p${i}`,
          {
            query: api.search.listings,
            args: { ...filters, paginationOpts: { cursor, numItems: 24 } },
          },
        ])
      : [],
  );
  const data = useQueries(queries),
    pages = cursors.map((_, i) => data[`p${i}`] as Page | Error | undefined),
    signatures = pages.map((p) =>
      p && !(p instanceof Error) ? JSON.stringify(p) : undefined,
    );
  const count = retainedSpatialPages(
    previous.current.key === key ? previous.current.signatures : [],
    signatures,
    cursors.length,
  );
  useEffect(() => {
    if (!spatial || skip) return;
    previous.current = { key, signatures: signatures.slice(0, count) };
    if (state.key !== key || count < cursors.length)
      setState({ key, cursors: cursors.slice(0, count) });
  }, [key, JSON.stringify(signatures), count, spatial, skip]);
  if (!spatial) return ordinary;
  for (const page of pages.slice(0, count))
    if (page instanceof Error) throw page;
  const valid = pages
    .slice(0, count)
    .filter((p): p is Page => !!p && !(p instanceof Error));
  const results = [
    ...new Map(
      valid.flatMap((p) => p.page).map((row) => [row._id, row]),
    ).values(),
  ];
  const last = pages[count - 1],
    loading = !last || last instanceof Error,
    status = loading
      ? count === 1
        ? "LoadingFirstPage"
        : "LoadingMore"
      : last.isDone
        ? "Exhausted"
        : "CanLoadMore";
  return {
    results,
    status,
    loadMore: (_numItems: number) => {
      if (!loading && !last.isDone)
        setState({
          key,
          cursors: [...cursors.slice(0, count), last.continueCursor],
        });
    },
  };
}
