import { CalendarImportError } from "./errors";
import { calendarLink, type CalendarProvider } from "./links";
import { MAX_CALENDAR_BYTES } from "./limits";

export async function fetchCalendar(link: string, provider: CalendarProvider) {
  let url = calendarLink(link, provider);
  const signal = AbortSignal.timeout(10000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, {
      redirect: "manual",
      signal,
      cache: "no-store",
      headers: {
        Accept: "text/calendar, application/octet-stream;q=0.8",
        "User-Agent": "Furnishsearcher/1.0 calendar sync",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const target = response.headers.get("location");
      await response.body?.cancel();
      if (!target || redirects === 3)
        throw new CalendarImportError(
          "The calendar provider returned an invalid redirect.",
        );
      url = calendarLink(new URL(target, url).toString(), provider);
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new CalendarImportError(
        "The calendar provider could not return this export. Check the link and retry.",
      );
    }
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_CALENDAR_BYTES) {
      await response.body.cancel();
      throw new CalendarImportError("Calendar export is too large.");
    }
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_CALENDAR_BYTES)
          throw new CalendarImportError("Calendar export is too large.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const all = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(all);
  }
  throw new CalendarImportError(
    "The calendar provider returned too many redirects.",
  );
}
