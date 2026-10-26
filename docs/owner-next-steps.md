# Owner next steps

The private owner dashboard now derives actionable cards from current account and publication state. The primary reference is Furnished Finder's current “What's Next” panel: https://support.furnishedfinder.com/hc/en-us/articles/50367312568987-Using-the-What-s-Next-Panel-in-the-Landlord-Dashboard (inspected 2026-10-26 UTC). It describes personalized account/listing cards, a renewal warning within 35 days, missing content, identity, profile and hidden-listing actions. Existing app components and colors are preserved; no reference styling is copied.

## Native authority

Both queries require the active native landlord, resolve the account from authentication and accept no owner argument. Account cards use the same trusted identity and current paid owner access predicates as publication. An active-looking subscription with an expired paid period, wrong environment, billing hold or no verification cannot clear the access task. Upcoming dates use the earlier of verified paid-through and current period end, never a promised renewal; scheduled cancellation receives separate wording. Server time is authoritative. The client's minute refresh parameter invalidates the time-dependent account read and cannot select the date.

The account also offers a first listing when none exists, and an explicitly optional introduction when the saved biography is blank. The latter never blocks publication. Terms acceptance and SMS notifications are not invented as completed or pending products. The app has no configured SMS notification channel or new terms version requiring these tasks.

Property tasks page through the owner's actual listings using its owner index, capped at ten candidates per query. All live eligible rentals are excluded. A page may contain no tasks while further candidates remain, and the UI offers Check more properties; only an exhausted traversal with no account/property tasks says none remain. Priorities order loaded cards without claiming a global ordering of unseen properties.

Publication readiness is reused directly. Missing content directs to the exact editor, mismatched shared property addresses to unit management, rejected revisions to editing, moderation holds to support, pending/stale approvals to listing management, and eligible hidden rentals to the normal publish controls. Cards retain all current publication issues. They do not grant identity/paid/approval state, hide issues, publish automatically, change optional preferences or create duplicate task records. Saved changes update the native queries. Account expiry dates refresh every minute while the page is open; property eligibility also follows native subscription/publication reconciliation and its saved state changes.

## Acceptance and remaining scope

Eight new synthetic tests cover private ownership/offboarding, optional profile and first-listing resolution through native mutations, actual hide/publish transitions under separately labeled synthetic paid/identity prerequisites, missing/rejected/held/stale revisions, complete 31-property traversal with empty candidate pages, the 35-day boundary, cancellation/expiry, untrusted client time and wrong-environment/held providers. These are not real payment or ID verification results.

The local native probe traverses all task pages and verifies private account/access guards without writes. Hosted acceptance uses the actual reserved Clerk owner, creates only a new private incomplete QA listing with two synthetic pixel uploads, follows the task to the editor, saves its description in the browser and checks that native storage and the revised task agree. Cleanup removes only its own listing using the guarded native API; photos retain the normal seven-day recovery period. No fake cloud payment or identity grants, provider requests, real-person messages or production changes are part of this workflow.

Real provider, public publication, larger operating-scale and full Phase 1 acceptance remain separate requirements. Convex remains the backend. Figma follows functionality acceptance.
