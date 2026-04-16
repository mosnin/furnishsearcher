"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser, useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import Link from "next/link";
import {
  Camera, Upload, Linkedin, CheckCircle2, Star, Bookmark,
  Home, MapPin, DollarSign, BedDouble, User, ExternalLink,
} from "lucide-react";
import { cn, formatPrice, formatDate } from "@/lib/utils";
import ReviewCard from "@/components/review-card";
import { STATES } from "@/lib/cities";

const TABS = ["Personal Info", "Reviews", "Saved Searches", "Housing Requests"] as const;
type Tab = typeof TABS[number];

const COMPLETENESS_FIELDS = [
  "firstName", "lastName", "displayName", "phone",
  "city", "state", "zip", "occupation", "bio",
  "profilePhoto", "petInfo", "linkedinVerified",
] as const;

export default function ProfilePage() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>("Personal Info");

  const convexUser = useQuery(
    api.users.getByClerkId,
    user?.id ? { clerkId: user.id } : "skip"
  );

  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-gray-600 mb-4">Please sign in to view your profile.</p>
        <Link href="/sign-in" className="bg-[#1e3a8a] text-white px-6 py-2 rounded-lg hover:bg-blue-900 transition-colors">
          Sign In
        </Link>
      </div>
    );
  }

  if (convexUser === undefined) {
    return <ProfileSkeleton />;
  }

  if (!convexUser) {
    return <div className="text-center py-20 text-gray-500">Profile not found.</div>;
  }

  const pct = Math.round(
    (COMPLETENESS_FIELDS.filter((f) => !!convexUser[f as keyof typeof convexUser]).length /
      COMPLETENESS_FIELDS.length) * 100
  );

  const barColor = pct < 30 ? "#ef4444" : pct < 70 ? "#f59e0b" : "#22c55e";

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header card */}
      <div className="bg-[#eef2f8] rounded-xl p-6 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <AvatarSection convexUser={convexUser} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">
              {convexUser.displayName || convexUser.name}
            </h1>
            <span className="text-xs border border-gray-400 text-gray-600 px-2 py-0.5 rounded-full capitalize">
              {convexUser.role} Profile
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Profile complete</p>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-xs">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: barColor }}
              />
            </div>
            <span className="text-sm font-medium text-gray-600">{pct}%</span>
          </div>
        </div>

        <Link
          href={`/landlords/${convexUser._id}`}
          className="flex items-center gap-2 text-sm border border-gray-400 text-gray-700 px-4 py-2 rounded-lg hover:bg-white transition-colors shrink-0"
        >
          <ExternalLink className="w-4 h-4" />
          My Public Profile
        </Link>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-8 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
              activeTab === tab
                ? "border-[#1e3a8a] text-[#1e3a8a]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Personal Info" && <PersonalInfoTab convexUser={convexUser} clerkUser={user} />}
      {activeTab === "Reviews" && <ReviewsTab convexUser={convexUser} />}
      {activeTab === "Saved Searches" && <SavedSearchesTab convexUser={convexUser} />}
      {activeTab === "Housing Requests" && <HousingRequestsTab convexUser={convexUser} />}
    </div>
  );
}

/* ─── Avatar section ─── */
function AvatarSection({ convexUser }: { convexUser: NonNullable<ReturnType<typeof useQuery<typeof api.users.getByClerkId>>> }) {
  const updateProfile = useMutation(api.users.updateProfile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(convexUser.profilePhoto ?? null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    toast.success("Photo updated! (Upload coming soon)");
  };

  const initials = convexUser.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?";

  return (
    <button
      onClick={() => fileRef.current?.click()}
      className="relative w-24 h-24 rounded-full border-2 border-dashed border-gray-400 flex items-center justify-center overflow-hidden bg-white hover:bg-gray-50 transition-colors shrink-0 group"
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
      ) : (
        <span className="text-2xl font-bold text-gray-400">{initials}</span>
      )}
      <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
        <Camera className="w-5 h-5 text-white" />
        <span className="text-[10px] text-white mt-1">Upload Photo</span>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </button>
  );
}

/* ─── Personal Info tab ─── */
function PersonalInfoTab({ convexUser, clerkUser }: { convexUser: NonNullable<ReturnType<typeof useQuery<typeof api.users.getByClerkId>>>; clerkUser: ReturnType<typeof useUser>["user"] }) {
  const updateProfile = useMutation(api.users.updateProfile);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    firstName: convexUser.firstName ?? "",
    lastName: convexUser.lastName ?? "",
    displayName: convexUser.displayName ?? "",
    phone: convexUser.phone ?? "",
    city: convexUser.city ?? "",
    state: convexUser.state ?? "",
    zip: convexUser.zip ?? "",
    hometown: convexUser.hometown ?? "",
    occupation: convexUser.occupation ?? "",
    company: convexUser.company ?? "",
    bio: convexUser.bio ?? "",
    petInfo: convexUser.petInfo ?? "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ id: convexUser._id, ...form });
      toast.success("Profile updated!");
    } catch {
      toast.error("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? convexUser.email;

  return (
    <div className="space-y-10">
      {/* General Information */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">General information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <Field label="First name" required>
            <input value={form.firstName} onChange={set("firstName")} placeholder="First name" className={inputCls} />
          </Field>
          <Field label="Last name" required>
            <input value={form.lastName} onChange={set("lastName")} placeholder="Last name" className={inputCls} />
          </Field>
          <Field label="Display name" required>
            <input value={form.displayName} onChange={set("displayName")} placeholder="Display name" className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Email" hint={<span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="w-3.5 h-3.5" />Verified</span>}>
            <input value={email} readOnly className={cn(inputCls, "bg-gray-50 cursor-not-allowed")} />
          </Field>
          <Field label="Phone number" hint={<button className="text-xs text-blue-600 hover:underline">Verify</button>}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 select-none">🇺🇸 +1</span>
              <input
                value={form.phone}
                onChange={set("phone")}
                placeholder="(555) 555-5555"
                className={cn(inputCls, "pl-14")}
              />
            </div>
            {form.phone && !convexUser.phoneVerified && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                Your phone number is not verified. Please click &apos;Verify&apos; to receive a link via SMS.
              </p>
            )}
          </Field>
        </div>
      </section>

      {/* Location */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Location</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="City" required>
            <input value={form.city} onChange={set("city")} placeholder="City" className={inputCls} />
          </Field>
          <Field label="State" required>
            <select value={form.state} onChange={set("state")} className={inputCls}>
              <option value="">- Select a State -</option>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Zip code" required>
            <input value={form.zip} onChange={set("zip")} placeholder="Zip code" className={inputCls} />
          </Field>
          <Field label="Hometown">
            <input value={form.hometown} onChange={set("hometown")} placeholder="Hometown" className={inputCls} />
          </Field>
        </div>
      </section>

      {/* Work Experience */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Work experience</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* LinkedIn card */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <p className="font-bold text-gray-900 mb-1">Verify on LinkedIn</p>
            <p className="text-sm text-gray-600 mb-2">Verifying your identity may help landlords respond faster.</p>
            <a href="#" className="text-sm text-blue-600 underline block mb-1">Learn more about LinkedIn verification</a>
            <p className="text-xs text-gray-500 mb-4">
              <a href="#" className="text-blue-600 underline">Click here</a> to learn more how we use LinkedIn data.
            </p>
            {convexUser.linkedinVerified ? (
              <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
                <CheckCircle2 className="w-4 h-4" /> LinkedIn Verified ✓
              </div>
            ) : (
              <button className="w-full flex items-center justify-center gap-2 bg-[#1e3a8a] text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-900 transition-colors">
                <Linkedin className="w-4 h-4" /> Verify on LinkedIn
              </button>
            )}
          </div>

          {/* Occupation + Company */}
          <div className="space-y-4">
            <Field label="Occupation">
              <input value={form.occupation} onChange={set("occupation")} placeholder="e.g. Travel Nurse, Software Engineer" className={inputCls} />
            </Field>
            <Field label="Company">
              <input value={form.company} onChange={set("company")} placeholder="Company or organization" className={inputCls} />
            </Field>
          </div>
        </div>
      </section>

      {/* About */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-2">Tell us about yourself</h2>
        <textarea
          value={form.bio}
          onChange={set("bio")}
          rows={4}
          placeholder="Share your story — what you do, why you're looking for housing, etc."
          className={cn(inputCls, "resize-none")}
        />
      </section>

      {/* Pet section */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Traveling with a pet?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Pet information">
            <textarea
              value={form.petInfo}
              onChange={set("petInfo")}
              rows={4}
              placeholder="Enter information about your pet (breed, size, temperament...)"
              className={cn(inputCls, "resize-none")}
            />
          </Field>
          <div className="border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-8 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
            <Upload className="w-8 h-8 text-gray-400 mb-2" />
            <p className="text-sm font-medium text-gray-600">Upload photo of your pet</p>
            <p className="text-xs text-gray-400 mt-1">JPG, PNG up to 5MB</p>
          </div>
        </div>
      </section>

      {/* Save button */}
      <div className="pt-4 border-t border-gray-100">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#1e3a8a] text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-900 transition-colors disabled:opacity-60 flex items-center gap-2"
        >
          {saving ? (
            <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving...</>
          ) : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

/* ─── Reviews tab ─── */
function ReviewsTab({ convexUser }: { convexUser: NonNullable<ReturnType<typeof useQuery<typeof api.users.getByClerkId>>> }) {
  const reviews = useQuery(
    api.reviews.getByLandlord,
    convexUser.role === "landlord" ? { landlordId: convexUser._id } : "skip"
  );

  if (convexUser.role !== "landlord") {
    return (
      <div className="text-center py-16 text-gray-400">
        <Star className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium text-gray-600">Reviews you&apos;ve written will appear here</p>
        <p className="text-sm mt-1">Once you&apos;ve stayed somewhere, you can leave a review.</p>
      </div>
    );
  }

  if (reviews === undefined) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>;

  if (!reviews.length) return (
    <div className="text-center py-16 text-gray-400">
      <Star className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p className="font-medium text-gray-600">No reviews yet</p>
      <p className="text-sm mt-1">Reviews from tenants will appear here.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {reviews.map((r) => (
        <ReviewCard
          key={r._id}
          rating={r.rating}
          comment={r.comment}
          reviewerName={r.reviewerName ?? "Anonymous"}
          reviewerAvatar={r.reviewerAvatar}
          createdAt={r.createdAt}
        />
      ))}
    </div>
  );
}

/* ─── Saved Searches tab ─── */
function SavedSearchesTab({ convexUser }: { convexUser: NonNullable<ReturnType<typeof useQuery<typeof api.users.getByClerkId>>> }) {
  const searches = useQuery(api.savedSearches.getByUser, { userId: convexUser._id });
  const remove = useMutation(api.savedSearches.remove);

  if (searches === undefined) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>;

  if (!searches.length) return (
    <div className="text-center py-16">
      <Bookmark className="w-10 h-10 mx-auto mb-3 text-gray-300" />
      <p className="font-medium text-gray-600">No saved searches yet</p>
      <p className="text-sm text-gray-400 mt-1 mb-4">Save a search to get notified of new listings.</p>
      <Link href="/search" className="bg-[#1e3a8a] text-white px-5 py-2 rounded-lg text-sm hover:bg-blue-900 transition-colors">
        Browse Listings
      </Link>
    </div>
  );

  return (
    <div className="space-y-3">
      {searches.map((s) => {
        const params = new URLSearchParams();
        if (s.city) { params.set("city", s.city); params.set("location", s.city + (s.state ? `, ${s.state}` : "")); }
        if (s.state) params.set("state", s.state);
        if (s.maxPrice) params.set("budget", String(s.maxPrice));
        return (
          <div key={s._id} className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-200 transition-colors">
            <Bookmark className="w-4 h-4 text-blue-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-900">{s.name}</p>
              <div className="flex gap-2 flex-wrap mt-1">
                {s.city && <span className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="w-3 h-3" />{s.city}{s.state ? `, ${s.state}` : ""}</span>}
                {s.maxPrice && <span className="flex items-center gap-1 text-xs text-gray-500"><DollarSign className="w-3 h-3" />Up to {formatPrice(s.maxPrice)}</span>}
                {s.bedrooms && <span className="flex items-center gap-1 text-xs text-gray-500"><BedDouble className="w-3 h-3" />{s.bedrooms}+ beds</span>}
              </div>
            </div>
            <Link href={`/search?${params.toString()}`} className="text-xs text-blue-600 hover:underline shrink-0 hidden sm:block">View</Link>
            <button onClick={() => remove({ id: s._id }).then(() => toast.success("Removed"))} className="text-gray-300 hover:text-red-400 transition-colors ml-1">✕</button>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Housing Requests tab ─── */
function HousingRequestsTab({ convexUser }: { convexUser: NonNullable<ReturnType<typeof useQuery<typeof api.users.getByClerkId>>> }) {
  const requests = useQuery(api.housingRequests.getByUser, { userId: convexUser._id });
  const close = useMutation(api.housingRequests.close);

  if (requests === undefined) return <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{requests.length} housing {requests.length === 1 ? "request" : "requests"}</p>
        <Link href="/housing-request" className="bg-[#1e3a8a] text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-900 transition-colors">
          + New Request
        </Link>
      </div>
      {!requests.length ? (
        <div className="text-center py-16">
          <Home className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-600">No housing requests</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Submit a request and let landlords come to you.</p>
          <Link href="/housing-request" className="bg-[#1e3a8a] text-white px-5 py-2 rounded-lg text-sm hover:bg-blue-900 transition-colors">
            Submit a Request
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r._id} className="p-4 bg-white border border-gray-200 rounded-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">{r.city}, {r.state}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                      r.status === "open" ? "bg-green-100 text-green-700" :
                      r.status === "fulfilled" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-600"
                    )}>
                      {r.status}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-gray-500">
                    <span>Budget: {formatPrice(r.maxBudget)}/mo</span>
                    <span>Duration: {r.duration} month{r.duration > 1 ? "s" : ""}</span>
                    <span>Beds: {r.bedrooms}+</span>
                    <span>Move-in: {formatDate(r.moveInDate)}</span>
                  </div>
                </div>
                {r.status === "open" && (
                  <button
                    onClick={() => close({ id: r._id }).then(() => toast.success("Request closed"))}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ─── */
const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white";

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-gray-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {hint && <span>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="max-w-4xl mx-auto animate-pulse">
      <div className="bg-gray-100 rounded-xl p-6 mb-6 flex items-center gap-6">
        <div className="w-24 h-24 rounded-full bg-gray-300" />
        <div className="flex-1 space-y-3">
          <div className="h-5 bg-gray-300 rounded w-40" />
          <div className="h-3 bg-gray-200 rounded w-24" />
          <div className="h-2 bg-gray-200 rounded-full w-64" />
        </div>
      </div>
      <div className="flex gap-6 border-b border-gray-200 mb-8">
        {[120, 80, 120, 140].map((w, i) => <div key={i} className="h-4 bg-gray-200 rounded mb-3" style={{ width: w }} />)}
      </div>
      <div className="space-y-6">
        {[0,1,2].map(i => (
          <div key={i} className="grid grid-cols-3 gap-4">
            {[0,1,2].map(j => <div key={j} className="h-12 bg-gray-200 rounded-lg" />)}
          </div>
        ))}
      </div>
    </div>
  );
}
