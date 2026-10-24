"use client";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
export function MessageComposerTools({
  draft,
  setDraft,
  disabled,
}: {
  draft: string;
  setDraft: (value: string) => void;
  disabled?: boolean;
}) {
  const settings = useQuery(api.messageTemplates.getSettings, {});
  const save = useMutation(api.messageTemplates.save),
    remove = useMutation(api.messageTemplates.remove),
    saveSignature = useMutation(api.messageTemplates.saveSignature);
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Id<"messageTemplates"> | undefined>();
  const [name, setName] = useState(""),
    [body, setBody] = useState(""),
    [signature, setSignature] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && settings) setSignature(settings.signature);
  }, [open, settings?.signature]);
  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap gap-2 items-center mb-2">
      <label className="sr-only" htmlFor="message-template">
        Insert a saved template
      </label>
      <select
        id="message-template"
        className="border rounded-md p-2 text-xs max-w-52"
        disabled={disabled || !settings?.templates.length}
        value=""
        onChange={(e) => {
          const template = settings?.templates.find(
            (t) => t._id === e.target.value,
          );
          if (!template) return;
          if (
            draft.trim() &&
            !window.confirm("Replace your current draft with this template?")
          )
            return;
          setDraft(template.body);
        }}
      >
        <option value="">Insert template</option>
        {settings?.templates.map((t) => (
          <option key={t._id} value={t._id}>
            {t.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || !settings?.signature}
        onClick={() => {
          const next = [draft.trimEnd(), settings?.signature]
            .filter(Boolean)
            .join("\n\n");
          if (next.length > 2000) {
            toast.error(
              "The message and signature must fit within 2,000 characters.",
            );
            return;
          }
          setDraft(next);
        }}
      >
        Add signature
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="sm">
            Manage templates & signature
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Templates & signature</DialogTitle>
            <DialogDescription>
              Save up to ten reusable messages. Inserting a template replaces
              the draft; your signature is added only when you choose it.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {settings?.templates.map((t) => (
              <li key={t._id} className="flex gap-2 items-center text-sm">
                <span className="flex-1 break-words">{t.name}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setEditing(t._id);
                    setName(t.name);
                    setBody(t.body);
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Delete template “${t.name}”?`))
                      perform(async () => {
                        await remove({ id: t._id });
                        if (editing === t._id) {
                          setEditing(undefined);
                          setName("");
                          setBody("");
                        }
                      }, "Template deleted");
                  }}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="space-y-3 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              perform(async () => {
                await save({ id: editing, name, body });
                setEditing(undefined);
                setName("");
                setBody("");
              }, "Template saved");
            }}
          >
            <h3 className="font-semibold">
              {editing
                ? "Edit template"
                : `New template (${settings?.templates.length ?? 0}/10)`}
            </h3>
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
            />
            <Label htmlFor="template-body">Message</Label>
            <Textarea
              id="template-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              maxLength={2000}
              rows={4}
            />
            <div className="flex gap-2">
              <Button
                disabled={
                  busy || (!editing && (settings?.templates.length ?? 0) >= 10)
                }
              >
                Save template
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditing(undefined);
                    setName("");
                    setBody("");
                  }}
                >
                  Cancel editing
                </Button>
              )}
            </div>
          </form>
          <form
            className="space-y-3 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              perform(() => saveSignature({ signature }), "Signature saved");
            }}
          >
            <Label htmlFor="message-signature">Your signature</Label>
            <Textarea
              id="message-signature"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              maxLength={500}
              rows={3}
            />
            <p className="text-xs text-slate-500">
              Clear and save to remove your signature.
            </p>
            <Button disabled={busy}>Save signature</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
