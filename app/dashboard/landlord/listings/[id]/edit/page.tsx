"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Check,
  Home,
  MapPin,
  Layers,
  Star,
  ImageIcon,
} from "lucide-react";

interface FormData {
  title: string;
  propertyType: string;
  description: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  bedrooms: number;
  bathrooms: number;
  price: number;
  minStay: number;
  availableFrom: string;
  amenities: string[];
  petFriendly: boolean;
  utilitiesIncluded: boolean;
  parkingIncluded: boolean;
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

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const listingId = params.id as string;
  const { userId } = useAuth();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip"
  );

  const listing = useQuery(
    api.listings.getById,
    listingId ? { id: listingId as Id<"listings"> } : "skip"
  );

  const updateMutation = useMutation(api.listings.update);

  // Pre-fill form when listing data arrives
  useEffect(() => {
    if (listing && !form) {
      const availableDate = new Date(listing.availableFrom);
      const yyyy = availableDate.getFullYear();
      const mm = String(availableDate.getMonth() + 1).padStart(2, "0");
      const dd = String(availableDate.getDate()).padStart(2, "0");

      setForm({
        title: listing.title,
        propertyType: listing.propertyType,
        description: listing.description,
        address: listing.address,
        city: listing.city,
        state: listing.state,
        zip: listing.zip,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        price: listing.price,
        minStay: listing.minStay,
        availableFrom: `${yyyy}-${mm}-${dd}`,
        amenities: listing.amenities,
        petFriendly: listing.petFriendly,
        utilitiesIncluded: listing.utilitiesIncluded,
        parkingIncluded: listing.parkingIncluded,
        photos: listing.photos.length > 0 ? listing.photos : [""],
      });
    }
  }, [listing, form]);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleAmenity(amenity: string) {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        amenities: prev.amenities.includes(amenity)
          ? prev.amenities.filter((a) => a !== amenity)
          : [...prev.amenities, amenity],
      };
    });
  }

  function updatePhoto(index: number, value: string) {
    setForm((prev) => {
      if (!prev) return prev;
      const photos = [...prev.photos];
      photos[index] = value;
      return { ...prev, photos };
    });
  }

  function addPhoto() {
    if (form && form.photos.length < 10) {
      setForm((prev) => prev ? { ...prev, photos: [...prev.photos, ""] } : prev);
    }
  }

  function removePhoto(index: number) {
    setForm((prev) =>
      prev ? { ...prev, photos: prev.photos.filter((_, i) => i !== index) } : prev
    );
  }

  function validateStep(): boolean {
    if (!form) return false;
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
    if (!form) return;
    setSubmitting(true);
    try {
      const cleanPhotos = form.photos.filter((p) => p.trim() !== "");
      await updateMutation({
        id: listingId as Id<"listings">,
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
      toast.success("Listing updated successfully!");
      router.push("/dashboard/landlord/listings");
    } catch (err) {
      toast.error("Failed to update listing. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Loading state
  if (listing === undefined || !form) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-28 mt-2" />
          </div>
          <Skeleton className="h-9 w-20" />
        </div>
        <Skeleton className="h-12 w-full" />
        <Card>
          <CardContent className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (listing === null) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center py-16">
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Listing not found</h2>
        <p className="text-slate-500 mb-4">This listing may have been deleted.</p>
        <Button asChild variant="outline">
          <Link href="/dashboard/landlord/listings">Back to Listings</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Edit Listing</h1>
          <p className="text-slate-500 text-sm mt-1">
            Step {step} of {STEPS.length}
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link href="/dashboard/landlord/listings">Cancel</Link>
        </Button>
      </div>

      <StepIndicator currentStep={step} />

      <Card>
        <CardContent className="p-6">
          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-lg">Basic Information</CardTitle>
              </CardHeader>
              <div className="space-y-2">
                <Label htmlFor="title">Listing Title *</Label>
                <Input
                  id="title"
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
                    <SelectValue />
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
                  rows={5}
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-5">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-lg">Location</CardTitle>
              </CardHeader>
              <div className="space-y-2">
                <Label htmlFor="address">Street Address *</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State *</Label>
                  <Input
                    id="state"
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
                  maxLength={10}
                  value={form.zip}
                  onChange={(e) => update("zip", e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 3 */}
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
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                    <Input
                      id="price"
                      type="number"
                      min={0}
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

          {/* Step 4 */}
          {step === 4 && (
            <div className="space-y-6">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-lg">Features & Amenities</CardTitle>
              </CardHeader>
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
                    <p className="text-xs text-slate-500">Electric, gas, water included in rent</p>
                  </div>
                  <Switch
                    checked={form.utilitiesIncluded}
                    onCheckedChange={(v) => update("utilitiesIncluded", v)}
                  />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Parking Included</p>
                    <p className="text-xs text-slate-500">Off-street or garage parking available</p>
                  </div>
                  <Switch
                    checked={form.parkingIncluded}
                    onCheckedChange={(v) => update("parkingIncluded", v)}
                  />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 mb-3">Amenities</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {AMENITIES.map((amenity) => (
                    <label key={amenity} className="flex items-center gap-2.5 cursor-pointer">
                      <Checkbox
                        id={`edit-${amenity}`}
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

          {/* Step 5 */}
          {step === 5 && (
            <div className="space-y-5">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-lg">Photos</CardTitle>
              </CardHeader>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                Photo upload coming soon — paste image URLs below to add photos.
              </div>
              <div className="space-y-3">
                {form.photos.map((photo, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0 overflow-hidden">
                      {photo ? (
                        <img
                          src={photo}
                          alt={`Photo ${index + 1}`}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                    <Input
                      placeholder={`Photo ${index + 1} URL`}
                      value={photo}
                      onChange={(e) => updatePhoto(index, e.target.value)}
                      className="flex-1"
                    />
                    {form.photos.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePhoto(index)}
                        className="text-slate-400 hover:text-red-500 shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {form.photos.length < 10 && (
                <Button type="button" variant="outline" size="sm" onClick={addPhoto}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Photo URL
                </Button>
              )}
              <p className="text-xs text-slate-400">
                Up to 10 photos. The first photo will be used as the cover image.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <Button variant="outline" onClick={prevStep} disabled={step === 1}>
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
            {submitting ? "Saving…" : "Save Changes"}
          </Button>
        )}
      </div>
    </div>
  );
}
