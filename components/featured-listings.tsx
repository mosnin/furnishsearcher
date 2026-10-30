"use client";
import { useRef } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ListingCard } from "@/components/listing-card";
import { ActionLink, Empty } from "@/components/ui-system/primitives";
export default function FeaturedListings() {
  const strip = useRef<HTMLDivElement>(null);
  const { results: listings, status } = usePaginatedQuery(api.search.listings, {sort:"newest"}, {initialNumItems: 36});
  return (
    <section className="w-property-showcase">
      <header className="w-showcase-header"><h2>Find your next monthly stay</h2><div><button className="w-icon-button" aria-label="Previous properties" onClick={()=>strip.current?.scrollBy({left:-strip.current.clientWidth,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}><CaretLeft size={19}/></button><button className="w-icon-button" aria-label="Next properties" onClick={()=>strip.current?.scrollBy({left:strip.current.clientWidth,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}><CaretRight size={19}/></button></div></header>
      {status === "LoadingFirstPage" ? (
        <div className="w-property-strip" ref={strip}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="public-rental-card">
              <div className="public-rental-image animate-pulse" />
              <div className="public-rental-body">
                <p>Loading rental…</p>
              </div>
            </div>
          ))}
        </div>
      ) : !listings.length ? (
        <div className="ds-panel">
          <Empty
            title="No rentals in this showcase"
            action={<ActionLink href="/search">Search all rentals</ActionLink>}
          >
            Explore the full search for your location and dates, or list your
            furnished property.
          </Empty>
        </div>
      ) : (
        <div className="w-property-strip" ref={strip}>
          {listings.map((listing) => (
            <ListingCard key={listing._id} listing={listing} />
          ))}
        </div>
      )}
    </section>
  );
}
