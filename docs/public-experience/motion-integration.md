# Motion integration

The 24 requested source recipes are retained in `vendor/transitions-dev`, with original links, license and provenance at commit `e3aefb554d8fd2cb3e91e773e82a0f2d5a4f82a0`. This work does not install an external skill. The original extracted `snippets.css` remains inert. Product adaptations live in `components/ui-system/motion.css`; React helpers and explicitly labeled workshop specimens live in `components/public-experience/motion.tsx`.

All 24 are saved and adapted. Applied means an actual interface consumes the effect; specimen means the effect is intentionally limited to the component library until there is a truthful product use. Neither source retention nor the formal selection contract certifies visual quality or browser behavior.

| Requested recipe | Adaptation and current surface | Scope |
| --- | --- | --- |
| Card resize | `.t-resize`, controlled dimensions and `data-expanded` | Applied to labeled resize specimen only |
| Notification badge | `.t-notification-badge`, keyed actual unread count | Applied to dashboard unread message badge |
| Text states swap | `MotionText`, immediate semantic label, visual exit and entry | Applied to native stay request busy and ready labels; workshop |
| Menu dropdown | `.ds-menu`, `.ds-popup` | Applied to shared Base UI menu and select popups |
| Modal open/close | `.ds-dialog`, `.ds-dialog-backdrop` | Applied to shared dialogs, including public and dashboard consumers |
| Panel reveal | `Reveal`, `.t-content-reveal`, `.ds-view-panel` | Applied to shared view panels and controlled workshop expansion |
| Icon swap | `.w-menu-symbol[data-open]` | Applied to public navigation menu icon |
| Success check | `SuccessCheck`, stroke reveal | Applied after native stay inquiry ID returns; labeled sample success |
| Error state shake | `.ds-input[aria-invalid=true]`, `.t-error-shake` | Applied to shared invalid fields; labeled sample validation |
| Skeleton loader and reveal | `.t-skeleton`, `.t-content-reveal` | Applied to shared Skeleton and view entry; finite shimmer |
| Tabs sliding | `.ds-tab-indicator`, `.ds-segmented-indicator` | Applied to shared Base UI tab indicators |
| Tooltip open/close | `.ds-tooltip` | Applied to shared tooltip popup |
| Dropdown menu morph | `.w-account-menu` clip reveal, `.t-morph` specimen | Applied to native public account menu and labeled morph specimen |
| Accordion | `.dashboard-tools-nav` native Collapsible panel | Applied to dashboard rental tools submenu |
| Toast open/close | Native Sonner entry, stack and exit with adapted timing | Applied to existing product toast consumers; no artificial notifications |
| Learn more hover | `.t-learn-arrow` | Applied to workshop return link only |
| Checkbox check | `.ds-checkbox[data-checked]` SVG path | Applied to both shared checkbox wrappers |
| Toggle | `.t-toggle`, native switch thumb | Applied to shared Base UI Switch |
| Banner stacking | `.t-stack` controlled `data-spread` | Applied to labeled workshop banners only |
| Avatar group hover | `.t-avatar-group`, focus and hover lift | Applied to labeled sample initials only |
| Like button | `.w-save-heart[aria-pressed=true]` | Applied to actual public saved property button |
| Number pop-in | `NumberPop`, keyed actual value | Applied to shared metric values; labeled workshop count |
| Texts reveal | `.w-hero-copy h1`, `.w-hero-copy p` | Applied to public homepage title and supporting text |
| Spinning counter | `SpinningCounter`, immediate accessible value | Applied to labeled workshop count only |

## Lifecycle and accessibility

Base UI popups use their actual `data-starting-style` and `data-ending-style` lifecycle. The Collapsible adapter uses native `data-open`, `data-closed` and `--collapsible-panel-height`. Tabs use Base UI indicator dimensions and positions. Checkbox, switch, save and menu state come from their actual emitted attributes. No fabricated `data-state` is required.

Modal scale uses the individual CSS `scale` property and preserves the existing centering transform. Native focus trapping, dismissal, keyboard navigation, disabled state and busy guards remain in the underlying components. `MotionText` exposes the new semantic label immediately and animates only an inaccessible duplicate. Number helpers expose the current value immediately. Success appears only after native completion. Motion does not generate property, message, booking, payment or support data.

The reduced motion media query disables transitions and animations, removes blur and keeps content visible. The text helper also settles immediately if the preference changes. Skeletons have one finite shimmer; there are no perpetual decorative animations. Public card images remain static until user interaction. Duration, easing, distance, blur and scale are editable CSS variables.

## Direct local browser checks

Checked on 2026 10 29 at `http://localhost:3006/dashboard/design-system` using the running local application. This covers shared motion plumbing, not whole product or reference screenshot acceptance.

* Actual CSS token `--badge-dur` computed as `260ms`; Skeleton animation iteration count computed as `1`.
* Modal opened with focus on Close dialog. Computed scale was `1`, the existing centering transform remained present, and its center was within one pixel of the viewport center. Escape removed the dialog and returned focus to Open confirmation.
* Selecting Foundations updated the native selected tab and live indicator position and width. Components selection restored its actual panel.
* Unchecking the sample checkbox changed its accessible checked state to false.
* Opening Rental tools emitted native open state and revealed its five real navigation links. Computed panel height was approximately 155 pixels.
* Expanding the labeled resize specimen exposed its additional content and updated `aria-expanded`. Changing the sample value exposed the current value 13 and Updated sample label.
* Sample success and morph controls visibly exposed their labeled sample content. Screenshot saved outside the repository at `../motion-workshop-review.png`.

Current system reduced motion preference was false. Reduced motion rules and helper change handling were inspected in source; an interactive operating system preference change was not performed. No claims of frame rate, all device coverage or pixel identity are made by these checks. Final integrated typecheck, full tests and visual comparison belong to the parent integration pass.
