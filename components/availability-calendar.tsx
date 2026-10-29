"use client";

import Link from "next/link";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Trash2, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Doc } from "@/convex/_generated/dataModel";

type AvailabilityBlock = Doc<"availabilityBlocks">;

interface AvailabilityCalendarProps {
  blocks: AvailabilityBlock[];
  onAddBlock?: (
    startDate: number,
    endDate: number,
    type: "unavailable" | "booked",
    metadata?: { title: string; note: string },
  ) => void | Promise<unknown>;
  onUpdateBlock?: (
    id: string,
    fields: {
      startDate: number;
      endDate: number;
      type: "unavailable" | "booked";
      title: string;
      note: string;
    },
  ) => Promise<unknown>;
  onRemoveBlock?: (id: string) => void;
  editable?: boolean;
  syncThrough?: number;
  availableFrom?: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 1)).getUTCDay();
}

function dateToTs(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day);
}

function getBlockForDate(
  blocks: AvailabilityBlock[],
  ts: number,
): AvailabilityBlock | null {
  return (
    blocks.find((b) => ts < b.endDate && b.startDate < ts + 86400000) ?? null
  );
}

export function AvailabilityCalendar({
  blocks,
  onAddBlock,
  onRemoveBlock,
  onUpdateBlock,
  editable = false,
  syncThrough,
  availableFrom,
}: AvailabilityCalendarProps) {
  const today = new Date();
  const [showPast, setShowPast] = useState(true),
    [onlyBookings, setOnlyBookings] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [title, setTitle] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const todayStart = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const displayed = blocks.filter(
    (b) =>
      (!editable || showPast || b.endDate > todayStart) &&
      (!editable ||
        !onlyBookings ||
        (b.type === "booked" && !b.calendarFeedId)),
  );
  const [viewYear, setViewYear] = useState(today.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(today.getUTCMonth());
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [blockType, setBlockType] = useState<"unavailable" | "booked">(
    "unavailable",
  );

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const handleDayClick = (day: number) => {
    if (!editable) return;
    const ts = dateToTs(viewYear, viewMonth, day);
    if (!selStart || (selStart && selEnd)) {
      setSelStart(ts);
      setSelEnd(null);
    } else {
      if (ts < selStart) {
        setSelEnd(selStart + 86400000);
        setSelStart(ts);
      } else {
        setSelEnd(ts + 86400000); // end of day
      }
    }
  };

  const handleAddBlock = async () => {
    if (!selStart || !selEnd || !onAddBlock) return;
    setBusy(true);
    try {
      await onAddBlock(selStart, selEnd, blockType, { title, note });
      setSelStart(null);
      setSelEnd(null);
      setTitle("");
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save event.");
    } finally {
      setBusy(false);
    }
  };

  const cells = useMemo(() => {
    const result: Array<{ day: number; ts: number } | null> = [];
    for (let i = 0; i < firstDay; i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      result.push({ day: d, ts: dateToTs(viewYear, viewMonth, d) });
    }
    return result;
  }, [viewYear, viewMonth, daysInMonth, firstDay]);

  return (
    <div className="select-none">
      {editable && (
        <div className="flex flex-wrap gap-4 text-sm mb-4">
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={showPast}
              onChange={(e) => setShowPast(e.target.checked)}
            />
            Display past events
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={onlyBookings}
              onChange={(e) => setOnlyBookings(e.target.checked)}
            />
            Show only booked stays
          </label>
          <p className="text-xs text-slate-500 w-full">
            Display filters leave availability unchanged; hidden events can
            still block dates.
          </p>
        </div>
      )}
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous month"
          onClick={prevMonth}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-semibold text-slate-800">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next month"
          onClick={nextMonth}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-medium text-slate-400 py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} />;

          const block = getBlockForDate(displayed, cell.ts),
            actualBlock = getBlockForDate(blocks, cell.ts);
          const todayTs = dateToTs(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            today.getUTCDate(),
          );
          const isPast = cell.ts < todayTs;
          const beforeStart =
            availableFrom !== undefined && cell.ts < availableFrom;
          const unconfirmed =
            syncThrough !== undefined && cell.ts + 86400000 > syncThrough;
          const isSelected =
            selStart && selEnd && cell.ts >= selStart && cell.ts < selEnd;
          const isSelStart = selStart && cell.ts === selStart && !selEnd;

          return (
            <button
              key={cell.day}
              aria-label={`${MONTHS[viewMonth]} ${cell.day}, ${viewYear}: ${isPast ? "past date" : beforeStart ? "unavailable" : actualBlock ? `${actualBlock.type}${!block ? " (event hidden by display filter)" : ""}` : unconfirmed ? "availability not confirmed" : "available"}`}
              onClick={() => handleDayClick(cell.day)}
              disabled={isPast && editable}
              className={cn(
                "h-9 w-full rounded text-sm font-medium transition-colors",
                (isPast || beforeStart || unconfirmed) &&
                  "text-slate-400 cursor-default",
                !isPast &&
                  !beforeStart &&
                  !unconfirmed &&
                  "text-slate-700 hover:bg-slate-100",
                block?.type === "unavailable" &&
                  "bg-red-100 text-red-700 hover:bg-red-200",
                block?.type === "booked" &&
                  "bg-amber-100 text-amber-700 hover:bg-amber-200",
                isSelected && "bg-primary/20 text-primary",
                isSelStart && "bg-primary text-white",
                editable && !isPast && !block && "cursor-pointer",
              )}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {syncThrough !== undefined && (
        <p className="mt-3 text-xs text-slate-600">
          {syncThrough === 0
            ? "Waiting for the linked calendar to sync. Availability is not yet confirmed."
            : `Linked calendar availability is confirmed through ${new Date(syncThrough - 1).toLocaleDateString("en-US", { timeZone: "UTC" })}. Later dates need confirmation from the owner.`}
        </p>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-red-200" />
          <span>Unavailable</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-amber-200" />
          <span>Booked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-white border border-slate-200" />
          <span>Available</span>
        </div>
      </div>

      {/* Edit controls */}
      {editable && (
        <div className="mt-6 space-y-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={blockType === "unavailable" ? "default" : "outline"}
              onClick={() => setBlockType("unavailable")}
              className={
                blockType === "unavailable" ? "bg-red-600 hover:bg-red-700" : ""
              }
            >
              Unavailable
            </Button>
            <Button
              size="sm"
              variant={blockType === "booked" ? "default" : "outline"}
              onClick={() => setBlockType("booked")}
              className={
                blockType === "booked" ? "bg-amber-500 hover:bg-amber-600" : ""
              }
            >
              Booked
            </Button>
          </div>

          {selStart && !selEnd && (
            <p className="text-sm text-slate-500">
              Click an end date to complete the range.
            </p>
          )}
          {selStart && selEnd && (
            <div className="space-y-2">
              <label className="block text-sm">
                Event name
                <Input
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Private note
                <Textarea
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </div>
          )}
          {selStart && selEnd && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-600">
                {new Date(selStart).toLocaleDateString("en-US", {
                  timeZone: "UTC",
                })}{" "}
                →{" "}
                {new Date(selEnd - 1).toLocaleDateString("en-US", {
                  timeZone: "UTC",
                })}
              </p>
              <Button
                disabled={busy}
                size="sm"
                onClick={handleAddBlock}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Block dates
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelStart(null);
                  setSelEnd(null);
                }}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Block list */}
          {displayed.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Blocked periods
              </p>
              {displayed.map((block) => (
                <div
                  key={block._id}
                  className="flex flex-wrap gap-2 items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border",
                        block.type === "booked"
                          ? "bg-amber-100 text-amber-700 border-amber-200"
                          : "bg-red-100 text-red-700 border-red-200",
                      )}
                    >
                      {block.type}
                    </span>
                    <span className="text-sm text-slate-600">
                      {new Date(block.startDate).toLocaleDateString("en-US", {
                        timeZone: "UTC",
                      })}{" "}
                      –{" "}
                      {new Date(block.endDate - 1).toLocaleDateString("en-US", {
                        timeZone: "UTC",
                      })}
                    </span>
                    {block.title && (
                      <span className="text-sm font-medium">{block.title}</span>
                    )}
                    {block.note && (
                      <span className="text-xs text-slate-400">
                        {block.note}
                      </span>
                    )}
                  </div>
                  {block.calendarFeedId && (
                    <span className="text-xs text-slate-500">Imported</span>
                  )}
                  {block.inquiryId && (
                    <Link
                      className="text-sm underline"
                      href={`/dashboard/inquiries/${block.inquiryId}`}
                    >
                      Manage stay
                    </Link>
                  )}
                  {onUpdateBlock &&
                    !block.calendarFeedId &&
                    !block.inquiryId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit calendar event"
                        onClick={() =>
                          setEditing(editing === block._id ? null : block._id)
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  {onRemoveBlock &&
                    !block.calendarFeedId &&
                    !block.inquiryId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove calendar event"
                        className="h-7 w-7 text-slate-400 hover:text-red-500"
                        onClick={() => onRemoveBlock(block._id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  {editing === block._id && onUpdateBlock && (
                    <CalendarEventEditor
                      block={block}
                      save={async (fields) => {
                        await onUpdateBlock(block._id, fields);
                        setEditing(null);
                      }}
                      cancel={() => setEditing(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CalendarEventEditor({
  block,
  save,
  cancel,
}: {
  block: AvailabilityBlock;
  save: (fields: {
    startDate: number;
    endDate: number;
    type: "unavailable" | "booked";
    title: string;
    note: string;
  }) => Promise<unknown>;
  cancel: () => void;
}) {
  const [start, setStart] = useState(
      new Date(block.startDate).toISOString().slice(0, 10),
    ),
    [end, setEnd] = useState(
      new Date(block.endDate - 1).toISOString().slice(0, 10),
    ),
    [title, setTitle] = useState(block.title ?? ""),
    [note, setNote] = useState(block.note ?? ""),
    [type, setType] = useState(block.type),
    [busy, setBusy] = useState(false);
  return (
    <div className="w-full border-t pt-3 space-y-2">
      <label className="block text-sm">
        Event name
        <Input
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          First blocked day
          <Input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Last blocked day
          <Input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      <label className="block text-sm">
        Event type
        <select
          className="block border rounded p-2"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
        >
          <option value="unavailable">Unavailable</option>
          <option value="booked">Booked stay</option>
        </select>
      </label>
      <label className="block text-sm">
        Private note
        <Textarea
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await save({
                startDate: Date.parse(start),
                endDate: Date.parse(end) + 86400000,
                type,
                title,
                note,
              });
            } catch (e) {
              toast.error(
                e instanceof Error
                  ? e.message
                  : "Could not save calendar event.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Save event
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
