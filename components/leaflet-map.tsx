"use client";

import dynamic from "next/dynamic";
import type { MapListing } from "@/components/map-view";

const LeafletMapInner = dynamic(() => import("./leaflet-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-blue-50 animate-pulse rounded-xl" />
  ),
});

export default function LeafletMap(props: {
  listings: MapListing[];
  selectedId?: string | null;
  onSelectListing?: (id: string | null) => void;
}) {
  return <LeafletMapInner {...props} />;
}
