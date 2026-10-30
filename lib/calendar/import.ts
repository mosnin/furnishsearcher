import { CalendarImportError } from "./errors";
import ICAL from "ical.js";
import { DAY } from "../stays";

import { MAX_CALENDAR_BYTES, MAX_IMPORTED_BLOCKS } from "./limits";
export { MAX_CALENDAR_BYTES, MAX_IMPORTED_BLOCKS } from "./limits";
export type ImportedBlock = { startDate: number; endDate: number };

function blocking(component: ICAL.Component) {
  return (
    component.getFirstPropertyValue("status") !== "CANCELLED" &&
    component.getFirstPropertyValue("transp") !== "TRANSPARENT"
  );
}

function timestamp(time: ICAL.Time | null | undefined): number {
  if (!time) throw new CalendarImportError("Calendar event is missing a date.");
  // Date-only entries describe whole nights, independent of the server's local timezone.
  if (time.isDate) {
    const result = Date.UTC(time.year, time.month - 1, time.day);
    if (!Number.isFinite(result))
      throw new CalendarImportError("Calendar event has an invalid date.");
    return result;
  }
  if (time.zone.tzid === "floating")
    throw new CalendarImportError(
      "Calendar event has an unspecified timezone.",
    );
  const result = time.toJSDate().getTime();
  if (!Number.isFinite(result))
    throw new CalendarImportError("Calendar event has an invalid date.");
  return result;
}

function validateTimezone(component: ICAL.Component, propertyName: string) {
  const property = component.getFirstProperty(propertyName);
  if (!property) return;
  const zone = property.getParameter("tzid");
  const time = property.getFirstValue() as ICAL.Time;
  if (zone && time.zone.tzid !== zone)
    throw new CalendarImportError("Calendar is missing a timezone definition.");
}

export function parseAvailability(text: string, now = Date.now()) {
  if (new TextEncoder().encode(text).byteLength > MAX_CALENDAR_BYTES)
    throw new CalendarImportError("Calendar export is too large.");
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text.trim()));
  } catch {
    throw new CalendarImportError(
      "The provider did not return a valid calendar export.",
    );
  }
  if (
    root.name !== "vcalendar" ||
    root.getFirstPropertyValue("version") !== "2.0"
  ) {
    throw new CalendarImportError(
      "The provider did not return a supported calendar export.",
    );
  }
  const coveredFrom = Math.floor(now / DAY) * DAY;
  const today = new Date(coveredFrom);
  const targetYear = today.getUTCFullYear() + 2;
  const lastDay = new Date(
    Date.UTC(targetYear, today.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const coveredThrough = Date.UTC(
    targetYear,
    today.getUTCMonth(),
    Math.min(today.getUTCDate(), lastDay),
  );
  const components = root.getAllSubcomponents("vevent");
  if (components.length > 2000)
    throw new CalendarImportError(
      "Calendar contains too many events to import safely.",
    );
  const groups = new Map<string, ICAL.Component[]>();
  for (const component of components) {
    const uid = component.getFirstPropertyValue("uid");
    if (typeof uid !== "string" || !uid || uid.length > 1000)
      throw new CalendarImportError(
        "Calendar event is missing a valid identifier.",
      );
    groups.set(uid, [...(groups.get(uid) ?? []), component]);
  }
  const ranges: ImportedBlock[] = [];
  let steps = 0;
  function add(start: ICAL.Time, end: ICAL.Time, component: ICAL.Component) {
    if (!blocking(component)) return;
    validateTimezone(component, "dtstart");
    validateTimezone(component, "dtend");
    const startDate = timestamp(start),
      endDate = timestamp(end);
    if (endDate <= startDate)
      throw new CalendarImportError(
        "Calendar event has an invalid date range.",
      );
    if (endDate <= coveredFrom || startDate >= coveredThrough) return;
    ranges.push({ startDate, endDate });
    if (ranges.length > MAX_IMPORTED_BLOCKS)
      throw new CalendarImportError(
        "Calendar has too many upcoming reservations to import safely.",
      );
  }
  for (const group of groups.values()) {
    const masters = group.filter((c) => !c.hasProperty("recurrence-id"));
    masters.sort(
      (a, b) =>
        Number(b.getFirstPropertyValue("sequence") ?? 0) -
        Number(a.getFirstPropertyValue("sequence") ?? 0),
    );
    const base = masters[0];
    if (!base) {
      // A detached occurrence is still an authoritative occupied interval in a full provider feed.
      for (const exception of group)
        if (blocking(exception)) {
          const event = new ICAL.Event(exception, { exceptions: [] });
          add(event.startDate, event.endDate, exception);
        }
      continue;
    }
    if (!blocking(base)) continue;
    const exceptions = group.filter((c) => c.hasProperty("recurrence-id"));
    const event = new ICAL.Event(base, {
      strictExceptions: true,
      exceptions: exceptions.filter(blocking),
    });
    const exceptionTimes = exceptions.map((component) => ({
      component,
      recurrence: timestamp(
        component.getFirstPropertyValue("recurrence-id") as ICAL.Time,
      ),
      range:
        component.getFirstProperty("recurrence-id")?.getParameter("range") ===
        "THISANDFUTURE",
    }));
    validateTimezone(base, "dtstart");
    validateTimezone(base, "dtend");
    if (!event.isRecurring()) {
      add(event.startDate, event.endDate, base);
      continue;
    }
    // Avoid unbounded expansion of malformed or extremely old recurrence rules.
    const iterator = event.iterator();
    for (
      let occurrence = iterator.next();
      occurrence;
      occurrence = iterator.next()
    ) {
      if (++steps > 10000)
        throw new CalendarImportError(
          "Calendar recurrence is too complex to import safely.",
        );
      if (timestamp(occurrence) >= coveredThrough) break;
      const occurrenceTime = timestamp(occurrence);
      const direct = exceptionTimes.find(
        (e) => e.recurrence === occurrenceTime,
      );
      const range = exceptionTimes
        .filter((e) => e.range && e.recurrence <= occurrenceTime)
        .sort((a, b) => b.recurrence - a.recurrence)[0];
      if (
        direct
          ? !blocking(direct.component)
          : range && !blocking(range.component)
      )
        continue;
      const details = event.getOccurrenceDetails(occurrence);
      if (blocking(details.item.component))
        add(details.startDate, details.endDate, details.item.component);
    }
    // Include moved exceptions even if their original recurrence starts beyond the coverage window.
    for (const exception of exceptions)
      if (blocking(exception)) {
        const item = new ICAL.Event(exception, { exceptions: [] });
        add(item.startDate, item.endDate, exception);
      }
  }
  // Only occupied intervals are stored. Guest names, descriptions, locations and calendar UIDs stay out of our database.
  ranges.sort((a, b) => a.startDate - b.startDate || a.endDate - b.endDate);
  const blocks: ImportedBlock[] = [];
  for (const range of ranges) {
    const previous = blocks[blocks.length - 1];
    if (previous && range.startDate <= previous.endDate)
      previous.endDate = Math.max(previous.endDate, range.endDate);
    else blocks.push({ ...range });
  }
  return { blocks, coveredFrom, coveredThrough };
}
