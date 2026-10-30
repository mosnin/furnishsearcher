"use client";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
export type PublicationState = FunctionReturnType<
  typeof api.publication.getReadiness
>;
export function PublicationStatus({ state }: { state?: PublicationState }) {
  if (!state) return null;
  return (
    <div className="border-t border-slate-100 px-4 py-3 text-sm space-y-2">
      <p className="font-medium">
        {state.live
          ? "Visible to travelers"
          : state.requested
            ? "Publication requested · not live"
            : "Hidden · publication not requested"}{" "}
        · Revision {state.revision} · {state.approval}
      </p>
      {state.reviewNote && (
        <p className="text-slate-600">Staff review: {state.reviewNote}</p>
      )}
      {state.issues.length > 0 && (
        <ul className="list-disc pl-5 text-slate-600 space-y-1">
          {state.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-4 text-xs">
        <Link href="/dashboard/landlord/billing" className="underline">
          Billing
        </Link>
        <Link href="/dashboard/support" className="underline">
          Support
        </Link>
      </div>
    </div>
  );
}
