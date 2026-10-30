# Existing-stay lifecycle acceptance

Convex remains the backend. Current primary references inspected 2026-10-26 UTC:

- https://support.furnishedfinder.com/hc/en-us/articles/57444582132251-Understanding-Booking-Statuses
- https://support.furnishedfinder.com/hc/en-us/articles/53448046101659-How-Do-I-Use-My-Furnished-Finder-Calendar
- https://support.furnishedfinder.com/hc/en-us/articles/53448268186779-How-Do-I-Add-Events-to-My-Calendar
- https://support.furnishedfinder.com/hc/en-us/articles/53451311862939-How-Do-I-Edit-Calendar-Events
- https://support.furnishedfinder.com/hc/en-us/articles/35584595681307-What-If-I-Need-to-Extend-or-Adjust-My-Stay
- https://support.furnishedfinder.com/hc/en-us/articles/35380946401819-What-Does-Hiding-Your-Listing-Do

These describe calendar reservations, date changes, cancellation and continued management of existing stays while a listing is hidden. Calendar confirmation does not replace a lease or payment. The app explicitly uses checkout-exclusive intervals: checkout is available again. It does not silently change its existing interval contract to the competitor guide's following-day wording.

## Repair visibility

Previously an imported confirmed inquiry with no matching calendar row still displayed blanket reservation wording. The private booking query now checks the same actual row binding used by mutations: matching listing, inquiry reference if present, start/end dates, booked type and no imported-feed identity. Both participants receive a boolean coverage result only for confirmed stays; other statuses receive null. Missing/mismatched rows show a warning and owner repair destination rather than an asserted reservation. Date-change forms and accepting pending changes wait for repair. Native mutation guards remain authoritative. A successful repair updates both participants reactively and restores the normal controls. Valid older rows with their canonical inquiry back-reference absent retain the existing compatible native behavior.

Source tests cover normal coverage, missing rows and actual repair, both participants, date/type mismatches, pending/cancelled distinction and unchanged agreed dates. This does not certify external calendars or that an actual tenant moved in.

## Hosted fixture boundary

A dedicated reserved Clerk traveler and existing reserved owner authenticate using actual provider-issued JWTs. Setup creates one new private QA rental and explicitly imports an accepted-history inquiry whose calendar entry is missing. This privileged existing-history precondition proves neither native public inquiry/confirmation nor paid, identity, lease or payment acceptance. No public eligibility override or provider entitlement is created.

The owner browser must see the warning and repair the calendar normally. A native owner-created maintenance conflict must reject the traveler's attempted extension, then be removed. The actual traveler requests an extension through the native API, with the original reservation unchanged until the owner accepts in the browser. Booking dates and the protected linked calendar row must agree afterward. The owner then requests cancellation in the browser; its reservation remains until the actual traveler accepts through the native API. Future dates are released while agreed dates and private event history remain. A change author cannot accept their own request, and the manual calendar API cannot delete the managed reservation.

The owner browser and traveler native API are distinct acceptance surfaces. This is not a claim of a complete two-browser public booking journey. Anonymous stay/history access must fail. Resend is asserted absent before fixture writes; no actual notification, lease or payment is sent or accepted. Cleanup removes only the new private rental and disposable Clerk traveler while retaining the owner's cancelled inquiry/history. Existing QA or customer records are not cleaned up by this script.

Live paid/identity providers, public inquiry/confirmation, both-participant browser journeys, calendar-provider feeds, production operations and full Phase 1 acceptance remain open. Figma follows functional acceptance.
