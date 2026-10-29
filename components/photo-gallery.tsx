"use client";
import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Modal, Button } from "@/components/ui-system/primitives";
import { cn } from "@/lib/utils";
interface PhotoGalleryProps {
  photos: string[];
  captions?: string[];
  title: string;
  className?: string;
}
export function PhotoGallery({
  photos,
  captions = [],
  title,
  className,
}: PhotoGalleryProps) {
  const [open, setOpen] = useState(false),
    [index, setIndex] = useState(0);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => setIndex(0), [photos.length]);
  const show = (i: number, e: React.MouseEvent<HTMLButtonElement>) => {
    opener.current = e.currentTarget;
    setIndex(i);
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setIndex(
          (i) =>
            (i + (event.key === "ArrowRight" ? 1 : -1) + photos.length) %
            photos.length,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length]);
  const move = (amount: number) =>
    setIndex((i) => (i + amount + photos.length) % photos.length);
  if (!photos.length)
    return (
      <div className={cn("public-gallery-empty", className)}>
        No property photos have been added.
      </div>
    );
  return (
    <>
      <div
        className={cn("public-gallery", className)}
        data-count={photos.length}
        id="photos"
      >
        {photos.slice(0, 5).map((photo, i) => (
          <button
            key={`${photo}-${i}`}
            aria-label={`Open photo ${i + 1} of ${photos.length}: ${captions[i] || title}`}
            onClick={(e) => show(i, e)}
          >
            <img src={photo} alt={captions[i] || `${title}, photo ${i + 1}`} />
          </button>
        ))}
        <Button
          variant="secondary"
          className="public-gallery-all"
          onClick={(e) => show(0, e)}
        >
          Show all photos
        </Button>
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`${title} · ${index + 1} of ${photos.length}`}
        className="public-photo-dialog"
        finalFocus={opener}
      >
        <figure
          className="public-gallery-stage"
          tabIndex={0}
          aria-label="Property photo viewer"
        >
          <img
            src={photos[index]}
            alt={captions[index] || `${title}, photo ${index + 1}`}
          />
          {captions[index] && <figcaption>{captions[index]}</figcaption>}
        </figure>
        <div className="public-gallery-controls">
          <Button
            variant="secondary"
            disabled={photos.length < 2}
            onClick={() => move(-1)}
            aria-label="Previous photo"
          >
            <CaretLeft size={15} />
          </Button>
          <span>
            {index + 1} / {photos.length}
          </span>
          <Button
            variant="secondary"
            disabled={photos.length < 2}
            onClick={() => move(1)}
            aria-label="Next photo"
          >
            <CaretRight size={15} />
          </Button>
        </div>
      </Modal>
    </>
  );
}
