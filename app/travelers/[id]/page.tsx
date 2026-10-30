"use client";

import { PublicFrame } from "@/components/public-page";
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
    <PublicFrame>
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
            {profile.profilePhoto && (
              <img
                src={profile.profilePhoto}
                alt={profile.name}
                className="h-24 w-24 rounded-full object-cover"
              />
            )}
            <h2 className="text-xl font-semibold">{profile.name}</h2>
            {(profile.city || profile.state) && (
              <p>{[profile.city, profile.state].filter(Boolean).join(", ")}</p>
            )}
            {(profile.occupation || profile.company) && (
              <p>
                {[profile.occupation, profile.company]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                <span className="text-xs text-slate-500">(self-reported)</span>
              </p>
            )}
            {profile.bio && (
              <p className="whitespace-pre-wrap">{profile.bio}</p>
            )}
            {(profile.petInfo || profile.petPhoto) && (
              <section className="space-y-2">
                <h3 className="font-semibold">Pets</h3>
                {profile.petInfo && (
                  <p className="whitespace-pre-wrap">{profile.petInfo}</p>
                )}
                {profile.petPhoto && (
                  <img
                    src={profile.petPhoto}
                    alt="Traveler's pet"
                    className="max-h-64 rounded-xl object-contain"
                  />
                )}
              </section>
            )}
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
    </PublicFrame>
  );
}
