"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const router = useRouter();
  const { userId, isLoaded } = useAuth();

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip"
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) {
      router.replace("/sign-in");
      return;
    }
    if (convexUser === undefined) return; // still loading

    if (convexUser === null) {
      // User not in Convex yet — default to tenant
      router.replace("/dashboard/tenant");
      return;
    }

    const role = convexUser.role;
    if (role === "admin") {
      router.replace("/dashboard/admin");
    } else if (role === "landlord") {
      router.replace("/dashboard/landlord");
    } else {
      router.replace("/dashboard/tenant");
    }
  }, [isLoaded, userId, convexUser, router]);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="space-y-4 w-64 text-center">
        <Skeleton className="h-6 w-40 mx-auto" />
        <Skeleton className="h-4 w-56 mx-auto" />
        <Skeleton className="h-4 w-48 mx-auto" />
        <p className="text-sm text-slate-500 mt-4">Redirecting to your dashboard…</p>
      </div>
    </div>
  );
}
