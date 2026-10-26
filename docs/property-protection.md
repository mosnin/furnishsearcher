# Property protection

Convex remains the backend. Insurance and damage protection are separate provider products. Neither publication, payment for app access nor an estimate grants coverage.

## Current provider research

Furnished Finder's current landlord tools include Steadily landlord insurance quotes and RentalGuardian damage protection. The old Waivo help articles apply to plans purchased before May 1, 2026. RentalGuardian's API requires partner onboarding; this app has no inherited Furnished Finder partnership, plan catalogue, prices or claims authority.

- https://www.furnishedfinder.com/landlord-tools
- https://support.furnishedfinder.com/hc/en-us/articles/50274853986587-What-is-the-Damage-Protection-Plan
- https://support.furnishedfinder.com/hc/en-us/articles/51850326931739-Changing-or-Extending-a-Damage-Protection-Plan
- https://www.rentalguardian.com/partners/

The official Steadily Partner API documents `POST https://api.steadily.com/v1/quote/estimate`, `X-Steadily-ApiKey` header authentication, `properties[].property_id` and `address`, and a matching `estimates[].start_url`. The ordinary estimate endpoint accepts address-only property details; the distinct instant-estimate endpoint requires county, coordinates, size and year. This implementation uses the ordinary estimate endpoint and never invents missing building details. Source: https://api.steadily.com/estimate-api/redoc and its directly referenced https://api.steadily.com/estimate-api/openapi.json (version `1.0-4d4c18a`, inspected 2026-10-26 UTC).

## Implemented boundary

Rental Tools shows property protection only for owners. The private property selector uses indexed, capped 20-item pages, including unpublished properties. An owner reviews the address and explicitly agrees to send it to Steadily. Canonical address binding survives Convex object-key serialization and invalidates consent/results when the selected address changes. No traveler details, user email/phone, building guesses, credit information or contact referral are included.

Native functions require the active native landlord and current property ownership, repeat the reviewed-address check while atomically claiming a request, and recheck ownership/address after the provider returns. Client calls cannot select an API origin, key, owner or recipient. A fixed HTTPS endpoint, header-only key, redirect refusal, 20-second timeout and 128 KiB streamed response limit constrain the request. Matching property identity and a credential-free HTTPS `steadily.com` or subdomain continuation link are required. Provider responses/errors and continuation URLs are not retained in the app database or logged by this flow. No premiums are displayed because this handoff does not establish the final quoted product, terms or purchase.

A minimal private per-owner/global counter limits attempts to three per owner per UTC day, 100 globally, and at least two minutes between owner attempts. Duplicate current request IDs are rejected. Failed/uncertain requests consume an attempt and never auto-retry; this is bounded attempt control, not a claim of provider exactly-once creation. Owners must check Steadily before manually retrying an uncertain request. A property/account changed during an in-flight call cannot unsend data already received by the provider; it prevents delivering the continuation link afterward.

## Configuration and remaining acceptance

Set server-only `STEADILY_API_KEY` from this app's approved partner account and `STEADILY_ENABLED=1` only after confirming the provider's integration terms and testing the intended environment. No arbitrary API-origin override or fabricated sandbox mode is supported. The app does not provision a partner account or send an onboarding message. Current local and hosted development remain unavailable; no live insurance estimate has been requested. The UI explains this state and offers the public Steadily website.

RentalGuardian is an external resource only. Purchase, plans, coverage dates, extensions, cancellations, billing, claim evidence and adjudication require an approved provider integration and acceptance. The app does not copy Furnished Finder's plan prices/refund terms, sell a plan, mark a lease eligible or claim damage coverage. Its provider account remains the place for an existing plan.

Unit tests use synthetic responses for access, consent/address binding, response limits, continuation origin/property matching, no-auto-retry, cooldown, daily caps and mutation during a request. Development readiness probes use native APIs with no fixture writes and verify the disabled-provider guard. Real approved-provider end-to-end quote/policy and damage-protection acceptance remain open; this is not full Furnished Finder provider parity.
