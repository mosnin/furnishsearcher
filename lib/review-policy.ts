// Author changes always return to moderation; published reviews stay immutable.
export function canResubmitReview(status?: string) {
  return !status || status === "rejected" || status === "removed";
}
