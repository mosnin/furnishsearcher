"use client";

import { useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const date = (value: number) =>
  new Date(value).toLocaleDateString("en-US", { timeZone: "UTC" });

export default function InquiriesPage() {
  const { isAuthenticated } = useConvexAuth();
  const [as, setAs] = useState<"tenant" | "landlord">("tenant");
  const [busy, setBusy] = useState<string | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    api.inquiries.getMine,
    isAuthenticated ? { as } : "skip",
    { initialNumItems: 20 },
  );
  const respond = useMutation(api.inquiries.respond);
  const invite = useMutation(api.reviewNotices.requestReview);
  async function decide(
    id: Id<"bookingInquiries">,
    decision: "accepted" | "declined" | "withdrawn",
  ) {
    setBusy(id);
    try {
      await respond({ id, decision });
      toast.success(`Inquiry ${decision}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update inquiry.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Booking inquiries</h1>
        <p className="mt-1 text-sm text-slate-600">
          Review stay dates and keep track of the next step. Leases and payments
          are arranged separately.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant={as === "tenant" ? "default" : "outline"}
          onClick={() => setAs("tenant")}
        >
          Sent by me
        </Button>
        <Button
          variant={as === "landlord" ? "default" : "outline"}
          onClick={() => setAs("landlord")}
        >
          Received for my properties
        </Button>
      </div>
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading inquiries…</p>
      ) : results.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            No inquiries yet.{" "}
            <Link className="underline" href="/search">
              Browse rentals
            </Link>
          </CardContent>
        </Card>
      ) : (
        results.map((i) => (
          <Card key={i._id}>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/listings/${i.listingId}`}
                    className="font-semibold hover:underline"
                  >
                    {i.title}
                  </Link>
                  <p className="text-sm text-slate-600">
                    {as === "landlord" ? (
                      <Link
                        className="underline"
                        href={`/travelers/${i.tenantId}`}
                      >
                        {i.otherName}
                      </Link>
                    ) : (
                      i.otherName
                    )}{" "}
                    · {date(i.moveIn)} – {date(i.moveOut)}
                  </p>
                </div>
                <Badge variant="secondary">
                  {i.status === "accepted" ? "confirmed" : i.status}
                </Badge>
              </div>
              <p className="text-sm">
                {i.occupants} occupant{i.occupants === 1 ? "" : "s"}
                {i.pets ? " · Traveling with pets" : ""}
              </p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {i.message}
              </p>
              <Button asChild variant="outline">
                <Link href={`/dashboard/inquiries/${i._id}`}>
                  Stay details, changes and history
                </Link>
              </Button>
              {i.status === "pending" && (
                <div className="flex flex-wrap gap-2">
                  {as === "landlord" ? (
                    <>
                      <Button
                        disabled={busy !== null}
                        onClick={() => decide(i._id, "accepted")}
                      >
                        Accept & block dates
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => decide(i._id, "declined")}
                      >
                        Decline
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => decide(i._id, "withdrawn")}
                    >
                      Withdraw inquiry
                    </Button>
                  )}
                </div>
              )}
              {i.canReview && (
                <Button asChild variant="outline">
                  <Link href={`/dashboard/reviews?inquiry=${i._id}`}>
                    Review stay
                  </Link>
                </Button>
              )}
              {i.canReview && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await invite({ inquiryId: i._id });
                      toast.success(
                        "Review invitation saved. Email delivery is tracked separately.",
                      );
                    } catch (e) {
                      toast.error(
                        e instanceof Error
                          ? e.message
                          : "Could not request review.",
                      );
                    }
                  }}
                >
                  Ask stay partner for a review
                </Button>
              )}
              {i.status === "accepted" && (
                <p className="text-sm text-slate-600">
                  The owner has blocked these dates. Agree on the lease and
                  payment details directly before moving in.
                </p>
              )}
            </CardContent>
          </Card>
        ))
      )}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(20)}>
          Load more
        </Button>
      )}
      {status === "LoadingMore" && <p role="status">Loading more…</p>}
    </main>
  );
}
