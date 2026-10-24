"use client";
import { PhotoUpload } from "@/components/photo-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PhotoDraft } from "@/lib/photos";
import { MAX_PHOTOS } from "@/lib/photos";
import { useId, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { uploadPhotoFile } from "@/lib/upload-photo";
import { PhotoAdjustDialog } from "@/components/photo-adjust-dialog";

export function ListingPhotoEditor({
  photos,
  onChange,
  busy,
  onBusyChange,
}: {
  photos: PhotoDraft[];
  onChange: (photos: PhotoDraft[]) => void;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const prefix = useId();
  const [editing, setEditing] = useState<number | null>(null);
  const { getToken } = useAuth();
  function move(index: number, to: number) {
    const next = [...photos];
    const [photo] = next.splice(index, 1);
    next.splice(to, 0, photo);
    onChange(next);
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Up to 30 JPEG, PNG or WebP photos, each smaller than 20 MB. The first
        photo is the cover. Use clear photos that accurately show this property;
        recommended size is at least 1024 × 683 pixels.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {photos.map((photo, index) => (
          <div
            key={photo.storageId ?? photo.url}
            className="space-y-3 rounded-xl border border-slate-200 p-3"
          >
            <p className="text-sm font-medium">
              {index === 0 ? "Cover photo" : `Photo ${index + 1}`}
            </p>
            <PhotoUpload
              disabled={busy}
              currentUrl={photo.url}
              maxSizeMB={20}
              label={`Replace photo ${index + 1}`}
              onBusyChange={onBusyChange}
              onUpload={(url, storageId) =>
                onChange(
                  url
                    ? photos.map((p, i) =>
                        i === index
                          ? { url, storageId, caption: p.caption }
                          : p,
                      )
                    : photos.filter((_, i) => i !== index),
                )
              }
            />
            <div>
              <Label htmlFor={`${prefix}-caption-${index}`}>
                Caption for photo {index + 1}
              </Label>
              <Input
                id={`${prefix}-caption-${index}`}
                maxLength={240}
                value={photo.caption}
                disabled={busy}
                onChange={(e) =>
                  onChange(
                    photos.map((p, i) =>
                      i === index ? { ...p, caption: e.target.value } : p,
                    ),
                  )
                }
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setEditing(index)}
              >
                Crop or rotate photo {index + 1}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || index === 0}
                onClick={() => move(index, 0)}
              >
                Make cover
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`Move photo ${index + 1} earlier`}
                disabled={busy || index === 0}
                onClick={() => move(index, index - 1)}
              >
                Move earlier
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`Move photo ${index + 1} later`}
                disabled={busy || index === photos.length - 1}
                onClick={() => move(index, index + 1)}
              >
                Move later
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onChange(photos.filter((_, i) => i !== index))}
              >
                Remove photo {index + 1}
              </Button>
            </div>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <div className="rounded-xl border border-slate-200 p-3">
            <PhotoUpload
              disabled={busy}
              maxSizeMB={20}
              label={`Add photo ${photos.length + 1}`}
              onBusyChange={onBusyChange}
              onUpload={(url, storageId) => {
                if (url) onChange([...photos, { url, storageId, caption: "" }]);
              }}
            />
          </div>
        )}
      </div>
      {editing !== null && photos[editing] && (
        <PhotoAdjustDialog
          url={photos[editing].url}
          onClose={() => setEditing(null)}
          onSave={async (file) => {
            onBusyChange(true);
            try {
              const token = await getToken({ template: "convex" });
              const uploaded = await uploadPhotoFile(file, token);
              onChange(
                photos.map((photo, index) =>
                  index === editing
                    ? { ...uploaded, caption: photo.caption }
                    : photo,
                ),
              );
            } finally {
              onBusyChange(false);
            }
          }}
        />
      )}
      <p className="text-xs text-slate-500" role="status">
        {busy
          ? "Uploading photo. Wait before saving."
          : `${photos.length} of ${MAX_PHOTOS} photos. Save your listing to keep photo order, captions and removals.`}
      </p>
    </div>
  );
}
