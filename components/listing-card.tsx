"use client";

import Link from "next/link";
import Image from "next/image";
import { MapPin, Bed, Bath, Calendar, PawPrint, Car } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatPrice, formatDate } from "@/lib/utils";

export interface ListingCardData {
  _id: string;
  title: string;
  city: string;
  state: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  photos: string[];
  petFriendly: boolean;
  parkingIncluded: boolean;
  utilitiesIncluded: boolean;
  availableFrom: number;
  minStay: number;
}

interface ListingCardProps {
  listing: ListingCardData;
  className?: string;
}

export function ListingCard({ listing, className }: ListingCardProps) {
  const firstPhoto = listing.photos?.[0];

  return (
    <Link
      href={`/listings/${listing._id}`}
      className={cn(
        "group flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5",
        className
      )}
    >
      {/* Photo */}
      <div className="relative aspect-[4/3] w-full bg-muted overflow-hidden">
        {firstPhoto ? (
          <Image
            src={firstPhoto}
            alt={listing.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-navy-100 to-navy-200 flex items-center justify-center">
            <span className="text-navy-500 text-4xl font-bold opacity-20">FF</span>
          </div>
        )}

        {/* Badges overlay */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="bg-white/90 text-foreground text-xs backdrop-blur-sm">
            {listing.propertyType}
          </Badge>
          {listing.utilitiesIncluded && (
            <Badge variant="success" className="text-xs backdrop-blur-sm">
              Utilities Incl.
            </Badge>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2 p-4 flex-1">
        {/* Location */}
        <div className="flex items-center gap-1 text-muted-foreground text-xs">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {listing.city}, {listing.state}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-foreground leading-snug line-clamp-2 text-sm group-hover:text-primary transition-colors">
          {listing.title}
        </h3>

        {/* Price */}
        <p className="text-[#0f2044] font-bold text-lg">
          {formatPrice(listing.price)}
          <span className="text-muted-foreground font-normal text-sm">/mo</span>
        </p>

        {/* Divider */}
        <div className="h-px bg-border" />

        {/* Key details */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Bed className="h-3.5 w-3.5" />
            {listing.bedrooms} {listing.bedrooms === 1 ? "bed" : "beds"}
          </span>
          <span className="flex items-center gap-1">
            <Bath className="h-3.5 w-3.5" />
            {listing.bathrooms} {listing.bathrooms === 1 ? "bath" : "baths"}
          </span>
          {listing.petFriendly && (
            <span className="flex items-center gap-1 text-emerald-600">
              <PawPrint className="h-3.5 w-3.5" />
              Pets OK
            </span>
          )}
          {listing.parkingIncluded && (
            <span className="flex items-center gap-1">
              <Car className="h-3.5 w-3.5" />
              Parking
            </span>
          )}
        </div>

        {/* Available from */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-auto pt-1">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span>
            Avail. {formatDate(listing.availableFrom)} &bull; {listing.minStay}+ mo
          </span>
        </div>
      </div>
    </Link>
  );
}
