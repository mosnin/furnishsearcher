"use client";
import { useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const reasons = [
  "Misleading or fraudulent listing",
  "Discrimination",
  "Safety or privacy concern",
  "Harassment or abusive conduct",
  "Spam or suspicious message",
  "Other",
];
export function ReportDialog({
  listingId,
  messageId,
}: {
  listingId?: Id<"listings">;
  messageId?: Id<"messages">;
}) {
  const { isSignedIn } = useUser();
  const report = useMutation(api.support.report);
  const [reason, setReason] = useState(
    messageId ? "Spam or suspicious message" : reasons[0],
  );
  const [details, setDetails] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-slate-500">
          {messageId ? "Report message" : "Report this property"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {messageId ? "Report a message" : "Report this property"}
          </DialogTitle>
          <DialogDescription>
            Reports are private to you and staff. Include what happened so staff
            can review it. Reporting does not automatically block a user.
          </DialogDescription>
        </DialogHeader>
        {!isSignedIn ? (
          <p>
            <Link href="/sign-in" className="underline">
              Sign in to report
            </Link>
            , or{" "}
            <Link href="/contact" className="underline">
              contact support
            </Link>
            .
          </p>
        ) : caseId ? (
          <div role="status" className="space-y-3">
            <p>Your report is saved. Reference: {caseId}</p>
            <Link href={`/dashboard/support/${caseId}`} className="underline">
              View your case and follow up
            </Link>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                setCaseId(
                  await report({
                    listingId,
                    messageId,
                    category: reason,
                    details,
                  }),
                );
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Unable to save report.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="report-reason">Reason</Label>
              <select
                id="report-reason"
                className="w-full rounded-md border p-2"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {reasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-details">What happened?</Label>
              <Textarea
                id="report-details"
                required
                minLength={10}
                maxLength={5000}
                rows={5}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Do not include passwords, payment card details or identity
                documents.
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <Button disabled={busy}>
              {busy ? "Saving…" : "Submit report"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
