"use client";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { Button } from "./ui/button";
export function PropertyUnits({
  propertyGroupId,
  currentId,
}: {
  propertyGroupId: Id<"properties">;
  currentId: Id<"listings">;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.units.publicUnits,
    { propertyGroupId },
    { initialNumItems: 5 },
  );
  const others = results.filter((l) => l._id !== currentId);
  return (
    <section className="border rounded-xl p-5 space-y-3 my-5">
      <h2 className="font-semibold text-lg">Rental spaces at this property</h2>
      <p className="text-sm text-slate-600">
        Each space has its own availability and rent. Check dates on the space
        you want to rent.
      </p>
      {others.map((l) => (
        <Link
          className="block underline"
          key={l._id}
          href={`/listings/${l._id}`}
        >
          {l.unitName ?? l.title} · ${l.price}/month · {l.bedrooms} bedrooms
        </Link>
      ))}
      {!others.length && status === "Exhausted" && (
        <p className="text-sm">
          No other published spaces are currently shown.
        </p>
      )}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(5)}>
          More spaces
        </Button>
      )}
      <Link
        className="block text-sm underline"
        href={`/search?propertyGroupId=${propertyGroupId}`}
      >
        Search this property with dates and filters
      </Link>
    </section>
  );
}
