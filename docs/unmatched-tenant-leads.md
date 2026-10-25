# Unmatched tenant leads

Primary research checked 2026-10-25:
- https://support.furnishedfinder.com/hc/en-us/articles/51343862893083-Tips-on-Responding-to-Booking-Inquiries-and-Tenant-Leads
- https://support.furnishedfinder.com/hc/en-us/articles/35655669699611-Responding-to-Tenant-Leads
- https://support.furnishedfinder.com/hc/en-us/articles/47737008712859-Managing-Tenant-Lead-Notifications
- https://support.furnishedfinder.com/hc/en-us/articles/51333339240347-What-Information-is-Included-in-a-Tenant-Lead

## Delivery and sharing

New owners start with matched-only lead intake and no lead email notifications. The owner Tenant Housing Requests page has separate controls for unmatched intake and lead email. These are owner-wide settings; property-specific email/text/app channel settings are not implemented by this batch.

The existing traveler form promised to share requests only with matching owners. Existing and legacy requests retain that scope. A new, optional, off-by-default traveler choice allows alternative offers; the request persists `allowUnmatched` and the sharing disclosure changes accordingly. Owner opt-in alone cannot expand a traveler's sharing choice. Agencies use that explicit selection for each request created in the submission. The exact-match preview remains exact and does not promise that all alternative offers are counted there. Travelers stop new sharing by closing their request or marking housing found.

A partial match requires a currently approved, paid, visible rental space in the request's selected city/state or named nearby cities, with compatible start date, minimum stay, imported-calendar coverage and no conflicting calendar interval. Date conflicts are excluded rather than highlighted as negotiable. Optional differences include budget, bedrooms, pets, property type, included utilities/parking, missing amenities and requested occupants versus listed capacity. Showing a difference never changes capacity or creates an accepted stay. Normal inquiry/booking validation continues to apply.

Owner opt-in starts bounded scheduled scanning of current active spaces and open requests. Native request/listing changes continue to trigger matching. Scan transactions page thirty owner spaces or forty requests/listings; private inbox and per-request property results cap each page at twenty-five. One owner delivery deduplicates multiple spaces, while property candidates retain their own current comparison and conversation. Empty filtered pages explicitly allow loading further pages. Larger property-group lead consolidation and continuous recovery/scale acceptance remain separate work.

## Replies and contact privacy

A request card labels its classification when delivered. Opening it rechecks each delivered candidate's current publication, dates and criteria; it displays requested versus listed terms for each difference. The owner can reply to a partially matching request only while both intake and traveler alternative permission remain enabled, after explicitly acknowledging the current differences. The server compares the exact criteria snapshot returned to the form; changed differences require another review. These snapshots are compared, not trusted as authorization.

The first alternative reply includes a clear non-confirmation notice and the differing categories. A 1–1700-character owner message leaves space within the existing native message limit. Matching replies retain the 2000-character limit. Source authorization, blocks and eligibility are checked again in the mutation. The candidate stores the conversation atomically, so concurrent first replies create one message and return one conversation. A reply does not create a booking, override rental rules or accept new terms. Existing conversations remain in the normal private inbox independently of the lead list.

Unmatched-only deliveries never return a traveler phone number. If that same owner later receives an actual exact match, the delivery can become matched and the existing request-specific phone choice, exact phone revision and current proof apply. Previously matched owners retain the existing phone-access semantics until the request closes or the traveler changes/revokes/loses phone confirmation. Profile accounts and arbitrary caller-supplied phone fields never establish consent. Blocks suppress details/replies. Closed, fulfilled and past-move-in requests leave the owner's active lead list.

Matched-history timestamps retain existing records' meaning; converting a legacy exact match to partial and back cannot add another original matched-lead event. New unmatched history is saved separately on the candidate. The dated performance report now counts a new first partial request/rental-space pair with separate collection coverage; legacy candidates are not reconstructed into history. See docs/listing-performance.md.

## Notifications and evidence

Lead email is a separate explicit preference. Delivery uses the current, mode-matched, provider-confirmed account notification address, not the editable profile email. Disabling email, expired confirmation, blocks, withdrawn requests or disabled unmatched intake suppress queued work at send-time lookup. No preference enables email merely by enabling unmatched intake. Email acceptance, failure, missing configuration and suppression remain distinct; a notification links to the private dashboard and contains no traveler contact details. Real email delivery and owner account-change provider reconciliation remain unaccepted.

Eight new cases cover default owner and traveler choices, proof-bound recipients, exact-only legacy sharing, scheduled backfill, requested/listed differences, phone privacy, opt-out, date/calendar hard exclusions, current-difference acknowledgement, native retry deduplication, authorization, closed/fulfilled/past requests, legacy match transitions and complete 55-request pagination. Existing phone/messaging cases continue to pass. The nineteenth guarded native local smoke uses reserved synthetic accounts and the existing isolated local publication fixtures. It verifies scheduler-driven intake, traveler permission, current differences, no phone exposure, anonymous/foreign denial, stale acknowledgement denial and one private proposal visible to the synthetic traveler; it closes the requests, hides its listing and restores owner preferences afterward. No real email, SMS, call, paid transaction or human/provider acceptance is implied. Receipt: docs/evidence/local-unmatched-leads-smoke.json.

Remaining work includes actual multi-account hosted UI proposals, real notification acceptance, per-property channel settings, optional lead removal, property-group relevance/consolidation, nonzero hosted unmatched-report acceptance and whole-product acceptance. This feature does not complete Furnished Finder parity or start the ordered Wander/Figma phase.
