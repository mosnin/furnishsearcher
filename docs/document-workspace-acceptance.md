# Private document workspace acceptance

Convex remains the backend. Current primary references for Furnished Finder's document capabilities were inspected on 2026-10-26 UTC:

- https://support.furnishedfinder.com/hc/en-us/articles/34809018173723-What-is-the-Leases-Legal-Docs-Service
- https://support.furnishedfinder.com/hc/en-us/articles/42065937682971-Creating-a-Document
- https://support.furnishedfinder.com/hc/en-us/articles/40863240404891-Signing-and-Sending-a-Document
- https://support.furnishedfinder.com/hc/en-us/articles/40863248962715-How-Do-I-Edit-a-Lease-or-Legal-Document

Its provider workflow includes legal templates, review, signing and access to completed documents. Our uploaded PDF workspace is a separate native capability. It does not grant access to the competitor's templates, credits or signing partnership. Rocket Lawyer approval/credentials, legal-template interviews and actual signer acceptance remain required for that integration.

## Hosted encryption configuration

The dedicated `cheerful-ferret-182` development deployment initially reported `privateFiles:false`. Its document keyring and active key were absent, and the native versions table was empty. `scripts/setup-hosted-document-storage.mjs` configures a fresh independent development keyring only after those checks, writes an exclusive private backup outside the repository with mode 0600, verifies readback without printing key material, confirms native capability and preserves the local selector. Existing keys are validated and preserved. Partial unknown configuration, existing encrypted versions with no keys or a mismatched backup refuse replacement. An interrupted known setup can resume from its same backup. This does not configure production, rotate keys or prove production disaster recovery.

The private backup is required as long as retained encrypted versions reference its key. Do not remove it or unset the server keyring during QA cleanup. Provider secrets and document encryption keys are separate resources.

## Version clarity and owner access

The previous owner card placed the document-level Shared state beside a newer private draft's filename/version. The UI now labels the latest private draft separately and identifies the exact currently shared version. Receipt acknowledgement names its shared version. The uploader can expand a paged Version history, download any saved version and see which version is currently shared and which has a receipt. Versions not currently shared are described that way; previously downloaded copies are not claimed erased. History uses the existing participant/creator native permissions, ten-version UI pages, bounded API paging and authenticated no-store downloads. Recipients have only the current shared version, with no uploader history or private draft controls.

## Acceptance procedure and boundary

A new private QA rental and explicitly imported pending discussion provide existing participant context. They do not prove public booking or paid/identity entitlement. Two valid one-page synthetic condition-report PDFs contain no personal information, actual property terms, lease or signatures. Both existing QA participants sign in through normal Clerk browser flows; native provider JWTs independently check persisted metadata and exact bytes.

The owner uploads V1, keeps it private, shares it and uploads a newer private V2. The traveler must see/download only V1 and acknowledge its receipt without signing. Native checks reject anonymous/draft/private-V2 downloads, compare owner V2 and traveler V1 bytes and require no-store responses. The owner then reviews history and revokes future access. The old V1 URL and private V2 URL must deny the traveler; its metadata list becomes empty. Existing downloaded copies remain outside this revocation.

Acknowledged history prevents ordinary draft deletion. QA cleanup therefore withdraws only its imported discussion, removes only its new rental and disposable Clerk traveler, and retains two encrypted versions plus receipt/audit for the owner under the existing guard. It does not bypass retention or claim erasure. No Rocket signing, lease acceptance, real-person email/SMS, production change or paid/identity grant is part of this test. The receipt and screenshots record which browser/native steps actually passed.

Full legal-template/signature/provider, production key custody/recovery, controlled retention/erasure and whole-product acceptance remain open. Figma follows Phase 1.

The final checks passed on source `c49fc38`, Ready deployment `dpl_DLhL4ZWZzqTwDacmtodG4rxvap7f`. Native retention availability now uses the same bounded version predicate as deletion, so protected history shows an explanation instead of an unusable Remove draft control. Both 390px layouts fit. Actual traveler and owner-history browser downloads matched V1 byte for byte. The owner browser session and default viewport are restored. Cleanup retained the two protected encrypted versions and receipt as intended. See `docs/evidence/hosted-document-workspace-native.json` and `docs/evidence/hosted-document-workspace-browser.json`. All 439 tests / 41 files, TypeScript and the production build pass; a new 12-version case checks complete ordered paging, uploader-only history, recipient access to only the exact shared version and denial after revocation.
