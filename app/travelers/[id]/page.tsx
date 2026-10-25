"use client";
import { use } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PublicReviews } from "@/components/public-reviews";
export default function TravelerProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    { isAuthenticated, isLoading } = useConvexAuth(),
    profile = useQuery(
      api.reviews.travelerProfile,
      isAuthenticated ? { id: id as Id<"users"> } : "skip",
    );
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-5">
      <h1 className="text-2xl font-bold">Traveler reviews</h1>
      {isLoading ? (
        <p role="status">Loading account…</p>
      ) : !isAuthenticated ? (
        <p>
          <Link href="/sign-in" className="underline">
            Sign in
          </Link>{" "}
          to view a traveler you have an inquiry or conversation with.
        </p>
      ) : profile === undefined ? (
        <p role="status">Loading reviews…</p>
      ) : !profile ? (
        <p>
          This profile is private to the traveler and established
          counterparties.
        </p>
      ) : (
        <>
          <h2 className="text-xl font-semibold">{profile.name}</h2>
          <p className="text-sm text-slate-600">
            {profile.count
              ? `${profile.average}/5 from ${profile.count} moderated reviews`
              : "No published reviews yet"}
            . Reviews reflect members’ experiences.
          </p>
          <PublicReviews travelerId={id as Id<"users">} />
        </>
      )}
    </main>
  );
}
