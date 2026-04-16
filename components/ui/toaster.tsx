"use client";

import { Toaster as SonnerToaster } from "sonner";

// Re-export Sonner's Toaster with sensible FurnishFinder defaults.
// Mount this once in your root layout (already done in app/layout.tsx).
// Import it from here for consistency across the codebase.
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group font-sans text-sm rounded-lg border shadow-lg",
          title: "font-semibold",
          description: "text-muted-foreground",
          actionButton:
            "bg-[#0f2044] text-white hover:bg-[#1a3360] rounded-md px-3 py-1.5 text-xs font-medium",
          cancelButton:
            "bg-muted text-muted-foreground hover:bg-muted/80 rounded-md px-3 py-1.5 text-xs font-medium",
        },
      }}
    />
  );
}
