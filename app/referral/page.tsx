"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Gift,
  Copy,
  Users,
  CheckCircle,
  Share2,
  ArrowRight,
} from "lucide-react";

export default function ReferralPage() {
  const { userId, isSignedIn } = useAuth();
  const [copied, setCopied] = useState(false);

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip"
  );

  const stats = useQuery(
    api.referrals.getReferralStats,
    convexUser?._id ? { userId: convexUser._id } : "skip"
  );

  const getOrCreateCode = useMutation(api.referrals.getOrCreateCode);

  const handleGetCode = async () => {
    if (!convexUser) return;
    try {
      await getOrCreateCode({ userId: convexUser._id as Id<"users"> });
      toast.success("Referral code generated!");
    } catch {
      toast.error("Failed to generate referral code");
    }
  };

  const referralLink = stats?.code
    ? `${typeof window !== "undefined" ? window.location.origin : "https://furnishfinder.com"}/sign-up?ref=${stats.code}`
    : null;

  const handleCopy = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!referralLink) return;
    if (navigator.share) {
      await navigator.share({
        title: "Join FurnishFinder",
        text: "Find furnished rentals or list your property — no fees!",
        url: referralLink,
      });
    } else {
      await handleCopy();
    }
  };

  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="bg-[#0f2044] text-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-amber-400/20 text-amber-300 text-sm font-semibold px-4 py-2 rounded-full mb-6">
            <Gift className="h-4 w-4" />
            Referral Program
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-4">
            Invite friends. <span className="text-amber-400">Earn rewards.</span>
          </h1>
          <p className="text-lg text-blue-100 max-w-xl mx-auto">
            Share FurnishFinder with landlords and renters. Every successful referral
            earns you a month of Pro features — free.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-slate-900 mb-10">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: 1,
                title: "Get Your Link",
                desc: "Generate your unique referral link from this page.",
                icon: Gift,
              },
              {
                step: 2,
                title: "Share It",
                desc: "Send it to friends, post it online, or share anywhere.",
                icon: Share2,
              },
              {
                step: 3,
                title: "Both Earn",
                desc: "When they sign up, you both get 1 month of Pro free.",
                icon: Users,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="flex flex-col items-center text-center gap-3"
                >
                  <div className="h-14 w-14 rounded-full bg-[#0f2044] text-white flex items-center justify-center shadow">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold text-slate-900">{item.title}</h3>
                  <p className="text-sm text-slate-500">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Dashboard / CTA */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto">
          {!isSignedIn ? (
            <Card className="text-center">
              <CardContent className="p-10">
                <Gift className="h-12 w-12 text-[#0f2044]/40 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Sign in to get your referral link
                </h3>
                <p className="text-slate-500 text-sm mb-6">
                  Create a free account or sign in to start referring.
                </p>
                <div className="flex justify-center gap-3">
                  <Button asChild>
                    <Link href="/sign-up">Sign Up Free</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/sign-in">Sign In</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Stats */}
              {stats && (
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-5 text-center">
                      <p className="text-3xl font-extrabold text-[#0f2044]">
                        {stats.totalReferrals}
                      </p>
                      <p className="text-sm text-slate-500 mt-1">Friends Referred</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5 text-center">
                      <p className="text-3xl font-extrabold text-emerald-600">
                        {stats.converted}
                      </p>
                      <p className="text-sm text-slate-500 mt-1">Conversions</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Referral link */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Gift className="h-5 w-5 text-[#0f2044]" />
                    Your Referral Link
                  </h3>

                  {!stats?.code ? (
                    <Button onClick={handleGetCode} className="w-full gap-2">
                      <Gift className="h-4 w-4" />
                      Generate My Referral Link
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value={referralLink ?? ""}
                          className="text-sm font-mono bg-slate-50"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleCopy}
                          className="shrink-0"
                        >
                          {copied ? (
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 gap-2"
                          onClick={handleCopy}
                        >
                          <Copy className="h-4 w-4" />
                          Copy Link
                        </Button>
                        <Button className="flex-1 gap-2" onClick={handleShare}>
                          <Share2 className="h-4 w-4" />
                          Share
                        </Button>
                      </div>
                      <p className="text-xs text-slate-400 text-center">
                        Your code:{" "}
                        <span className="font-mono font-bold tracking-wider text-slate-600">
                          {stats.code}
                        </span>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent referrals */}
              {stats?.referrals && stats.referrals.length > 0 && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-slate-900 mb-4">
                      Recent Referrals
                    </h3>
                    <div className="space-y-2">
                      {stats.referrals.slice(0, 5).map((r: Doc<"referrals">) => (
                        <div
                          key={r._id}
                          className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                        >
                          <span className="text-sm text-slate-600">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </span>
                          <Badge
                            variant={
                              r.status === "converted"
                                ? "success"
                                : r.status === "signed_up"
                                ? "secondary"
                                : "outline"
                            }
                            className="capitalize text-xs"
                          >
                            {r.status === "code_created"
                              ? "Pending"
                              : r.status === "signed_up"
                              ? "Signed Up"
                              : "Converted"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Terms */}
      <section className="py-12 px-4 bg-gray-50 border-t border-gray-200">
        <div className="max-w-2xl mx-auto text-center">
          <h3 className="font-semibold text-slate-900 mb-3">Program Terms</h3>
          <ul className="text-sm text-slate-500 space-y-1 text-left max-w-md mx-auto">
            <li className="flex items-start gap-2">
              <ArrowRight className="h-4 w-4 shrink-0 mt-0.5 text-[#0f2044]" />
              Rewards apply when the referred user completes a paid subscription.
            </li>
            <li className="flex items-start gap-2">
              <ArrowRight className="h-4 w-4 shrink-0 mt-0.5 text-[#0f2044]" />
              You cannot refer yourself or use your own code.
            </li>
            <li className="flex items-start gap-2">
              <ArrowRight className="h-4 w-4 shrink-0 mt-0.5 text-[#0f2044]" />
              FurnishFinder reserves the right to modify or end this program at any time.
            </li>
          </ul>
        </div>
      </section>

      <Footer />
    </main>
  );
}
