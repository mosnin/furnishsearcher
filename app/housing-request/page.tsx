"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { STATES, getCitiesByState } from "@/lib/cities";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Home, MapPin, DollarSign, Calendar, BedDouble } from "lucide-react";

const BUDGET_RANGES = [
  { label: "Under $1,500 / mo", value: "1500" },
  { label: "Under $2,000 / mo", value: "2000" },
  { label: "Under $2,500 / mo", value: "2500" },
  { label: "Under $3,000 / mo", value: "3000" },
  { label: "Under $4,000 / mo", value: "4000" },
  { label: "Under $5,000 / mo", value: "5000" },
  { label: "$5,000+ / mo", value: "9999" },
];

const BEDROOM_OPTIONS = [
  { label: "1 Bedroom", value: "1" },
  { label: "2 Bedrooms", value: "2" },
  { label: "3 Bedrooms", value: "3" },
  { label: "4+ Bedrooms", value: "4" },
];

export default function HousingRequestPage() {
  const router = useRouter();
  const { userId, isLoaded, isSignedIn } = useAuth();

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip"
  );

  const createRequest = useMutation(api.housingRequests.create);

  // Form state
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [duration, setDuration] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [petFriendly, setPetFriendly] = useState(false);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedCity, setSubmittedCity] = useState("");

  const citiesForState = state ? getCitiesByState(state) : [];

  // Reset city when state changes
  const handleStateChange = (val: string) => {
    setState(val);
    setCity("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSignedIn) {
      toast.error("Please sign in to submit a housing request.");
      return;
    }

    if (!convexUser) {
      toast.error("Unable to load your account. Please try again.");
      return;
    }

    if (!state || !city || !moveInDate || !duration || !maxBudget || !bedrooms) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      await createRequest({
        userId: convexUser._id,
        city,
        state,
        moveInDate: new Date(moveInDate).getTime(),
        duration: parseInt(duration, 10),
        maxBudget: parseInt(maxBudget, 10),
        bedrooms: parseInt(bedrooms, 10),
        petFriendly,
        description,
      });
      setSubmittedCity(city);
      setSubmitted(true);
      toast.success("Housing request submitted!");
    } catch (err) {
      console.error("Failed to submit housing request:", err);
      toast.error("Failed to submit your request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="max-w-lg w-full">
          <CardContent className="flex flex-col items-center text-center gap-5 py-14 px-8">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-9 w-9 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Request Submitted!</h1>
            <p className="text-slate-600 leading-relaxed">
              Your request has been submitted! Landlords in{" "}
              <span className="font-semibold text-[#0f2044]">{submittedCity}</span>{" "}
              will reach out when they have a match.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
              <Button asChild className="flex-1 bg-[#0f2044] hover:bg-[#1a3360]">
                <Link href="/dashboard/tenant">View Dashboard</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="flex-1"
              >
                <Link href="/search">Browse Listings</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="bg-[#0f2044] text-white py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm font-medium text-blue-100 mb-6">
            <Home className="h-4 w-4" />
            For Renters
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Submit a Housing Request
          </h1>
          <p className="mt-4 text-lg text-blue-200">
            Let landlords come to you — describe what you need and get matched
            with furnished properties in your target city.
          </p>
        </div>
      </section>

      {/* Form */}
      <section className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          {!isLoaded ? (
            <Card>
              <CardContent className="py-12 text-center text-slate-500">
                Loading…
              </CardContent>
            </Card>
          ) : !isSignedIn ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-14 text-center px-8">
                <div className="h-14 w-14 rounded-full bg-[#0f2044]/10 flex items-center justify-center">
                  <Home className="h-7 w-7 text-[#0f2044]" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Sign in to Submit</h2>
                <p className="text-slate-500 text-sm max-w-sm">
                  Create a free account or sign in to submit a housing request.
                  Landlords will be able to find and contact you directly.
                </p>
                <div className="flex gap-3 mt-2">
                  <Button asChild className="bg-[#0f2044] hover:bg-[#1a3360]">
                    <Link href="/sign-up">Create Account</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/sign-in">Sign In</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-md">
              <CardContent className="p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Location */}
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-4">
                      <MapPin className="h-4 w-4 text-[#0f2044]" />
                      Location
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="state">State *</Label>
                        <Select value={state} onValueChange={handleStateChange} required>
                          <SelectTrigger id="state">
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                          <SelectContent>
                            {STATES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="city">City *</Label>
                        <Select
                          value={city}
                          onValueChange={setCity}
                          required
                          disabled={!state}
                        >
                          <SelectTrigger id="city">
                            <SelectValue placeholder={state ? "Select city" : "Choose state first"} />
                          </SelectTrigger>
                          <SelectContent>
                            {citiesForState.map((c) => (
                              <SelectItem key={c.name} value={c.name}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Dates & Duration */}
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-4">
                      <Calendar className="h-4 w-4 text-[#0f2044]" />
                      Timing
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="move-in-date">Move-in Date *</Label>
                        <Input
                          id="move-in-date"
                          type="date"
                          value={moveInDate}
                          onChange={(e) => setMoveInDate(e.target.value)}
                          min={new Date().toISOString().split("T")[0]}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="duration">Duration *</Label>
                        <Select value={duration} onValueChange={setDuration} required>
                          <SelectTrigger id="duration">
                            <SelectValue placeholder="How many months?" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n} {n === 1 ? "month" : "months"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Budget & Bedrooms */}
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-4">
                      <DollarSign className="h-4 w-4 text-[#0f2044]" />
                      Budget &amp; Size
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="max-budget">Max Monthly Budget *</Label>
                        <Select value={maxBudget} onValueChange={setMaxBudget} required>
                          <SelectTrigger id="max-budget">
                            <SelectValue placeholder="Select budget" />
                          </SelectTrigger>
                          <SelectContent>
                            {BUDGET_RANGES.map((b) => (
                              <SelectItem key={b.value} value={b.value}>
                                {b.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="bedrooms">Bedrooms *</Label>
                        <Select value={bedrooms} onValueChange={setBedrooms} required>
                          <SelectTrigger id="bedrooms">
                            <SelectValue placeholder="How many bedrooms?" />
                          </SelectTrigger>
                          <SelectContent>
                            {BEDROOM_OPTIONS.map((b) => (
                              <SelectItem key={b.value} value={b.value}>
                                {b.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Pet Friendly */}
                  <div className="space-y-1.5">
                    <Label>Pet Friendly</Label>
                    <div className="flex items-center gap-3 mt-1">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={petFriendly}
                        onClick={() => setPetFriendly((v) => !v)}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
                          petFriendly ? "bg-[#0f2044]" : "bg-slate-200"
                        )}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200",
                            petFriendly ? "translate-x-5" : "translate-x-0"
                          )}
                        />
                      </button>
                      <span className="text-sm text-slate-600">
                        {petFriendly ? "I have a pet — need pet-friendly housing" : "No pets"}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <Label htmlFor="description">Tell Landlords About Yourself</Label>
                    <Textarea
                      id="description"
                      placeholder="Share a bit about yourself, your work, your lifestyle, how long you've been renting, and anything else that might help landlords feel comfortable reaching out…"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      className="resize-none"
                    />
                    <p className="text-xs text-slate-400">
                      Optional but highly recommended — requests with a description get 3× more responses.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={isSubmitting || convexUser === undefined}
                    className="w-full bg-[#0f2044] hover:bg-[#1a3360] text-white font-semibold"
                  >
                    {isSubmitting ? "Submitting…" : "Submit Housing Request"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </main>
  );
}
