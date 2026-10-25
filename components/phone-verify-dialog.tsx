"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth, useUser, useReverification } from "@clerk/nextjs";
import { confirmContact } from "@/lib/confirm-contact";
import { canonicalPhone } from "@/lib/contact-verification";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface PhoneVerifyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  phone: string;
  onVerified: (phone: string) => void;
}
export default function PhoneVerifyDialog({
  isOpen,
  onClose,
  phone,
  onVerified,
}: PhoneVerifyDialogProps) {
  const { user } = useUser(),
    { getToken } = useAuth();
  const create = useReverification((number: string) =>
    user!.createPhoneNumber({ phoneNumber: number }),
  );
  const makePrimary = useReverification((id: string) =>
    user!.update({ primaryPhoneNumberId: id }),
  );
  const [phoneId, setPhoneId] = useState<string | null>(null),
    [code, setCode] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const attempt = useRef(0);
  useEffect(() => {
    attempt.current++;
    setPhoneId(null);
    setCode("");
    setError("");
    setBusy(false);
    setRetryAt(0);
  }, [isOpen, phone]);
  useEffect(() => {
    const tick = () =>
      setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  async function confirm(number: string, id: string, run: number) {
    if (!user) throw new Error("Please sign in again.");
    if (user.primaryPhoneNumberId !== id) await makePrimary(id);
    await user.reload();
    const token = await getToken({ template: "convex", skipCache: true });
    if (!token) throw new Error("Please sign in again.");
    const result = await confirmContact(token, {
      kind: "phone",
      clerkId: user.id,
      phone: number,
    });
    if (!result.phone)
      throw new Error("Phone confirmation could not be saved.");
    if (run === attempt.current) {
      onVerified(result.phone);
      onClose();
    }
  }
  async function send() {
    const run = ++attempt.current;
    setBusy(true);
    setError("");
    try {
      if (!user) throw new Error("Please sign in again.");
      const number = canonicalPhone(phone);
      await user.reload();
      const resource =
        user.phoneNumbers.find((p) => p.phoneNumber === number) ??
        (await create(number));
      if (!resource || run !== attempt.current) return;
      setPhoneId(resource.id);
      if (resource.verification.status === "verified") {
        await confirm(number, resource.id, run);
        return;
      }
      await resource.prepareVerification();
      if (run === attempt.current) setRetryAt(Date.now() + 60000);
    } catch (err) {
      if (run === attempt.current)
        setError(
          err instanceof Error
            ? err.message
            : "Could not send the verification code. Try again or contact support.",
        );
    } finally {
      if (run === attempt.current) setBusy(false);
    }
  }
  async function verify() {
    const run = ++attempt.current;
    setBusy(true);
    setError("");
    try {
      await user?.reload();
      const resource = user?.phoneNumbers.find((p) => p.id === phoneId);
      if (!resource) throw new Error("Request a new code first.");
      const result =
        resource.verification.status === "verified"
          ? resource
          : await resource.attemptVerification({ code });
      if (result.verification.status !== "verified")
        throw new Error("The code was not confirmed. Try again.");
      if (run === attempt.current)
        await confirm(canonicalPhone(phone), resource.id, run);
    } catch (err) {
      if (run === attempt.current)
        setError(
          err instanceof Error
            ? err.message
            : "Verification failed. Check the code or request another.",
        );
    } finally {
      if (run === attempt.current) setBusy(false);
    }
  }
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Confirm your phone number</DialogTitle>
          <DialogDescription>
            Confirm {phone} through your sign-in account. SMS charges may apply.
            This becomes your primary sign-in phone; it is only shared with
            matching owners when you choose phone contact on a housing request.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-slate-600">
          Confirmation lasts 30 days. Changing the number or stopping phone
          sharing immediately removes it from existing requests. Confirmation
          proves access to the number, not identity.
        </p>
        {phoneId && (
          <div className="space-y-2">
            <label htmlFor="phone-code">SMS code</label>
            <Input
              id="phone-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              value={code}
              maxLength={12}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              disabled={busy}
            />
            <Button
              onClick={verify}
              disabled={busy || !/^\d{4,12}$/.test(code)}
            >
              Confirm code
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <Button
          variant="outline"
          disabled={busy || remaining > 0}
          onClick={send}
        >
          {busy
            ? "Working…"
            : remaining > 0
              ? `Resend available in ${remaining}s`
              : phoneId
                ? "Resend or refresh confirmation"
                : "Send code or confirm existing number"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
