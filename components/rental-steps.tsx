"use client";
import { useRef, useState } from "react";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { RENTAL_TOOLS, type RentalTool } from "@/lib/rental-tools";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Card, CardContent } from "./ui/card";
import { toast } from "sonner";
import Link from "next/link";
export function RentalSteps({
  inquiryId,
  owner,
  canRequest,
}: {
  inquiryId: Id<"bookingInquiries">;
  owner: boolean;
  canRequest: boolean;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
      api.rentalTools.list,
      { inquiryId },
      { initialNumItems: 10 },
    ),
    request = useMutation(api.rentalTools.request),
    update = useMutation(api.rentalTools.update);
  const [kind, setKind] = useState<RentalTool>("screening"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    reference = useRef<string | null>(null);
  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not update rental step.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-lg">Rental setup</h2>
      <p className="text-sm text-slate-600">
        Coordinate screening, documents and rent setup here. Provider accounts
        handle actual screening orders and rent payments; these instructions and
        progress updates do not verify a report, signed lease or payment.
      </p>
      <div className="flex gap-4 text-sm">
        <Link
          className="underline"
          href={`/dashboard/inquiries/${inquiryId}/documents`}
        >
          Private documents and signing
        </Link>
        <Link className="underline" href="/dashboard/rental-tools">
          Provider resources
        </Link>
      </div>
      {results.map((row) => {
        const tool = RENTAL_TOOLS[row.kind],
          open = ["requested", "received"].includes(row.status);
        return (
          <Card key={row._id}>
            <CardContent className="p-4 space-y-2">
              <h3 className="font-semibold">
                {tool.title} · {tool.provider}
              </h3>
              <p className="text-sm">
                {row.status === "owner_reported_complete"
                  ? "Owner reports this step completed outside globe"
                  : row.status === "received"
                    ? "Traveler received the instructions"
                    : row.status === "cancelled"
                      ? "Instruction cancelled"
                      : "Awaiting traveler acknowledgement"}
              </p>
              <p className="text-sm whitespace-pre-wrap">{row.note}</p>
              <p className="text-xs text-slate-500">
                {owner ? tool.description : tool.tenant}
              </p>
              <a
                className="text-sm underline block"
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Review {tool.provider}
              </a>
              <div className="flex flex-wrap gap-2">
                {!owner && row.status === "requested" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => update({ id: row._id, status: "received" }),
                        "Receipt acknowledged; no screening consent or payment authorization recorded",
                      )
                    }
                  >
                    Acknowledge instructions
                  </Button>
                )}
                {owner && open && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            update({
                              id: row._id,
                              status: "owner_reported_complete",
                            }),
                          "Owner-reported progress saved; check the provider for its actual result",
                        )
                      }
                    >
                      Record completed outside this app
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => update({ id: row._id, status: "cancelled" }),
                          "Instruction cancelled",
                        )
                      }
                    >
                      Cancel instruction
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {owner && canRequest && (
        <details className="border rounded-xl p-4">
          <summary className="font-semibold cursor-pointer">
            Coordinate the next rental step
          </summary>
          <div className="space-y-3 mt-3">
            <label className="block text-sm">
              Step
              <select
                className="block border rounded-md p-2"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as RentalTool);
                  reference.current = null;
                }}
              >
                {Object.entries(RENTAL_TOOLS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.title}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm">{RENTAL_TOOLS[kind].description}</p>
            <label className="block text-sm">
              Instructions for the traveler
              <Textarea
                maxLength={1500}
                minLength={10}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  reference.current = null;
                }}
                placeholder="Explain the next step and how you will provide the official provider invitation. Keep identity and payment information in the provider account."
              />
            </label>
            <Button
              disabled={busy || note.trim().length < 10}
              onClick={() =>
                run(async () => {
                  reference.current ??= crypto.randomUUID();
                  await request({
                    inquiryId,
                    kind,
                    note,
                    requestId: reference.current,
                  });
                  setNote("");
                  reference.current = null;
                }, "Instruction saved; provider setup is still handled separately")
              }
            >
              Send setup instructions
            </Button>
          </div>
        </details>
      )}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(10)}>
          More setup history
        </Button>
      )}
    </section>
  );
}
