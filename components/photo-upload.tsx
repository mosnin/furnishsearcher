"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Camera, Upload, ImageIcon, X, Loader2 } from "lucide-react";

type Variant = "avatar" | "cover" | "listing";

type Props = {
  onUpload: (url: string) => void;
  currentUrl?: string;
  label?: string;
  accept?: string;
  maxSizeMB?: number;
  className?: string;
  variant?: Variant;
};

export function PhotoUpload({
  onUpload,
  currentUrl,
  label,
  accept = "image/*",
  maxSizeMB = 5,
  className,
  variant = "listing",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [uploading, setUploading] = useState(false);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const getUrl = useMutation(api.files.getUrl);

  function openPicker() {
    inputRef.current?.click();
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
    if (file.size > maxBytes) {
      toast.error(`File is too large. Maximum size is ${maxSizeMB} MB.`);
      e.target.value = "";
      return;
    }

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setUploading(true);

    try {
      // 1. Get upload URL from Convex
      const uploadUrl = await generateUploadUrl();

      // 2. POST file to that URL
      const result = await fetch(uploadUrl, {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!result.ok) {
        throw new Error(`Upload failed with status ${result.status}`);
      }

      const { storageId } = await result.json();

      // 3. Get the public URL
      const url = await getUrl({ storageId });

      if (!url) {
        throw new Error("Could not retrieve file URL after upload.");
      }

      // 4. Notify parent and replace local blob URL with permanent one
      setPreview(url);
      onUpload(url);
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload photo. Please try again.");
      setPreview(currentUrl ?? null);
    } finally {
      setUploading(false);
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
          onClick={openPicker}
          aria-label={label ?? "Upload avatar"}
          className="relative h-24 w-24 rounded-full overflow-hidden border-2 border-dashed border-slate-300 bg-slate-100 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f2044] transition-colors group"
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
          onClick={openPicker}
          aria-label={label ?? "Upload cover photo"}
          className="relative w-full h-48 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f2044] transition-colors overflow-hidden group"
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
              <span className="text-sm text-white font-medium">Change photo</span>
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
        onClick={openPicker}
        aria-label={label ?? "Upload listing photo"}
        className="relative w-full aspect-square rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f2044] transition-colors overflow-hidden group"
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
        accept={accept}
        className="sr-only"
        onChange={handleChange}
        aria-hidden="true"
      />
    </div>
  );
}
