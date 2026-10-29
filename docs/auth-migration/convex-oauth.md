# Convex OAuth migration

## Current verified state

On 2026 10 29 the application already uses Convex for its data, storage and business functions. The selected deployment is local `anonymous:anonymous-agent`, with database URL `http://127.0.0.1:3210` and HTTP actions URL `http://127.0.0.1:3211`. No cloud team, project or production target is selected in this checkout.

Authentication is Clerk, including its development preview tickets. `@convex-dev/auth` and `@auth/core` are not installed. Frontend environment keys contain no OAuth provider credentials. A backend environment name inspection found `CLERK_JWT_ISSUER_DOMAIN` and existing application, billing and document keys, but no `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `JWT_PRIVATE_KEY` or `JWKS`. Secret values were not printed. A working OAuth round trip requires a real provider application and configured credentials; local access to Convex does not supply those credentials.

## Implementation boundary

Keep the meeting demo operational while migrating. Preserve every existing `users` document ID, role, listing relationship and offboarding state. Never infer an administrator role from an OAuth profile or promote a new account. Do not silently join an existing account by an unverified email claim. New accounts must retain the account type selection step, and platform administration remains separately authorized.

## Concrete change map

| Boundary | Existing source | Migration |
| --- | --- | --- |
| App provider | `app/providers.tsx`, `app/layout.tsx` | Convex Auth Next.js server provider plus client provider |
| Route guard | `middleware.ts` | Convex Auth middleware; preserve dashboard and onboarding protection |
| Login UI | auth sign in/sign up pages, `components/public-experience/auth-context.tsx` | Shared branded OAuth entry, truthful configured provider availability, safe return URL |
| UI identity | Approximately 50 Clerk imports in app/components | Provider neutral hooks with loading, current account, sign out and token contract |
| Auth server | new `convex/auth.ts`, existing `convex/auth.config.ts`, `convex/http.ts` | Configured OAuth provider, signing issuer and HTTP routes |
| Auth schema | `convex/schema.ts` | Auth tables alongside custom users; existing required fields populated by custom callback |
| Role and data mapping | `convex/lib/auth.ts`, `convex/users.ts`, identity.subject callers | Resolve authenticated Convex Auth user to existing account IDs; preserve legacy Clerk subject mapping during transition |
| Verified contacts | `emailContacts`, `phoneContacts`, contact HTTP/token helpers, Clerk webhook | Replace contact proof issuance and revocation; never label provider email or phone verified without documented provider proof |
| Account lifecycle | account offboarding, profile, admin and support flows | Preserve suspended/deleted checks; revoke new sessions through actual Convex Auth records |
| Demo entry | local preview route and preview entry component | Preserve current working demo until replacement session is verified; any new demo entry remains local and server controlled |

## Ordered execution

1. Select the intended local or authorized cloud deployment. Export a local snapshot before schema or account migration. A cloud project must be identified by actual account/project evidence rather than guessed from branding.
2. Add pinned current `@convex-dev/auth` and the documented compatible `@auth/core` version. Inspect actual installed exports and types. Do not run the interactive auth wizard.
3. Add auth tables and a custom user creation/update callback. Existing account linking must be explicit and deterministic, with ambiguity rejected. Keep users table IDs and server controlled roles. Add regression tests for new traveler/owner accounts, suspended/deleted accounts, duplicate email ambiguity and rejected privilege escalation.
4. Add server auth routes and issuer configuration. Generate fresh RS256 signing keys without logging secrets. Set JWT_PRIVATE_KEY, JWKS, SITE_URL and provider credentials only on the selected deployment. Never reuse the Clerk signing key or publish credentials to the browser.
5. Migrate frontend through a provider neutral adapter, then replace provider and middleware together. Test signed out navigation, return URLs, loading, logout and protected routes. Migrate all contact verification and offboarding contracts before deleting Clerk code.
6. Verify a real OAuth browser round trip with the selected provider, account type onboarding, role isolation, owner listing visibility and native monthly stay request behavior. Validate restored previous account access before retiring Clerk sessions.
7. Remove Clerk dependency and development ticket entry only after the replacement is verified. Final checks include typecheck, backend function tests, build and local role walkthrough. Hosted deployment acceptance is a separate result.

## Missing configuration

For Google, configure AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET on the chosen Convex deployment. The callback is the HTTP actions origin plus `/api/auth/callback/google`; localhost currently means `http://127.0.0.1:3211/api/auth/callback/google`. The provider console must permit that exact URI. Set SITE_URL to the actual app origin, currently `http://localhost:3006`.

For a publicly shared demo, an authorized cloud deployment and its actual HTTP origin are required before creating the final provider callback registration. No cloud deployment, new security grant, account linking or OAuth registration was performed by this assessment.

## Sources

[Convex Auth setup](https://labs.convex.dev/auth/setup), [manual configuration](https://labs.convex.dev/auth/setup/manual), [custom schema](https://labs.convex.dev/auth/setup/schema), [OAuth configuration](https://labs.convex.dev/auth/config/oauth), [Next.js protected routes](https://labs.convex.dev/auth/authz/nextjs), [account linking](https://labs.convex.dev/auth/advanced).

The served official Convex plugin auth runbook was consulted at `https://basic-anteater-667.convex.site/capability/auth.md`. Its manual headless setup guidance takes precedence over the docs' interactive initialization command. This assessment changes no active auth files and makes no claim that OAuth is installed or verified.
