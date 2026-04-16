"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Plan = "landlord_pro" | "landlord_premium" | "tenant_plus";

type Props = {
  plan: Plan;
  label: string;
  className?: string;
  variant?: "default" | "outline";
};

export function SubscriptionCheckoutButton({
  plan,
  label,
  className,
  variant = "default",
}: Props) {
  const { userId: clerkId, isSignedIn } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const convexUser = useQuery(
    api.users.getByClerkId,
    clerkId ? { clerkId } : "skip"
  ) as { _id: Id<"users">; email: string } | null | undefined;

  const createCheckout = useAction(api.creem.createSubscriptionCheckout);

  const handleClick = async () => {
    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=/pricing`);
      return;
    }
    if (!convexUser?._id) {
      toast.error("Please finish onboarding first");
      router.push("/onboarding");
      return;
    }
    setLoading(true);
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const result = await createCheckout({
        userId: convexUser._id,
        plan,
        customerEmail: convexUser.email,
        successUrl: `${origin}/billing/success?checkout_id={CHECKOUT_ID}`,
        cancelUrl: `${origin}/pricing?canceled=1`,
      });
      if (typeof window !== "undefined") {
        window.location.href = result.checkoutUrl;
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Checkout failed";
      toast.error(message);
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      variant={variant}
      className={cn(
        variant === "default" && "bg-[#1e3a8a] hover:bg-[#0f2044]",
        className
      )}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Redirecting…
        </>
      ) : (
        label
      )}
    </Button>
  );
}

type FeatureListingProps = {
  listingId: Id<"listings">;
  className?: string;
};

export function FeatureListingButton({
  listingId,
  className,
}: FeatureListingProps) {
  const { userId: clerkId, isSignedIn } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const convexUser = useQuery(
    api.users.getByClerkId,
    clerkId ? { clerkId } : "skip"
  ) as { _id: Id<"users">; email: string } | null | undefined;

  const createCheckout = useAction(api.creem.createFeatureListingCheckout);

  const handleClick = async () => {
    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }
    if (!convexUser?._id) {
      toast.error("Please complete your account setup first");
      return;
    }
    setLoading(true);
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const result = await createCheckout({
        userId: convexUser._id,
        listingId,
        customerEmail: convexUser.email,
        successUrl: `${origin}/billing/success?checkout_id={CHECKOUT_ID}`,
        cancelUrl: `${origin}/dashboard/landlord/listings?canceled=1`,
      });
      if (typeof window !== "undefined") {
        window.location.href = result.checkoutUrl;
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Checkout failed";
      toast.error(message);
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      className={cn(
        "bg-amber-400 hover:bg-amber-500 text-slate-900 font-semibold",
        className
      )}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Redirecting…
        </>
      ) : (
        "Feature this listing"
      )}
    </Button>
  );
}
