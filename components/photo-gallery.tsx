"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PhotoGalleryProps {
  photos: string[];
  title: string;
  className?: string;
}

export function PhotoGallery({ photos, title, className }: PhotoGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const goNext = useCallback(() => {
    setLightboxIndex((i) => (i + 1) % photos.length);
  }, [photos.length]);

  const goPrev = useCallback(() => {
    setLightboxIndex((i) => (i - 1 + photos.length) % photos.length);
  }, [photos.length]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    },
    [closeLightbox, goNext, goPrev]
  );

  const hasPhotos = photos && photos.length > 0;
  const mainPhoto = hasPhotos ? photos[0] : null;
  const thumbPhotos = hasPhotos ? photos.slice(1, 5) : [];
  const totalPhotos = photos?.length ?? 0;

  if (!hasPhotos) {
    return (
      <div
        className={cn(
          "w-full h-[420px] rounded-xl overflow-hidden bg-gradient-to-br from-navy-100 to-navy-200 flex items-center justify-center",
          className
        )}
      >
        <div className="text-center text-navy-500 opacity-40">
          <Images className="h-16 w-16 mx-auto mb-2" />
          <p className="text-sm font-medium">No photos available</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Gallery grid */}
      <div className={cn("relative w-full", className)}>
        <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[420px] rounded-xl overflow-hidden">
          {/* Main large photo */}
          <button
            className="col-span-2 row-span-2 relative group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => openLightbox(0)}
            aria-label={`View photo 1 of ${totalPhotos}`}
          >
            <Image
              src={mainPhoto!}
              alt={`${title} – main photo`}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              priority
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </button>

          {/* Thumbnails — up to 4 */}
          {thumbPhotos.map((photo, i) => {
            const photoIndex = i + 1;
            const isLast = i === 3;
            const hiddenCount = totalPhotos - 5;

            return (
              <button
                key={photo}
                className="relative group cursor-pointer overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => openLightbox(photoIndex)}
                aria-label={`View photo ${photoIndex + 1} of ${totalPhotos}`}
              >
                <Image
                  src={photo}
                  alt={`${title} – photo ${photoIndex + 1}`}
                  fill
                  sizes="25vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {/* Overlay on last thumb when there are more photos */}
                {isLast && hiddenCount > 0 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white font-semibold text-lg">+{hiddenCount}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </button>
            );
          })}

          {/* Fill empty slots with placeholder when fewer than 4 thumbnails */}
          {thumbPhotos.length < 4 &&
            Array.from({ length: 4 - thumbPhotos.length }).map((_, i) => (
              <div
                key={`placeholder-${i}`}
                className="relative bg-gradient-to-br from-muted to-muted/50"
              />
            ))}
        </div>

        {/* View all button */}
        {totalPhotos > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => openLightbox(0)}
            className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm border-white/60 hover:bg-white gap-1.5 shadow-md"
          >
            <Images className="h-4 w-4" />
            View all {totalPhotos} photos
          </Button>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Photo lightbox"
          onKeyDown={handleKeyDown}
          tabIndex={-1}
        >
          {/* Close */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10 rounded-full p-2 hover:bg-white/10 transition-colors"
            aria-label="Close lightbox"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm tabular-nums">
            {lightboxIndex + 1} / {totalPhotos}
          </div>

          {/* Prev */}
          {totalPhotos > 1 && (
            <button
              onClick={goPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white z-10 rounded-full p-3 hover:bg-white/10 transition-colors"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
          )}

          {/* Image */}
          <div className="relative w-full max-w-5xl max-h-[85vh] mx-16 aspect-video">
            <Image
              src={photos[lightboxIndex]}
              alt={`${title} – photo ${lightboxIndex + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
              priority
            />
          </div>

          {/* Next */}
          {totalPhotos > 1 && (
            <button
              onClick={goNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white z-10 rounded-full p-3 hover:bg-white/10 transition-colors"
              aria-label="Next photo"
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          )}

          {/* Thumbnail strip */}
          {totalPhotos > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 max-w-full overflow-x-auto px-4">
              {photos.map((photo, i) => (
                <button
                  key={photo}
                  onClick={() => setLightboxIndex(i)}
                  className={cn(
                    "relative h-12 w-16 shrink-0 rounded overflow-hidden border-2 transition-all",
                    i === lightboxIndex
                      ? "border-white opacity-100"
                      : "border-transparent opacity-50 hover:opacity-80"
                  )}
                  aria-label={`Go to photo ${i + 1}`}
                >
                  <Image
                    src={photo}
                    alt={`Thumbnail ${i + 1}`}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
