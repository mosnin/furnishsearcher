# Contact confirmation

The profile phone dialog uses the installed Clerk SDK to create or reuse an account phone, request an SMS code, and submit the code to Clerk. It makes a confirmed number the account's primary phone, with Clerk reverification when required. A fresh `convex` token is then submitted to Convex. No local code comparison, fake success, client flag or profile mutation grants confirmation.

Enable phone authentication for the intended Clerk application before acceptance. The current [Clerk phone flow](https://clerk.com/docs/guides/development/custom-flows/account-updates/add-phone) describes the provider configuration; disabled SMS, account conflicts and invalid/expired codes must be tested there. No provider account setting, SMS purchase or real text message was performed during implementation.

Preserve the existing issuer/audience and signing-email claims in the `convex` JWT template. Add these **dynamic** claims:

```json
{
  "phone_number": "{{user.primary_phone_address}}",
  "phone_number_verified": "{{user.phone_number_verified}}"
}
```

The primary-phone shortcode above follows the complete example in the current [Clerk JWT template reference](https://clerk.com/docs/guides/sessions/jwt-templates). That reference also documents the verification boolean. Inspect an actual freshly issued token in a private development session to confirm the exact E.164 number and boolean before enabling production. Neither the actual intended template nor its JWT has been verified. Never substitute a constant, a profile field, unsafe metadata or a browser-reported verification status. Tokens and SMS codes must not be logged or checked into Git.

Convex maps the standard claims to `phoneNumber` and `phoneNumberVerified`; its installed authentication type documents this mapping. `confirmPhone` requires a verified boolean, exact canonical number, authenticated subject and numeric `iat` issued within the last two minutes, with no future issuance. A profile edit/revocation invalidates earlier token issuance; refresh after the next second if confirming immediately after one of those changes. The browser explicitly requests an uncached token and the server accepts no client user ID.

`CLERK_CONTACT_MODE` on Convex defaults to `test`. Set `prod` only on the intended deployment after actual Clerk production SMS/token acceptance. Other values fail closed. Development `clerk.accounts.dev` issuers are refused in production mode. Test proof is labeled in the profile, housing-request choice and owner inbox and cannot grant confirmation after switching the deployment to production mode.

Confirmation expires after 30 days. An exact-expiry scheduled mutation updates active subscriptions; a stale expiry job cannot revoke refreshed proof. Reads and new requests also check the proof window. This is a time-limited confirmation of access to a phone number, not government identity or a promise of future number ownership. Signed primary-contact reconciliation is now implemented and configured in the app-specific Clerk/Convex development environment. A changed/removed/unverified primary revokes stored authority and phone-sharing consent after successful event delivery; native confirmation also checks the latest provider snapshot. Actual provider-driven primary-email changes pass, while real phone/SMS and production acceptance remain open. See [contact-change reconciliation](clerk-contact-reconciliation.md) for setup, ordering, tombstones, asynchronous delivery limits and evidence.

Each request records a private contact revision, not a copy of the number. Only matching owner deliveries can show the current confirmed number, for an open phone-opt-in request with the same revision and no account block. Changing/removing the saved number or using **Stop phone sharing** invalidates existing requests. A new number or later confirmation cannot silently restore their consent. Legacy boolean-only records and old requests without a bound revision disclose no phone. Already viewed or copied numbers cannot be recalled.

Email status on the profile comes from Clerk's primary email verification. LinkedIn self-assertion remains rejected by the backend; the profile explains that work details are self-reported and that LinkedIn verification is unavailable. An approved LinkedIn provider flow remains an explicit feature gap.

`tests/contact-verification.test.ts` covers proof validation, expiry, stale tokens/jobs, consent revisions, legacy flags, contact privacy and environment separation. `scripts/local-contact-smoke.mjs` exercises real local Convex persistence/rejection using privileged synthetic identities, then revokes and removes its synthetic phone. It does **not** prove Clerk JWT acceptance, SMS delivery, a real person's number or signed-in browser behavior.
