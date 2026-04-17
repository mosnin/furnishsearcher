"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Doc } from "@/convex/_generated/dataModel";

type AvailabilityBlock = Doc<"availabilityBlocks">;

interface AvailabilityCalendarProps {
  blocks: AvailabilityBlock[];
  onAddBlock?: (startDate: number, endDate: number, type: "unavailable" | "booked") => void;
  onRemoveBlock?: (id: string) => void;
  editable?: boolean;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function dateToTs(year: number, month: number, day: number): number {
  return new Date(year, month, day).getTime();
}

function getBlockForDate(
  blocks: AvailabilityBlock[],
  ts: number
): AvailabilityBlock | null {
  return (
    blocks.find(
      (b) => ts >= b.startDate && ts < b.endDate
    ) ?? null
  );
}

export function AvailabilityCalendar({
  blocks,
  onAddBlock,
  onRemoveBlock,
  editable = false,
}: AvailabilityCalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [blockType, setBlockType] = useState<"unavailable" | "booked">("unavailable");

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const handleDayClick = (day: number) => {
    if (!editable) return;
    const ts = dateToTs(viewYear, viewMonth, day);
    if (!selStart || (selStart && selEnd)) {
      setSelStart(ts);
      setSelEnd(null);
    } else {
      if (ts < selStart) {
        setSelEnd(selStart);
        setSelStart(ts);
      } else {
        setSelEnd(ts + 86400000); // end of day
      }
    }
  };

  const handleAddBlock = () => {
    if (!selStart || !selEnd || !onAddBlock) return;
    onAddBlock(selStart, selEnd, blockType);
    setSelStart(null);
    setSelEnd(null);
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
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-semibold text-slate-800">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <Button variant="ghost" size="icon" onClick={nextMonth}>
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

          const block = getBlockForDate(blocks, cell.ts);
          const todayTs = dateToTs(today.getFullYear(), today.getMonth(), today.getDate());
          const isPast = cell.ts < todayTs;
          const isSelected =
            selStart &&
            selEnd &&
            cell.ts >= selStart &&
            cell.ts < selEnd;
          const isSelStart = selStart && cell.ts === selStart && !selEnd;

          return (
            <button
              key={cell.day}
              onClick={() => handleDayClick(cell.day)}
              disabled={isPast && editable}
              className={cn(
                "h-9 w-full rounded text-sm font-medium transition-colors",
                isPast && "text-slate-300 cursor-default",
                !isPast && "text-slate-700 hover:bg-slate-100",
                block?.type === "unavailable" && "bg-red-100 text-red-700 hover:bg-red-200",
                block?.type === "booked" && "bg-amber-100 text-amber-700 hover:bg-amber-200",
                isSelected && "bg-[#0f2044]/20 text-[#0f2044]",
                isSelStart && "bg-[#0f2044] text-white",
                editable && !isPast && !block && "cursor-pointer"
              )}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

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
              className={blockType === "unavailable" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              Unavailable
            </Button>
            <Button
              size="sm"
              variant={blockType === "booked" ? "default" : "outline"}
              onClick={() => setBlockType("booked")}
              className={blockType === "booked" ? "bg-amber-500 hover:bg-amber-600" : ""}
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
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-600">
                {new Date(selStart).toLocaleDateString()} →{" "}
                {new Date(selEnd - 1).toLocaleDateString()}
              </p>
              <Button size="sm" onClick={handleAddBlock} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Block dates
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setSelStart(null); setSelEnd(null); }}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Block list */}
          {blocks.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Blocked periods
              </p>
              {blocks.map((block) => (
                <div
                  key={block._id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border",
                        block.type === "booked"
                          ? "bg-amber-100 text-amber-700 border-amber-200"
                          : "bg-red-100 text-red-700 border-red-200"
                      )}
                    >
                      {block.type}
                    </span>
                    <span className="text-sm text-slate-600">
                      {new Date(block.startDate).toLocaleDateString()} –{" "}
                      {new Date(block.endDate - 1).toLocaleDateString()}
                    </span>
                    {block.note && (
                      <span className="text-xs text-slate-400">{block.note}</span>
                    )}
                  </div>
                  {onRemoveBlock && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-red-500"
                      onClick={() => onRemoveBlock(block._id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
