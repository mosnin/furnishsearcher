"use client";
import Link from "next/link";
import { usePaginatedQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { buildSearchUrl, criteriaOnly } from "@/lib/search";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
export default function SavedSearchesPage() {
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.savedSearches.mine,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 20 },
  );
  const toggle = useMutation(api.savedSearches.toggleEmailAlerts),
    remove = useMutation(api.savedSearches.remove),
    retry = useMutation(api.searchAlerts.retry);
  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to update search.",
      );
    }
  }
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Saved searches</h1>
        <p className="text-sm text-slate-500 mt-2">
          Open your complete search again, or choose email alerts for new
          matching properties.
        </p>
      </header>
      {status === "LoadingFirstPage" ? (
        <p>Loading saved searches…</p>
      ) : !results.length ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <p>No saved searches yet.</p>
          <Link href="/search" className="underline inline-block mt-3">
            Browse listings
          </Link>
        </div>
      ) : (
        results.map((s) => {
          let url: string | null = null;
          try {
            url = buildSearchUrl(criteriaOnly(s));
          } catch {
            /* Legacy invalid filters can still be deleted. */
          }
          const details = [
            s.propertyId,
            s.location,
            [s.city, s.state].filter(Boolean).join(", "),
            s.minPrice !== undefined ? `From $${s.minPrice}/mo` : "",
            s.maxPrice !== undefined ? `Up to $${s.maxPrice}/mo` : "",
            s.bedrooms !== undefined ? `${s.bedrooms}+ bedrooms` : "",
            s.bathrooms !== undefined ? `${s.bathrooms}+ bathrooms` : "",
            s.occupants ? `${s.occupants} occupants` : "",
            ...(s.propertyTypes ?? (s.propertyType ? [s.propertyType] : [])),
            ...(s.amenities ?? []),
            s.petFriendly === undefined
              ? ""
              : s.petFriendly
                ? "Pet friendly"
                : "No pets",
            s.utilitiesIncluded === undefined
              ? ""
              : s.utilitiesIncluded
                ? "Utilities included"
                : "Utilities not included",
            s.parkingIncluded === undefined
              ? ""
              : s.parkingIncluded
                ? "Parking included"
                : "Parking not included",
            s.moveIn === undefined
              ? ""
              : `${new Date(s.moveIn).toISOString().slice(0, 10)} → ${new Date(s.moveOut!).toISOString().slice(0, 10)}${s.flexibleDays ? ` ±${s.flexibleDays} days` : ""}`,
          ].filter(Boolean);
          return (
            <article
              key={s._id}
              className="rounded-xl border bg-white p-5 space-y-3"
            >
              <div className="flex gap-3 items-start">
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold break-words">{s.name}</h2>
                  <p className="text-sm text-slate-500 mt-2">
                    {details.join(" · ") || "All monthly rentals"}
                  </p>
                </div>
                {url ? (
                  <Button asChild variant="outline">
                    <Link href={url}>Run search</Link>
                  </Button>
                ) : (
                  <p className="text-sm text-red-700">Invalid saved criteria</p>
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(`Remove “${s.name}”?`))
                      run(() => remove({ id: s._id }), "Search removed");
                  }}
                >
                  Remove
                </Button>
              </div>
              <div className="border-t pt-3 flex items-center justify-between gap-3">
                <label htmlFor={`alerts-${s._id}`} className="text-sm">
                  Email about new matches
                </label>
                <Switch
                  id={`alerts-${s._id}`}
                  checked={s.emailAlerts ?? false}
                  onCheckedChange={(enabled) =>
                    run(
                      () => toggle({ id: s._id, enabled }),
                      enabled ? "Alerts enabled" : "Alerts disabled",
                    )
                  }
                />
              </div>
              {s.latestDelivery && (
                <div className="text-xs text-slate-500 space-y-2">
                  <p>
                    Latest alert:{" "}
                    {s.latestDelivery.status === "sent"
                      ? "accepted by email provider"
                      : s.latestDelivery.status}
                  </p>
                  {["failed", "unconfigured"].includes(
                    s.latestDelivery.status,
                  ) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run(
                          () => retry({ deliveryId: s.latestDelivery!.id }),
                          "Alert retry queued",
                        )
                      }
                    >
                      Retry latest alert
                    </Button>
                  )}
                </div>
              )}
            </article>
          );
        })
      )}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(20)}>
          Load more saved searches
        </Button>
      )}
      {status === "LoadingMore" && <p>Loading…</p>}
    </div>
  );
}
