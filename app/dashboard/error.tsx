"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: ErrorProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <TriangleAlert className="h-12 w-12 text-amber-500" aria-hidden="true" />
      <h1 className="mt-4 text-3xl font-semibold text-gray-900">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-sm text-center text-gray-500">
        {error.message || "An unexpected error occurred"}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button
          onClick={reset}
          className="bg-[#1B2A6B] hover:bg-[#15236a] text-white"
        >
          Try Again
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/search">Browse Listings</Link>
        </Button>
      </div>
    </div>
  );
}
