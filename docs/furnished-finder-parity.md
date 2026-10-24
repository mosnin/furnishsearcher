# Furnishsearcher delivery

## Authority and order

- User requested Furnished Finder functionality, followed by a Wander-inspired UI in Figma for refinement.
- Latest correction (2026-10-24): retain Convex. Neon migration stopped before application changes. A separate unused Neon development project exists (`twilight-feather-59590434`); it contains no application data. Do not delete or migrate anything without a new reason and appropriate authorization.
- Preserve the current UI during functional completion. No Airbnb UI styles are authorized.
- Checkout starts at `6be105d80754fd9ae970793481f0a0b5bba327ce`, branch `codex/furnished-finder-parity`.

## Primary research, 2026-10-24

- https://www.furnishedfinder.com/ — public marketplace, monthly budget, dates, Fern, favorites/sharing, owner profiles, direct messages, requests.
- https://support.furnishedfinder.com/hc/en-us/articles/35200491367579-How-Do-I-Search-For-a-Listing — updated October 21: search by location/property ID, move-in/out, flexible dates ±7/14/30 days, amenities, accessibility, map grouping and multiple units.
- https://www.furnishedfinder.com/housing-request — traveler/agency requests, move-in/out, workplace, filters, nearby cities, match preview, verified contacts and contact-sharing preferences.
- https://www.furnishedfinder.com/faq — 30-day minimum, calendar imports from Airbnb/Vrbo, landlord-controlled bookings, annual listings, no traveler booking fee, screening, direct communication.
- https://www.furnishedfinder.com/landlord-tools — screening, Rocket Lawyer documents, Baselane rent collection, protection, landlord operations.
- https://www.furnishedfinder.com/market-insights — market-level searches/demand, pricing, bedroom/type/amenity distributions. Our own data must be used; competitor statistics cannot be presented as ours.
- https://www.furnishedfinder.com/property/701266_1 — rooms/beds, fees/deposits, utilities, house rules, nearby facilities, availability, reviews, inquiry and owner profile.
- https://www.baselane.com/product-updates — current rent collection partnership.
- https://support.baselane.com/hc/en-us/articles/35743092323227-How-to-Create-Upload-and-E-Sign-Lease-Agreements-on-Baselane — new-user lease/e-sign creation sunset July 31, 2026. Do not assume this integration is available just because old promotional copy exists.

## User-supplied code reference

`kubowania/airbnb-sanity-backend`, commit `b6db1c07e840b91a1c32dd48fe80ca3e1fbae7e3`:
https://github.com/kubowania/airbnb-sanity-backend

Small Sanity schemas for property, host, traveler and reviews. Property concepts include geopoints, beds, bedrooms, galleries and host/reviews. No license declared in GitHub metadata. Inspected metadata and property schema; no code or UI copied and no skill package acquired.

## Functional acceptance ledger

`Implemented` below means source exists. Runtime and production proof are separate and must be recorded before marking parity complete.

| Requirement | Initial evidence / remaining acceptance |
| --- | --- |
| Authenticated accounts and owner onboarding | Clerk existed but Convex provider had no Clerk integration and self-owner role selection was denied. Corrected source; verify real Clerk token/issuer in deployed app. |
| Location / property-ID / workplace search | City/state existed; generic location text was ignored. Location matching added. Still need property ID, geocoded address/neighborhood/workplace proximity. |
| Budget, bedrooms, types, pets, utilities, parking, amenities/accessibility | Basic fields exist. Server filters added for utilities/parking/amenities. Complete UI, accessibility fields and exact URL/saved-search round trips remain. |
| Move-in/out and flexible search | Date was cosmetic; search now checks dates, listing minimum stay and calendar blocks. Still need editable exact date range, ±7/14/30 flexibility and paginated large-market search. |
| Accurate map and grouped units | Existing pins use city-based jitter. Need real privacy-preserving geolocation, bounds search, grouping and multi-unit navigation. |
| Listing creation, editing, publishing, photos | Existing. Verify complete owner lifecycle, moderation/verification, entitlement policy, storage authorization and persistence. |
| Listing details | Owner-set maximum occupancy is implemented in create/edit, detail display, request matching and booking-inquiry validation. Add bed/bath configurations, itemized fees/deposits, the remaining house rules, nearby facilities and accurate public location. |
| Save/share listings and saved searches | Existing. Verify account ownership, complete filter persistence, alerts and no leaked private data. |
| Booking inquiries | New dated, occupant/pet-aware inquiry; tenant withdrawal, owner acceptance/decline, paginated private inbox and transactional calendar block. Automated tests exist. Verify browser journey and deployed behavior. |
| Housing requests | Implemented persisted matching in bounded scheduled pages, deduplicated owner inbox/email jobs, match preview, owner replies into private conversations, all-state city entry, nearby cities, agency requests per traveler with individual dates, exact stays, amenities, occupancy, contact preferences and tenant close/fulfilled controls. Remaining: real provider-backed contact verification and deployed/browser acceptance. |
| Direct messages | Existing. Verify participant authorization, notifications and unread/read behavior. |
| Owner/tenant profiles | Existing. Phone verification is simulated and LinkedIn badge is user-set. Replace with provider-backed verification and trusted claims. |
| Availability | Manual blocks exist. Add calendar import/sync, sync status and booking-change lifecycle. |
| Reviews | Existing. Verify review eligibility/ownership and add any missing moderation/owner response behavior evidenced by research. |
| Reports/support | Admin reports screen is analytics, not property reports. Need persisted report submission, moderation workflow and working support submission. |
| Market insights | Existing aggregates describe supply. Need own search/demand events and city/bedroom/type/amenity breakdowns, with honest sparse-data states. |
| Listing subscription/billing | Creem source exists. Verify server-only checkout authority, webhook idempotency, entitlements, renewals/cancellation and customer portal. |
| Screening | No provider integration. Implement real provider handoff/status only with supported integration; no synthetic reports or unverified "screened" badge. |
| Leases/documents | No workflow. Add secure document lifecycle, participant access and a supported creation/signing path. Do not invent legal templates or provider availability. |
| Rent/deposit collection | No landlord rent workflow. Implement actual supported provider handoff and payment state/receipts; subscription checkout does not establish rent collection. |
| Fern-equivalent natural-language search | Missing. Need structured filter extraction, visible editable interpretation and real matching results. |
| Protection and owner resources | Research current landlord-tools items and implement supported services/handoffs with accurate states. |
| Mobile accessibility, errors and empty states | Verify complete new and existing flows; native app delivery was not explicitly requested. |
| Integration acceptance | Typecheck, meaningful backend tests, deploy to development and browser journeys. Never equate a source screen or mocked test with provider or production success. |

## Phase 2, after functional acceptance

Research Wander's actual website and interaction patterns, then create an editable Figma design covering marketplace, search/map, property details, request/contact flows and tenant/owner operations. Preserve Furnished Finder functionality; use Wander for visual direction. User refinement of the Figma artifact is part of the requested outcome. No Figma artifact exists yet.

## Verification receipt, first Convex batch

- `vitest run`: 2 files, 8 tests passed. Exercises private inquiry access, state transitions, competing acceptance conflict, calendar blocking, date boundaries, search filters, account spoof rejection and landlord onboarding.
- `tsc --noEmit`: passed.
- `next build`: passed, including `/dashboard/inquiries` and the changed property/search pages.
- These are local source/build and Convex-test results. No live Clerk session, hosted Convex push, browser journey or provider effect has been verified. Full parity remains open.
- Existing Vercel project `furnishsearcher` is accessible but returned no environment variables. The current Convex account has no project named `furnishsearcher`; the committed `convex.json` contains placeholder configuration. Recover the intended deployment or provision an isolated development deployment before a hosted verification. Do not point at another product's backend.

## Verification receipt, housing-request flow

- Source: exact move-in/out, optional same-state nearby cities, all 50 states plus DC with free city entry, agency submissions with independently dated travelers, property/amenity/budget/pet/occupancy requirements and per-request phone-sharing preference.
- Runtime behavior covered in Convex-test: paged matching beyond 40 properties; listing-change and calendar-change matching; one owner delivery per request despite multiple matching properties; transactional reply into the existing message inbox; stale-date/budget/status rejection; private request access; phone consent; atomic agency submission; owner occupancy updates; closed/fulfilled requests.
- Email jobs use Resend idempotency keys and record sent, failed or unconfigured states. Provider acceptance and failure are mocked in tests; no actual emails were sent as acceptance evidence. Missing configuration never becomes a sent state.
- Local browser smoke: `/housing-request` resolves to the real signed-out gate with sign-in/create-account links. Clerk automatically provisioned temporary keyless development settings; `.clerk/` is git-ignored. No authenticated browser submission, claim of the temporary app, or live backend deployment was performed.
- Target clarification remains pending: identify the intended Convex deployment and Clerk application before deploying there. Safe local implementation continues independently. The user's latest direction to retain Convex overrides the older Neon wording in the goal.

- Final local checks for this batch: `vitest run` passed all 19 tests across 3 files; `tsc --noEmit` passed; `next build` passed with the new tenant and owner routes. Formatting and `git diff --check` also pass.
- Refreshed remote default head remains `6be105d80754fd9ae970793481f0a0b5bba327ce`; changes remain isolated on `codex/furnished-finder-parity`.
