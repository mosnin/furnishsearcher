import { CalendarImportError } from "./errors";
export type CalendarProvider = "airbnb" | "vrbo";

const hosts: Record<CalendarProvider, ReadonlySet<string>> = {
  airbnb: new Set(["airbnb.com", "www.airbnb.com"]),
  vrbo: new Set([
    "vrbo.com",
    "www.vrbo.com",
    "homeaway.com",
    "www.homeaway.com",
    "ical.homeaway.com",
  ]),
};

export function calendarLink(
  value: string,
  provider: CalendarProvider,
): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new CalendarImportError("Paste a valid calendar export URL.");
  }
  if (
    value.length > 4096 ||
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    url.hash ||
    !hosts[provider].has(url.hostname)
  ) {
    throw new CalendarImportError(
      `Use a private HTTPS calendar export link from ${provider === "airbnb" ? "Airbnb" : "Vrbo"}.`,
    );
  }
  if (!/\.ics$/i.test(url.pathname))
    throw new CalendarImportError(
      "Use the calendar export link ending in .ics, rather than the property page.",
    );
  return url.toString();
}
