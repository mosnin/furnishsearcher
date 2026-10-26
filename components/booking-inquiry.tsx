"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseDate } from "@/lib/search";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type InquiryProps = {
  listingId: Id<"listings">;
  minStay: number;
  petFriendly: boolean;
  needsProfile?: boolean;
};
export function BookingInquiry(props: InquiryProps) {
  const params = useSearchParams();
  return (
    <BookingInquiryForm
      key={JSON.stringify([
        props.listingId,
        params.get("moveIn"),
        params.get("moveOut"),
      ])}
      {...props}
    />
  );
}
function BookingInquiryForm({
  listingId,
  minStay,
  petFriendly,
  needsProfile,
}: InquiryProps) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const create = useMutation(api.inquiries.create);
  const [open, setOpen] = useState(false);
  const inFlight = useRef(false);
  const reference = useRef<{ payload: string; id: string } | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const params = useSearchParams();
  function initial(key: string) {
    const value = params.get(key) ?? "";
    try {
      parseDate(value);
      return value;
    } catch {
      return "";
    }
  }
  const [moveIn, setMoveIn] = useState(() => initial("moveIn"));
  const [moveOut, setMoveOut] = useState(() => initial("moveOut"));
  const [occupants, setOccupants] = useState(1);
  const [pets, setPets] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const fields = {
        listingId,
        moveIn: Date.parse(moveIn),
        moveOut: Date.parse(moveOut),
        occupants,
        pets,
        message: message.trim(),
      };
      const payload = JSON.stringify(fields);
      if (reference.current?.payload !== payload)
        reference.current = { payload, id: crypto.randomUUID() };
      await create({ ...fields, clientRequestId: reference.current.id });
      setSent(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to send inquiry. Please try again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        className="w-full"
        onClick={() => setOpen(true)}
        disabled={isLoading}
      >
        Send booking inquiry
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!inFlight.current) setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {sent ? "Inquiry sent" : "Ask about your stay"}
            </DialogTitle>
            <DialogDescription>
              {sent
                ? "The owner can review your dates and reply. An inquiry does not charge you or sign a lease."
                : `Minimum stay: ${Math.max(1, minStay) * 30} days. No payment is required to inquire.`}
            </DialogDescription>
          </DialogHeader>
          {sent ? (
            <div className="space-y-4">
              <Button asChild>
                <Link href="/dashboard/inquiries">View my inquiries</Link>
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          ) : !isAuthenticated ? (
            <Button asChild>
              <Link
                href={`/sign-in?redirect_url=${encodeURIComponent(`/listings/${listingId}`)}`}
              >
                Sign in to send an inquiry
              </Link>
            </Button>
          ) : needsProfile ? (
            <Button asChild>
              <Link href="/onboarding">
                Complete your profile to send an inquiry
              </Link>
            </Button>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="inquiry-in">Move-in</Label>
                  <Input
                    id="inquiry-in"
                    type="date"
                    value={moveIn}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setMoveIn(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inquiry-out">Move-out</Label>
                  <Input
                    id="inquiry-out"
                    type="date"
                    value={moveOut}
                    min={moveIn || new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setMoveOut(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="inquiry-guests">Occupants</Label>
                <Input
                  id="inquiry-guests"
                  type="number"
                  min={1}
                  max={30}
                  value={occupants}
                  onChange={(e) => setOccupants(Number(e.target.value))}
                  required
                />
              </div>
              {petFriendly && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={pets}
                    onChange={(e) => setPets(e.target.checked)}
                  />
                  I am traveling with pets
                </label>
              )}
              <div className="space-y-1">
                <Label htmlFor="inquiry-message">Introduce yourself</Label>
                <Textarea
                  id="inquiry-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={2000}
                  required
                  placeholder="Tell the owner about your trip and who is staying."
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <Button className="w-full" type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send inquiry"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
