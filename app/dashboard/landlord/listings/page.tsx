"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPrice, formatDate } from "@/lib/utils";

type ManagedListing = {
  _id: string;
  title: string;
  status: "active" | "inactive" | "pending";
  price: number;
  bedrooms: number;
  bathrooms: number;
  views: number;
  photos: string[];
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  createdAt: number;
};
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  ToggleLeft,
  ToggleRight,
  Home,
  BedDouble,
  Bath,
  MapPin,
  Building2,
} from "lucide-react";

type StatusFilter = "all" | "active" | "inactive" | "pending";

function StatusBadge({ status }: { status: "active" | "inactive" | "pending" }) {
  const variants = {
    active: "success",
    inactive: "secondary",
    pending: "outline",
  } as const;
  return (
    <Badge variant={variants[status]} className="capitalize">
      {status}
    </Badge>
  );
}

export default function LandlordListingsPage() {
  const { userId } = useAuth();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<Id<"listings"> | null>(null);
  const [deleting, setDeleting] = useState(false);

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip"
  );

  const listings = useQuery(
    api.listings.getByLandlord,
    convexUser?._id ? { landlordId: convexUser._id } : "skip"
  ) as ManagedListing[] | undefined;

  const publishMutation = useMutation(api.listings.publish);
  const unpublishMutation = useMutation(api.listings.unpublish);
  const deleteMutation = useMutation(api.listings.deleteListing);

  const filtered =
    listings?.filter((l) =>
      statusFilter === "all" ? true : l.status === statusFilter
    ) ?? [];

  const handleToggle = async (id: Id<"listings">, status: string) => {
    try {
      if (status === "active") {
        await unpublishMutation({ id });
        toast.success("Listing set to inactive");
      } else {
        await publishMutation({ id });
        toast.success("Listing is now active");
      }
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMutation({ id: deleteTarget });
      toast.success("Listing deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete listing");
    } finally {
      setDeleting(false);
    }
  };

  const isLoading = convexUser === undefined || listings === undefined;

  const statusTabs: { label: string; value: StatusFilter; count?: number }[] = [
    { label: "All", value: "all", count: listings?.length },
    { label: "Active", value: "active", count: listings?.filter((l) => l.status === "active").length },
    { label: "Inactive", value: "inactive", count: listings?.filter((l) => l.status === "inactive").length },
    { label: "Pending", value: "pending", count: listings?.filter((l) => l.status === "pending").length },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Listings</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage and monitor all your property listings
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/landlord/listings/new">
            <Plus className="h-4 w-4 mr-2" />
            Add New Listing
          </Link>
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-xs text-slate-400">
                ({tab.count})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Listings */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-center gap-4">
                <Skeleton className="h-16 w-24 rounded-md shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-56" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3.5 w-64" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-slate-300 mb-4" />
            {statusFilter === "all" ? (
              <>
                <h3 className="text-base font-medium text-slate-900 mb-1">
                  No listings yet
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  Add your first listing to start attracting tenants.
                </p>
                <Button asChild>
                  <Link href="/dashboard/landlord/listings/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Listing
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-base font-medium text-slate-900 mb-1">
                  No {statusFilter} listings
                </h3>
                <p className="text-sm text-slate-500">
                  You don't have any {statusFilter} listings right now.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((listing) => {
            const photo = listing.photos[0];
            return (
              <Card key={listing._id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row items-start gap-0">
                    {/* Photo */}
                    <div className="h-32 sm:h-auto sm:w-32 w-full bg-slate-200 shrink-0 overflow-hidden">
                      {photo ? (
                        <img
                          src={photo}
                          alt={listing.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full min-h-[128px] flex items-center justify-center">
                          <Home className="h-8 w-8 text-slate-400" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-slate-900 truncate">
                            {listing.title}
                          </h3>
                          <StatusBadge status={listing.status} />
                        </div>
                        <div className="flex items-center gap-1 text-slate-500 text-sm mt-1">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>
                            {listing.city}, {listing.state} {listing.zip}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-500 mt-1 flex-wrap">
                          <span className="font-medium text-slate-700">
                            {formatPrice(listing.price)}/mo
                          </span>
                          <span className="flex items-center gap-1">
                            <BedDouble className="h-3.5 w-3.5" />
                            {listing.bedrooms} bd
                          </span>
                          <span className="flex items-center gap-1">
                            <Bath className="h-3.5 w-3.5" />
                            {listing.bathrooms} ba
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="h-3.5 w-3.5" />
                            {listing.views} views
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Created {formatDate(listing.createdAt)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/listings/${listing._id}`}>
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            View
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/landlord/listings/${listing._id}/edit`}>
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            handleToggle(listing._id as Id<"listings">, listing.status)
                          }
                          title={listing.status === "active" ? "Deactivate" : "Activate"}
                          className="text-slate-500"
                        >
                          {listing.status === "active" ? (
                            <ToggleRight className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="h-5 w-5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(listing._id as Id<"listings">)}
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          title="Delete listing"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Listing</DialogTitle>
          </DialogHeader>
          <p className="text-slate-600 text-sm">
            Are you sure you want to delete this listing? This action cannot be
            undone and will remove all saved entries associated with it.
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete Listing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
