import { describe, expect, it } from "vitest";
import { calendarLink } from "../lib/calendar/links";
import { parseAvailability, MAX_CALENDAR_BYTES } from "../lib/calendar/import";
import { DAY } from "../lib/stays";

const now = Date.UTC(2026, 9, 24),
  start = Date.UTC(2027, 2, 1);
const calendar = (events: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Fixture Calendar//EN\r\n${events}\r\nEND:VCALENDAR`;
const event = (uid: string, from: string, to: string, extra = "") =>
  `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART;VALUE=DATE:${from}\r\nDTEND;VALUE=DATE:${to}\r\n${extra}\r\nEND:VEVENT`;

describe("provider calendar links", () => {
  it("accepts only private HTTPS calendar exports from the selected provider", () => {
    expect(
      calendarLink(
        "https://www.airbnb.com/calendar/ical/123.ics?s=private",
        "airbnb",
      ),
    ).toContain("s=private");
    expect(
      calendarLink("https://www.vrbo.com/icalendar/private.ics", "vrbo"),
    ).toContain("vrbo.com");
    for (const link of [
      "http://www.airbnb.com/a.ics",
      "https://www.airbnb.com.evil.test/a.ics",
      "https://www.airbnb.com@127.0.0.1/a.ics",
      "https://localhost/a.ics",
      "https://169.254.169.254/a.ics",
      "file:///etc/passwd",
      "https://www.airbnb.com:1234/a.ics",
      "https://www.airbnb.com/rooms/123",
      "https://www.airbnb.com/a.ics#fragment",
    ])
      expect(() => calendarLink(link, "airbnb")).toThrow();
    expect(() =>
      calendarLink("https://www.vrbo.com/a.ics", "airbnb"),
    ).toThrow();
  });
});

describe("calendar availability parsing", () => {
  it("uses exclusive checkout dates, merges occupied ranges, and excludes private event text", () => {
    const result = parseAvailability(
      calendar(
        event(
          "guest-private",
          "20270301",
          "20270310",
          "SUMMARY:Secret Guest\r\nDESCRIPTION:Private details",
        ) +
          "\r\n" +
          event("other", "20270308", "20270315"),
      ),
      now,
    );
    expect(result.blocks).toEqual([
      { startDate: start, endDate: Date.UTC(2027, 2, 15) },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /Secret Guest|Private details|guest-private/,
    );
  });
  it("ignores canceled and transparent entries and handles a valid empty calendar", () => {
    const contents = calendar(
      event("cancelled", "20270301", "20270310", "STATUS:CANCELLED") +
        "\r\n" +
        event("free", "20270301", "20270310", "TRANSP:TRANSPARENT"),
    );
    expect(parseAvailability(contents, now).blocks).toEqual([]);
    expect(parseAvailability(calendar(""), now).blocks).toEqual([]);
  });
  it("expands recurrences with EXDATE and moved exceptions without mixing unrelated UIDs", () => {
    const first = event(
      "recurring",
      "20270301",
      "20270302",
      "RRULE:FREQ=DAILY;COUNT=3\r\nEXDATE;VALUE=DATE:20270302",
    );
    const moved = event(
      "recurring",
      "20270310",
      "20270311",
      "RECURRENCE-ID;VALUE=DATE:20270303",
    );
    const unrelated = event("other-series", "20270303", "20270304");
    expect(
      parseAvailability(calendar([first, moved, unrelated].join("\r\n")), now)
        .blocks,
    ).toEqual([
      { startDate: start, endDate: start + DAY },
      { startDate: start + 2 * DAY, endDate: start + 3 * DAY },
      { startDate: start + 9 * DAY, endDate: start + 10 * DAY },
    ]);
  });
  it("handles a canceled recurrence exception with no DTSTART", () => {
    const master = event(
      "recurring",
      "20270301",
      "20270302",
      "RRULE:FREQ=DAILY;COUNT=2",
    );
    const cancelled =
      "BEGIN:VEVENT\r\nUID:recurring\r\nRECURRENCE-ID;VALUE=DATE:20270302\r\nSTATUS:CANCELLED\r\nEND:VEVENT";
    expect(
      parseAvailability(calendar(master + "\r\n" + cancelled), now).blocks,
    ).toEqual([{ startDate: start, endDate: start + DAY }]);
  });
  it("converts UTC times and embedded timezone definitions correctly", () => {
    const utc =
      "BEGIN:VEVENT\r\nUID:utc\r\nDTSTART:20270301T150000Z\r\nDTEND:20270301T170000Z\r\nEND:VEVENT";
    expect(parseAvailability(calendar(utc), now).blocks[0]).toEqual({
      startDate: start + 15 * 3600000,
      endDate: start + 17 * 3600000,
    });
    const zone = `BEGIN:VTIMEZONE\r\nTZID:America/New_York\r\nBEGIN:STANDARD\r\nDTSTART:19701101T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\nTZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500\r\nEND:STANDARD\r\nBEGIN:DAYLIGHT\r\nDTSTART:19700308T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0400\r\nEND:DAYLIGHT\r\nEND:VTIMEZONE`;
    const timed =
      "BEGIN:VEVENT\r\nUID:dst\r\nDTSTART;TZID=America/New_York:20270315T150000\r\nDTEND;TZID=America/New_York:20270315T170000\r\nEND:VEVENT";
    expect(
      parseAvailability(calendar(zone + "\r\n" + timed), now).blocks[0],
    ).toEqual({
      startDate: Date.UTC(2027, 2, 15, 19),
      endDate: Date.UTC(2027, 2, 15, 21),
    });
    expect(() => parseAvailability(calendar(timed), now)).toThrow("timezone");
  });
  it("rejects malformed, oversized, ambiguous and invalid exports instead of treating them as empty", () => {
    for (const contents of [
      "<html>Sign in</html>",
      "",
      "not a calendar",
      calendar(event("reverse", "20270310", "20270301")),
      calendar(
        "BEGIN:VEVENT\r\nUID:floating\r\nDTSTART:20270301T150000\r\nDTEND:20270301T160000\r\nEND:VEVENT",
      ),
    ])
      expect(() => parseAvailability(contents, now)).toThrow();
    expect(() =>
      parseAvailability("x".repeat(MAX_CALENDAR_BYTES + 1), now),
    ).toThrow("large");
  });
  it("uses the newest sequence for a UID and bounds recurring imports without silent truncation", () => {
    const old = event("same", "20270301", "20270303", "SEQUENCE:1");
    const canceled = event(
      "same",
      "20270301",
      "20270303",
      "SEQUENCE:2\r\nSTATUS:CANCELLED",
    );
    expect(
      parseAvailability(calendar(old + "\r\n" + canceled), now).blocks,
    ).toEqual([]);
    expect(() =>
      parseAvailability(
        calendar(
          event("too-many", "20270301", "20270302", "RRULE:FREQ=SECONDLY"),
        ),
        now,
      ),
    ).toThrow();
    expect(() =>
      parseAvailability(
        calendar(
          event("old-series", "19700101", "19700102", "RRULE:FREQ=DAILY"),
        ),
        now,
      ),
    ).toThrow("complex");
  });
  it("only imports intervals that overlap the declared two-year coverage window", () => {
    const result = parseAvailability(
      calendar(
        event("past", "20200101", "20200102") +
          "\r\n" +
          event("future", "20350101", "20350102"),
      ),
      now,
    );
    expect(result.blocks).toEqual([]);
    expect(result.coveredThrough).toBe(Date.UTC(2028, 9, 24));
  });
  it("honors canceled ranges until a later range override restores occupied dates", () => {
    const master = event(
      "range",
      "20270301",
      "20270302",
      "RRULE:FREQ=DAILY;COUNT=5",
    );
    const canceled =
      "BEGIN:VEVENT\r\nUID:range\r\nRECURRENCE-ID;VALUE=DATE;RANGE=THISANDFUTURE:20270302\r\nSTATUS:CANCELLED\r\nEND:VEVENT";
    const restored = event(
      "range",
      "20270304",
      "20270305",
      "RECURRENCE-ID;VALUE=DATE;RANGE=THISANDFUTURE:20270304",
    );
    expect(
      parseAvailability(
        calendar([master, canceled, restored].join("\r\n")),
        now,
      ).blocks,
    ).toEqual([
      { startDate: start, endDate: start + DAY },
      { startDate: start + 3 * DAY, endDate: start + 5 * DAY },
    ]);
  });
});
