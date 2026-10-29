"use client";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { CaretDown, Minus, Plus } from "@phosphor-icons/react";
import { DateRangeCalendar } from "@/components/public-experience/search-pill";
import { parseDate } from "@/lib/search";

type InquiryProps = {
  listingId: string;
  minStay: number;
  petFriendly: boolean;
  needsProfile?: boolean;
  maxOccupancy?: number;
};
export function BookingInquiry({
  listingId,
  minStay,
  maxOccupancy = 30,
}: InquiryProps) {
  const params = useSearchParams(),
    router = useRouter();
  const initial = (key: string) => {
    const value = params.get(key) ?? "";
    try {
      parseDate(value);
      return value;
    } catch {
      return "";
    }
  };
  const [moveIn, setMoveIn] = useState(() => initial("moveIn")),
    [moveOut, setMoveOut] = useState(() => initial("moveOut"));
  const [occupants, setOccupants] = useState(() =>
    Math.max(1, Math.min(maxOccupancy, Number(params.get("occupants")) || 1)),
  );
  const [openDates, setOpenDates] = useState(false),
    [openGuests, setOpenGuests] = useState(false),
    [error, setError] = useState("");
  const display = (value: string) =>
    value
      ? new Date(value + "T12:00:00Z").toLocaleDateString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
          timeZone: "UTC",
        })
      : "Add date";
  function proceed() {
    const query = new URLSearchParams();
    if (moveIn) query.set("moveIn", moveIn);
    if (moveOut) query.set("moveOut", moveOut);
    query.set("occupants", String(occupants));
    if (
      moveIn &&
      moveOut &&
      Date.parse(moveOut) - Date.parse(moveIn) <
        Math.max(1, minStay) * 30 * 86400000
    ) {
      setError(`Choose a stay of at least ${Math.max(1, minStay) * 30} days.`);
      setOpenDates(true);
      return;
    }
    router.push(`/listings/${listingId}/request?${query}`);
  }
  return (
    <div className="w-property-request-fields">
      <Popover.Root open={openDates} onOpenChange={setOpenDates}>
        <Popover.Trigger className="w-property-date-trigger">
          <span>
            <small>Move in</small>
            <strong>{display(moveIn)}</strong>
          </span>
          <span>
            <small>Move out</small>
            <strong>{display(moveOut)}</strong>
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={16}
            className="w-property-popover-positioner"
          >
            <Popover.Popup className="w-property-date-popover">
              <DateRangeCalendar
                start={moveIn}
                end={moveOut}
                onChange={(a, b) => {
                  setMoveIn(a);
                  setMoveOut(b);
                  setError("");
                }}
              />
              <div className="w-property-date-footer">
                <span>{Math.max(1, minStay) * 30} day minimum</span>
                <Popover.Close className="w-property-pill">Done</Popover.Close>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <Popover.Root open={openGuests} onOpenChange={setOpenGuests}>
        <Popover.Trigger className="w-property-guest-trigger">
          <span>
            <small>Guests</small>
            <strong>
              {occupants} {occupants === 1 ? "guest" : "guests"}
            </strong>
          </span>
          <CaretDown size={18} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={16}
            className="w-property-popover-positioner"
          >
            <Popover.Popup className="w-property-guests-popover">
              <span>Guests</span>
              <div className="w-property-counter">
                <button
                  disabled={occupants <= 1}
                  aria-label="Remove guest"
                  onClick={() => setOccupants((n) => n - 1)}
                >
                  <Minus size={18} />
                </button>
                <span>{occupants}</span>
                <button
                  disabled={occupants >= maxOccupancy}
                  aria-label="Add guest"
                  onClick={() => setOccupants((n) => n + 1)}
                >
                  <Plus size={18} />
                </button>
              </div>
              <Popover.Close className="w-property-pill">Done</Popover.Close>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <button className="w-property-reserve" onClick={proceed}>
        Request stay
      </button>
      <p className="w-property-no-charge">
        You won’t be charged. Owner approval required.
      </p>
      {error && (
        <p className="w-property-form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
