"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { cn, formatPrice, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ExternalLink, Trash2, CheckCircle2 } from "lucide-react";

type StatusFilter = "all" | "active" | "pending" | "inactive";

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-emerald-100 text-emerald-700"
      : status === "pending"
      ? "bg-amber-100 text-amber-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        cls
      )}
    >
      {status}
    </span>
  );
}

export default function AdminListingsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<Id<"listings"> | null>(null);
  const [deleting, setDeleting] = useState(false);

  const listings = useQuery(api.listings.getAll) as Doc<"listings">[] | undefined;
  const deleteListing = useMutation(api.listings.deleteListing);
  const publishListing = useMutation(api.listings.publish);

  const filtered =
    listings?.filter((l) =>
      statusFilter === "all" ? true : l.status === statusFilter
    ) ?? [];

  const statusTabs: { label: string; value: StatusFilter }[] = [
    { label: "All", value: "all" },
    { label: "Active", value: "active" },
    { label: "Pending", value: "pending" },
    { label: "Inactive", value: "inactive" },
  ];

  const handleApprove = async (id: Id<"listings">) => {
    try {
      await publishListing({ id });
      toast.success("Listing approved and set to active");
    } catch {
      toast.error("Failed to approve listing");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteListing({ id: deleteTarget });
      toast.success("Listing deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete listing");
    } finally {
      setDeleting(false);
    }
  };

  const isLoading = listings === undefined;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">All Listings</h1>
        <p className="text-slate-500 text-sm mt-1">
          Manage every listing on the platform
        </p>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit flex-wrap">
        {statusTabs.map((tab) => {
          const count =
            tab.value === "all"
              ? listings?.length
              : listings?.filter((l) => l.status === tab.value).length;
          return (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                statusFilter === tab.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              {tab.label}
              {count !== undefined && (
                <span className="ml-1.5 text-xs text-slate-400">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <p className="text-slate-500 text-sm">No listings found</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Title</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wide">City / State</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Price</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Views</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Created</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wide text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((listing) => (
                <TableRow key={listing._id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium text-slate-900 max-w-[200px] truncate">
                    {listing.title}
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm">
                    {listing.city}, {listing.state}
                  </TableCell>
                  <TableCell className="text-slate-700 text-sm font-medium">
                    {formatPrice(listing.price)}/mo
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={listing.status} />
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm">
                    {listing.views.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {formatDate(listing.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-slate-700"
                        title="View listing"
                      >
                        <Link href={`/listings/${listing._id}`} target="_blank">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      {listing.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => handleApprove(listing._id as Id<"listings">)}
                          title="Approve listing"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteTarget(listing._id as Id<"listings">)}
                        title="Delete listing"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Listing</DialogTitle>
          </DialogHeader>
          <p className="text-slate-600 text-sm">
            Are you sure you want to permanently delete this listing? This cannot be
            undone.
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
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
