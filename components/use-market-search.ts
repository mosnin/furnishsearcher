"use client";
import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { demandShape, type DemandShape } from "@/lib/market-insights";
import type { SearchFilters } from "@/lib/search";
// In-memory page-session reference only: no cookie, local storage, account or IP.
let pageSession: string | undefined;
export function useMarketSearch(
  filters: SearchFilters,
  skip: boolean,
  ready: boolean,
) {
  const record = useMutation(api.marketInsights.recordSearch),
    coarse = JSON.stringify(demandShape(filters));
  useEffect(() => {
    if (
      skip ||
      !ready ||
      navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl === true
    )
      return;
    const timer = setTimeout(() => {
      pageSession ??= crypto.randomUUID();
      void record({
        clientId: pageSession,
        shape: JSON.parse(coarse) as DemandShape,
      }).catch(() => {
        /* Optional observation must not interrupt search. */
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [coarse, skip, ready, record]);
}
