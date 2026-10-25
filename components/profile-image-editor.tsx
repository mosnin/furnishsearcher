"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { PHOTO_TYPES, convexSiteUrl } from "@/lib/photos";
import { PhotoAdjustDialog } from "./photo-adjust-dialog";
import { Button } from "./ui/button";

export function ProfileImageEditor({ kind }: { kind: "profile" | "pet" }) {
  const { isAuthenticated } = useConvexAuth(),
    { getToken } = useAuth();
  const images = useQuery(
    api.profileImages.mine,
    isAuthenticated ? {} : "skip",
  );
  const remove = useMutation(api.profileImages.remove),
    input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<{
      url: string;
      revision: number;
      local: boolean;
    } | null>(null);
  const retry = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const current = images?.[kind],
    label = kind === "profile" ? "Profile photo" : "Pet photo";
  useEffect(
    () => () => {
      if (editing?.local) URL.revokeObjectURL(editing.url);
    },
    [editing],
  );
  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !current) return;
    if (!PHOTO_TYPES.includes(file.type) || file.size >= 5 * 1024 * 1024) {
      toast.error("Choose a JPEG, PNG or WebP photo smaller than 5 MB.");
      return;
    }
    retry.current = null;
    setEditing({
      url: URL.createObjectURL(file),
      local: true,
      revision: current.revision,
    });
  }
  async function save(file: File) {
    if (!editing) throw new Error("Choose a photo first.");
    if (file.size >= 5 * 1024 * 1024)
      throw new Error(
        "The edited photo must be smaller than 5 MB. Crop a smaller area or choose another image.",
      );
    setBusy(true);
    try {
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      const fingerprint = `${editing.revision}:${digest}`;
      if (retry.current?.fingerprint !== fingerprint)
        retry.current = { fingerprint, requestId: crypto.randomUUID() };
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("Sign in to save a photo.");
      const site = convexSiteUrl(
        process.env.NEXT_PUBLIC_CONVEX_URL!,
        process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
      );
      const params = new URLSearchParams({
        kind,
        revision: String(editing.revision),
        requestId: retry.current.requestId,
      });
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(
          `${site}/profile-images/upload?${params}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": file.type,
            },
            body: file,
            signal: controller.signal,
          },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Could not save the photo.");
        if (
          !Number.isSafeInteger(result.revision) ||
          typeof result.applied !== "boolean"
        )
          throw new Error(
            "Could not confirm the photo was saved. Refresh or retry.",
          );
        if (result.applied) toast.success(`${label} saved.`);
        else
          toast.info(
            "A newer photo is current. This earlier upload did not replace it.",
          );
      } finally {
        clearTimeout(timer);
      }
    } finally {
      setBusy(false);
    }
  }
  async function removePhoto() {
    if (!current) return;
    setBusy(true);
    try {
      await remove({ kind, expectedRevision: current.revision });
      toast.success(`${label} removed.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove the photo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2" aria-busy={busy}>
      <div
        className={
          kind === "profile"
            ? "h-24 w-24 overflow-hidden rounded-full border-2 border-dashed border-gray-400 bg-white"
            : "h-40 w-full overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-gray-50"
        }
      >
        {current?.url ? (
          <img
            src={current.url}
            alt={label}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center">
            <Camera aria-hidden="true" className="h-6 w-6 text-gray-400" />
            <span className="sr-only">No {label.toLowerCase()}</span>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!current || busy || !!editing}
          onClick={() => input.current?.click()}
        >
          {current?.url
            ? `Replace ${label.toLowerCase()}`
            : `Upload ${label.toLowerCase()}`}
        </Button>
        {current?.url && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !!editing}
              onClick={() => {
                retry.current = null;
                setEditing({
                  url: current.url!,
                  revision: current.revision,
                  local: false,
                });
              }}
            >
              Crop or rotate
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy || !!editing}
              onClick={removePhoto}
            >
              Remove
            </Button>
          </>
        )}
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        ref={input}
        onChange={choose}
        className="sr-only"
        tabIndex={-1}
        disabled={!current || busy}
        aria-label={`Choose ${label.toLowerCase()}`}
      />
      {kind === "pet" && (
        <p className="text-xs text-gray-500">
          JPEG, PNG or WebP, smaller than 5 MB. Photo changes save immediately,
          separately from your written profile.
        </p>
      )}
      {editing && (
        <PhotoAdjustDialog
          key={editing.url}
          url={editing.url}
          onClose={() => setEditing(null)}
          onSave={save}
          saveLabel="Save photo"
          description="Crop or rotate, then save this photo to your profile. This replaces the current photo immediately. Edited images are saved as JPEG, up to 4096 pixels on the longest side."
        />
      )}
    </div>
  );
}
