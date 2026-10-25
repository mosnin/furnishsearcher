"use client";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ReviewCard } from "./review-card";
import { Button } from "./ui/button";
export function PublicReviews(props: {
  listingId?: Id<"listings">;
  landlordId?: Id<"users">;
  travelerId?: Id<"users">;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.reviews.listPublic,
    props,
    { initialNumItems: 10 },
  );
  return (
    <div className="space-y-4">
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading reviews…</p>
      ) : results.length === 0 && status === "Exhausted" ? (
        <p className="text-sm text-slate-600">No published reviews yet.</p>
      ) : (
        results.map((r) => <ReviewCard key={r._id} {...r} reviewId={r._id} />)
      )}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(10)}>
          Load more reviews
        </Button>
      )}
      {status === "LoadingMore" && <p role="status">Loading more reviews…</p>}
    </div>
  );
}
