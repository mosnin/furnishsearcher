"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function SearchError({ reset }: { reset: () => void }) {
  return (
    <div className="max-w-xl mx-auto p-8 space-y-4">
      <h1 className="text-xl font-semibold">
        Search is temporarily unavailable
      </h1>
      <p>Please retry or clear your search criteria.</p>
      <div className="flex gap-4">
        <Button onClick={reset}>Retry</Button>
        <Link href="/search" className="underline">
          Clear search
        </Link>
      </div>
    </div>
  );
}
