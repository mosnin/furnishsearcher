"use client";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usePublicAuth } from "./auth-context";
import { dashboardHome } from "@/lib/dashboard-access";
export function usePublicAccount() {
  const { userId, isLoaded } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const account = useQuery(
    api.users.getByClerkId,
    isAuthenticated && userId ? { clerkId: userId } : "skip",
  );
  return {
    account,
    signedIn: Boolean(userId),
    loading:
      !isLoaded || isLoading || (Boolean(userId) && account === undefined),
  };
}
export function AccountEmpty({
  title,
  description,
  action = "Browse properties",
  href = "/search",
}: {
  title: string;
  description: string;
  action?: string;
  href?: string;
}) {
  return (
    <div className="w-account-empty">
      <h1>{title}</h1>
      <p>{description}</p>
      <Link className="w-black-button" href={href}>
        {action}
      </Link>
    </div>
  );
}
export function AccountSignIn({
  returnTo = "/account",
}: {
  returnTo?: string;
}) {
  const openAuth = usePublicAuth();
  return (
    <div className="w-account-empty">
      <h1>Your next stay starts here</h1>
      <p>Sign in to view your account, stay requests and saved properties.</p>
      <button className="w-black-button" onClick={() => openAuth(returnTo)}>
        Log in or sign up
      </button>
      <Link className="w-account-secondary-link" href="/search">
        Continue exploring properties
      </Link>
    </div>
  );
}
export function AccountRoleBoundary({
  role,
  subject,
}: {
  role: "tenant" | "landlord" | "admin";
  subject: string;
}) {
  return (
    <AccountEmpty
      title={`${subject} is for traveler accounts`}
      description={`You’re signed in with a ${role === "landlord" ? "property owner" : "platform admin"} account. Your account has its own dashboard and tools.`}
      action="Open your dashboard"
      href={dashboardHome(role)}
    />
  );
}
export function AccountLoading() {
  return (
    <div
      className="w-account-loading"
      role="status"
      aria-label="Loading your account"
    >
      <div />
      <div />
      <div />
    </div>
  );
}
