"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PROPERTY_TYPES, AMENITIES } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Home,
  MapPin,
  Layers,
  Star,
  ImageIcon,
} from "lucide-react";
import { PhotoUpload } from "@/components/photo-upload";

interface FormData {
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
  price: number;
  minStay: number;
  availableFrom: string;
  // Step 4
  amenities: string[];
  petFriendly: boolean;
  utilitiesIncluded: boolean;
  parkingIncluded: boolean;
  // Step 5
  photos: string[];
}

const STEPS = [
  { id: 1, label: "Basic Info", icon: Home },
  { id: 2, label: "Location", icon: MapPin },
  { id: 3, label: "Details", icon: Layers },
  { id: 4, label: "Features", icon: Star },
  { id: 5, label: "Photos", icon: ImageIcon },
];

const BATHROOM_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];

const initialForm: FormData = {
  title: "",
  propertyType: "",
  description: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  bedrooms: 1,
  bathrooms: 1,
  price: 0,
  minStay: 1,
  availableFrom: "",
  amenities: [],
  petFriendly: false,
  utilitiesIncluded: false,
  parkingIncluded: false,
  photos: [""],
};

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isCompleted = currentStep > step.id;
        const isActive = currentStep === step.id;
        return (
          <div key={step.id} className="flex items-center shrink-0">
            <div className="flex flex-col items-center">
              <div
                className={`h-9 w-9 rounded-full flex items-center justify-center border-2 transition-colors ${
                  isCompleted
                    ? "bg-[#0f2044] border-[#0f2044] text-white"
                    : isActive
                    ? "border-[#0f2044] text-[#0f2044] bg-white"
                    : "border-slate-200 text-slate-400 bg-white"
                }`}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span
                className={`text-xs mt-1 font-medium ${
                  isActive ? "text-[#0f2044]" : isCompleted ? "text-slate-600" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-8 mx-1 mt-[-14px] transition-colors ${
                  currentStep > step.id ? "bg-[#0f2044]" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function NewListingPage() {
  const router = useRouter();
  const { userId } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip"
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
      if (!form.title.trim()) { toast.error("Title is required"); return false; }
      if (!form.propertyType) { toast.error("Property type is required"); return false; }
      if (!form.description.trim()) { toast.error("Description is required"); return false; }
    }
    if (step === 2) {
      if (!form.address.trim()) { toast.error("Address is required"); return false; }
      if (!form.city.trim()) { toast.error("City is required"); return false; }
      if (!form.state.trim()) { toast.error("State is required"); return false; }
      if (!form.zip.trim()) { toast.error("ZIP code is required"); return false; }
    }
    if (step === 3) {
      if (!form.price || form.price <= 0) { toast.error("Valid price is required"); return false; }
      if (!form.availableFrom) { toast.error("Available from date is required"); return false; }
    }
    return true;
  }

  function nextStep() {
    if (validateStep()) setStep((s) => Math.min(s + 1, 5));
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleSubmit() {
    if (!convexUser?._id) {
      toast.error("User not found. Please try again.");
      return;
    }
    setSubmitting(true);
    try {
      const cleanPhotos = form.photos.filter((p) => p.trim() !== "");
      await createListing({
        landlordId: convexUser._id,
        title: form.title.trim(),
        description: form.description.trim(),
        propertyType: form.propertyType,
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip: form.zip.trim(),
        price: Number(form.price),
        bedrooms: Number(form.bedrooms),
        bathrooms: Number(form.bathrooms),
        minStay: Number(form.minStay),
        availableFrom: new Date(form.availableFrom).getTime(),
        amenities: form.amenities,
        petFriendly: form.petFriendly,
        utilitiesIncluded: form.utilitiesIncluded,
        parkingIncluded: form.parkingIncluded,
        photos: cleanPhotos,
      });
      toast.success("Listing created! It will be reviewed shortly.");
      router.push("/dashboard/landlord");
    } catch (err) {
      toast.error("Failed to create listing. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Add New Listing</h1>
          <p className="text-slate-500 text-sm mt-1">
            Step {step} of {STEPS.length}
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link href="/dashboard/landlord">Cancel</Link>
        </Button>
      </div>

      <StepIndicator currentStep={step} />

      <Card>
        <CardContent className="p-6">
          {/* Step 1 — Basic Info */}
          {step === 1 && (
            <div className="space-y-5">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-lg">Basic Information</CardTitle>
              </CardHeader>
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
          {step === 2 && (
            <div className="space-y-5">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-lg">Location</CardTitle>
              </CardHeader>
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
                    onChange={(e) => update("state", e.target.value.toUpperCase())}
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
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-lg">Property Details</CardTitle>
              </CardHeader>
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
                      onChange={(e) => update("price", Number(e.target.value))}
                    />
                  </div>
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

          {/* Step 4 — Features */}
          {step === 4 && (
            <div className="space-y-6">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-lg">Features & Amenities</CardTitle>
              </CardHeader>

              {/* Toggles */}
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Pet Friendly</p>
                    <p className="text-xs text-slate-500">Cats and/or dogs allowed</p>
                  </div>
                  <Switch
                    checked={form.petFriendly}
                    onCheckedChange={(v) => update("petFriendly", v)}
                  />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Utilities Included</p>
                    <p className="text-xs text-slate-500">
                      Electric, gas, water included in rent
                    </p>
                  </div>
                  <Switch
                    checked={form.utilitiesIncluded}
                    onCheckedChange={(v) => update("utilitiesIncluded", v)}
                  />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Parking Included</p>
                    <p className="text-xs text-slate-500">
                      Off-street or garage parking available
                    </p>
                  </div>
                  <Switch
                    checked={form.parkingIncluded}
                    onCheckedChange={(v) => update("parkingIncluded", v)}
                  />
                </div>
              </div>

              {/* Amenities grid */}
              <div>
                <p className="text-sm font-medium text-slate-900 mb-3">Amenities</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {AMENITIES.map((amenity) => (
                    <label
                      key={amenity}
                      className="flex items-center gap-2.5 cursor-pointer"
                    >
                      <Checkbox
                        id={amenity}
                        checked={form.amenities.includes(amenity)}
                        onCheckedChange={() => toggleAmenity(amenity)}
                      />
                      <span className="text-sm text-slate-700">{amenity}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 5 — Photos */}
          {step === 5 && (
            <div className="space-y-5">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-lg">Photos</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {Array.from({ length: 10 }).map((_, index) => (
                  <PhotoUpload
                    key={index}
                    variant="listing"
                    currentUrl={form.photos[index] || undefined}
                    label={index === 0 ? "Cover photo" : `Photo ${index + 1}`}
                    onUpload={(url) => {
                      setForm((prev) => {
                        const photos = [...prev.photos];
                        // Grow array if needed
                        while (photos.length <= index) photos.push("");
                        photos[index] = url;
                        return { ...prev, photos };
                      });
                    }}
                  />
                ))}
              </div>
              <p className="text-xs text-slate-400">
                Up to 10 photos. The first photo will be used as the cover image.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={step === 1}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        {step < 5 ? (
          <Button onClick={nextStep}>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating…" : "Create Listing"}
          </Button>
        )}
      </div>
    </div>
  );
}
