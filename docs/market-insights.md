# Market insights operating contract

The public report separates eligible listing supply from this app's recorded demand. It does not reuse Furnished Finder's traffic or certify unique travelers, achieved rent, occupancy, conversion or booking outcomes. Test environments visibly label synthetic data.

## Supply

`marketSupply.refresh` starts a private run. Thirty-record continuations check `publiclyVisible` and valid US city/state data before including independently rentable listing/unit records. Sums retain integer cents; averages are rounded to the cent. Standard property types, bedrooms and amenities have bounded categories. Invalid locations and ineligible records are excluded. Country owner/city counts are maintained while scanning.

Only a complete run becomes public. Reads keep the previous completed run while another is building. Eligibility is observed while each page is processed, rather than at one globally atomic instant; the UI exposes start and completion times. A snapshot does not establish date-specific availability. Public reads do not scan source listings. City ranking reads at most twenty-one aggregate rows to return twenty cities, pairing each city with its state.

Daily refresh and fifteen-minute cold/stalled-run recovery are scheduled. A collector with no progress for thirty minutes can be replaced; its run ID/cursor cannot append to the replacement. To initialize after deployment, invoke internal `marketSupply:refresh` against the intended app deployment. Do not accidentally select an unrelated saved deployment. Retired runs older than seven days are removed in bounded batches; each environment's current and building runs remain protected.

## Demand

The browser reports a coarse projection after the first search page settles for 1.5 seconds. It sends city/state and finite preference bands, never raw search text, exact reference locations, listing IDs or exact stay dates. Its random page-session reference exists only in module memory; reloads create new references, and multiple references may belong to the same person. No cookie/local-storage analytics identifier or third-party analytics SDK was added. DNT/GPC suppress browser observation. A failed observation does not interrupt search.

The mutation validates allowed categories, canonicalizes city/state and deduplicates the same coarse profile per page-session/day. At most twenty profiles per reference/day are accepted. Sorting, result reactivity, pagination or map movement without a different coarse projection do not add another observation. These are client-reported preferences; bots, duplicate visits and deliberate false reports remain possible. Do not label them verified people, all site searches or the entire rental market.

Inquiries, first traveler-created conversations and housing requests write demand in the same server transaction as the real native operation. First-message retries and invalid inquiries cannot inflate those counters. Owner-initiated outreach and later replies are excluded from the first-traveler-conversation metric. Housing requests use stated budgets; inquiry/conversation bins use the targeted listing's rent/type, rather than inventing a renter budget. Native request counts do not mean confirmed stays. Metrics overlap and must not be summed into a people or conversion total.

Reports cover the last thirty UTC calendar days including today, as of the query's recorded through time. Collection starts when the feature is enabled; no prior demand is inferred. Daily aggregates are read through bounded scope/kind/day indexes. A category remains hidden below ten distinct contributing account/page-session references in that window. Stored contributor hashes and source content are private; only coarse aggregate buckets are public. Multiple type/amenity selections can sum above the number of searches. Missing filters stay explicit. Professions are not inferred; optional self-reported traveler segmentation remains future work.

The namespace follows the app's recognized billing environment, defaulting safely to test when billing is unconfigured. This keeps native request creation working without payment configuration. Test/prod supply pointers, demand scopes, contributor hashes and search deduplication are separated. A billing mode switch does not promote prior test traffic into production statistics.

Coarse daily data and inactive contributor days older than forty-five days are eligible for bounded scheduled cleanup. Deduplication rows are eligible when their recorded day is older than two days. Full batches schedule continuations. This is neither a formal differential-privacy guarantee nor a complete retention policy for separate account/message/request records.

## Owner statistics and limits

The compatibility owner endpoints require that account or staff. Views are existing stored counters, conversation totals count threads, and saves count current favorites; neither visits nor saves are dated event histories. Their reads use listing indexes for saves/conversations instead of a whole-platform save scan. The current private compatibility endpoints still collect that owner's histories and need pagination/maintained counters at scale. The UI removed fabricated daily-series noise and exposes real totals and per-property selection. Actual 7/30/90-day impression/view/share events, long-history owner performance and its acceptance remain open.

## Verification

Run `node scripts/local-market-smoke.mjs` only with the existing guarded anonymous loopback fixture. It refuses a non-synthetic billing configuration or active email key. It creates ten clearly synthetic search profiles in a unique QA city, validates cohort/dedup/access behavior, starts actual snapshot collection, and compares its count/cent average with every page of real local public search. Those test observations remain until normal expiry in the test namespace. No real travelers or provider effects are involved.

Unit tests cover boundary/privacy/authority cases and native event transactions. The local receipt is `docs/evidence/local-market-smoke.json`. Actual Clerk tokens, browser observation/GPC behavior, rendered market/property selection, accessibility/mobile review, hosted collection and intended traffic/query cost remain acceptance work. Source and guarded SDK checks alone do not establish production readiness.
