"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/star-rating";
import { toast } from "sonner";
const day = (timestamp?: number) =>
  timestamp === undefined ? "" : new Date(timestamp).toISOString().slice(0, 10);
type Props = {
  listingId: Id<"listings">;
  landlordId: Id<"users">;
  landlordName: string;
  reviewerId: Id<"users">;
  isOpen: boolean;
  onClose: () => void;
  kind?: "property" | "traveler";
  subjectId?: Id<"users">;
  invitationId?: Id<"reviewInvitations">;
  bookingId?: Id<"bookingInquiries">;
  stayStart?: number;
  stayEnd?: number;
};
export function ReviewForm(p: Props) {
  const { isAuthenticated } = useConvexAuth();
  const context = useQuery(
    api.reviews.context,
    p.isOpen && isAuthenticated
      ? {
          listingId: p.listingId,
          kind: p.kind,
          subjectId: p.subjectId,
          invitationId: p.invitationId,
        }
      : "skip",
  );
  const create = useMutation(api.reviews.create);
  const [rating, setRating] = useState(0),
    [title, setTitle] = useState(""),
    [comment, setComment] = useState(""),
    [phone, setPhone] = useState(""),
    [start, setStart] = useState(day(p.stayStart)),
    [end, setEnd] = useState(day(p.stayEnd)),
    [evidence, setEvidence] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const existing = context?.existing,
    bookingId = existing?.bookingId ?? p.bookingId;
  useEffect(() => {
    if (!p.isOpen) return;
    setRating(existing?.rating ?? 0);
    setTitle(existing?.title ?? "");
    setComment(existing?.comment ?? "");
    setPhone(existing?.phone ?? "");
    setStart(day(existing?.stayStart ?? p.stayStart));
    setEnd(day(existing?.stayEnd ?? p.stayEnd));
    setEvidence(existing?.stayEvidence ?? "");
    setConfirmed(false);
    setError("");
  }, [p.isOpen, existing?._id, existing?.revision, p.stayStart, p.stayEnd]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await create({
        listingId: p.listingId,
        expectedRevision: existing?.revision,
        invitationId: existing?.invitationId ?? p.invitationId,
        landlordId: context?.landlordId ?? p.landlordId,
        reviewerId: p.reviewerId,
        kind: p.kind,
        subjectId: p.subjectId,
        title,
        rating,
        comment,
        phone,
        stayStart: Date.parse(`${start}T00:00:00Z`),
        stayEnd: Date.parse(`${end}T00:00:00Z`),
        bookingId,
        stayEvidence: evidence,
        experienceConfirmed: confirmed,
      });
      toast.success("Review submitted for moderation. It is not public yet.");
      p.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit review.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={p.isOpen}
      onOpenChange={(value) => !value && !busy && p.onClose()}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {p.kind === "traveler" ? "Review traveler" : "Review property"}
          </DialogTitle>
          <DialogDescription>
            {context?.listingTitle ?? p.landlordName} · Reviews and responses
            are moderated before publication.
          </DialogDescription>
        </DialogHeader>
        {!context ? (
          <p role="status">Loading review status…</p>
        ) : !context.canSubmit ? (
          <div className="space-y-3">
            <p>
              Your review is {existing?.status ?? "unavailable"}. Use My reviews
              to follow its status or request removal.
            </p>
            <Button asChild variant="outline">
              <a href="/dashboard/reviews">My reviews</a>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {existing?.status === "removed" && (
              <p className="rounded border p-3 text-sm">
                Your previous review was removed. Submit a replacement for fresh
                staff moderation. It stays private until approved; the prior
                text and replies remain in staff history.
              </p>
            )}
            {existing?.moderationNote && (
              <p className="rounded border p-3 text-sm">
                Staff feedback: {existing.moderationNote}
              </p>
            )}
            <div>
              <p className="text-sm font-medium">Rating</p>
              <StarRating rating={rating} interactive onChange={setRating} />
            </div>
            <label className="block text-sm font-medium">
              Review title
              <Input
                required
                minLength={3}
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Your review
              <Textarea
                required
                minLength={20}
                maxLength={1000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={5}
              />
              <span className="text-xs text-slate-500">
                {comment.length}/1000 · Do not include names, addresses, contact
                details, threats or promotional content.
              </span>
            </label>
            <label className="block text-sm font-medium">
              Private contact phone
              <Input
                type="tel"
                autoComplete="tel"
                required
                maxLength={30}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <span className="text-xs text-slate-500">
                Only you and staff can see this. Providing a number does not
                verify it.
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">
                Check-in
                <Input
                  type="date"
                  required
                  readOnly={!!bookingId}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label className="text-sm font-medium">
                Check-out
                <Input
                  type="date"
                  required
                  readOnly={!!bookingId}
                  min={start}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
            {bookingId ? (
              <p className="text-xs text-slate-600">
                Linked to your accepted inquiry. Staff still review the actual
                stay and content.
              </p>
            ) : (
              <label className="block text-sm font-medium">
                Private stay context
                <Textarea
                  required
                  minLength={20}
                  maxLength={1000}
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  placeholder="Explain how the stay was arranged and confirmed. Do not include ID documents, payment details or private addresses."
                />
                <span className="text-xs text-slate-500">
                  A stay arranged outside this app needs staff review. Support
                  may ask for more information.
                </span>
              </label>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1"
              />
              <span>
                I personally experienced this stay. This review is accurate,
                unbiased, contains no private information, and is not
                incentivized or about my own, a friend’s, or a relative’s
                property.
              </span>
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={p.onClose}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || rating < 1 || !confirmed}>
                {busy
                  ? "Submitting…"
                  : existing?.status === "removed"
                    ? "Submit replacement for review"
                    : "Submit for review"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
