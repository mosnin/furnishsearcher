"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useAction, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
export function IdentityPanel({ enabled = true }: { enabled?: boolean }) {
  const { isAuthenticated } = useConvexAuth();
  const state = useQuery(
      api.identity.mine,
      enabled && isAuthenticated ? {} : "skip",
    ),
    start = useAction(api.identity.start),
    refresh = useAction(api.identity.refresh);
  const [busy, setBusy] = useState(false);
  async function run(open: boolean, restart = false) {
    setBusy(true);
    try {
      if (open) {
        const url = await start({
          retryExpired: restart || !!state?.sessionExpired,
        });
        if (url) window.location.assign(url);
      } else {
        await refresh({});
        toast.success("Verification status refreshed.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update verification.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <h2 className="font-semibold text-slate-900">
        Owner identity verification
      </h2>
      <p className="text-sm text-slate-600">
        Verify through Jumio's hosted ID and selfie process. Review the
        provider's consent and privacy terms there. Your ID images and document
        details are not stored in this app.
      </p>
      {!state ? (
        <p role="status">Loading verification status…</p>
      ) : (
        <>
          <p className="text-sm" role="status">
            Status: {state.status.replaceAll("_", " ")}
            {state.mode === "test" ? " · Test verification" : ""}
          </p>
          {!state.configured && (
            <p className="text-sm text-amber-800">
              Verification is not available yet. Contact support to finish
              provider setup.
            </p>
          )}
          {state.status === "review" && (
            <p className="text-sm text-amber-800">
              This attempt needs review. Contact support with its reference
              before starting another check.
            </p>
          )}
          {state.sessionExpired && (
            <p className="text-sm text-amber-800">
              The resume link is no longer available in this app. Refresh its
              status first; restarting creates a new provider check.
            </p>
          )}
          {state.reference && (
            <p className="text-xs break-all text-slate-500">
              Reference: {state.reference}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {state.status !== "passed" && (
              <Button
                disabled={
                  busy ||
                  !state.configured ||
                  ["creating", "review"].includes(state.status)
                }
                onClick={() => run(true)}
              >
                {busy
                  ? "Working…"
                  : state.sessionExpired
                    ? "Start new verification"
                    : state.status === "pending"
                      ? "Continue verification"
                      : "Start verification"}
              </Button>
            )}
            {state.status === "pending" && !state.sessionExpired && (
              <Button
                variant="outline"
                disabled={busy || !state.configured}
                onClick={() => run(true, true)}
              >
                Start a new check
              </Button>
            )}
            {["pending", "review"].includes(state.status) && (
              <Button
                variant="outline"
                disabled={busy || !state.configured}
                onClick={() => run(false)}
              >
                Refresh status
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href="/dashboard/support">Contact support</Link>
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
