import { describe, it, expect } from "vitest";
import { DAY, isAvailable, searchDateRange, validateStay } from "../lib/stays";

describe("monthly stay dates", () => {
  it("resolves relative dates without stale hardcoded months", () => {
    expect(searchDateRange("next-month", new Date("2026-12-28T12:00:00Z"))).toEqual({ moveIn: Date.UTC(2027, 0, 1), moveOut: Date.UTC(2027, 0, 31) });
    expect(searchDateRange("flexible")).toEqual({});
  });
  it("rejects invalid, reversed, non-midnight and short dates", () => {
    for (const [a, b] of [[NaN, DAY], [DAY, 0], [1, 31 * DAY], [0, 29 * DAY]]) expect(() => validateStay(a, b)).toThrow();
  });
  it("honors minimum stays and exclusive checkout boundaries", () => {
    expect(isAvailable({ availableFrom: 0, minStay: 2 }, [], 0, 30 * DAY)).toBe(false);
    expect(isAvailable({ availableFrom: 0, minStay: 1 }, [{ startDate: 30 * DAY, endDate: 60 * DAY }], 0, 30 * DAY)).toBe(true);
  });
});
