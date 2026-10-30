"use client";

import { useState, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_CHARS = 1000;

interface ContactModalProps {
  listingId: Id<"listings">;
  landlordId: Id<"users">;
  landlordName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ContactModal({
  listingId,
  landlordId,
  landlordName,
  isOpen,
  onClose,
}: ContactModalProps) {
  const { user: clerkUser } = useUser();
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const reference = useRef<{ payload: string; id: string } | null>(null);

  // Fetch the current user's Convex record using their Clerk ID
  const convexUser = useQuery(
    api.users.getByClerkId,
    clerkUser?.id ? { clerkId: clerkUser.id } : "skip",
  );

  const sendMessage = useMutation(api.messages.sendMessage);

  const charsRemaining = MAX_CHARS - message.length;
  const canSend =
    message.trim().length > 0 &&
    message.length <= MAX_CHARS &&
    !sending &&
    convexUser != null;

  const handleSend = async () => {
    if (!canSend || !convexUser || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const fields = {
        senderId: convexUser._id,
        receiverId: landlordId,
        listingId,
        content: message.trim(),
      };
      const payload = JSON.stringify(fields);
      if (reference.current?.payload !== payload)
        reference.current = { payload, id: crypto.randomUUID() };
      await sendMessage({ ...fields, clientRequestId: reference.current.id });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send message. Please try again.",
      );
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const handleClose = () => {
    if (inFlight.current) return;
    onClose();
    setMessage("");
    setSent(false);
    setError(null);
    reference.current = null;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        {sent ? (
          /* Success state */
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl">Message sent!</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Your message is saved in your inbox. You can read any replies
                there.
              </DialogDescription>
            </DialogHeader>
            <Button asChild>
              <Link href="/dashboard/messages">Open messages</Link>
            </Button>
            <Button onClick={handleClose} className="mt-2 w-full sm:w-auto">
              Done
            </Button>
          </div>
        ) : (
          /* Compose state */
          <>
            <DialogHeader>
              <DialogTitle>Contact {landlordName}</DialogTitle>
              <DialogDescription>
                Introduce yourself and let the landlord know about your
                situation.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 mt-1">
              <Textarea
                placeholder="Tell the landlord about yourself: when you're moving, how long you'll stay, your profession, etc."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={MAX_CHARS}
                className="resize-none text-sm"
                disabled={sending}
              />
              <div
                className={cn(
                  "text-right text-xs",
                  charsRemaining < 100
                    ? "text-amber-600"
                    : "text-muted-foreground",
                )}
              >
                {charsRemaining} characters remaining
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              {convexUser === null && (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
                  Your account is still being set up. Please refresh and try
                  again.
                </p>
              )}
            </div>

            <DialogFooter className="mt-2 gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={!canSend}>
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send Message"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
