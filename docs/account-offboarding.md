# Deleted sign-in accounts

Research checked October 25, 2026: [Clerk documents deletion events and retained deletion markers](https://clerk.com/docs/guides/development/webhooks/syncing). [Furnished Finder subscription cancellation](https://support.furnishedfinder.com/hc/en-us/articles/35772181538459-Cancelling-Your-Subscription) is a separate auto-renew operation; this batch does not invent financial closure from sign-in deletion.

An accepted, signed Clerk `user.deleted` event now removes native app access. The permanent subject tombstone and retained user's `clerkDeletedAt` marker are checked by shared account lookups, including legacy profile, saved-item, availability, inbox, listing, referral, performance and payment-resolution endpoints. The subject cannot recreate a profile, including if deletion arrived before onboarding. A deleted staff account loses native privileges too. Internal financial reconciliation can still resolve retained records.

Public listing eligibility, public profiles and phone disclosure fail closed immediately after the native deletion transaction. Paged maintenance deactivates the owner's rental spaces and closes open housing requests. Existing fulfilled requests remain historical. Daily paged reconciliation repairs old contact-only deletion tombstones and incomplete cleanup; duplicate provider events do not reactivate the account. No public paid/identity exception is added.

An active participant can still read existing conversations, accepted stays and their permitted documents. Conversation summaries label the removed counterpart `Account removed`; new contact, proposals and queued signing setup are denied. Native contact confirmation and phone-sharing consent are revoked. Email recipients and legacy listing notification jobs are checked again before dispatch. Events remain asynchronous: these guarantees start when Convex accepts the signed event, not before provider delivery.

This is access offboarding. Messages, rental records, accepted reservations, legal documents and financial records are retained. It does not cancel/refund subscriptions or stays, erase personal data, revoke already-created external signing links, recall in-flight provider requests or define a production retention policy. Those operations need explicit product policy and provider acceptance. No custom account-deletion UI was introduced in this batch.

## Evidence

- `tests/account-offboarding.test.ts`: eight lifecycle cases, including unexpired retained identities, historical access for the surviving participant, pre-onboarding tombstones, deleted staff, 31-request and 27-listing pagination, duplicate/out-of-order repair and unchanged subscriptions/stays. Publication fixtures use explicitly synthetic privileged payment/identity setup.
- Full suite: 351 tests / 33 files; TypeScript and Next production build pass. Existing guarded local signed-contact HTTP regression passes with real delivery disabled.
- `scripts/hosted-account-offboarding-smoke.mjs`: only a newly created reserved Clerk development account may be deleted. It verifies the actual development instance and absent Resend key, uses actual Clerk sessions/JWTs and the existing signed endpoint, then checks native denial before JWT expiration and retained records through private CLI reads. It never deletes the shared browser QA account, publishes a cloud rental or fabricates identity/payment entitlement. Safe results are saved separately from private fixture identifiers in `docs/evidence/hosted-account-offboarding.json`.

Convex remains the backend. Production resources are unchanged.
