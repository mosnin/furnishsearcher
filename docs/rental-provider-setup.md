# Rental documents and provider setup

Convex remains the backend. This page separates the private document service from external screening, signature and rent-provider outcomes.

## Private PDFs

Set these **server-side Convex secrets**, separately for each intended deployment:

- `RENTAL_DOCUMENT_KEYRING`: a JSON object mapping key IDs to independently generated 32-byte keys encoded as 64 hexadecimal characters.
- `RENTAL_DOCUMENT_ACTIVE_KEY`: the ID to use for new encrypted files.

Generate keys using a cryptographic random generator and store them in the deployment secret manager and an appropriate secure backup. Do not put real keys in source control, public Next variables, screenshots or support messages. Keep every older key while documents referencing its ID still exist. Changing the active key changes new uploads; it does not re-encrypt or migrate existing versions. Removing a historical key makes its files unavailable until the correct key is restored.

The guarded local smoke script creates or restores the anonymous-local key configuration and writes its backup to ignored `.convex/local-document-keys.json` with mode 0600. It refuses a mismatched backup. This is local QA setup, not proof that production secrets or backups exist.

Files have a 10 MiB plaintext limit, PDF header/end-marker validation, owner-bound upload intents, a 15-minute reservation window, stable retry references and bounded document/version/hourly allowances. Each version is stored as an AES-256-GCM payload with a fresh nonce. Plaintext hashes bind the requested version to returned bytes. Public client metadata contains no storage IDs or key IDs; authenticated HTTP download actions recheck participant/version permission and return decrypted attachments with no-store headers. Public or photo URL helpers do not grant access to these files. File validation does not establish legal suitability or malware-scanning acceptance.

Drafts and each replacement version are private until explicitly shared. A later private draft does not replace the previously shared version. Revocation blocks subsequent downloads; it cannot retract copies already downloaded. Receipt acknowledgement is not a signature. Unshared drafts without receipt/signing history can be removed with their stored files. Received/signed records require a controlled support/retention process; a complete retention/purge policy remains an operating requirement.

Primary storage reference: https://docs.convex.dev/file-storage/serve-files. Direct file URLs are bearer capabilities, so this service avoids exposing them.

## Rocket Lawyer

An approved Rocket Lawyer developer app with the appropriate backend auth and RocketSign/Binder products is required. Configure:

- `ROCKET_CLIENT_ID` and `ROCKET_CLIENT_SECRET` as Convex secrets.
- `ROCKET_API_MODE`: `sandbox` or `prod`.
- `ROCKET_SIGN_UI_URL`: the provider-approved HTTPS signing page for that environment. Sandbox requires an explicit value. Production defaults to the documented `https://www.rocketlawyer.com/us/en/sign`. Query strings, existing fragments and non-provider hosts are rejected.

The configured flag proves that required settings exist, not that the vendor has approved the app or that an actual signing journey works. Start in sandbox and complete provider/UI acceptance before live usage. Sandbox output remains labeled test-only in every native file projection. Native signing currently requires an active verified paid landlord period when a new binder is needed; subscription and provider modes must correspond. Existing provider workflows retain their access after that initial entitlement check. Per-document credits, native document purchases and final vendor-cost/pricing arrangements remain open; this source does not promise unlimited included signatures.

Each stay participant must give version-specific permission, supply their own legal name, and have an identity-provider-signed verified email. Permissions expire after 24 hours before preparation. Configure the existing Clerk `convex` JWT template to carry the dynamic `email` and `email_verified` claims, while retaining the current Convex audience/issuer configuration:

```json
{
  "email": "{{user.primary_email_address}}",
  "email_verified": "{{user.email_verified}}"
}
```

Clerk shortcodes preserve the underlying boolean type. Never replace verification with a constant `true`, a user-editable profile flag or unsafe metadata. Verified email identifies an account contact; it does not certify a legal name or prove government-ID identity. Actual Clerk token/template acceptance is still required for the intended deployment. Reference: https://clerk.com/docs/guides/sessions/jwt-templates.

The owner sends the exact mutually approved PDF. The broker creates a binder with two account-bound mandatory signers, uploads the source, checks the provider's unsigned PDF against the native SHA-256, finalises, and starts invitations with provider email notifications disabled. Each participant gets only their own party-scoped signing link, with a short lifetime and a token in the fragment. The app never exposes its backend provider token. Rocket Lawyer's interface collects signatures.

Status refreshes and bounded scheduled polls validate the binder, original version, mandatory signer references, consented names/emails and environment. Only authenticated `SIGN_COMPLETED` plus a matching original PDF permits import of the provider's signed PDF into encrypted native storage. Completed versions remain immutable. Poll checkpoints reject superseded observations; preparation and poll activity are coordinated. There is no anonymous success callback granting a signature, and no user-editable "signed" checkbox.

A lost create response is retained as an uncertain outcome; it does not automatically create another binder. Recovery accepts an existing binder only after its native version/parties match. An untransferred preparation can be stopped, withdrawing that actor's permission. Once a create attempt may have reached the provider, reconcile its actual outcome first. An observed provider cancellation unlocks a new native version; local revocation does not claim to cancel a provider signature. Completed records remain available as native private PDFs even if the provider environment is later changed.

The native document workspace signs uploaded PDFs. RocketDocument template/interview creation, additional signers beyond the two stay participants, document-credit commerce, live provider operations, signed-in browser acceptance and controlled retention/purge remain separate parity/acceptance work. No legal templates are generated or bundled here.

Provider references: https://docs.rocketlawyer.net/ and https://developer.rocketlawyer.com/docs/binders-product-document-manager-sandbox/1/types/StatusOut. `docs/evidence/rocket-api-reference.json` records inspected contract paths and the public reference snapshot hash. API traffic in automated tests is mocked; no live provider transaction has been performed.

## Screening and rent collection

The resource catalog links to official TransUnion SmartMove, Rocket Lawyer and Baselane public destinations. The in-app setup instruction is not a screening order, credit-report authorization, lease signature, invoice, payment authorization or receipt of funds.

- An owner requests coordination for a real stay discussion; the traveler may acknowledge receipt. Owner completion is explicitly **owner-reported outside the app**. It never grants a verified/screened/paid badge.
- SmartMove screening orders, applicant consent and reports stay with the screening provider. Integration access requires its approved partnership. No raw credit reports, identity documents or Social Security numbers are collected by this workspace.
- Owners create real rent schedules and tenant invitations in Baselane. Bank/card data, payment execution, refunds, disputes, authoritative payment states and receipts remain there. The public documentation inspected did not establish a general-purpose Baselane API for this app. A supported approved connection is still required before automatic native tracking can be claimed.

References: https://www.mysmartmove.com/partner-with-us, https://support.furnishedfinder.com/hc/en-us/articles/46791518177435-Signing-up-for-Online-Rent-Payments-with-Baselane and https://support.furnishedfinder.com/hc/en-us/articles/46802682289819-What-are-Online-Rent-Payments-with-Baselane. The app has no asserted partnership or inherited Furnished Finder provider-account access.

## Message notification email confirmation

Set `CLERK_EMAIL_MODE` to `test` (default) or `prod`. Production refuses a development Clerk issuer. The Clerk `convex` JWT template must provide the dynamic `email` and boolean `email_verified` claims described above, plus its automatic numeric issued-at claim. Convex strips reserved `iat` from `UserIdentity`; contact confirmation therefore uses `/contacts/confirm` with the uncached token in Authorization. Convex natively verifies this exact JWT before its signed issuance is read, and internal mutations enforce the revocation fence. No caller-provided issuance time is accepted. Confirmation requires a token issued within two minutes; do not hardcode verification or timestamps. Profile email input is never a verification source.

Users opt in under Profile → Message emails. Confirm the primary email through Clerk's account management UI, then select Turn on message emails. Confirmation lasts thirty days; refresh it after an account-email change or expiry. Turning off removes the bound address and fences older tokens. Account changes outside the app do not yet have a Clerk webhook reconciliation path, so an untouched confirmation may remain usable until its expiry. This is a known production acceptance gap. Existing message notifications are off until a user confirms/opts in. The preference covers message previews only; other transactional, provider and saved-search email flows retain their separate settings/implementation.

Sending also requires backend `RESEND_API_KEY`, `EMAIL_FROM` and `NEXT_PUBLIC_APP_URL`, using resources approved for this app. A provider-accepted send is not a delivery receipt. No actual email was sent during this verification. Do not use an unrelated product's sending domain or webhook, overwrite an existing domain's MX records, or treat mere webhook signature verification as sender authentication. Only new notifications explicitly offering replies have a connected reply address; others direct users to the private inbox.

The optional onboarding welcome action uses only a signed verified account email and one atomically claimed attempt per account. Unverified/configuration-missing cases skip sending. A failed or uncertain attempt is not retried automatically. Caller-supplied recipient/name/role are retained only as a compatibility argument shape and do not control the message.

## Receiving conversation replies

This source supports Resend receiving; the intended hosted integration is not provisioned or accepted yet. Use an app-specific receiving domain or an approved Resend-managed receiving domain. Keep unrelated products' domains, webhooks and MX records unchanged. Configure only after the intended hosted Convex resource is identified:

- `MESSAGE_REPLY_DOMAIN`: lower-case receiving domain, without a mailbox, URL or wildcard. Resend must actually receive mail on it.
- `MESSAGE_REPLY_KEY`: independent cryptographically random 32-byte secret represented as 64 lower-case hex characters. Store it as a backend secret. Use separate environments and retain the key while outbound work is unresolved; rotation may change retry payloads even though previously issued reply bindings remain valid until revoked/expired.
- `RESEND_RECEIVING_WEBHOOK_SECRET`: signing secret of this app's `email.received` subscription, directed to `https://<intended-convex-site>/webhooks/resend-replies`.
- `RESEND_API_KEY`: backend key with supported received-email retrieval access as well as the required sending access. No API key or signing secret goes to the browser.

Reply-To addresses contain opaque HMAC tokens. Only their SHA-256 digest is stored in the binding table. A binding ties the original notification to its verified recipient, conversation, email revision, environment, receiving domain and confirmation expiry. Confirming a new email or refreshing/revoking confirmation invalidates older revisions, so use a recent notification afterward. Turning off message email also disables its old reply bindings.

Ingress verifies the exact raw request bytes using Svix HMAC-SHA256 and a five-minute timestamp window. Signed unrelated-domain, ambiguous or unrecognized reply addresses are ignored before provider retrieval. Accepted work is deduplicated by the provider's received-email ID and anchored to that exact binding. The worker retrieves only the fixed Resend API endpoint, requests CID HTML, rejects redirects, bounds the response and sets a timeout. It does not fetch attachment, image or raw-email URLs.

The fetched receiving-server authentication object must report DMARC pass, or DMARC gray with DKIM pass. Resend documents gray DMARC for absent/none policies and gray DKIM for nonmatching From domains; this fallback therefore still requires its matching-domain DKIM result. A sender-controlled Authentication-Results header is never accepted as evidence. The parsed single From mailbox must match the bound, still-confirmed email. Missing authentication, automated responses and malformed content are rejected.

Text and HTML replies become plain text; scripts, images and common quoted HTML are excluded. Common quoted notification markers and reply separators are removed heuristically. This is not a guarantee of perfect quote detection in every email client/language. New text must fit the existing 2,000-character message limit; oversized/empty/attachment-only replies are rejected rather than silently truncated. Attachments and inline images are not imported, and this limitation appears in notifications, accepted message provenance and private reply activity. Use the existing private stay document workspace for supported files.

The final mutation rechecks binding/revision/expiry, current participants/property ownership and blocks, then appends once with email provenance, updates inbox/unread/archive state and records acceptance atomically. It does not create a new conversation or grant a profile, signature, booking or payment authority. Lease generations fence stale workers. Temporary retrieval failures use bounded exponential retries, at most six attempts, with a five-minute recovery sweep for stuck work. Terminal retrieval failures appear in the bound account's activity; unknown reply addresses cannot have account activity. There is no automatic rejection email or real outbound side effect during tests.

Profile → Message emails → Email reply activity shows only that account's paged accepted/rejected/pending records and authorized conversation links. Accepted means saved in the private conversation, not an email delivery/read receipt. Expired token bindings are removed in bounded batches after a seven-day grace period; minimal receipt IDs remain for replay protection. A complete retention/account-deletion policy and intended-scale operations remain acceptance work.

Acceptance must use the real Clerk JWT/template and hosted webhook, a legitimately authenticated sender, forged/foreign sender rejection, duplicate/retried provider events, blocks/revocation, plain/HTML replies, overlong text, attachment warnings and multi-account/mobile UI. Current tests mock Resend and privileged local checks prove only configuration/access guards. Official contracts: https://resend.com/docs/api-reference/emails/retrieve-received-email, https://resend.com/docs/webhooks/verify-webhooks-requests, https://docs.svix.com/receiving/verifying-payloads/how-manual and https://resend.com/features/webhooks.


## Isolated hosted development environment

The app-specific `furnishsearcher-dev` Convex project now has the `cheerful-ferret-182` development deployment. Its Clerk issuer is the dedicated temporary development app `sweeping-blowfish-4800.clerk.accounts.dev`. A real provider-issued JWT has passed native Convex email confirmation and tamper/revocation rejection; see `docs/evidence/hosted-contact-auth.json`. This does not establish human sign-in, SMS, sending/receiving email, production ownership or document/billing-provider acceptance.

Only the `codex/furnished-finder-parity` Vercel preview branch has been configured with this development backend and temporary Clerk test keys. The keys stay in ignored local files and encrypted Vercel variables. Production settings were not changed. The Clerk development application is still unclaimed; an owner must claim/configure the intended production application before production release. Phone configuration remains disabled. No other product's keys or provider resources should be reused.
