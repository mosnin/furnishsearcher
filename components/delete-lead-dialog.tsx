"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function DeleteLeadDialog({
  deliveryId,
  traveler,
  location,
  disabled,
}: {
  deliveryId: Id<"housingRequestDeliveries">;
  traveler: string;
  location: string;
  disabled: boolean;
}) {
  const remove = useMutation(api.housingRequests.deleteLead);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await remove({ deliveryId });
      setOpen(false);
      toast.success("Lead deleted");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to delete this lead. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="text-red-700"
        disabled={disabled || busy}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Delete lead
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this tenant lead?</DialogTitle>
            <DialogDescription>
              Permanently remove {traveler}’s {location} lead from your Tenant
              Requests. You cannot restore it. Booking inquiries and existing
              conversations stay in Messages. The traveler’s request remains
              available to other owners. Emails already sent or in progress
              cannot be recalled.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Keep lead
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {busy ? "Deleting…" : "Permanently delete lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
