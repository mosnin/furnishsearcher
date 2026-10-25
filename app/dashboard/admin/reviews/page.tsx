"use client";
import { useState } from "react";
import {
  useConvexAuth,
  usePaginatedQuery,
  useMutation,
  useQuery,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
type View =
  | "pending"
  | "approved"
  | "rejected"
  | "removed"
  | "responses"
  | "reports"
  | "legacy";
type Row = FunctionReturnType<typeof api.reviews.queue>["page"][number];
function Audit({ id }: { id: Id<"reviews"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.reviews.history,
    { id },
    { initialNumItems: 10 },
  );
  return (
    <div className="space-y-2 border-t pt-3">
      {results.map((r, index) => (
        <details key={`${r.createdAt}-${index}`}>
          <summary className="text-xs">
            {r.action} · revision {r.revision} ·{" "}
            {new Date(r.createdAt).toLocaleString()}
          </summary>
          <p className="text-sm">{r.note}</p>
          {r.snapshot && (
            <pre className="whitespace-pre-wrap break-all text-xs">
              {r.snapshot}
            </pre>
          )}
        </details>
      ))}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(10)}>
          Older audit events
        </Button>
      )}
    </div>
  );
}
function ModerationCard({ r, view }: { r: Row; view: View }) {
  const [note, setNote] = useState(""),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState(false),
    [reviewed] = useState({ review: r.revision, response: r.responseRevision }),
    [part, setPart] = useState<"review" | "response">(
      view === "responses" ? "response" : "review",
    );
  const moderate = useMutation(api.reviews.moderate),
    resolve = useMutation(api.reviews.resolveFlag),
    revision = reviewed[part],
    stale = revision !== (part === "review" ? r.revision : r.responseRevision);
  async function decide(
    decision: "approved" | "rejected" | "removed" | "resolve",
  ) {
    setBusy(true);
    try {
      if (decision === "resolve") await resolve({ id: r._id, note });
      else
        await moderate({
          id: r._id,
          part,
          decision,
          expectedRevision: revision,
          note,
          experienceChecked: checked,
        });
      toast.success("Moderation decision saved.");
      setNote("");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not save moderation.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex justify-between gap-3">
          <h2 className="font-semibold">{r.listingTitle}</h2>
          <span className="text-sm">
            {r.kind} · {r.status} · revision {r.revision}
          </span>
        </div>
        <p className="text-sm">
          Rating: {r.rating}/5 · Author: {r.reviewerName}
        </p>
        <h3 className="font-medium">{r.title}</h3>
        <p className="whitespace-pre-wrap text-sm">{r.comment}</p>
        <div className="rounded border p-3 text-sm space-y-1">
          <p>Private phone: {r.phone || "Missing (not verified)"}</p>
          <p>
            Stay:{" "}
            {r.stayStart
              ? new Date(r.stayStart).toISOString().slice(0, 10)
              : "Missing"}{" "}
            –{" "}
            {r.stayEnd
              ? new Date(r.stayEnd).toISOString().slice(0, 10)
              : "Missing"}
          </p>
          <p>Inquiry: {r.bookingId ?? "Arranged outside the app"}</p>
          <p className="whitespace-pre-wrap">
            Private stay context: {r.stayEvidence || "None supplied"}
          </p>
        </div>
        {r.removalRequested && (
          <p className="text-sm rounded bg-amber-50 p-3">
            Removal/report reason: {r.removalReason}
          </p>
        )}
        {r.responseDraft && (
          <div className="rounded border p-3">
            <p className="text-xs">
              Response: {r.responseStatus} · revision {r.responseRevision}
            </p>
            <p className="whitespace-pre-wrap text-sm">{r.responseDraft}</p>
          </div>
        )}
        {r.responseDraft && (
          <label className="block text-sm font-medium">
            Moderate
            <select
              className="ml-3 rounded border p-2"
              value={part}
              onChange={(e) => setPart(e.target.value as "review" | "response")}
              disabled={busy}
            >
              <option value="review">Review</option>
              <option value="response">Response</option>
            </select>
          </label>
        )}
        {stale && (
          <p role="alert" className="text-red-700">
            The submission changed. Reload this queue and inspect the new
            revision.
          </p>
        )}
        <label className="block text-sm font-medium">
          Decision note (shared with the author)
          <Textarea
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {part === "review" && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1"
            />
            <span>
              I checked the confirmed stay context and content for privacy,
              conflicts, incentives, threats and relevance. An accepted inquiry
              alone does not prove the stay occurred.
            </span>
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={
              busy ||
              stale ||
              note.trim().length < 3 ||
              (part === "review" && !checked)
            }
            onClick={() => decide("approved")}
          >
            Approve {part}
          </Button>
          <Button
            variant="outline"
            disabled={busy || stale || note.trim().length < 3}
            onClick={() => decide("rejected")}
          >
            Decline {part}
          </Button>
          <Button
            variant="destructive"
            disabled={busy || stale || note.trim().length < 3}
            onClick={() => decide("removed")}
          >
            Remove {part}
          </Button>
          {r.removalRequested && (
            <Button
              variant="outline"
              disabled={busy || note.trim().length < 3}
              onClick={() => decide("resolve")}
            >
              Resolve report without removal
            </Button>
          )}
          <Button variant="ghost" onClick={() => setHistory(!history)}>
            Audit history
          </Button>
        </div>
        {history && <Audit id={r._id} />}
      </CardContent>
    </Card>
  );
}
export default function ReviewModeration() {
  const { isAuthenticated } = useConvexAuth(),
    [view, setView] = useState<View>("pending"),
    { results, status, loadMore } = usePaginatedQuery(
      api.reviews.queue,
      isAuthenticated ? { view } : "skip",
      { initialNumItems: 10 },
    );
  return (
    <main className="mx-auto max-w-4xl p-6 space-y-5">
      <h1 className="text-2xl font-bold">Review moderation</h1>
      <p className="text-sm text-slate-600">
        Publish reviews based on experience and content standards, regardless of
        rating. Legacy reviews require the author to supply the missing stay
        details before approval.
      </p>
      <label className="block text-sm">
        Queue
        <select
          className="ml-3 rounded border p-2"
          value={view}
          onChange={(e) => setView(e.target.value as View)}
        >
          {[
            "pending",
            "responses",
            "reports",
            "approved",
            "rejected",
            "removed",
            "legacy",
          ].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading moderation queue…</p>
      ) : results.length === 0 ? (
        <p>No submissions in this queue.</p>
      ) : (
        results.map((r) => (
          <ModerationCard key={`${view}-${r._id}`} r={r} view={view} />
        ))
      )}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(10)}>
          Load more submissions
        </Button>
      )}
    </main>
  );
}
