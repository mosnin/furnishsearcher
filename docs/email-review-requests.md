# Review requests by account email

## Reference

Read October 26, 2026:

- [Requesting a Review From a Tenant](https://support.furnishedfinder.com/hc/en-us/articles/35194545548699-Requesting-a-Review-From-a-Tenant), updated May 27: select the property and enter a past tenant's account email. The tenant must already have an account.
- [Requesting a Review From a Landlord](https://support.furnishedfinder.com/hc/en-us/articles/45985620044699-Requesting-a-Review-From-a-Landlord), updated August 25: choose the property and enter its owner's email to request a traveler review.
- [Reviewing a Tenant](https://support.furnishedfinder.com/hc/en-us/articles/35195327461147-Reviewing-a-Tenant) and [Reviewing a Property Listing](https://support.furnishedfinder.com/hc/en-us/articles/35734424140571-Reviewing-a-Property-Listing): invitations lead to the appropriate review form; moderation applies.

The app previously supported only invitations tied to an accepted inquiry. The new My reviews section supports both directions by verified existing account email without importing or creating an app booking/conversation. The profile Reviews tab already links to this complete management screen. Existing stay-based requests remain available.

## Authority and private context

The sender supplies the property number/native listing ID and exact account email. A landlord selects from all owned properties with native pagination; a traveler enters the property reference. One participant must be the property's current native owner. Property ownership and review direction come from server data, never client role assertions. Both accounts must be active and pass current messaging/contact-hold checks.

Lookup uses an indexed hash of a primary email confirmed by a signed Clerk event for the configured instance/mode. It never matches arbitrary editable `users.email`. Missing, ambiguous, uncertain, deleted or wrong-instance/mode bindings are unavailable. The sender also needs its current verified sign-in email to match its signed account snapshot. Existing accounts without a trusted contact snapshot must refresh their provider account or obtain support; the implementation does not fabricate legacy proof. Failure gives one generic response, without returning a matching identity or mailing an unregistered address.

Each request is assigned to a particular recipient account, property, owner, review kind, subject and email binding. Only that recipient may open the protected request context and review form. The sender cannot use its own sent link as the recipient. The context contains a first-name label and property title; it omits email, phone, street address and general traveler-profile access. Sent history shows the email its sender entered; received history does not expose the sender's contact email. Incoming/outgoing histories and property choices are indexed and cursor-paged. Malformed request links return an unavailable state.

New reviews must still provide first-hand confirmation, valid dates, private phone and off-platform stay context. They become pending, count toward no public rating and require staff authenticity/content review. An invitation does not confer a confirmed/verified stay, paid access, ID approval, public listing or general private-account access. Its first submission atomically records the canonical review ID so the invitation cannot produce another review. Existing author resubmissions retain their normal revision/moderation rights after a request closes; closure does not erase a submitted review.

## Limits, lifecycle and delivery

Stable sender/request references deduplicate retries and reject changed payloads. Pair/property requests deduplicate for three days. Native limits allow ten lookup/request attempts per sender per UTC day, including unavailable lookups, and five requests per recipient per day across senders. Existing reviews suppress redundant invitations.

Requests expire after thirty days through a scheduled native mutation and current-time checks. Senders may revoke and recipients may decline. Closure, expiry, blocks, contact changes, account deletion and property-owner changes are rechecked before opening a form, creating a review and transferring email. Previously sent emails and submitted reviews are not claimed erased. A transfer already in flight cannot be unsent. History remains private and retained.

The scheduled email outbox reports pending, unconfigured, failed or accepted-by-provider states. It uses one stable Resend idempotency key per request. Only the sender may retry eligible failures, with a one-minute cooldown; accepted delivery is not resent. Missing `RESEND_API_KEY`, `EMAIL_FROM` or `NEXT_PUBLIC_APP_URL` does not become sent. Email bodies contain no private stay evidence, street address or review text, only a fixed review-request explanation and a private sign-in link. Email opens cannot claim an invitation for another account. No new-account invitation/registration relay, reminder campaign or real mailbox acceptance is claimed.

## Verification

Fourteen source cases cover both directions without app bookings; canonical retries; signed-contact authority versus forged editable email; ambiguous/unverified/wrong-instance bindings; sender and global recipient limits; private complete paging; exact-recipient context; pending moderation; no profile/stay/public grant; resubmission after closure; block, changed-email, deletion, expiry, revocation and decline fences; and mocked email failure, retry, stable identity and provider acceptance.

Hosted development acceptance uses the dedicated actual Clerk owner and one new disposable reserved traveler with signed provider contact events, one unpublished rental and no imported inquiry/conversation/contact authority. The separate native and browser receipts record persisted requests, exact recipient forms, wrong-account/anonymous denial, truthful unconfigured scheduled mail, browser draft open/edit/cancel, native closure and guarded cleanup. It does not send email to a real person, accept a first-hand browser attestation, create an actual stay or publish a review. Full real mailbox delivery, authenticity investigation and staff/browser review submission remain separate acceptance work.
