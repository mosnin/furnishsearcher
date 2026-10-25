"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PublicationStatus } from "./publication-status";
import { toast } from "sonner";
export function StaffListingReview({ id }: { id: Id<"listings"> }) {
  const [open, setOpen] = useState(false),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const state = useQuery(api.publication.getReadiness, open ? { id } : "skip"),
    approve = useMutation(api.listings.approveListing),
    reject = useMutation(api.listings.rejectListing);
  const identity = useQuery(
    api.identity.forListing,
    open ? { listingId: id } : "skip",
  );
  const reviewIdentity = useMutation(api.identity.review);
  const [accountId, setAccountId] = useState(""),
    [workflowId, setWorkflowId] = useState("");
  async function changeIdentity(action: "hold" | "recheck" | "recover") {
    if (!identity || note.trim().length < 3) {
      toast.error("Enter a review note first.");
      return;
    }
    setBusy(true);
    try {
      await reviewIdentity({
        id: identity.id,
        action,
        note,
        ...(action === "recover" ? { accountId, workflowId } : {}),
      });
      toast.success(
        action === "hold"
          ? "Identity held for review. Publication is blocked."
          : "Provider recheck requested. Identity is not confirmed until the result returns.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update identity review.",
      );
    } finally {
      setBusy(false);
    }
  }
  const [reviewedRevision, setReviewedRevision] = useState<number | null>(null);
  useEffect(() => {
    if (open && state && reviewedRevision === null)
      setReviewedRevision(state.revision);
  }, [open, state, reviewedRevision]);
  const stale =
    !!state && reviewedRevision !== null && state.revision !== reviewedRevision;
  async function decide(approved: boolean) {
    if (
      !state ||
      stale ||
      reviewedRevision === null ||
      note.trim().length < 3
    ) {
      toast.error("Enter a review note.");
      return;
    }
    setBusy(true);
    try {
      if (approved) {
        const result = await approve({
          id,
          expectedRevision: reviewedRevision,
          note,
        });
        toast.success(
          result.live
            ? "Approved and live."
            : "Content approved; other publication requirements remain.",
        );
      } else {
        await reject({ id, expectedRevision: reviewedRevision, note });
        toast.success("Rejection recorded.");
      }
      setOpen(false);
      setNote("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not record review.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setReviewedRevision(null);
          setOpen(true);
        }}
      >
        Review
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review listing content</DialogTitle>
            <DialogDescription>
              Review this exact revision in the property preview. Approving
              content does not grant identity verification or paid access, and
              cannot override an owner-hidden listing.
            </DialogDescription>
          </DialogHeader>
          <a
            href={`/listings/${id}`}
            target="_blank"
            rel="noreferrer"
            className="underline text-sm"
          >
            Open private property preview
          </a>
          <a
            className="underline text-sm"
            href={`/dashboard/landlord/listings/${id}/location`}
            target="_blank"
            rel="noreferrer"
          >
            Inspect private address and map location
          </a>
          <PublicationStatus state={state} />
          {stale && (
            <p role="alert" className="text-sm text-red-700">
              The content changed while this review was open. Reopen the review
              and inspect the new revision.
            </p>
          )}
          <label className="text-sm font-medium">
            Review note
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
              disabled={busy}
            />
          </label>
          {identity && (
            <section className="space-y-2 rounded-lg border p-3 text-sm">
              <h3 className="font-medium">Identity review</h3>
              <p>
                Status: {identity.status}
                {identity.onHold ? " · Staff hold" : ""}
              </p>
              <p className="text-xs text-slate-500">
                These controls use the review note above. A staff decision
                cannot mark an identity verified; confirmation must come from
                the provider.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => changeIdentity("hold")}
                >
                  Hold identity
                </Button>
                {identity.hasProviderSession && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => changeIdentity("recheck")}
                  >
                    Request provider recheck
                  </Button>
                )}
              </div>
              {!identity.hasProviderSession && (
                <>
                  <p className="text-xs text-slate-500">
                    For an interrupted start, locate this reference in the
                    provider dashboard and enter its account and workflow
                    references. Do not enter ID document details.
                  </p>
                  <label>
                    Provider account reference
                    <input
                      className="w-full rounded border px-2 py-1"
                      maxLength={128}
                      value={accountId}
                      onChange={(event) => setAccountId(event.target.value)}
                    />
                  </label>
                  <label>
                    Provider workflow reference
                    <input
                      className="w-full rounded border px-2 py-1"
                      maxLength={128}
                      value={workflowId}
                      onChange={(event) => setWorkflowId(event.target.value)}
                    />
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || !accountId || !workflowId}
                    onClick={() => changeIdentity("recover")}
                  >
                    Recover and recheck
                  </Button>
                </>
              )}
            </section>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy || !state || stale || reviewedRevision === null}
              onClick={() => decide(false)}
            >
              Reject revision
            </Button>
            <Button
              disabled={busy || !state || stale || reviewedRevision === null}
              onClick={() => decide(true)}
            >
              Approve content
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
