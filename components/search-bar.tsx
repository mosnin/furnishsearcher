"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Input, Button, SelectField } from "@/components/ui-system/primitives";
import { TOP_CITIES } from "@/lib/cities";
import { BUDGET_OPTIONS, cn } from "@/lib/utils";
import { buildSearchUrl, normalizeSearch, parseDate } from "@/lib/search";
import { searchDateRange } from "@/lib/stays";
export default function SearchBar({
  className,
  defaultLocation = "",
  defaultDate = "",
  defaultBudget = "",
}: {
  className?: string;
  defaultLocation?: string;
  defaultDate?: string;
  defaultBudget?: string;
}) {
  const router = useRouter(),
    id = useId();
  const initial = searchDateRange(defaultDate);
  const [location, setLocation] = useState(defaultLocation),
    [budget, setBudget] = useState(defaultBudget || "any"),
    [moveIn, setMoveIn] = useState(
      initial.moveIn ? new Date(initial.moveIn).toISOString().slice(0, 10) : "",
    ),
    [moveOut, setMoveOut] = useState(
      initial.moveOut
        ? new Date(initial.moveOut).toISOString().slice(0, 10)
        : "",
    ),
    [flexibleDays, setFlexibleDays] = useState("0"),
    [error, setError] = useState("");
  return (
    <form
      className={cn("public-search-form", className)}
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const filters = normalizeSearch({
            location: location.trim() || undefined,
            moveIn: moveIn ? parseDate(moveIn) : undefined,
            moveOut: moveOut ? parseDate(moveOut) : undefined,
            maxPrice: budget === "any" ? undefined : Number(budget),
            flexibleDays: Number(flexibleDays),
          });
          setError("");
          router.push(buildSearchUrl(filters));
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Review your search criteria.",
          );
        }
      }}
    >
      <div className="public-search-primary">
        <label className="ds-field public-location-field">
          Where would you like to stay?
          <Input
            list={id}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={200}
            placeholder="City, state, ZIP or property number"
          />
          <datalist id={id}>
            {TOP_CITIES.map((city) => (
              <option
                key={`${city.name}-${city.stateCode}`}
                value={`${city.name}, ${city.stateCode}`}
              />
            ))}
          </datalist>
        </label>
        <SelectField
          label="Monthly budget"
          value={budget}
          onValueChange={setBudget}
          options={BUDGET_OPTIONS.map(({ value, label }) => ({ value, label }))}
        />
        <Button type="submit">
          <MagnifyingGlass size={16} />
          Find a rental
        </Button>
      </div>
      <div className="public-search-dates">
        <label className="ds-field">
          Move in
          <Input
            type="date"
            value={moveIn}
            onChange={(e) => setMoveIn(e.target.value)}
          />
        </label>
        <label className="ds-field">
          Move out
          <Input
            type="date"
            value={moveOut}
            onChange={(e) => setMoveOut(e.target.value)}
          />
        </label>
        <SelectField
          label="Flexibility"
          value={flexibleDays}
          onValueChange={setFlexibleDays}
          options={[
            { value: "0", label: "Exact dates" },
            ...[7, 14, 30].map((n) => ({
              value: String(n),
              label: `±${n} days`,
            })),
          ]}
        />
        <p>
          Stays of 30 days or more.
          <br />
          Add dates now or explore first.
        </p>
      </div>
      {error && (
        <p role="alert" className="public-search-error">
          {error}
        </p>
      )}
    </form>
  );
}
