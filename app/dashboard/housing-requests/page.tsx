"use client";

import { useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { DAY } from "@/lib/stays";
import { toast } from "sonner";

const date = (value: number) =>
  new Date(value).toLocaleDateString("en-US", { timeZone: "UTC" });
export default function HousingRequestsPage() {
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.housingRequests.getMine,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 20 },
  );
  const close = useMutation(api.housingRequests.close),
    fulfill = useMutation(api.housingRequests.markFulfilled);
  const [busy, setBusy] = useState<string | null>(null);
  async function update(id: Id<"housingRequests">, found: boolean) {
    setBusy(id);
    try {
      await (found ? fulfill : close)({ id });
      toast.success(found ? "Marked as housing found" : "Request closed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update request.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            My housing requests
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Track matching and close requests when your plans change or you find
            housing.
          </p>
        </div>
        <Button asChild>
          <Link href="/housing-request">New request</Link>
        </Button>
      </div>
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading requests…</p>
      ) : results.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            No housing requests yet.
          </CardContent>
        </Card>
      ) : (
        results.map((r) => (
          <Card key={r._id}>
            <CardContent className="space-y-3 p-5">
              <div className="flex justify-between gap-3">
                <h2 className="font-semibold">
                  {r.city}, {r.state}
                </h2>
                <Badge variant="secondary">{r.status}</Badge>
              </div>
              {r.agencyName && (
                <p className="text-sm">
                  {r.agencyName} · {r.travelerName}
                </p>
              )}
              <p className="text-sm text-slate-600">
                {date(r.moveInDate)} –{" "}
                {date(r.moveOutDate ?? r.moveInDate + r.duration * 30 * DAY)} ·
                Up to {formatPrice(r.maxBudget)}/mo · {r.bedrooms}+ bedrooms
              </p>
              {r.nearbyCities?.length ? (
                <p className="text-sm text-slate-600">
                  Also considering: {r.nearbyCities.join(", ")}
                </p>
              ) : null}
              {r.status === "open" && (
                <p className="text-sm">
                  {r.matchingStatus === "matching"
                    ? "Checking active properties… "
                    : ""}
                  {r.matchedProperties ?? 0}{" "}
                  {r.matchedProperties === 1
                    ? "property has"
                    : "properties have"}{" "}
                  matched this request. Availability is checked again when
                  owners reply.
                </p>
              )}
              <p className="text-sm text-slate-600">
                Contact preference:{" "}
                {r.contactPreference === "phone"
                  ? "Platform messages and verified phone"
                  : "Platform messages only"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <Link href="/dashboard/messages">View owner replies</Link>
                </Button>
                {r.status === "open" && (
                  <>
                    <Button
                      disabled={busy !== null}
                      onClick={() => update(r._id, true)}
                    >
                      I found housing
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => update(r._id, false)}
                    >
                      Close request
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(20)}>
          Load more requests
        </Button>
      )}
    </main>
  );
}
