# Furnishsearcher UI implementation

Updated October 29, 2026. Local implementation delivered for review. Visual taste approval, hosted release and whole product/provider acceptance remain separate.

## Current direction

Company OS supplies shell hierarchy, compact controls and sidebar structure. Chippi supplies the home widget composition. User feedback supersedes the original gray shell: white top bar, white canvas, white cards and a very light gray sidebar. Owner, traveler and platform admin are separate account types and dashboards. There is no workspace role switcher. Rental tools is an expandable navigation group with separate pages.

The public application is now in scope by explicit user instruction. It uses the same tokens, fields, buttons, dialogs and surfaces. The home, search, listing detail, gallery, cities, resources, blog index, owner landing and pricing compositions were rebuilt. Remaining content and profile pages use the common public shell and shared controls; their domain content is retained.

## Source authority

| Source | Revision | Applied responsibility |
| --- | --- | --- |
| Company OS Web | 94827a320e06958995263b32a44d6fc8c227d7a1 | Design language v3, 56px bar, 240px sidebar, compact controls, Phosphor navigation |
| Chippi v2 application branch | 8db38e36b0cc26dc4218ee4fea755417236887cc | Tabbed homes, metrics, widget hierarchy, activity and real empty states |
| ui-builder-os | a074662c84e6d4991c94c397af1b120be737320b | Custom UI OS workflow, semantic DNA, validation and Base UI migration contracts |
| Furnishsearcher starting source | bd5955441652f44cbd5432e14e07f15f5f94aeae | Convex rental behavior and existing domain adapters |

Other checkouts were read without editing them. No external skill packages were acquired. No Airbnb clone styles were imported. The public redesign now follows the shared product primitives; a separate Wander/Figma refinement has not been produced in this implementation.

## Phases and evidence

| Phase | Local result | Evidence |
| --- | --- | --- |
| 1 Source and screen map | Source pins resolved; role and route inventory recorded | This document and route matrix |
| 2 Library and workshop | Shared semantic tokens, Base UI controls, panels, menus, tabs, dialogs and component workshop | components/ui-system, /dashboard/design-system, design-dna.json |
| 3 Shell and listing pilot | White Company OS shell, static account identity, role navigation, command search, mobile drawer and working listing management | Owner browser: filters, menu, delete dialog cancellation and focus return |
| 4 Role homes | Native owner, traveler and staff data arranged as Chippi style widgets | Actual local owner and traveler Clerk sessions reviewed; staff verified separately |
| 5 Product migration | Shared controls across existing dashboard journeys; separate rental tools; admin account management; public rebuild | Route matrix, native role tests and browser journey record |
| 6 Review and handoff | Five review passes with fixes, regression tests, typecheck and production build | implementation-review.md, screenshots and local logs |

Implementation is local and uncommitted. The existing draft PR does not yet contain this UI work. Nothing in this UI task was pushed to cloud Convex or production.

## Library contracts

The canonical generated tokens are generated-tokens-v2.css. Core DNA validates with revision a591b05d58c3a68cccbe9af3d06ebde0b3f496bef5adc624d0dd94cec5a58c1f. Core schema radiusSurface is 8px and rowHeight is 40px; Company OS card radius 12px and shell geometry are explicit product extensions in dna.ts. Schema validity does not establish visual acceptance. The first generated icon set was rejected. The installed second set is provisional and has not received user approval.

New Button defaults to type button. The existing compatibility Button retains the native HTML submit default so older forms continue to submit. asChild links remain semantic anchors through Radix Slot; ordinary buttons and active dialog/select/checkbox/switch/tabs/avatar/tooltip wrappers use Base UI. Remaining unused Radix wrappers and dependencies are retained until consumer removal is justified. Native select, textarea, date and calendar semantics remain where appropriate, styled with the shared tokens. No Tailwind major upgrade was coupled to the migration.

Portals carry furnish-ui so menus and overlays share the same tokens. The public body carries the same scope following the expanded user request. Delete dialogs preserve final focus. Busy dialog cancellation guards are adapted to Base UI event details. Source-level migration does not claim a full assistive technology audit.

## Account boundaries

New accounts select traveler or property owner once during onboarding. Established accounts cannot change their own account type. Native platform admins can manage names and roles through a bounded, allowlisted account directory. Self demotion and resurrection of offboarded accounts are rejected. Admin access checks are enforced in Convex, not only by navigation. The dashboard layout does not mount forbidden role pages and redirects to the correct role home.

Owner accounts do not receive traveler saved-search, saved-rental or inquiry creation controls. Traveler APIs reject owner/admin context. The shared inquiry screen derives its direction from the actual account role. Publication eligibility now also requires the current owner role to be property owner.

Local reserved role fixtures are distinct real development Clerk users against the loopback Convex database. Their admin role exists only locally. These fixtures do not establish cloud admin provisioning, identity verification, paid access or real inventory.

## Preserved domain behavior

Existing indexed paging, search criteria, date flexibility, map eligibility, photo assets/captions, listing revision approval, stay inquiries, conversations, document versions, signatures, billing, owner identity and moderation gates remain in the application. A shared PDF is not a legal signature. App subscription billing is separate from rent collection. Provider availability and external charges are still explicit. No test setup granted public listing eligibility to the new owner preview drafts.
