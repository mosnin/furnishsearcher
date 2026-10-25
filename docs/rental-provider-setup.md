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
