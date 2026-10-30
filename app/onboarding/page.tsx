"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Search, Home, Loader2 } from "lucide-react";
import wizard from "@/components/onboardingwizard.module.css";
import Link from "next/link";
import { toast } from "sonner";

type Role = "tenant" | "landlord";

export default function OnboardingPage() {
  const router = useRouter();
  const { userId } = useAuth();
  const { user } = useUser();
  const getOrCreate = useMutation(api.users.getOrCreate);
  const updateRole = useMutation(api.users.updateRole);
  const applyReferral = useMutation(api.referrals.applyReferralCode);
  const sendWelcome = useAction(api.emails.sendWelcomeEmail);

  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [showReferral, setShowReferral] = useState(false);

  async function handleRoleSelect(role: Role) {
    if (isLoading) return;
    setSelectedRole(role);
  }

  async function handleContinue() {
    if (!selectedRole || !userId || !user) return;
    setIsLoading(true);

    try {
      const primaryEmail = user.primaryEmailAddress?.emailAddress ?? "";
      const fullName =
        user.fullName ?? user.username ?? primaryEmail.split("@")[0] ?? "User";
      const avatar = user.imageUrl ?? undefined;

      // Upsert the user record in Convex
      const convexUser = await getOrCreate({
        clerkId: userId,
        name: fullName,
        email: primaryEmail,
        avatar,
      });

      if (!convexUser) {
        throw new Error("Failed to create user record.");
      }

      if (convexUser.accountTypePending !== true) {
        router.replace(
          convexUser.role === "admin"
            ? "/dashboard/admin"
            : convexUser.role === "landlord"
              ? "/dashboard/landlord"
              : "/dashboard/tenant",
        );
        return;
      }
      // Choose the new account type exactly once.
      if (convexUser.accountTypePending === true) {
        await updateRole({
          userId: convexUser._id,
          role: selectedRole,
        });
      }

      // Apply referral code if provided (silently ignore errors)
      if (referralCode.trim()) {
        try {
          await applyReferral({
            code: referralCode.trim().toUpperCase(),
            newUserId: convexUser._id,
          });
        } catch {
          // Invalid or already-used code — not a fatal error
        }
      }

      // Fire welcome email (non-blocking — errors are logged server-side)
      await sendWelcome({
        toEmail: primaryEmail,
        toName: fullName,
        role: selectedRole,
      });

      // Redirect to the appropriate dashboard
      router.push(
        selectedRole === "landlord"
          ? "/dashboard/landlord/listings/new"
          : "/dashboard/tenant",
      );
    } catch (err) {
      console.error("Onboarding error:", err);
      toast.error("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <main className={wizard.shell}>
      <p className={wizard.eyebrow}>Welcome to globe</p>
      <h1 className={wizard.heading}>Your next chapter starts here.</h1>
      <p className={wizard.intro}>
        How would you like to use globe? Choose the account that fits your
        plans.
      </p>
      <div className={wizard.step}>
        <div className={wizard.choices}>
          {(
            [
              {
                role: "tenant",
                title: "Find a furnished home",
                description:
                  "Explore monthly rentals and connect with property owners.",
                icon: Search,
              },
              {
                role: "landlord",
                title: "Share your property",
                description:
                  "Create your listing and manage monthly stay requests.",
                icon: Home,
              },
            ] as const
          ).map((option) => (
            <button
              key={option.role}
              className={wizard.choice}
              aria-pressed={selectedRole === option.role}
              disabled={isLoading}
              onClick={() => handleRoleSelect(option.role)}
            >
              <option.icon strokeWidth={1.5} />
              <span>
                <strong>{option.title}</strong>
                <p>{option.description}</p>
              </span>
              <span className={wizard.circle} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className={wizard.referral}>
          {!showReferral ? (
            <button onClick={() => setShowReferral(true)}>
              Have a referral code?
            </button>
          ) : (
            <label>
              Referral code
              <input
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                maxLength={10}
                placeholder="Enter code"
              />
            </label>
          )}
        </div>
      </div>
      <div className={wizard.navigation}>
        <Link href="/">Back to explore</Link>
        <button
          className={wizard.continue}
          onClick={handleContinue}
          disabled={!selectedRole || isLoading}
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Setting up…
            </span>
          ) : (
            "Continue"
          )}
        </button>
      </div>
      <p className={wizard.note}>
        Your account type is chosen once. Property owners create a draft before
        requesting publication.
      </p>
      <p className={wizard.note}>
        By continuing you agree to our{" "}
        <Link href="/terms" className="underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  );
}
