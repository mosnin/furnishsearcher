"use client";
import { useState } from "react";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
export function ReviewActions({ id }: { id: Id<"reviews"> }) {
  const { isAuthenticated } = useConvexAuth(),
    state = useQuery(api.reviews.actions, isAuthenticated ? { id } : "skip"),
    respond = useMutation(api.reviews.respond),
    flag = useMutation(api.reviews.flag);
  const [mode, setMode] = useState<"reply" | "report" | null>(null),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  if (!state) return null;
  async function submit() {
    setBusy(true);
    try {
      if (mode === "reply") await respond({ id, body: text });
      else await flag({ id, reason: text });
      toast.success(
        mode === "reply"
          ? "Response submitted for moderation."
          : "Concern sent to staff for review.",
      );
      setMode(null);
      setText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 text-sm">
      {state.responseStatus && (
        <p className="text-slate-600">
          Your response: {state.responseStatus}
          {state.responseNote ? ` · ${state.responseNote}` : ""}
        </p>
      )}
      <div className="flex gap-2">
        {state.canRespond && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setMode("reply");
              setText(state.responseDraft);
            }}
          >
            Reply to review
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={state.reported}
          onClick={() => {
            setMode("report");
            setText("");
          }}
        >
          {state.reported
            ? "Staff review requested"
            : state.isAuthor
              ? "Request removal"
              : "Report review"}
        </Button>
      </div>
      {mode && (
        <div className="space-y-2">
          <label className="block">
            {mode === "reply"
              ? "Public response (moderated before publication)"
              : "Private reason for staff review"}
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
            />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={
                busy || text.trim().length < (mode === "reply" ? 3 : 10)
              }
              onClick={submit}
            >
              Submit
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setMode(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
