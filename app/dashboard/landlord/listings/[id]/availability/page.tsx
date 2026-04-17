"use client";

import { use } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AvailabilityPage({ params }: PageProps) {
  const { id } = use(params);
  const { userId } = useAuth();

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip"
  );
  const listing = useQuery(
    api.listings.getById,
    id ? { id: id as Id<"listings"> } : "skip"
  );
  const blocks = useQuery(
    api.availability.getByListing,
    id ? { listingId: id as Id<"listings"> } : "skip"
  );

  const addBlock = useMutation(api.availability.addBlock);
  const removeBlock = useMutation(api.availability.removeBlock);

  const handleAddBlock = async (
    startDate: number,
    endDate: number,
    type: "unavailable" | "booked"
  ) => {
    try {
      await addBlock({ listingId: id as Id<"listings">, startDate, endDate, type });
      toast.success("Dates blocked");
    } catch {
      toast.error("Failed to block dates");
    }
  };

  const handleRemoveBlock = async (blockId: string) => {
    try {
      await removeBlock({ id: blockId as Id<"availabilityBlocks"> });
      toast.success("Block removed");
    } catch {
      toast.error("Failed to remove block");
    }
  };

  if (listing === undefined || blocks === undefined) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center py-16">
        <p className="text-slate-500 mb-4">Listing not found.</p>
        <Button asChild variant="outline">
          <Link href="/dashboard/landlord/listings">Back to Listings</Link>
        </Button>
      </div>
    );
  }

  const isOwner = convexUser?._id === listing.landlordId;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2 text-slate-500">
              <Link href="/dashboard/landlord/listings">
                <ChevronLeft className="h-4 w-4" />
                My Listings
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-[#0f2044]" />
            Manage Availability
          </h1>
          <p className="text-slate-500 text-sm mt-1 truncate max-w-md">
            {listing.title}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard/landlord/listings/${id}/edit`}>Edit Listing</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Availability Calendar</CardTitle>
          <p className="text-sm text-slate-500">
            Block dates when your property is unavailable or already booked. Tenants will
            see these when browsing your listing.
          </p>
        </CardHeader>
        <CardContent>
          <AvailabilityCalendar
            blocks={blocks ?? []}
            onAddBlock={isOwner ? handleAddBlock : undefined}
            onRemoveBlock={isOwner ? handleRemoveBlock : undefined}
            editable={isOwner}
          />
        </CardContent>
      </Card>
    </div>
  );
}
