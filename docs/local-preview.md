# Local dashboard preview

Start from this application's directory with `npm run dev:preview` (or run `node scripts/local-preview.mjs` with Node 24 on PATH).

Open **http://localhost:3006/local-preview**. The page automatically signs into the existing reserved Clerk development QA account with a short-lived, single-use sign-in ticket, then opens the real dashboard. No email/password/OTP form is required. Existing different accounts are left intact; use a private browser window in that case.

The launcher starts the existing anonymous local Convex database on 127.0.0.1:3210/3211 and Next development on localhost:3006. It checks the exact development Clerk instance, reserved QA account and disabled local email delivery. It creates a separate native local owner profile when missing, then idempotently creates two labelled private draft rentals. No public listing, paid access, identity approval or booking is fabricated. It uses the existing ignored keyless credentials and QA session file; none are committed. There are Clerk development authentication API calls, so internet access is still required.

The login shortcut is opt-in per launcher process. Its page requires development mode, an explicit flag, test publishable key, configured QA user and loopback frontend/backend. Its ticket endpoint additionally requires exact Host and same Origin and rejects cross-site/foreign forwarded-host requests. It cannot select a user from request input and validates the fixed account's reserved external ID and test address. Production mode disables both routes even if the flag is set. Existing Clerk middleware, Convex token verification and backend authorization remain unchanged.

The launcher uses webpack for this local preview because Turbopack's CSS worker failed to spawn in this runtime. It adds the current Node executable's directory to child PATH. Stop the launcher with Ctrl-C; it closes Next and a Convex process it started. Existing externally started local Convex processes are reused and left running.

This is the existing application UI. Company OS/Base UI/Chippi dashboard migration is planned separately in dashboard-ui-migration-plan.md.

Verified October 29, 2026: automatic browser entry reaches the real landlord dashboard; reload preserves the session, and My Listings shows both labelled local drafts. Same-origin ticket requests return 200; cross-origin and missing-origin requests return 404. An actual production build/server returns 404 for both preview routes even with the opt-in flag set. All 500 tests / 46 files, TypeScript and production build pass. Local app remains running; no cloud deployment or PR push was performed for this preview change.
