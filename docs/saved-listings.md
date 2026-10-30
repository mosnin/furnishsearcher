# Favorites and listing sharing

Research checked October 25, 2026: Furnished Finder's [favorites guide](https://support.furnishedfinder.com/hc/en-us/articles/39332714835483-How-to-Favorite-Properties) supports saving from search/property photos and confirming removal. Its [request-match guide](https://support.furnishedfinder.com/hc/en-us/articles/35422331656475-Viewing-Your-Housing-Request-Matches) also points travelers toward favorites. No collection-sharing, notes or comparison engine is invented from these references.

## Saved behavior

Native save requires the caller's own account and a currently public, qualified listing. Repeated/concurrent requests return the existing favorite and do not double-count save activity. Unsave is owner-bound and idempotent, including while a listing is hidden or missing. Deleted sign-in accounts cannot use saved-data APIs.

`saved.mine` pages the caller's complete collection by indexed saved time. It preserves unavailable entries with `listing: null`, allowing removal without exposing the current unpublished title, photos, address or other owner details. When the listing becomes public again its current card returns. Public cards are a whitelist of display fields; exact addresses and publication/moderation internals are excluded. The old `getSaved` export remains a compatibility preview of visible entries among the ten most recent saves. Current full management uses `mine`.

The dashboard uses a three-entry preview and an indexed count capped at one hundred, displayed as `100+` when more exist. This is an explicit lower bound, rather than an unbounded scan or a partial count labeled as the total. The management page displays how many entries are loaded, keeps unavailable entries removable, and reaches remaining pages through Load more. It handles sign-in/profile/loading/empty states. Both traveler and landlord navigation reach saved listings/searches without changing the account's role.

Search hearts, the property Save button and the management Remove button use the same removal dialog. Keep saved closes it without a write. Pending writes disable repeated clicks. New saves remain deliberate user actions; sign-in/onboarding does not silently create favorites. Existing component styles and colors are preserved.

## Sharing

The property Share button opens a dialog with the current listing link, a read-only fully selectable field, Copy link and supported native app sharing. The explanation makes visibility conditional on the listing being public. Clipboard errors leave the manual-copy field available and show instructions. Native cancellation is quiet; other failures suggest copying. A share observation is requested only after a reported successful copy/share operation; manually selecting a URL is not fabricated as delivery. Opening a dialog neither sends a message nor changes publication.

## Evidence and limits

- Eight native test cases: 130-entry exhaustive paging, saved-time ordering, public-card projection, unavailable/removed history, private boundaries, deleted identities, 100+ summaries, bounded compatibility previews, unavailable save denial and concurrent save/unsave deduplication. Full suite: 367 tests / 35 files; TypeScript and Next production build pass.
- Twenty-fourth guarded local native flow: real public save against explicitly synthetic local identity/payment/staff publication prerequisites, hide/restore, current card, unrelated-account denial, unavailable removal and retry. The new fixture is removed afterward. Receipt: `docs/evidence/local-favorites-smoke.json`. This is privileged local development authentication, not real paid/ID provider acceptance.
- Hosted reads/removal use an actual reserved Clerk development JWT. Twenty private, unpublished rentals are paired with explicitly privileged synthetic *historical* favorite records, because a currently private rental cannot be newly saved through the normal API. No cloud publication/paid/identity exception is created. Paged reads expose only unavailable placeholders and deny anonymous access. A native removal succeeds. Receipt: `docs/evidence/hosted-favorites-native.json`.
- Hosted browser acceptance records page loading, confirmation/cancellation, reactive native removal, mobile fit and sharing separately in `docs/evidence/hosted-favorites-browser.json`. It does not claim an actual hosted public save or final browser removal submission from those historical fixtures. Native sharing delivery, true public hosted save, unsupported-platform clipboard behavior and the wider integrated marketplace remain separate acceptance work.

Convex remains the backend. No real email/SMS, real recipient sharing, production settings or customer favorites were changed. Figma remains the ordered second phase.
