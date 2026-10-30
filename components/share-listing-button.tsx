"use client";
import { useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function ShareListingButton({
  title,
  onShared,
}: {
  title: string;
  onShared: () => void;
}) {
  const [open, setOpen] = useState(false),
    [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  async function copy() {
    setBusy(true);
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      onShared();
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Select the link below and copy it using your browser.");
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    setBusy(true);
    try {
      await navigator.share({ title, url });
      onShared();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        toast.error(
          "Sharing is unavailable. You can copy the listing link instead.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        onClick={() => {
          setUrl(window.location.href);
          setOpen(true);
        }}
        className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border border-slate-200 text-slate-700 text-[14px] font-medium hover:bg-slate-50 transition-colors"
      >
        <Share2 className="h-4 w-4" />
        Share
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share listing</DialogTitle>
            <DialogDescription>
              Anyone with this link can view the listing while it is public.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="listing-share-link" className="text-sm font-medium">
            Listing link
          </label>
          <Input
            id="listing-share-link"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
          />
          <p className="text-xs text-slate-500">
            You can also select the link and copy it using your browser.
          </p>
          <Button disabled={busy} onClick={() => void copy()}>
            Copy link
          </Button>
          {typeof navigator !== "undefined" && !!navigator.share && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void share()}
            >
              Share with an app
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
