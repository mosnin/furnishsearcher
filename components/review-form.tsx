"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/star-rating";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MIN_COMMENT_LENGTH = 20;
const MAX_COMMENT_LENGTH = 500;

interface ReviewFormProps {
  listingId: Id<"listings">;
  landlordId: Id<"users">;
  landlordName: string;
  reviewerId: Id<"users">;
  isOpen: boolean;
  onClose: () => void;
}

export function ReviewForm({
  listingId,
  landlordId,
  landlordName,
  reviewerId,
  isOpen,
  onClose,
}: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createReview = useMutation(api.reviews.create);

  const canReview = useQuery(api.reviews.canReview, {
    reviewerId,
    listingId,
  });

  const charsRemaining = MAX_COMMENT_LENGTH - comment.length;
  const isCommentValid =
    comment.trim().length >= MIN_COMMENT_LENGTH &&
    comment.length <= MAX_COMMENT_LENGTH;
  const canSubmit = rating > 0 && isCommentValid && !submitting && canReview === true;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      await createReview({
        listingId,
        landlordId,
        reviewerId,
        rating,
        comment: comment.trim(),
      });
      setSubmitted(true);
      toast.success("Review submitted successfully!");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit review. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
    // Reset after close animation
    setTimeout(() => {
      setRating(0);
      setComment("");
      setSubmitting(false);
      setSubmitted(false);
      setError(null);
    }, 300);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        {submitted ? (
          /* Success state */
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl">Review submitted!</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Thank you for sharing your experience. Your review helps other renters
                make informed decisions.
              </DialogDescription>
            </DialogHeader>
            <Button onClick={handleClose} className="mt-2 w-full sm:w-auto">
              Done
            </Button>
          </div>
        ) : canReview === false ? (
          /* Already reviewed state */
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <DialogHeader>
              <DialogTitle>Already reviewed</DialogTitle>
              <DialogDescription>
                You&apos;ve already reviewed this listing. You can only submit one review per
                listing.
              </DialogDescription>
            </DialogHeader>
            <Button onClick={handleClose} variant="outline" className="mt-2">
              Close
            </Button>
          </div>
        ) : (
          /* Form state */
          <>
            <DialogHeader>
              <DialogTitle>Write a Review for {landlordName}</DialogTitle>
              <DialogDescription>
                Share your honest experience to help other renters.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-5 mt-1">
              {/* Star selector */}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-foreground">Your Rating</p>
                <StarRating
                  rating={rating}
                  size="lg"
                  interactive
                  onChange={setRating}
                  showNumeric
                />
                {rating === 0 && (
                  <p className="text-xs text-muted-foreground">Click a star to rate</p>
                )}
              </div>

              {/* Comment textarea */}
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium text-foreground">Your Review</p>
                <Textarea
                  placeholder={`Describe your experience renting from ${landlordName}. What was communication like? Would you rent from them again?`}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={5}
                  maxLength={MAX_COMMENT_LENGTH}
                  className="resize-none text-sm"
                  disabled={submitting}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {comment.trim().length < MIN_COMMENT_LENGTH && comment.length > 0 ? (
                      <span className="text-amber-600">
                        {MIN_COMMENT_LENGTH - comment.trim().length} more characters needed
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      charsRemaining < 50 ? "text-amber-600" : "text-muted-foreground"
                    )}
                  >
                    {charsRemaining} remaining
                  </span>
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <DialogFooter className="mt-2 gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Submit Review"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
