"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
export function ResponseRatePanel({
  listingId,
  refreshKey,
}: {
  listingId: Id<"listings"> | null;
  refreshKey?: string;
}) {
  const report = useQuery(
    api.responsiveness.report,
    listingId ? { listingId, refreshKey } : "skip",
  );
  const reset = useMutation(api.responsiveness.reset);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  async function confirmReset() {
    if (!listingId) return;
    setBusy(true);
    try {
      await reset({ listingId, confirmAllRentalSpaces: true });
      setOpen(false);
      toast.success("Response rates reset for all your rental spaces.");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not reset response rates.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <h2 className="font-semibold text-lg">Response rate</h2>
        {!listingId ? (
          <p className="text-sm text-slate-600">
            Select a property or unit to see its private response rate and
            public response time.
          </p>
        ) : !report ? (
          <p role="status">Loading response history…</p>
        ) : (
          <>
            <p className="font-semibold">
              {report.percent === null
                ? report.grade
                : `${report.percent.toFixed(1)}% · ${report.grade}`}
            </p>
            {report.ready ? (
              <>
                <p className="text-sm">
                  {report.onTime} of {report.received} first traveler
                  conversations answered within 24 hours.{" "}
                  {report.basis === "last_three" && report.received > 0
                    ? "No new qualifying conversations in the last 90 UTC calendar days; using the last three since your reset, if any."
                    : "Based on new conversations in the last 90 UTC calendar days."}
                </p>
                <p className="text-sm text-slate-600">
                  Only your first in-app reply counts. Housing requests,
                  owner-started conversations, email/phone replies and booking
                  status changes do not count. An unanswered conversation is
                  included even while its 24-hour window is open, so this rate
                  can change.
                </p>
                <p className="text-sm">
                  Public response time:{" "}
                  {report.typical ?? "Not enough measured reply history"}.{" "}
                  {report.typical
                    ? "The median response band of measured replies to conversations started in the last 90 UTC calendar days."
                    : "No response-time promise is shown to travelers."}{" "}
                  Your percentage is private.
                </p>
                {report.hasUnmeasuredHistory && (
                  <p className="text-sm text-slate-600">
                    Some older conversations lack a known first-message source
                    and are unmeasured.
                  </p>
                )}
                {report.resetAt !== null && (
                  <p className="text-sm text-slate-600">
                    One-time account reset used{" "}
                    {new Date(report.resetAt).toISOString().slice(0, 10)}.
                    Earlier messages remain in your inbox; public response-time
                    history is unchanged.
                  </p>
                )}
                {report.canReset && (
                  <Button variant="outline" onClick={() => setOpen(true)}>
                    Reset my response rates
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-600">
                Adopting native conversation history. Rates and public
                response-time labels remain unavailable until it finishes.
              </p>
            )}
            <p>
              <Link className="text-sm underline" href="/dashboard/messages">
                Open messages
              </Link>
            </p>
          </>
        )}
        <Dialog
          open={open}
          onOpenChange={(value) => {
            if (!busy) setOpen(value);
          }}
        >
          <DialogContent
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              if (busy) e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>Reset rates for all rental spaces?</DialogTitle>
              <DialogDescription>
                This one-time account reset cannot be undone. Every current
                rental space starts fresh; only conversations started after this
                reset affect its response rate. Existing messages and public
                response-time history are retained.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
                autoFocus
              >
                Keep my rates
              </Button>
              <Button disabled={busy} onClick={confirmReset}>
                {busy ? "Resetting…" : "Use my one-time reset"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
export function ListingResponseTime({
  listingId,
}: {
  listingId: Id<"listings">;
}) {
  const time = useQuery(api.responsiveness.publicTime, { listingId });
  return time ? (
    <p className="text-xs text-slate-500 mt-1">{time.label}</p>
  ) : null;
}
