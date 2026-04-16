"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onChange?: (rating: number) => void;
  showNumeric?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

const TEXT_SIZE_MAP = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function StarRating({
  rating,
  max = 5,
  size = "md",
  interactive = false,
  onChange,
  showNumeric = true,
  className,
}: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const displayRating = hovered !== null ? hovered : rating;
  const iconSize = SIZE_MAP[size];

  if (interactive) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        {Array.from({ length: max }, (_, i) => {
          const starValue = i + 1;
          const filled = starValue <= displayRating;

          return (
            <button
              key={starValue}
              type="button"
              onMouseEnter={() => setHovered(starValue)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onChange?.(starValue)}
              className="transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              aria-label={`Rate ${starValue} out of ${max}`}
            >
              <Star
                className={cn(
                  iconSize,
                  "transition-colors",
                  filled
                    ? "fill-amber-400 text-amber-400"
                    : "fill-transparent text-muted-foreground/40 hover:text-amber-300"
                )}
              />
            </button>
          );
        })}

        {showNumeric && (
          <span className={cn("ml-1 font-medium text-foreground", TEXT_SIZE_MAP[size])}>
            {hovered !== null ? hovered : rating > 0 ? rating : ""}
          </span>
        )}
      </div>
    );
  }

  // Non-interactive: support half stars
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {Array.from({ length: max }, (_, i) => {
        const starValue = i + 1;
        const filled = rating >= starValue;
        const half = !filled && rating >= starValue - 0.5;

        return (
          <span key={starValue} className="relative inline-flex" aria-hidden="true">
            {/* Background empty star */}
            <Star className={cn(iconSize, "fill-transparent text-muted-foreground/30")} />
            {/* Filled overlay */}
            {(filled || half) && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: filled ? "100%" : "50%" }}
              >
                <Star className={cn(iconSize, "fill-amber-400 text-amber-400")} />
              </span>
            )}
          </span>
        );
      })}

      {showNumeric && rating > 0 && (
        <span className={cn("ml-1.5 font-semibold text-foreground", TEXT_SIZE_MAP[size])}>
          {rating % 1 === 0 ? rating.toFixed(1) : rating}
        </span>
      )}
    </div>
  );
}
