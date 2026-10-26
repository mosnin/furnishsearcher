"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useConvexAuth,
  usePaginatedQuery,
  useQuery,
  useMutation,
} from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ReviewForm } from "@/components/review-form";
import { ReviewCard } from "@/components/review-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
function ReviewHistory() {
  const { isAuthenticated } = useConvexAuth(),
    { userId } = useAuth(),
    me = useQuery(
      api.users.getByClerkId,
      isAuthenticated && userId ? { clerkId: userId } : "skip",
    );
  const mine = usePaginatedQuery(api.reviews.mine, me ? {} : "skip", {
      initialNumItems: 10,
    }),
    received = usePaginatedQuery(api.reviews.received, me ? {} : "skip", {
      initialNumItems: 10,
    });
  const [edit, setEdit] = useState<(typeof mine.results)[number] | null>(null);
  return (
    <main className="mx-auto max-w-4xl p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">My reviews</h1>
        <p className="text-sm text-slate-600 mt-2">
          Reviews and responses are published after staff moderation. For a stay
          arranged outside this app, open the property’s review form and provide
          the private stay context.{" "}
          <Link href="/dashboard/support" className="underline">
            Contact support
          </Link>{" "}
          about a property you can no longer access.
        </p>
      </div>
      <ReviewInvitation me={me ?? null} />
      <ReviewInbox enabled={!!me} />
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Written by me</h2>
        {mine.status === "LoadingFirstPage" ? (
          <p role="status">Loading reviews…</p>
        ) : mine.results.length === 0 ? (
          <p>
            No reviews submitted yet.{" "}
            <Link href="/dashboard/inquiries" className="underline">
              Review a stay
            </Link>{" "}
            or find the property you stayed in.
          </p>
        ) : (
          mine.results.map((r) => (
            <Card key={r._id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium">
                    {r.listingTitle} ·{" "}
                    {r.kind === "traveler"
                      ? "Traveler review"
                      : "Property review"}
                  </p>
                  <span className="text-sm capitalize">{r.status}</span>
                </div>
                <h3 className="font-semibold">{r.title}</h3>
                <p className="whitespace-pre-wrap text-sm">{r.comment}</p>
                {r.moderationNote && (
                  <p className="rounded bg-slate-50 p-3 text-sm">
                    Staff feedback: {r.moderationNote}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {r.canResubmit && (
                    <Button variant="outline" onClick={() => setEdit(r)}>
                      {r.status === "removed"
                        ? "Submit replacement"
                        : "Edit and resubmit"}
                    </Button>
                  )}
                  <Link
                    className="underline text-sm"
                    href={`/listings/${r.listingId}`}
                  >
                    Property
                  </Link>
                </div>
                <ReviewActions id={r._id} />
              </CardContent>
            </Card>
          ))
        )}
        {mine.status === "CanLoadMore" && (
          <Button variant="outline" onClick={() => mine.loadMore(10)}>
            Load more written reviews
          </Button>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          Reviews about me or my properties
        </h2>
        {received.status === "LoadingFirstPage" ? (
          <p role="status">Loading received reviews…</p>
        ) : received.results.length === 0 && received.status === "Exhausted" ? (
          <p>No published reviews yet.</p>
        ) : (
          received.results.map((r) => (
            <ReviewCard key={r._id} {...r} reviewId={r._id} />
          ))
        )}
        {received.status === "CanLoadMore" && (
          <Button variant="outline" onClick={() => received.loadMore(10)}>
            Load more received reviews
          </Button>
        )}
      </section>
      {edit && me && (
        <ReviewForm
          key={edit._id}
          listingId={edit.listingId}
          landlordId={edit.landlordId}
          landlordName={edit.listingTitle}
          reviewerId={me._id}
          kind={edit.kind}
          subjectId={edit.subjectId}
          isOpen
          onClose={() => setEdit(null)}
        />
      )}
    </main>
  );
}
import { toast } from "sonner";
import { ReviewActions } from "@/components/review-actions";
function ReviewInvitation({ me }: { me: { _id: Id<"users"> } | null }) {
  const params = useSearchParams(),
    raw = params.get("inquiry"),
    data = useQuery(
      api.reviews.invitationContext,
      me && raw ? { inquiryId: raw as Id<"bookingInquiries"> } : "skip",
    );
  const [open, setOpen] = useState(false);
  if (!raw) return null;
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        {!data ? (
          <p role="status">Loading stay…</p>
        ) : (
          <>
            <p>
              {data.title} ·{" "}
              {data.kind === "traveler"
                ? "Review your traveler"
                : "Review your stay"}
            </p>
            {data.eligible ? (
              <Button onClick={() => setOpen(true)}>Write review</Button>
            ) : (
              <p className="text-sm text-slate-600">
                Reviews require an accepted inquiry whose stay has started. Only
                review a stay that actually occurred.
              </p>
            )}
            {me && open && (
              <ReviewForm
                listingId={data.listingId}
                landlordId={data.landlordId}
                landlordName={data.title}
                reviewerId={me._id}
                subjectId={data.subjectId}
                kind={data.kind}
                bookingId={data.id}
                stayStart={data.moveIn}
                stayEnd={data.moveOut}
                isOpen
                onClose={() => setOpen(false)}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
export default function ReviewsPage() {
  return (
    <Suspense fallback={<p>Loading reviews…</p>}>
      <ReviewHistory />
    </Suspense>
  );
}

function ReviewInbox({ enabled }: { enabled: boolean }) {
  const { results, status, loadMore } = usePaginatedQuery(
      api.reviewNotices.mine,
      enabled ? {} : "skip",
      { initialNumItems: 10 },
    ),
    retry = useMutation(api.reviewNotices.retry);
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Review updates and invitations</h2>
      {results.map((n) => (
        <Card key={n._id}>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm">{n.body}</p>
            <p className="text-xs text-slate-500">
              Email:{" "}
              {n.emailStatus === "sent"
                ? "accepted by email provider"
                : n.emailStatus}
            </p>
            {n.inquiryId && (
              <Link
                className="underline text-sm"
                href={`/dashboard/reviews?inquiry=${n.inquiryId}`}
              >
                Open stay
              </Link>
            )}
            {["failed", "unconfigured"].includes(n.emailStatus) && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await retry({ id: n._id });
                    toast.success("Email retry requested.");
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "Could not retry.",
                    );
                  }
                }}
              >
                Retry email
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(10)}>
          Older updates
        </Button>
      )}
    </section>
  );
}
