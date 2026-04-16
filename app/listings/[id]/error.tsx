"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ListingError({ error, reset }: ErrorProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <TriangleAlert className="h-12 w-12 text-amber-500" aria-hidden="true" />
      <h1 className="mt-4 text-3xl font-semibold text-gray-900">
        This listing is unavailable
      </h1>
      <p className="mt-3 max-w-sm text-center text-gray-500">
        It may have been removed or is no longer active.
      </p>
      <div className="mt-8">
        <Button asChild className="bg-[#1B2A6B] hover:bg-[#15236a] text-white">
          <Link href="/search">Browse All Listings</Link>
        </Button>
      </div>
    </div>
  );
}
