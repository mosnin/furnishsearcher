"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PROPERTY_TYPES, OWNER_AMENITIES } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ListingPhotoEditor } from "@/components/listing-photo-editor";
import { photoAssetsFromDrafts, type PhotoDraft } from "@/lib/photos";

import wizard from "@/components/onboardingwizard.module.css";

import { ListingDetailsEditor } from "@/components/listing-details-editor";
import {
  emptyListingDetails,
  validateListingDetails,
  type ListingDetails,
} from "@/lib/listing-details";

interface FormData {
  details: ListingDetails;
  // Step 1
  title: string;
  propertyType: string;
  description: string;
  // Step 2
  address: string;
  city: string;
  state: string;
  zip: string;
  // Step 3
  bedrooms: number;
  bathrooms: number;
  maxOccupancy: string;
  price: number;
  minStay: number;
  availableFrom: string;
  // Step 4
  amenities: string[];
  petFriendly: boolean;
  utilitiesIncluded: boolean;
  parkingIncluded: boolean;
  // Step 5
  photos: PhotoDraft[];
}

const STEPS = [
  {
    id: 1,
    label: "Tell us about your property",
    description: "Give travelers a clear first impression of their next home.",
  },
  {
    id: 2,
    label: "Where is your property?",
    description:
      "Start with the address. You’ll confirm its map location after saving your draft.",
  },
  {
    id: 3,
    label: "Make room for your next guest",
    description: "Add the bedrooms and bathrooms available in this rental.",
  },
  {
    id: 4,
    label: "What makes it feel like home?",
    description:
      "Choose the features and included essentials travelers can expect.",
  },
  {
    id: 5,
    label: "Let your property speak for itself",
    description: "Add clear photos of the spaces your guests will use.",
  },
  {
    id: 6,
    label: "Set your monthly stay details",
    description: "Choose your rent, availability and minimum stay.",
  },
  {
    id: 7,
    label: "A few details worth sharing",
    description:
      "Add the policies and practical details that help travelers decide.",
  },
  {
    id: 8,
    label: "Ready for a final look?",
    description:
      "Review your property before saving. This creates a draft, not a public listing.",
  },
];

const BATHROOM_OPTIONS = [
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8,
];

const initialForm: FormData = {
  details: emptyListingDetails(),
  title: "",
  propertyType: "",
  description: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  bedrooms: 1,
  bathrooms: 1,
  maxOccupancy: "",
  price: 0,
  minStay: 1,
  availableFrom: "",
  amenities: [],
  petFriendly: false,
  utilitiesIncluded: false,
  parkingIncluded: false,
  photos: [],
};

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div
      className={wizard.progress}
      role="progressbar"
      aria-label="Listing setup"
      aria-valuemin={1}
      aria-valuemax={STEPS.length}
      aria-valuenow={currentStep}
    >
      {STEPS.map((item) => (
        <span key={item.id} data-active={item.id <= currentStep} />
      ))}
    </div>
  );
}

export default function NewListingPage() {
  return (
    <Suspense fallback={<p className="p-6">Loading rental form…</p>}>
      <NewListingForm />
    </Suspense>
  );
}
function NewListingForm() {
  const parent = useSearchParams().get("parent"),
    { isAuthenticated } = useConvexAuth();
  const [unitName, setUnitName] = useState(""),
    [independentSpace, setIndependentSpace] = useState(false);
  const property = useQuery(
    api.units.context,
    parent && isAuthenticated
      ? {
          listingId:
            parent as import("@/convex/_generated/dataModel").Id<"listings">,
        }
      : "skip",
  );
  const router = useRouter();
  const { userId } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip",
  );
  const createListing = useMutation(api.listings.create);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleAmenity(amenity: string) {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  }

  function validateStep(): boolean {
    if (step === 1) {
      if (!form.title.trim()) {
        toast.error("Title is required");
        return false;
      }
      if (!form.propertyType) {
        toast.error("Property type is required");
        return false;
      }
      if (!form.description.trim()) {
        toast.error("Description is required");
        return false;
      }
    }
    if (step === 2 && !parent) {
      if (!form.address.trim()) {
        toast.error("Address is required");
        return false;
      }
      if (!form.city.trim()) {
        toast.error("City is required");
        return false;
      }
      if (!form.state.trim()) {
        toast.error("State is required");
        return false;
      }
      if (!form.zip.trim()) {
        toast.error("ZIP code is required");
        return false;
      }
    }
    if (step === 6) {
      if (!form.price || form.price <= 0) {
        toast.error("Valid price is required");
        return false;
      }
      if (!form.availableFrom) {
        toast.error("Available from date is required");
        return false;
      }
    }
    if (step === 7) {
      try {
        validateListingDetails(form.details);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Review the property details.",
        );
        return false;
      }
    }
    return true;
  }

  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  function nextStep() {
    if (validateStep()) setStep((s) => Math.min(s + 1, STEPS.length));
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleSubmit() {
    if (!convexUser?._id) {
      toast.error("User not found. Please try again.");
      return;
    }
    if (
      parent &&
      (!property?.canAdd || !unitName.trim() || !independentSpace)
    ) {
      toast.error(
        "Complete the unit name and independent space confirmation; the main property must be ready.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const photoAssets = photoAssetsFromDrafts(form.photos);
      const listingId = await createListing({
        ...(parent
          ? {
              parentListingId:
                parent as import("@/convex/_generated/dataModel").Id<"listings">,
              unitName,
              independentSpace,
            }
          : {}),
        landlordId: convexUser._id,
        title: form.title.trim(),
        description: form.description.trim(),
        propertyType: form.propertyType,
        address: property?.address ?? form.address.trim(),
        city: property?.city ?? form.city.trim(),
        state: property?.state ?? form.state.trim(),
        zip: property?.zip ?? form.zip.trim(),
        details: validateListingDetails(form.details),
        price: Number(form.price),
        bedrooms: Number(form.bedrooms),
        bathrooms: Number(form.bathrooms),
        maxOccupancy: form.maxOccupancy ? Number(form.maxOccupancy) : undefined,
        minStay: Number(form.minStay),
        availableFrom: new Date(form.availableFrom).getTime(),
        amenities: form.amenities,
        petFriendly: form.petFriendly,
        utilitiesIncluded: form.utilitiesIncluded,
        parkingIncluded: form.parkingIncluded,
        photos: [],
        photoAssets,
      });
      toast.success(
        parent
          ? "Unit draft created. Request publication when ready."
          : "Draft created. Confirm the address match and request publication when ready.",
      );
      router.push(
        `/dashboard/landlord/listings/${listingId}/${parent ? "units" : "location"}`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to create listing. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={wizard.shell}>
      {parent && (
        <section className="rounded-xl border p-4 space-y-3 mb-6">
          <h2 className="font-semibold">
            Add a rental space at {property?.title ?? "this property"}
          </h2>
          <p>
            {property?.address}, {property?.city}, {property?.state}{" "}
            {property?.zip}
          </p>
          <p className="text-sm">
            This space inherits the shared address and map area. Add its own
            photos, rent, amenities and availability below. Each unit uses one
            active listing slot.
          </p>
          {property?.issues.map((issue) => (
            <p key={issue} role="alert">
              {issue}
            </p>
          ))}
          <Label htmlFor="unit-name">Unit name</Label>
          <Input
            id="unit-name"
            maxLength={80}
            value={unitName}
            onChange={(e) => setUnitName(e.target.value)}
            placeholder="Garden suite or upstairs bedroom"
          />
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={independentSpace}
              onChange={(e) => setIndependentSpace(e.target.checked)}
            />
            This is a distinct space that can be rented independently.
          </label>
        </section>
      )}
      <div className={wizard.top}>
        <div>
          <p className={wizard.eyebrow}>
            Your property · Step {step} of {STEPS.length}
          </p>
          <h1 ref={heading} tabIndex={-1} className={wizard.heading}>
            {STEPS[step - 1].label}
          </h1>
          <p className={wizard.intro}>{STEPS[step - 1].description}</p>
        </div>
        <Button asChild variant="ghost">
          <Link href="/dashboard/landlord">Close</Link>
        </Button>
      </div>
      <StepIndicator currentStep={step} />
      <Card className={wizard.surface}>
        <CardContent>
          <div key={step} className={wizard.step}>
            {/* Step 1 — Basic Info */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="title">Listing Title *</Label>
                  <Input
                    id="title"
                    placeholder="e.g. Modern 2BR Apartment in Downtown Austin"
                    value={form.title}
                    onChange={(e) => update("title", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="propertyType">Property Type *</Label>
                  <Select
                    value={form.propertyType}
                    onValueChange={(v) => update("propertyType", v)}
                  >
                    <SelectTrigger id="propertyType">
                      <SelectValue placeholder="Select property type" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROPERTY_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe your property — what makes it special, nearby amenities, neighborhood vibe…"
                    rows={5}
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Step 2 — Location */}
            {step === 2 && parent && (
              <p className="p-4">
                Shared address: {property?.address}, {property?.city},{" "}
                {property?.state} {property?.zip}.{" "}
                <Link
                  className="underline"
                  href={`/dashboard/landlord/listings/${property?.primaryListingId ?? parent}/location`}
                >
                  Manage property location
                </Link>
              </p>
            )}
            {step === 2 && !parent && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="address">Street Address *</Label>
                  <Input
                    id="address"
                    placeholder="123 Main St, Apt 4B"
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      placeholder="Austin"
                      value={form.city}
                      onChange={(e) => update("city", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      placeholder="TX"
                      maxLength={2}
                      value={form.state}
                      onChange={(e) =>
                        update("state", e.target.value.toUpperCase())
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="zip">ZIP Code *</Label>
                  <Input
                    id="zip"
                    placeholder="78701"
                    maxLength={10}
                    value={form.zip}
                    onChange={(e) => update("zip", e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Step 3 — Details */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bedrooms">Bedrooms *</Label>
                    <Select
                      value={String(form.bedrooms)}
                      onValueChange={(v) => update("bedrooms", Number(v))}
                    >
                      <SelectTrigger id="bedrooms">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} {n === 1 ? "bedroom" : "bedrooms"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bathrooms">Bathrooms *</Label>
                    <Select
                      value={String(form.bathrooms)}
                      onValueChange={(v) => update("bathrooms", Number(v))}
                    >
                      <SelectTrigger id="bathrooms">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BATHROOM_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} {n === 1 ? "bathroom" : "bathrooms"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4 — Features */}
            {step === 4 && (
              <div className="space-y-6">
                {/* Toggles */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-slate-100">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Pet Friendly
                      </p>
                      <p className="text-xs text-slate-500">
                        Cats and/or dogs allowed
                      </p>
                    </div>
                    <Switch
                      aria-label="Pet Friendly"
                      checked={form.petFriendly}
                      onCheckedChange={(v) => update("petFriendly", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-slate-100">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Utilities Included
                      </p>
                      <p className="text-xs text-slate-500">
                        Electric, gas, water included in rent
                      </p>
                    </div>
                    <Switch
                      aria-label="Utilities Included"
                      checked={form.utilitiesIncluded}
                      onCheckedChange={(v) => update("utilitiesIncluded", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-slate-100">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Parking Included
                      </p>
                      <p className="text-xs text-slate-500">
                        Off-street or garage parking available
                      </p>
                    </div>
                    <Switch
                      aria-label="Parking Included"
                      checked={form.parkingIncluded}
                      onCheckedChange={(v) => update("parkingIncluded", v)}
                    />
                  </div>
                </div>

                {/* Amenities grid */}
                <div>
                  <p className="text-sm font-medium text-slate-900 mb-3">
                    Amenities
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {OWNER_AMENITIES.map((amenity) => (
                      <label
                        key={amenity}
                        className="flex items-center gap-2.5 cursor-pointer"
                      >
                        <Checkbox
                          id={amenity}
                          checked={form.amenities.includes(amenity)}
                          onCheckedChange={() => toggleAmenity(amenity)}
                        />
                        <span className="text-sm text-slate-700">
                          {amenity}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 5 — Photos */}
            {step === 5 && (
              <div className="space-y-5">
                <ListingPhotoEditor
                  photos={form.photos}
                  onChange={(photos) => update("photos", photos)}
                  busy={photoBusy}
                  onBusyChange={setPhotoBusy}
                />
              </div>
            )}
            {step === 6 && (
              <div className="space-y-5">
                {" "}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price">Monthly Price (USD) *</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                        $
                      </span>
                      <Input
                        id="price"
                        type="number"
                        min={1}
                        step={1}
                        placeholder="2500"
                        className="pl-7"
                        value={form.price || ""}
                        onChange={(e) =>
                          update("price", Number(e.target.value))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="maxOccupancy">
                      Maximum occupants (optional)
                    </Label>
                    <Input
                      id="maxOccupancy"
                      type="number"
                      min={1}
                      max={30}
                      value={form.maxOccupancy}
                      onChange={(e) => update("maxOccupancy", e.target.value)}
                      placeholder="Not specified"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minStay">Minimum Stay (months)</Label>
                    <Select
                      value={String(form.minStay)}
                      onValueChange={(v) => update("minStay", Number(v))}
                    >
                      <SelectTrigger id="minStay">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} {n === 1 ? "month" : "months"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="availableFrom">Available From *</Label>
                  <Input
                    id="availableFrom"
                    type="date"
                    value={form.availableFrom}
                    onChange={(e) => update("availableFrom", e.target.value)}
                  />
                </div>
              </div>
            )}
            {step === 7 && (
              <div className="space-y-5">
                {" "}
                <ListingDetailsEditor
                  value={form.details}
                  onChange={(details) => update("details", details)}
                />
              </div>
            )}
            {step === 8 && (
              <div>
                <dl className={wizard.review}>
                  {[
                    ["Property", form.title],
                    ["Type", form.propertyType],
                    [
                      "Location",
                      parent
                        ? `${property?.address}, ${property?.city}`
                        : `${form.address}, ${form.city}, ${form.state} ${form.zip}`,
                    ],
                    [
                      "Rooms",
                      `${form.bedrooms} bedrooms · ${form.bathrooms} bathrooms`,
                    ],
                    [
                      "Monthly rent",
                      new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(form.price),
                    ],
                    [
                      "Minimum stay",
                      `${form.minStay} month${form.minStay === 1 ? "" : "s"}`,
                    ],
                    ["Available from", form.availableFrom],
                    ["Photos", String(form.photos.length)],
                    ["Amenities", form.amenities.join(", ") || "None selected"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className={wizard.note}>
                  You can edit this draft before requesting publication. Address
                  verification and publication requirements still apply.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Navigation buttons */}
      <div className={wizard.navigation}>
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={step === 1 || photoBusy}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        {step < STEPS.length ? (
          <Button onClick={nextStep} disabled={photoBusy}>
            Continue
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting || photoBusy}>
            {submitting ? "Creating…" : "Save property draft"}
          </Button>
        )}
      </div>
    </div>
  );
}
