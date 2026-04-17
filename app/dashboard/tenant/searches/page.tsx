"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, Bell, BellOff, Trash2, ExternalLink, BookmarkX } from "lucide-react";

export default function SavedSearchesPage() {
  const { userId } = useAuth();

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip"
  );

  const searches = useQuery(
    api.savedSearches.getByUser,
    convexUser?._id ? { userId: convexUser._id } : "skip"
  );

  const toggleAlerts = useMutation(api.savedSearches.toggleEmailAlerts);
  const removeSearch = useMutation(api.savedSearches.remove);

  const handleToggle = async (id: Id<"savedSearches">, enabled: boolean) => {
    try {
      await toggleAlerts({ id, enabled });
      toast.success(enabled ? "Email alerts enabled" : "Email alerts disabled");
    } catch {
      toast.error("Failed to update alerts");
    }
  };

  const handleRemove = async (id: Id<"savedSearches">) => {
    try {
      await removeSearch({ id });
      toast.success("Search removed");
    } catch {
      toast.error("Failed to remove search");
    }
  };

  interface SearchFilters {
    city?: string;
    state?: string;
    maxPrice?: number;
    bedrooms?: number;
    propertyType?: string;
    petFriendly?: boolean;
  }

  const buildSearchUrl = (s: SearchFilters) => {
    const params = new URLSearchParams();
    if (s.city) params.set("city", s.city);
    if (s.state) params.set("state", s.state);
    if (s.maxPrice) params.set("maxPrice", String(s.maxPrice));
    if (s.bedrooms) params.set("bedrooms", String(s.bedrooms));
    if (s.propertyType) params.set("propertyType", s.propertyType);
    if (s.petFriendly) params.set("petFriendly", "true");
    return `/search?${params.toString()}`;
  };

  const isLoading = convexUser === undefined || searches === undefined;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Saved Searches</h1>
        <p className="text-slate-500 text-sm mt-1">
          Enable email alerts to get notified when new listings match your search.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : searches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <BookmarkX className="h-12 w-12 text-slate-300" />
            <h3 className="font-medium text-slate-900">No saved searches</h3>
            <p className="text-sm text-slate-500">
              Save a search from the listings page and you&apos;ll see it here.
            </p>
            <Button asChild className="mt-2">
              <Link href="/search">Browse Listings</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {searches.map((s) => {
            const filters: string[] = [];
            if (s.city) filters.push(s.city);
            if (s.state) filters.push(s.state);
            if (s.maxPrice) filters.push(`≤$${s.maxPrice.toLocaleString()}/mo`);
            if (s.bedrooms) filters.push(`${s.bedrooms}+ beds`);
            if (s.propertyType) filters.push(s.propertyType);
            if (s.petFriendly) filters.push("Pet friendly");

            return (
              <Card key={s._id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Search className="h-4 w-4 text-[#0f2044] shrink-0" />
                        <h3 className="font-semibold text-slate-900 truncate">
                          {s.name}
                        </h3>
                        {s.emailAlerts && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs gap-1">
                            <Bell className="h-3 w-3" />
                            Alerts on
                          </Badge>
                        )}
                      </div>
                      {filters.length > 0 && (
                        <p className="text-sm text-slate-500 truncate">
                          {filters.join(" · ")}
                        </p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        Saved {new Date(s.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button asChild variant="ghost" size="icon" title="Run this search">
                        <Link href={buildSearchUrl(s)}>
                          <ExternalLink className="h-4 w-4 text-slate-500" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(s._id as Id<"savedSearches">)}
                        className="text-red-400 hover:text-red-600 hover:bg-red-50"
                        title="Remove search"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Alert toggle */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      {s.emailAlerts ? (
                        <Bell className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <BellOff className="h-4 w-4 text-slate-400" />
                      )}
                      <span>
                        {s.emailAlerts
                          ? "Email me when new listings match"
                          : "Email alerts off"}
                      </span>
                    </div>
                    <Switch
                      checked={s.emailAlerts ?? false}
                      onCheckedChange={(enabled) =>
                        handleToggle(s._id as Id<"savedSearches">, enabled)
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
