"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent } from "./ui/card";
import { ReviewForm } from "./review-form";
import { toast } from "sonner";
export function ReviewEmailRequests({
  enabled,
  reviewerId,
  initialId,
}: {
  enabled: boolean;
  reviewerId?: Id<"users">;
  initialId?: string | null;
}) {
  const [reference, setReference] = useState(""),
    [email, setEmail] = useState(""),
    [agreed, setAgreed] = useState(false),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string | null>(initialId ?? null),
    [open, setOpen] = useState(false);
  useEffect(() => {
    setSelected(initialId ?? null);
    setOpen(false);
  }, [initialId]);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const properties = usePaginatedQuery(
      api.reviewInvitations.properties,
      enabled ? {} : "skip",
      { initialNumItems: 10 },
    ),
    sent = usePaginatedQuery(
      api.reviewInvitations.list,
      enabled ? { direction: "sent" } : "skip",
      { initialNumItems: 10 },
    ),
    received = usePaginatedQuery(
      api.reviewInvitations.list,
      enabled ? { direction: "received" } : "skip",
      { initialNumItems: 10 },
    ),
    context = useQuery(
      api.reviewInvitations.context,
      enabled && selected ? { id: selected } : "skip",
    ),
    request = useMutation(api.reviewInvitations.request),
    close = useMutation(api.reviewInvitations.close),
    retry = useMutation(api.reviewInvitations.retry);
  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not update review request.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const key = JSON.stringify([
        reference.trim(),
        email.trim().toLowerCase(),
      ]);
      if (attempt.current?.key !== key)
        attempt.current = { key, id: crypto.randomUUID() };
      const result = await request({
        propertyReference: reference,
        email,
        agreed,
        requestId: attempt.current!.id,
      });
      if (result.status === "unavailable")
        toast.error(
          "Request unavailable. Check the property and verified account email. No email was sent.",
        );
      else if (result.status === "limited")
        toast.error("Daily review-request limit reached. Try again tomorrow.");
      else {
        toast.success(
          result.status === "existing"
            ? "An existing request is shown below."
            : "Review request saved. Check its delivery status below.",
        );
        setAgreed(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not request review.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">
        Request an honest review by email
      </h2>
      <p className="text-sm text-slate-600">
        Choose your property to ask a past traveler for a property review, or
        enter the property you stayed in to ask its owner for a traveler review.
        The email must match an existing account’s verified primary sign-in
        email. An app booking is not required. Requests do not verify a stay;
        every review needs staff moderation.
      </p>
      <Card>
        <CardContent className="p-5">
          <form onSubmit={submit} className="space-y-3">
            {properties.results.length > 0 && (
              <label className="block text-sm font-medium">
                Your properties
                <select
                  className="block w-full border rounded-md p-2 mt-1"
                  value={
                    properties.results.some(
                      (p) => (p.publicId ?? p.id) === reference,
                    )
                      ? reference
                      : ""
                  }
                  onChange={(e) => setReference(e.target.value)}
                >
                  <option value="">
                    Choose a property, or enter another below
                  </option>
                  {properties.results.map((p) => (
                    <option key={p.id} value={p.publicId ?? p.id}>
                      {p.publicId ?? "Property"} · {p.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {properties.status === "CanLoadMore" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => properties.loadMore(10)}
              >
                More properties
              </Button>
            )}
            <label className="block text-sm font-medium">
              Property number or listing ID
              <Input
                required
                maxLength={100}
                placeholder="FS-…"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Stay partner’s account email
              <Input
                required
                type="email"
                autoComplete="off"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                I am requesting an honest review of a stay that occurred,
                without incentives. This request will be visible to the matching
                account and may be emailed to it.
              </span>
            </label>
            <Button
              disabled={
                !enabled ||
                busy ||
                !agreed ||
                !reference.trim() ||
                !email.trim()
              }
              type="submit"
            >
              Request review
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="space-y-3">
        <h3 className="font-semibold">Requests sent by me</h3>
        {sent.status === "LoadingFirstPage" ? (
          <p role="status">Loading requests…</p>
        ) : (
          !sent.results.length && (
            <p className="text-sm">No email review requests yet.</p>
          )
        )}
        {sent.results.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-4 space-y-2 break-words">
              <p className="text-sm">
                {r.propertyReference} · {r.email}
              </p>
              <p className="text-sm">
                {r.submitted
                  ? "Review submitted for moderation"
                  : r.state !== "active"
                    ? r.state
                    : r.expiresAt <= Date.now()
                      ? "Expired"
                      : r.available
                        ? "Awaiting a review"
                        : "Unavailable"}{" "}
                · Email:{" "}
                {r.emailStatus === "sent"
                  ? "accepted by email provider"
                  : r.emailStatus}
              </p>
              <div className="flex flex-wrap gap-2">
                {r.state === "active" && !r.submitted && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => close({ id: r.id }),
                        "Future review-request access revoked. Delivered emails and submitted reviews remain.",
                      )
                    }
                  >
                    Revoke request
                  </Button>
                )}
                {r.available &&
                  ["failed", "unconfigured", "suppressed"].includes(
                    r.emailStatus,
                  ) && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => retry({ id: r.id }),
                          "Delivery retry requested",
                        )
                      }
                    >
                      Retry request email
                    </Button>
                  )}
              </div>
            </CardContent>
          </Card>
        ))}
        {sent.status === "CanLoadMore" && (
          <Button variant="outline" onClick={() => sent.loadMore(10)}>
            More sent requests
          </Button>
        )}
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold">Review requests received</h3>
        {received.status === "LoadingFirstPage" ? (
          <p role="status">Loading requests…</p>
        ) : (
          !received.results.length && (
            <p className="text-sm">No email review requests received.</p>
          )
        )}
        {received.results.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm break-words">
                Property {r.propertyReference} ·{" "}
                {r.submitted
                  ? "Review submitted"
                  : r.state !== "active"
                    ? r.state
                    : r.available
                      ? "Review requested"
                      : "Unavailable or expired"}
              </p>
              {r.available && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setOpen(false);
                      setSelected(r.id);
                    }}
                  >
                    Open review request
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(() => close({ id: r.id }), "Review request declined")
                    }
                  >
                    Decline request
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {received.status === "CanLoadMore" && (
          <Button variant="outline" onClick={() => received.loadMore(10)}>
            More received requests
          </Button>
        )}
      </div>
      {selected && (
        <Card>
          <CardContent className="p-5 space-y-3">
            {context === undefined ? (
              <p role="status">Loading private review request…</p>
            ) : context === null ? (
              <p>
                This review request is unavailable, expired or already
                completed. Sign in with the invited account, or contact your
                stay partner.
              </p>
            ) : (
              <>
                <p>
                  {context.requesterName} requested an honest{" "}
                  {context.kind === "property" ? "property" : "traveler"} review
                  for {context.title}.
                </p>
                <p className="text-sm text-slate-600">
                  Only continue if you personally experienced the stay. This
                  invitation does not confirm its authenticity or grant access
                  to private account details.
                </p>
                <Button onClick={() => setOpen(true)}>
                  Write requested review
                </Button>
                {open && reviewerId && (
                  <ReviewForm
                    listingId={context.listingId}
                    landlordId={context.landlordId}
                    landlordName={context.title}
                    reviewerId={reviewerId}
                    subjectId={context.subjectId}
                    kind={context.kind}
                    invitationId={context.id}
                    isOpen
                    onClose={() => setOpen(false)}
                  />
                )}
              </>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setSelected(null);
              }}
            >
              Close request details
            </Button>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
