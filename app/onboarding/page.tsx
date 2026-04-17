"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Search, Home, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Role = "tenant" | "landlord";

interface RoleOption {
  role: Role;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  badgeColor: string;
  accentColor: string;
  hoverBorder: string;
  selectedBorder: string;
  selectedBg: string;
}

const roleOptions: RoleOption[] = [
  {
    role: "tenant",
    icon: Search,
    title: "I'm Looking for a Rental",
    subtitle: "Renter",
    description:
      "Find furnished monthly rentals from verified landlords. No booking fees.",
    badge: "300k+ listings",
    badgeColor: "bg-blue-50 text-blue-700",
    accentColor: "text-blue-600",
    hoverBorder: "hover:border-blue-300 hover:shadow-blue-100",
    selectedBorder: "border-blue-500",
    selectedBg: "bg-blue-50/40",
  },
  {
    role: "landlord",
    icon: Home,
    title: "I'm a Property Owner",
    subtitle: "Landlord",
    description:
      "List your furnished property and connect directly with quality tenants.",
    badge: "No platform fees",
    badgeColor: "bg-emerald-50 text-emerald-700",
    accentColor: "text-emerald-600",
    hoverBorder: "hover:border-emerald-300 hover:shadow-emerald-100",
    selectedBorder: "border-emerald-500",
    selectedBg: "bg-emerald-50/40",
  },
];

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

      // Update their role if it differs from default
      if (convexUser.role !== selectedRole) {
        await updateRole({
          userId: convexUser._id,
          role: selectedRole,
        });
      }

      // Apply referral code if provided (silently ignore errors)
      if (referralCode.trim()) {
        try {
          await applyReferral({ code: referralCode.trim().toUpperCase(), newUserId: convexUser._id });
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
          ? "/dashboard/landlord"
          : "/dashboard/tenant"
      );
    } catch (err) {
      console.error("Onboarding error:", err);
      toast.error("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-[#0f2044]/8 text-[#0f2044] text-xs font-semibold px-3 py-1.5 rounded-full mb-5 tracking-wide uppercase">
            Step 1 of 1
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#0f2044] tracking-tight mb-3">
            Welcome to FurnishFinder!
          </h1>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            How will you use the platform? You can always change this later.
          </p>
        </div>

        {/* Role cards */}
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          {roleOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = selectedRole === option.role;

            return (
              <button
                key={option.role}
                onClick={() => handleRoleSelect(option.role)}
                disabled={isLoading}
                className={cn(
                  "group relative flex flex-col items-start gap-4 p-6 rounded-xl border-2 text-left",
                  "transition-all duration-200 cursor-pointer",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:pointer-events-none disabled:opacity-60",
                  "shadow-sm hover:shadow-md",
                  isSelected
                    ? cn(
                        option.selectedBorder,
                        option.selectedBg
                      )
                    : cn(
                        "border-border bg-white",
                        option.hoverBorder
                      )
                )}
                aria-pressed={isSelected}
              >
                {/* Selection indicator */}
                <div
                  className={cn(
                    "absolute top-4 right-4 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                    isSelected
                      ? cn("border-current", option.accentColor, "bg-current")
                      : "border-border bg-white"
                  )}
                >
                  {isSelected && (
                    <svg
                      className="w-3 h-3 text-white"
                      fill="currentColor"
                      viewBox="0 0 12 12"
                    >
                      <path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  )}
                </div>

                {/* Icon */}
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                    isSelected
                      ? cn("bg-current/10", option.accentColor)
                      : "bg-muted group-hover:bg-muted/80"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-6 h-6 transition-colors",
                      isSelected ? option.accentColor : "text-muted-foreground"
                    )}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-base text-foreground leading-snug">
                      {option.title}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                    {option.description}
                  </p>
                  <span
                    className={cn(
                      "inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full",
                      option.badgeColor
                    )}
                  >
                    {option.badge}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Referral code */}
        <div className="text-center mb-4">
          {!showReferral ? (
            <button
              onClick={() => setShowReferral(true)}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Have a referral code?
            </button>
          ) : (
            <div className="flex items-center gap-2 max-w-xs mx-auto">
              <input
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="Enter code (e.g. ABC1234)"
                maxLength={10}
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-center tracking-widest font-mono uppercase focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => { setShowReferral(false); setReferralCode(""); }}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Continue button */}
        <div className="flex justify-center">
          <button
            onClick={handleContinue}
            disabled={!selectedRole || isLoading}
            className={cn(
              "inline-flex items-center justify-center gap-2 h-12 px-10 rounded-lg font-semibold text-base",
              "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:pointer-events-none disabled:opacity-50",
              selectedRole
                ? "bg-[#0f2044] text-white hover:bg-[#1a3360] shadow-sm hover:shadow-md"
                : "bg-muted text-muted-foreground"
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Setting up your account…
              </>
            ) : (
              "Continue"
            )}
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          By continuing you agree to our{" "}
          <a href="/terms" className="underline hover:text-foreground transition-colors">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" className="underline hover:text-foreground transition-colors">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
