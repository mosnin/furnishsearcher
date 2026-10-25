/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as availability from "../availability.js";
import type * as billingWebhook from "../billingWebhook.js";
import type * as bookingEmails from "../bookingEmails.js";
import type * as bookings from "../bookings.js";
import type * as calendarFeeds from "../calendarFeeds.js";
import type * as creem from "../creem.js";
import type * as crons from "../crons.js";
import type * as emails from "../emails.js";
import type * as files from "../files.js";
import type * as geo from "../geo.js";
import type * as housingRequestEmails from "../housingRequestEmails.js";
import type * as housingRequests from "../housingRequests.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as inquiries from "../inquiries.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_billing from "../lib/billing.js";
import type * as lib_bookings from "../lib/bookings.js";
import type * as lib_calendarFeeds from "../lib/calendarFeeds.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_housing from "../lib/housing.js";
import type * as lib_listingIds from "../lib/listingIds.js";
import type * as lib_messageAccess from "../lib/messageAccess.js";
import type * as lib_messaging from "../lib/messaging.js";
import type * as lib_photos from "../lib/photos.js";
import type * as lib_publication from "../lib/publication.js";
import type * as lib_reviews from "../lib/reviews.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_unitSetup from "../lib/unitSetup.js";
import type * as lib_units from "../lib/units.js";
import type * as listings from "../listings.js";
import type * as messageEmails from "../messageEmails.js";
import type * as messageTemplates from "../messageTemplates.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as payments from "../payments.js";
import type * as publication from "../publication.js";
import type * as referrals from "../referrals.js";
import type * as reviewEmails from "../reviewEmails.js";
import type * as reviewNotices from "../reviewNotices.js";
import type * as reviews from "../reviews.js";
import type * as saved from "../saved.js";
import type * as savedSearches from "../savedSearches.js";
import type * as search from "../search.js";
import type * as searchAlertEmails from "../searchAlertEmails.js";
import type * as searchAlerts from "../searchAlerts.js";
import type * as support from "../support.js";
import type * as supportEmails from "../supportEmails.js";
import type * as syncCalendars from "../syncCalendars.js";
import type * as units from "../units.js";
import type * as users from "../users.js";
import type * as validators_billing from "../validators/billing.js";
import type * as validators_bookings from "../validators/bookings.js";
import type * as validators_calendars from "../validators/calendars.js";
import type * as validators_geo from "../validators/geo.js";
import type * as validators_housing from "../validators/housing.js";
import type * as validators_identity from "../validators/identity.js";
import type * as validators_listingDetails from "../validators/listingDetails.js";
import type * as validators_messaging from "../validators/messaging.js";
import type * as validators_photos from "../validators/photos.js";
import type * as validators_reviews from "../validators/reviews.js";
import type * as validators_search from "../validators/search.js";
import type * as validators_support from "../validators/support.js";
import type * as validators_units from "../validators/units.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  availability: typeof availability;
  billingWebhook: typeof billingWebhook;
  bookingEmails: typeof bookingEmails;
  bookings: typeof bookings;
  calendarFeeds: typeof calendarFeeds;
  creem: typeof creem;
  crons: typeof crons;
  emails: typeof emails;
  files: typeof files;
  geo: typeof geo;
  housingRequestEmails: typeof housingRequestEmails;
  housingRequests: typeof housingRequests;
  http: typeof http;
  identity: typeof identity;
  inquiries: typeof inquiries;
  "lib/auth": typeof lib_auth;
  "lib/billing": typeof lib_billing;
  "lib/bookings": typeof lib_bookings;
  "lib/calendarFeeds": typeof lib_calendarFeeds;
  "lib/geo": typeof lib_geo;
  "lib/housing": typeof lib_housing;
  "lib/listingIds": typeof lib_listingIds;
  "lib/messageAccess": typeof lib_messageAccess;
  "lib/messaging": typeof lib_messaging;
  "lib/photos": typeof lib_photos;
  "lib/publication": typeof lib_publication;
  "lib/reviews": typeof lib_reviews;
  "lib/search": typeof lib_search;
  "lib/unitSetup": typeof lib_unitSetup;
  "lib/units": typeof lib_units;
  listings: typeof listings;
  messageEmails: typeof messageEmails;
  messageTemplates: typeof messageTemplates;
  messages: typeof messages;
  migrations: typeof migrations;
  payments: typeof payments;
  publication: typeof publication;
  referrals: typeof referrals;
  reviewEmails: typeof reviewEmails;
  reviewNotices: typeof reviewNotices;
  reviews: typeof reviews;
  saved: typeof saved;
  savedSearches: typeof savedSearches;
  search: typeof search;
  searchAlertEmails: typeof searchAlertEmails;
  searchAlerts: typeof searchAlerts;
  support: typeof support;
  supportEmails: typeof supportEmails;
  syncCalendars: typeof syncCalendars;
  units: typeof units;
  users: typeof users;
  "validators/billing": typeof validators_billing;
  "validators/bookings": typeof validators_bookings;
  "validators/calendars": typeof validators_calendars;
  "validators/geo": typeof validators_geo;
  "validators/housing": typeof validators_housing;
  "validators/identity": typeof validators_identity;
  "validators/listingDetails": typeof validators_listingDetails;
  "validators/messaging": typeof validators_messaging;
  "validators/photos": typeof validators_photos;
  "validators/reviews": typeof validators_reviews;
  "validators/search": typeof validators_search;
  "validators/support": typeof validators_support;
  "validators/units": typeof validators_units;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  geospatial: import("@convex-dev/geospatial/_generated/component.js").ComponentApi<"geospatial">;
};
