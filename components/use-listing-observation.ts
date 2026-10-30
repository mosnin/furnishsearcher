"use client";
import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
let pageReference: string | undefined;
export function observationsAllowed() {
  return (
    document.visibilityState === "visible" &&
    navigator.doNotTrack !== "1" &&
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl !== true
  );
}
export function useListingObservation(
  kind: "impressions" | "views" | "shares",
) {
  const record = useMutation(api.listingPerformance.observe),
    { isLoading, isAuthenticated } = useConvexAuth(),
    { isLoaded, userId } = useAuth();
  const sent = useRef(new Set<string>()),
    scope = useRef("");
  return useCallback(
    (listingIds: string[]) => {
      if (
        !isLoaded ||
        isLoading ||
        (userId && !isAuthenticated) ||
        !observationsAllowed()
      )
        return;
      const key = `${userId ?? "anonymous"}:${Math.floor(Date.now() / 86400000)}`;
      if (scope.current !== key) {
        scope.current = key;
        sent.current.clear();
      }
      const pending = [...new Set(listingIds)].filter(
        (id) => !sent.current.has(id),
      );
      pageReference ??= crypto.randomUUID();
      for (let offset = 0; offset < pending.length; offset += 24) {
        const batch = pending.slice(offset, offset + 24);
        for (const id of batch) sent.current.add(id);
        void record({
          listingIds: batch as Id<"listings">[],
          kind,
          clientId: pageReference,
        }).catch(() => {
          for (const id of batch) sent.current.delete(id);
        });
      }
    },
    [record, kind, isLoaded, isLoading, isAuthenticated, userId],
  );
}
export function useSearchAppearance(listingId: string) {
  const ref = useRef<HTMLElement | null>(null),
    record = useListingObservation("impressions");
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    let visible = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      cancel();
      if (visible && observationsAllowed())
        timer = setTimeout(() => {
          if (visible && observationsAllowed()) record([listingId]);
        }, 1000);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some(
          (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5,
        );
        schedule();
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      cancel();
      observer.disconnect();
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [listingId, record]);
  return ref;
}
export function useListingPageView(listingId: string | undefined) {
  const record = useListingObservation("views");
  useEffect(() => {
    if (!listingId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (observationsAllowed())
        timer = setTimeout(() => record([listingId]), 1000);
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [listingId, record]);
}
