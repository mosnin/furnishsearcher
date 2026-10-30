import { describe, expect, it } from "vitest";
import {
  localPreviewEnabled,
  localPreviewRequestAllowed,
} from "../lib/local-preview";

const env = {
  NODE_ENV: "development",
  LOCAL_PREVIEW_ENABLED: "1",
  LOCAL_PREVIEW_ORIGIN: "http://127.0.0.1:3006",
  LOCAL_PREVIEW_USER_ID: "user_reserved",
  NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
};
const headers = () =>
  new Headers({
    host: "127.0.0.1:3006",
    origin: "http://127.0.0.1:3006",
    "sec-fetch-site": "same-origin",
  });
describe("local preview entry boundary", () => {
  it("requires explicit development mode, a test key, reserved account selector and loopback frontend/backend", () => {
    expect(localPreviewEnabled(env)).toBe(true);
    for (const overrides of [
      { NODE_ENV: "production" },
      { NODE_ENV: "test" },
      { LOCAL_PREVIEW_ENABLED: "0" },
      { LOCAL_PREVIEW_ORIGIN: "http://example.com:3006" },
      { LOCAL_PREVIEW_ORIGIN: "http://127.0.0.1:3006/path" },
      { NEXT_PUBLIC_CONVEX_URL: "https://example.convex.cloud" },
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_fixture" },
      { LOCAL_PREVIEW_USER_ID: "" },
    ])
      expect(localPreviewEnabled({ ...env, ...overrides })).toBe(false);
  });
  it("rejects cross-origin, forwarded and mismatched-host ticket requests", () => {
    expect(localPreviewRequestAllowed(env, headers())).toBe(true);
    for (const [name, value] of [
      ["origin", "https://attacker.example"],
      ["host", "example.com:3006"],
      ["x-forwarded-host", "attacker.example"],
      ["sec-fetch-site", "cross-site"],
    ]) {
      const h = headers();
      h.set(name, value);
      expect(localPreviewRequestAllowed(env, h)).toBe(false);
    }
    const h = headers();
    h.delete("origin");
    expect(localPreviewRequestAllowed(env, h)).toBe(false);
    expect(
      localPreviewRequestAllowed({ ...env, NODE_ENV: "production" }, headers()),
    ).toBe(false);
  });
});
