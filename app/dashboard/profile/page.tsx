"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser, useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import Link from "next/link";
import {
  Camera,
  Upload,
  Linkedin,
  CheckCircle2,
  Star,
  Bookmark,
  Home,
  MapPin,
  DollarSign,
  BedDouble,
  User,
  ExternalLink,
} from "lucide-react";
import { cn, formatPrice, formatDate } from "@/lib/utils";
import { Doc } from "@/convex/_generated/dataModel";
import { PublicReviews } from "@/components/public-reviews";
import { STATES } from "@/lib/cities";
import { ProfileImageEditor } from "@/components/profile-image-editor";
import PhoneVerifyDialog from "@/components/phone-verify-dialog";

const TABS = [
  "Personal Info",
  "Reviews",
  "Saved Searches",
  "Housing Requests",
] as const;
type Tab = (typeof TABS)[number];

const COMPLETENESS_FIELDS = [
  "firstName",
  "lastName",
  "displayName",
  "phone",
  "city",
  "state",
  "zip",
  "occupation",
  "bio",
  "profilePhoto",
  "petInfo",
] as const;

export default function ProfilePage() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>("Personal Info");

  const convexUser = useQuery(
    api.users.getByClerkId,
    user?.id ? { clerkId: user.id } : "skip",
  );

  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-gray-600 mb-4">
          Please sign in to view your profile.
        </p>
        <Link
          href="/sign-in"
          className="bg-[#1e3a8a] text-white px-6 py-2 rounded-lg hover:bg-blue-900 transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  if (convexUser === undefined) {
    return <ProfileSkeleton />;
  }

  if (!convexUser) {
    return (
      <div className="text-center py-20 text-gray-500">Profile not found.</div>
    );
  }

  const pct = Math.round(
    (COMPLETENESS_FIELDS.filter(
      (f) => !!convexUser[f as keyof typeof convexUser],
    ).length /
      COMPLETENESS_FIELDS.length) *
      100,
  );

  const barColor = pct < 30 ? "#ef4444" : pct < 70 ? "#f59e0b" : "#22c55e";

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header card */}
      <div className="bg-[#eef2f8] rounded-xl p-6 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <ProfileImageEditor kind="profile" />

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
          href={
            convexUser.role === "landlord"
              ? `/landlords/${convexUser._id}`
              : `/travelers/${convexUser._id}`
          }
          className="flex items-center gap-2 text-sm border border-gray-400 text-gray-700 px-4 py-2 rounded-lg hover:bg-white transition-colors shrink-0"
        >
          <ExternalLink className="w-4 h-4" />
          View My Profile
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
                : "border-transparent text-gray-500 hover:text-gray-700",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Personal Info" && (
        <PersonalInfoTab convexUser={convexUser} clerkUser={user} />
      )}
      {activeTab === "Reviews" && <ReviewsTab convexUser={convexUser} />}
      {activeTab === "Saved Searches" && (
        <SavedSearchesTab convexUser={convexUser} />
      )}
      {activeTab === "Housing Requests" && (
        <HousingRequestsTab convexUser={convexUser} />
      )}
    </div>
  );
}

/* ─── Personal Info tab ─── */
function PersonalInfoTab({
  convexUser,
  clerkUser,
}: {
  convexUser: NonNullable<
    ReturnType<typeof useQuery<typeof api.users.getByClerkId>>
  >;
  clerkUser: ReturnType<typeof useUser>["user"];
}) {
  const updateProfile = useMutation(api.users.updateProfile);
  const [saving, setSaving] = useState(false);
  const [verifyingPhone, setVerifyingPhone] = useState(false);
  const revokePhone = useMutation(api.users.revokePhone);

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

  const set =
    (k: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ userId: convexUser._id, ...form });
      toast.success("Profile updated!");
    } catch {
      toast.error("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const emailResource = clerkUser?.primaryEmailAddress;
  const email = emailResource?.emailAddress ?? convexUser.email;
  const emailConfirmed = emailResource?.verification.status === "verified";

  return (
    <div className="space-y-10">
      <p className="text-sm text-gray-600">
        Profile and pet photos appear with your profile. Photo links can be
        opened by anyone who has the link. Use images you want to share, without
        private documents or contact details.
      </p>
      {/* General Information */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          General information
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <Field label="First name" required>
            <input
              value={form.firstName}
              onChange={set("firstName")}
              placeholder="First name"
              className={inputCls}
            />
          </Field>
          <Field label="Last name" required>
            <input
              value={form.lastName}
              onChange={set("lastName")}
              placeholder="Last name"
              className={inputCls}
            />
          </Field>
          <Field label="Display name" required>
            <input
              value={form.displayName}
              onChange={set("displayName")}
              placeholder="Display name"
              className={inputCls}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Email"
            hint={
              <span
                className={cn(
                  "text-xs",
                  emailConfirmed ? "text-green-600" : "text-gray-500",
                )}
              >
                {emailConfirmed ? "Email confirmed" : "Email not confirmed"}
              </span>
            }
          >
            <input
              value={email}
              readOnly
              className={cn(inputCls, "bg-gray-50 cursor-not-allowed")}
            />
          </Field>
          <Field label="Phone number">
            <input
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={set("phone")}
              placeholder="+14155552671"
              className={inputCls}
            />
            <div className="flex flex-wrap gap-3 mt-2 text-xs">
              <button
                type="button"
                onClick={() => setVerifyingPhone(true)}
                disabled={!form.phone.trim()}
                className="text-blue-600 underline disabled:opacity-50"
              >
                {convexUser.phoneVerified && form.phone === convexUser.phone
                  ? "Refresh confirmation"
                  : "Confirm with SMS"}
              </button>
              {convexUser.phoneVerified && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await revokePhone({});
                      toast.success(
                        "Phone sharing stopped for existing requests.",
                      );
                    } catch {
                      toast.error("Could not stop phone sharing. Try again.");
                    }
                  }}
                  className="text-red-700 underline"
                >
                  Stop phone sharing
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {convexUser.phoneVerified && form.phone === convexUser.phone
                ? convexUser.phoneVerificationMode === "test"
                  ? "Test account phone confirmation. "
                  : "Phone confirmed through your sign-in account. "
                : "Phone not confirmed. "}
              Use the country code. Changing or removing a saved number stops
              sharing on existing requests.
            </p>
          </Field>
          <PhoneVerifyDialog
            isOpen={verifyingPhone}
            onClose={() => setVerifyingPhone(false)}
            phone={form.phone}
            onVerified={(phone) => {
              setForm((previous) => ({ ...previous, phone }));
              toast.success("Phone confirmation saved.");
            }}
          />
        </div>
      </section>

      {/* Location */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Location</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="City" required>
            <input
              value={form.city}
              onChange={set("city")}
              placeholder="City"
              className={inputCls}
            />
          </Field>
          <Field label="State" required>
            <select
              value={form.state}
              onChange={set("state")}
              className={inputCls}
            >
              <option value="">- Select a State -</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Zip code" required>
            <input
              value={form.zip}
              onChange={set("zip")}
              placeholder="Zip code"
              className={inputCls}
            />
          </Field>
          <Field label="Hometown">
            <input
              value={form.hometown}
              onChange={set("hometown")}
              placeholder="Hometown"
              className={inputCls}
            />
          </Field>
        </div>
      </section>

      {/* Work Experience */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Work experience
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <p className="font-bold text-gray-900 mb-1">Work information</p>
            <p className="text-sm text-gray-600">
              Share your occupation and company so other members can learn about
              you. This information is self-reported. LinkedIn verification is
              not available yet.
            </p>
          </div>

          {/* Occupation + Company */}
          <div className="space-y-4">
            <Field label="Occupation">
              <input
                value={form.occupation}
                onChange={set("occupation")}
                placeholder="e.g. Travel Nurse, Software Engineer"
                className={inputCls}
              />
            </Field>
            <Field label="Company">
              <input
                value={form.company}
                onChange={set("company")}
                placeholder="Company or organization"
                className={inputCls}
              />
            </Field>
          </div>
        </div>
      </section>

      {/* About */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-2">
          Tell us about yourself
        </h2>
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
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Traveling with a pet?
        </h2>
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
          <ProfileImageEditor kind="pet" />
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
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── Reviews tab ─── */
function ReviewsTab({
  convexUser,
}: {
  convexUser: NonNullable<
    ReturnType<typeof useQuery<typeof api.users.getByClerkId>>
  >;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Published reviews about you
        {convexUser.role === "landlord" ? " and your properties" : ""} appear
        below.{" "}
        <Link className="underline" href="/dashboard/reviews">
          Manage written reviews, responses, invitations and moderation updates
        </Link>
        .
      </p>
      {convexUser.role === "landlord" ? (
        <PublicReviews landlordId={convexUser._id} />
      ) : (
        <PublicReviews travelerId={convexUser._id} />
      )}
    </div>
  );
}

/* ─── Saved Searches tab ─── */
function SavedSearchesTab({
  convexUser,
}: {
  convexUser: NonNullable<
    ReturnType<typeof useQuery<typeof api.users.getByClerkId>>
  >;
}) {
  const searches = useQuery(api.savedSearches.getByUser, {
    userId: convexUser._id,
  });
  const remove = useMutation(api.savedSearches.remove);

  if (searches === undefined)
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );

  if (!searches.length)
    return (
      <div className="text-center py-16">
        <Bookmark className="w-10 h-10 mx-auto mb-3 text-gray-300" />
        <p className="font-medium text-gray-600">No saved searches yet</p>
        <p className="text-sm text-gray-400 mt-1 mb-4">
          Save a search to get notified of new listings.
        </p>
        <Link
          href="/search"
          className="bg-[#1e3a8a] text-white px-5 py-2 rounded-lg text-sm hover:bg-blue-900 transition-colors"
        >
          Browse Listings
        </Link>
      </div>
    );

  return (
    <div className="space-y-3">
      {searches.map((s) => {
        const params = new URLSearchParams();
        if (s.city) {
          params.set("city", s.city);
          params.set("location", s.city + (s.state ? `, ${s.state}` : ""));
        }
        if (s.state) params.set("state", s.state);
        if (s.maxPrice) params.set("budget", String(s.maxPrice));
        return (
          <div
            key={s._id}
            className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-200 transition-colors"
          >
            <Bookmark className="w-4 h-4 text-blue-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-900">{s.name}</p>
              <div className="flex gap-2 flex-wrap mt-1">
                {s.city && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="w-3 h-3" />
                    {s.city}
                    {s.state ? `, ${s.state}` : ""}
                  </span>
                )}
                {s.maxPrice && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <DollarSign className="w-3 h-3" />
                    Up to {formatPrice(s.maxPrice)}
                  </span>
                )}
                {s.bedrooms && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <BedDouble className="w-3 h-3" />
                    {s.bedrooms}+ beds
                  </span>
                )}
              </div>
            </div>
            <Link
              href={`/search?${params.toString()}`}
              className="text-xs text-blue-600 hover:underline shrink-0 hidden sm:block"
            >
              View
            </Link>
            <button
              onClick={() =>
                remove({ id: s._id }).then(() => toast.success("Removed"))
              }
              className="text-gray-300 hover:text-red-400 transition-colors ml-1"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Housing Requests tab ─── */
function HousingRequestsTab({
  convexUser,
}: {
  convexUser: NonNullable<
    ReturnType<typeof useQuery<typeof api.users.getByClerkId>>
  >;
}) {
  const requests = useQuery(api.housingRequests.getByUser, {
    userId: convexUser._id,
  });
  const close = useMutation(api.housingRequests.close);

  if (requests === undefined)
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">
          {requests.length} housing{" "}
          {requests.length === 1 ? "request" : "requests"}
        </p>
        <Link
          href="/housing-request"
          className="bg-[#1e3a8a] text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-900 transition-colors"
        >
          + New Request
        </Link>
      </div>
      {!requests.length ? (
        <div className="text-center py-16">
          <Home className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-600">No housing requests</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">
            Submit a request and let landlords come to you.
          </p>
          <Link
            href="/housing-request"
            className="bg-[#1e3a8a] text-white px-5 py-2 rounded-lg text-sm hover:bg-blue-900 transition-colors"
          >
            Submit a Request
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r: Doc<"housingRequests">) => (
            <div
              key={r._id}
              className="p-4 bg-white border border-gray-200 rounded-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">
                      {r.city}, {r.state}
                    </span>
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        r.status === "open"
                          ? "bg-green-100 text-green-700"
                          : r.status === "fulfilled"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-600",
                      )}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-gray-500">
                    <span>Budget: {formatPrice(r.maxBudget)}/mo</span>
                    <span>
                      Duration: {r.duration} month{r.duration > 1 ? "s" : ""}
                    </span>
                    <span>Beds: {r.bedrooms}+</span>
                    <span>Move-in: {formatDate(r.moveInDate)}</span>
                  </div>
                </div>
                {r.status === "open" && (
                  <button
                    onClick={() =>
                      close({ id: r._id }).then(() =>
                        toast.success("Request closed"),
                      )
                    }
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
const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white";

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
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
        {[120, 80, 120, 140].map((w, i) => (
          <div
            key={i}
            className="h-4 bg-gray-200 rounded mb-3"
            style={{ width: w }}
          />
        ))}
      </div>
      <div className="space-y-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-12 bg-gray-200 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
