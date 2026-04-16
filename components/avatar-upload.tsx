"use client";

import { PhotoUpload } from "@/components/photo-upload";
import { cn } from "@/lib/utils";

type Props = {
  currentUrl?: string;
  name: string;
  onUpload: (url: string) => void;
  size?: number;
};

export function AvatarUpload({ currentUrl, name, onUpload, size = 96 }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="relative inline-block">
      {/* Initials fallback — rendered underneath and visible when no photo */}
      {!currentUrl && (
        <div
          className="absolute inset-0 rounded-full flex items-center justify-center bg-[#0f2044] text-white font-semibold select-none pointer-events-none"
          style={{ fontSize: size * 0.35 }}
          aria-hidden="true"
        >
          {initial}
        </div>
      )}

      <PhotoUpload
        variant="avatar"
        currentUrl={currentUrl}
        onUpload={onUpload}
        label="Upload avatar"
        className={cn(
          // When there's no currentUrl, the PhotoUpload button sits on top of
          // the initials div. We set a transparent background so the initials
          // show through the empty state.
          !currentUrl && "[&>button]:bg-transparent [&>button]:border-transparent [&>button>div:first-child]:opacity-0"
        )}
      />
    </div>
  );
}
