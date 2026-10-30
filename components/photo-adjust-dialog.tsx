"use client";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function PhotoAdjustDialog({
  url,
  onClose,
  onSave,
  description,
  saveLabel = "Apply changes",
}: {
  description?: string;
  saveLabel?: string;
  url: string;
  onClose: () => void;
  onSave: (file: File) => Promise<void>;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  });
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setFailed(true);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  useEffect(() => {
    if (!image || !canvas.current) return;
    try {
      const scale = Math.min(
        1,
        4096 / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const width = Math.round(image.naturalWidth * scale),
        height = Math.round(image.naturalHeight * scale);
      const rotated = document.createElement("canvas");
      rotated.width = rotation % 2 ? height : width;
      rotated.height = rotation % 2 ? width : height;
      const context = rotated.getContext("2d");
      if (!context) return;
      context.fillStyle = "white";
      context.fillRect(0, 0, rotated.width, rotated.height);
      context.translate(rotated.width / 2, rotated.height / 2);
      context.rotate((rotation * Math.PI) / 2);
      context.drawImage(image, -width / 2, -height / 2, width, height);
      const target = canvas.current;
      target.width = Math.max(
        1,
        Math.round((rotated.width * crop.width) / 100),
      );
      target.height = Math.max(
        1,
        Math.round((rotated.height * crop.height) / 100),
      );
      const targetContext = target.getContext("2d");
      targetContext?.drawImage(
        rotated,
        (rotated.width * crop.left) / 100,
        (rotated.height * crop.top) / 100,
        target.width,
        target.height,
        0,
        0,
        target.width,
        target.height,
      );
    } catch {
      setFailed(true);
    }
  }, [image, rotation, crop]);
  async function save() {
    if (!canvas.current || !image) return;
    setBusy(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.current!.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Could not create the edited photo.")),
          "image/jpeg",
          0.92,
        ),
      );
      await onSave(
        new File([blob], "edited-photo.jpg", { type: "image/jpeg" }),
      );
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save your photo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Crop & rotate photo</DialogTitle>
          <DialogDescription>
            {description ??
              "Preview your changes below. Applying creates a new photo; the original stays in your listing until you save the listing. Edited photos are saved as JPEG, up to 4096 pixels on the longest side."}
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <p role="alert" className="text-sm text-red-700">
            This photo cannot be edited here. Upload the original JPEG, PNG or
            WebP file to replace it.
          </p>
        ) : (
          <>
            {!image && <p role="status">Loading photo…</p>}
            <canvas
              ref={canvas}
              className="max-h-72 w-full object-contain rounded-lg bg-slate-100"
              aria-label="Edited photo preview"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!image || busy}
              onClick={() => {
                setRotation((r) => (r + 1) % 4);
                setCrop({ left: 0, top: 0, width: 100, height: 100 });
              }}
            >
              Rotate clockwise 90°
            </Button>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["left", "top", "width", "height"] as const).map((key) => (
                <div key={key}>
                  <Label htmlFor={`crop-${key}`}>
                    {key === "left"
                      ? "Crop left"
                      : key === "top"
                        ? "Crop top"
                        : key === "width"
                          ? "Width"
                          : "Height"}
                    : {crop[key]}%
                  </Label>
                  <input
                    id={`crop-${key}`}
                    aria-label={`Crop ${key}`}
                    type="range"
                    className="w-full"
                    disabled={!image || busy}
                    min={key === "width" || key === "height" ? 10 : 0}
                    max={
                      key === "left"
                        ? 100 - crop.width
                        : key === "top"
                          ? 100 - crop.height
                          : key === "width"
                            ? 100 - crop.left
                            : 100 - crop.top
                    }
                    value={crop[key]}
                    onChange={(e) =>
                      setCrop((prev) => ({
                        ...prev,
                        [key]: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setRotation(0);
                setCrop({ left: 0, top: 0, width: 100, height: 100 });
              }}
            >
              Reset adjustments
            </Button>
          </>
        )}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!image || failed || busy}
            onClick={save}
          >
            {busy ? "Saving photo…" : saveLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
