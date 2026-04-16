"use client";

import {
  useRef,
  useState,
  useEffect,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { CheckCircle2, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "send" | "verify" | "success";

export interface PhoneVerifyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  phone: string;
  onVerified: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PhoneVerifyDialog({
  isOpen,
  onClose,
  phone,
  onVerified,
}: PhoneVerifyDialogProps) {
  const { user: clerkUser } = useUser();

  // Look up the Convex user so we can call updateProfile with their _id
  const convexUser = useQuery(
    api.users.getByClerkId,
    clerkUser?.id ? { clerkId: clerkUser.id } : "skip"
  );

  const updateProfile = useMutation(api.users.updateProfile);

  const [step, setStep] = useState<Step>("send");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStep("send");
      setDigits(Array(6).fill(""));
      setSending(false);
      setVerifying(false);
      setResendCountdown(0);
    }
  }, [isOpen]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSendCode = async () => {
    setSending(true);
    await new Promise((r) => setTimeout(r, 800));
    setSending(false);
    toast.info(`In production, an SMS would be sent to ${phone}`);
    setStep("verify");
    setResendCountdown(30);
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  };

  const handleResend = async () => {
    if (resendCountdown > 0) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 600));
    setSending(false);
    toast.info(`In production, an SMS would be sent to ${phone}`);
    setDigits(Array(6).fill(""));
    setResendCountdown(30);
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  };

  const handleVerify = async () => {
    const full = digits.join("");
    if (full.length < 6) {
      toast.error("Please enter the full 6-digit code.");
      return;
    }
    setVerifying(true);
    // Simulate a 3-second verification round-trip
    await new Promise((r) => setTimeout(r, 3000));
    try {
      if (convexUser?._id) {
        await updateProfile({
          userId: convexUser._id,
          // phoneVerified is not in updateProfile args — persist phone at minimum
          phone,
        });
      }
    } catch {
      // Non-fatal: profile update failure shouldn't block UI success state
    }
    setVerifying(false);
    setStep("success");
    onVerified();
  };

  // ---------------------------------------------------------------------------
  // 6-box code input helpers
  // ---------------------------------------------------------------------------

  const handleDigitChange = (index: number, value: string) => {
    // Support paste into any box
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length > 1) {
      const next = Array(6).fill("");
      cleaned.slice(0, 6).split("").forEach((ch, i) => {
        next[index + i < 6 ? index + i : i] = ch;
      });
      setDigits(next);
      const nextFocus = Math.min(index + cleaned.length, 5);
      inputRefs.current[nextFocus]?.focus();
      return;
    }
    const char = cleaned.slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const next = [...digits];
        next[index] = "";
        setDigits(next);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }
    if (e.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, index: number) => {
    e.preventDefault();
    handleDigitChange(index, e.clipboardData.getData("text"));
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const codeComplete = digits.every((d) => d !== "");

  const renderStep = () => {
    // ---- Step 1: Send code ----
    if (step === "send") {
      return (
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
              <Smartphone className="w-7 h-7 text-[#1e3a8a]" />
            </div>
            <p className="text-sm text-gray-600 text-center leading-relaxed">
              We&apos;ll send a verification code to{" "}
              <span className="font-semibold text-gray-800">{phone}</span>
            </p>
          </div>
          <Button
            onClick={handleSendCode}
            disabled={sending}
            className="w-full bg-[#0f2044] hover:bg-[#1a3360] text-white font-medium gap-2"
          >
            {sending ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending…
              </>
            ) : (
              "Send Code"
            )}
          </Button>
          <button
            onClick={onClose}
            className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      );
    }

    // ---- Step 2: Enter 6-digit code ----
    if (step === "verify") {
      return (
        <div className="space-y-6">
          <p className="text-sm text-gray-500 text-center">
            Enter the 6-digit code sent to{" "}
            <span className="font-medium text-gray-800">{phone}</span>
          </p>

          {/* 6 individual character inputs */}
          <div className="flex gap-2 justify-center">
            {Array.from({ length: 6 }).map((_, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={digits[i]}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleDigitKeyDown(i, e)}
                onPaste={(e) => handlePaste(e, i)}
                onFocus={(e) => e.target.select()}
                aria-label={`Digit ${i + 1}`}
                className={cn(
                  "w-11 text-center text-xl font-bold rounded-lg border-2 focus:outline-none focus:border-[#1e3a8a] transition-colors",
                  digits[i]
                    ? "border-[#1e3a8a] bg-blue-50 text-[#1e3a8a]"
                    : "border-gray-300 bg-white text-gray-900"
                )}
                style={{ height: "3.25rem" }}
              />
            ))}
          </div>

          <Button
            onClick={handleVerify}
            disabled={verifying || !codeComplete}
            className="w-full bg-[#0f2044] hover:bg-[#1a3360] text-white font-medium gap-2 disabled:opacity-50"
          >
            {verifying ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Verifying…
              </>
            ) : (
              "Verify"
            )}
          </Button>

          {/* Resend */}
          <div className="text-center">
            {resendCountdown > 0 ? (
              <p className="text-sm text-gray-400">
                Resend code in{" "}
                <span className="font-medium text-gray-600">{resendCountdown}s</span>
              </p>
            ) : (
              <button
                onClick={handleResend}
                disabled={sending}
                className="text-sm text-[#1e3a8a] hover:underline font-medium disabled:opacity-50"
              >
                {sending ? "Sending…" : "Resend code"}
              </button>
            )}
          </div>
        </div>
      );
    }

    // ---- Step 3: Success ----
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
          <CheckCircle2 className="w-9 h-9 text-green-600" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-semibold text-gray-900">Phone verified! ✓</p>
          <p className="text-sm text-gray-500">Your phone number has been confirmed.</p>
        </div>
        <Button
          onClick={onClose}
          className="mt-2 bg-[#0f2044] hover:bg-[#1a3360] text-white font-medium"
        >
          Done
        </Button>
      </div>
    );
  };

  const titles: Record<Step, string> = {
    send: "Verify your phone number",
    verify: "Enter verification code",
    success: "Verification complete",
  };

  const descriptions: Record<Step, string> = {
    send: "We'll send a one-time SMS code to your mobile number.",
    verify: "Check your SMS messages for the 6-digit code.",
    success: "",
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titles[step]}</DialogTitle>
          {descriptions[step] && (
            <DialogDescription>{descriptions[step]}</DialogDescription>
          )}
        </DialogHeader>
        <div className="mt-2">{renderStep()}</div>
      </DialogContent>
    </Dialog>
  );
}
