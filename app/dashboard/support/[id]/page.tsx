"use client";
import { use, useState } from "react";
import Link from "next/link";
import {
  useQuery,
  useMutation,
  usePaginatedQuery,
  useConvexAuth,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

function Audit({ id }: { id: Id<"supportCases"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.support.audit,
    { id },
    { initialNumItems: 20 },
  );
  return (
    <section className="border-t pt-4 space-y-3">
      <h2 className="font-semibold">Staff review history</h2>
      {results.map((a) => (
        <div key={a._id} className="text-sm">
          <p>
            {a.action} · {new Date(a.createdAt).toLocaleString()}
          </p>
          <p className="whitespace-pre-wrap">{a.note}</p>
        </div>
      ))}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(20)}>
          Older actions
        </Button>
      )}
    </section>
  );
}
export default function CasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: raw } = use(params);
  const id = raw as Id<"supportCases">;
  const { isAuthenticated } = useConvexAuth();
  const ticket = useQuery(api.support.get, isAuthenticated ? { id } : "skip");
  const { results, status, loadMore } = usePaginatedQuery(
    api.support.replies,
    isAuthenticated ? { id } : "skip",
    { initialNumItems: 20 },
  );
  const reply = useMutation(api.support.reply),
    review = useMutation(api.support.review),
    retry = useMutation(api.support.retryEmail);
  const [body, setBody] = useState(""),
    [internal, setInternal] = useState(false),
    [busy, setBusy] = useState(false);
  const [nextStatus, setNextStatus] = useState<
    "open" | "reviewing" | "resolved" | "dismissed"
  >("reviewing");
  const [note, setNote] = useState(""),
    [listingAction, setListingAction] = useState<"none" | "hold" | "release">(
      "none",
    );
  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  if (!ticket) return <div className="p-6">Loading case…</div>;
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Link
        className="underline text-sm"
        href={
          ticket.isStaff ? "/dashboard/admin/support" : "/dashboard/support"
        }
      >
        Back to cases
      </Link>
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{ticket.subject}</h1>
        <p className="text-sm text-slate-500 break-all">
          Reference: {id} · {ticket.status}
        </p>
        {ticket.category && <p>{ticket.category}</p>}
      </header>
      <section className="rounded-xl border bg-white p-5 space-y-3">
        <p className="font-medium">{ticket.name}</p>
        <p className="whitespace-pre-wrap break-words">{ticket.body}</p>
        {ticket.isStaff && <p className="text-sm">Contact: {ticket.email}</p>}
      </section>
      {ticket.isStaff && (
        <section className="rounded-xl border bg-white p-5 space-y-4">
          <h2 className="font-semibold">Staff review</h2>
          <p className="text-sm">
            Notification email: {ticket.notificationStatus}
          </p>
          {["failed", "unconfigured"].includes(ticket.notificationStatus) && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                perform(() => retry({ id }), "Notification queued")
              }
            >
              Retry staff notification
            </Button>
          )}
          {ticket.evidence && (
            <details>
              <summary className="cursor-pointer">
                Original reported content
              </summary>
              <pre className="mt-3 whitespace-pre-wrap break-all text-xs">
                {ticket.evidence}
              </pre>
            </details>
          )}
          {ticket.listingId && (
            <p className="text-sm">
              Property:{" "}
              <Link
                href={`/listings/${ticket.listingId}`}
                className="underline"
              >
                {ticket.listingId}
              </Link>{" "}
              ·{" "}
              {ticket.listingHeld ? "On moderation hold" : "No moderation hold"}
            </p>
          )}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              perform(async () => {
                await review({
                  id,
                  status: nextStatus,
                  note,
                  listingAction:
                    listingAction === "none" ? undefined : listingAction,
                });
                setNote("");
                setListingAction("none");
              }, "Review saved");
            }}
          >
            <label className="flex gap-3 items-center">
              Set status
              <select
                className="rounded border p-2"
                value={nextStatus}
                onChange={(e) =>
                  setNextStatus(e.target.value as typeof nextStatus)
                }
              >
                {["open", "reviewing", "resolved", "dismissed"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            {ticket.listingId && (
              <label className="flex gap-3 items-center">
                Listing action
                <select
                  className="rounded border p-2"
                  value={listingAction}
                  onChange={(e) =>
                    setListingAction(e.target.value as typeof listingAction)
                  }
                >
                  <option value="none">No action</option>
                  <option value="hold">
                    Hide listing and prevent publishing
                  </option>
                  <option value="release">
                    Release hold, keep current visibility
                  </option>
                </select>
              </label>
            )}
            <Label htmlFor="review-note">Private review note</Label>
            <Textarea
              id="review-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
              minLength={3}
              maxLength={2000}
            />
            <p className="text-xs text-slate-500">
              Review actions are logged privately. Use a reply below to explain
              the outcome to the requester.
            </p>
            <Button disabled={busy}>Save review</Button>
          </form>
          <Audit id={id} />
        </section>
      )}
      <section className="space-y-4">
        <h2 className="font-semibold">Replies · newest first</h2>
        {status === "LoadingFirstPage" && <p>Loading replies…</p>}
        {results.map((r) => (
          <article
            key={r._id}
            className="rounded-xl border bg-white p-4 space-y-2"
          >
            <p className="text-sm text-slate-500">
              {r.internal
                ? "Private staff note"
                : r.staff
                  ? "Support team"
                  : "Requester"}{" "}
              · {new Date(r.createdAt).toLocaleString()}
            </p>
            <p className="whitespace-pre-wrap break-words">{r.body}</p>
            {ticket.isStaff && r.emailStatus && (
              <p className="text-xs">Email: {r.emailStatus}</p>
            )}
            {ticket.isStaff &&
              r.emailStatus &&
              ["failed", "unconfigured"].includes(r.emailStatus) && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    perform(
                      () => retry({ id, replyId: r._id }),
                      "Reply email queued",
                    )
                  }
                >
                  Retry email
                </Button>
              )}
          </article>
        ))}
        {status === "CanLoadMore" && (
          <Button variant="outline" onClick={() => loadMore(20)}>
            Older replies
          </Button>
        )}
      </section>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          perform(
            async () => {
              await reply({ id, body, internal });
              setBody("");
            },
            internal ? "Private note saved" : "Reply saved",
          );
        }}
      >
        <Label htmlFor="reply">
          {internal ? "Private staff note" : "Follow-up message"}
        </Label>
        <Textarea
          id="reply"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          maxLength={5000}
          rows={5}
        />
        {ticket.isStaff && (
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
            />
            Staff only (never emailed to requester)
          </label>
        )}
        <Button disabled={busy}>
          {busy ? "Saving…" : internal ? "Save private note" : "Send reply"}
        </Button>
      </form>
    </div>
  );
}
