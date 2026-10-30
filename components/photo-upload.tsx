"use client";

import { useRef, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import type { Id } from "@/convex/_generated/dataModel";
import { PHOTO_TYPES } from "@/lib/photos";
import { uploadPhotoFile } from "@/lib/upload-photo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Camera, Upload, ImageIcon, X, Loader2 } from "lucide-react";

type Variant = "avatar" | "cover" | "listing";

type Props = {
  onUpload: (url: string, storageId?: Id<"_storage">) => void;
  onBusyChange?: (busy: boolean) => void;
  currentUrl?: string;
  label?: string;
  accept?: string;
  maxSizeMB?: number;
  className?: string;
  variant?: Variant;
  disabled?: boolean;
};

export function PhotoUpload({
  onUpload,
  onBusyChange,
  currentUrl,
  label,
  accept = "image/jpeg,image/png,image/webp",
  maxSizeMB = 5,
  className,
  variant = "listing",
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [uploading, setUploading] = useState(false);

  const { getToken } = useAuth();
  useEffect(() => {
    if (!uploading) setPreview(currentUrl ?? null);
  }, [currentUrl, uploading]);

  function openPicker() {
    if (!uploading) inputRef.current?.click();
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    setPreview(null);
    onUpload("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxBytes = maxSizeMB * 1024 * 1024;
    if (!PHOTO_TYPES.includes(file.type)) {
      toast.error("Use JPEG, PNG or WebP photos.");
      e.target.value = "";
      return;
    }
    if (file.size >= maxBytes) {
      toast.error(`File is too large. Maximum size is ${maxSizeMB} MB.`);
      e.target.value = "";
      return;
    }

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setUploading(true);
    onBusyChange?.(true);

    try {
      const token = await getToken({ template: "convex" });
      const { url, storageId } = await uploadPhotoFile(file, token);

      // 4. Notify parent and replace local blob URL with permanent one
      setPreview(url);
      onUpload(url, storageId);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to upload photo. Please try again.",
      );
      setPreview(currentUrl ?? null);
    } finally {
      setUploading(false);
      onBusyChange?.(false);
      URL.revokeObjectURL(localUrl);
      // Reset so same file can be re-selected if needed
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (variant === "avatar") {
    return (
      <div className={cn("relative inline-block", className)}>
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={openPicker}
          aria-label={label ?? "Upload avatar"}
          className="relative h-24 w-24 rounded-full overflow-hidden border-2 border-dashed border-slate-300 bg-slate-100 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors group"
        >
          {preview ? (
            <img
              src={preview}
              alt="Avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full w-full">
              <Camera className="h-6 w-6 text-slate-400" />
            </div>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
            <Camera className="h-5 w-5 text-white" />
          </div>

          {/* Upload spinner */}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            </div>
          )}
        </button>

        {preview && !uploading && (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={handleRemove}
            aria-label="Remove photo"
            className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow"
          >
            <X className="h-3 w-3" />
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          tabIndex={-1}
          disabled={disabled || uploading}
          accept={accept}
          className="sr-only"
          onChange={handleChange}
          aria-hidden="true"
        />
      </div>
    );
  }

  if (variant === "cover") {
    return (
      <div className={cn("relative w-full", className)}>
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={openPicker}
          aria-label={label ?? "Upload cover photo"}
          className="relative w-full h-48 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors overflow-hidden group"
        >
          {preview ? (
            <img
              src={preview}
              alt="Cover"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <Upload className="h-8 w-8 text-slate-400" />
              <span className="text-sm text-slate-500">
                {label ?? "Click to upload cover photo"}
              </span>
            </div>
          )}

          {/* Hover overlay when image is set */}
          {preview && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <Upload className="h-7 w-7 text-white" />
              <span className="text-sm text-white font-medium">
                Change photo
              </span>
            </div>
          )}

          {/* Upload spinner */}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-8 w-8 text-white animate-spin" />
            </div>
          )}
        </button>

        {preview && !uploading && (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={handleRemove}
            aria-label="Remove cover photo"
            className="absolute top-2 right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          tabIndex={-1}
          disabled={disabled || uploading}
          accept={accept}
          className="sr-only"
          onChange={handleChange}
          aria-hidden="true"
        />
      </div>
    );
  }

  // variant === "listing" (default)
  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={openPicker}
        aria-label={label ?? "Upload listing photo"}
        className="relative w-full aspect-square rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors overflow-hidden group"
      >
        {preview ? (
          <img
            src={preview}
            alt="Listing photo"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-1.5 p-2">
            <ImageIcon className="h-6 w-6 text-slate-400" />
            <span className="text-xs text-slate-400 text-center leading-tight">
              {label ?? "Upload photo"}
            </span>
          </div>
        )}

        {/* Hover overlay when image is set */}
        {preview && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <Upload className="h-5 w-5 text-white" />
            <span className="text-xs text-white font-medium">Replace</span>
          </div>
        )}

        {/* Upload spinner */}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
        )}
      </button>

      {preview && !uploading && (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={handleRemove}
          aria-label="Remove photo"
          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow z-10"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        tabIndex={-1}
        disabled={disabled || uploading}
        accept={accept}
        className="sr-only"
        onChange={handleChange}
        aria-hidden="true"
      />
    </div>
  );
}
