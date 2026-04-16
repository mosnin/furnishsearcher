"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SaveSearchButtonProps {
  location?: string;
  city?: string;
  state?: string;
  maxPrice?: number;
  bedrooms?: number;
  propertyType?: string;
  petFriendly?: boolean;
}

export default function SaveSearchButton({
  location,
  city,
  state,
  maxPrice,
  bedrooms,
  propertyType,
  petFriendly,
}: SaveSearchButtonProps) {
  const router = useRouter();
  const { isSignedIn, userId } = useAuth();
  const { user } = useUser();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [searchName, setSearchName] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const convexUser = useQuery(
    api.users.getByClerkId,
    isSignedIn && userId ? { clerkId: userId } : "skip"
  );

  const saveSearch = useMutation(api.savedSearches.save);

  const defaultName = React.useMemo(() => {
    if (city && state) return `${city}, ${state}`;
    if (city) return city;
    if (location) return location;
    return "My Search";
  }, [city, state, location]);

  const handleClick = () => {
    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }
    setSearchName(defaultName);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!convexUser?._id) {
      toast.error("Could not find your account. Please try again.");
      return;
    }

    const trimmedName = searchName.trim();
    if (!trimmedName) {
      toast.error("Please enter a name for this search.");
      return;
    }

    setIsSaving(true);
    try {
      await saveSearch({
        userId: convexUser._id,
        name: trimmedName,
        location,
        city,
        state,
        maxPrice,
        bedrooms,
        propertyType,
        petFriendly,
      });
      setDialogOpen(false);
      toast.success(`Search "${trimmedName}" saved!`);
    } catch (err) {
      console.error("Failed to save search:", err);
      toast.error("Failed to save search. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        className="flex items-center gap-2"
      >
        <Bookmark className="h-4 w-4" />
        Save Search
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save This Search</DialogTitle>
            <DialogDescription>
              Give this search a name so you can find it later in your dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="search-name">Search name</Label>
            <Input
              id="search-name"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Austin 2BR under $2k"
              autoFocus
              disabled={isSaving}
            />
          </div>

          {/* Criteria preview */}
          {(city || state || maxPrice || bedrooms || propertyType || petFriendly !== undefined) && (
            <div className="flex flex-wrap gap-1.5 pb-1">
              {(city || state) && (
                <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-1 font-medium">
                  {[city, state].filter(Boolean).join(", ")}
                </span>
              )}
              {maxPrice && (
                <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-1 font-medium">
                  Under ${maxPrice.toLocaleString()}/mo
                </span>
              )}
              {bedrooms && (
                <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-1 font-medium">
                  {bedrooms}+ beds
                </span>
              )}
              {propertyType && (
                <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-1 font-medium">
                  {propertyType}
                </span>
              )}
              {petFriendly && (
                <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-1 font-medium">
                  Pet friendly
                </span>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !searchName.trim()}
              className="bg-[#0f2044] hover:bg-[#1a3360] text-white"
            >
              {isSaving ? "Saving…" : "Save Search"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
