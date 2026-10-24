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
import type * as calendarFeeds from "../calendarFeeds.js";
import type * as creem from "../creem.js";
import type * as crons from "../crons.js";
import type * as emails from "../emails.js";
import type * as files from "../files.js";
import type * as housingRequestEmails from "../housingRequestEmails.js";
import type * as housingRequests from "../housingRequests.js";
import type * as http from "../http.js";
import type * as inquiries from "../inquiries.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_calendarFeeds from "../lib/calendarFeeds.js";
import type * as lib_housing from "../lib/housing.js";
import type * as lib_listingIds from "../lib/listingIds.js";
import type * as lib_messageAccess from "../lib/messageAccess.js";
import type * as lib_messaging from "../lib/messaging.js";
import type * as lib_photos from "../lib/photos.js";
import type * as lib_search from "../lib/search.js";
import type * as listings from "../listings.js";
import type * as messageEmails from "../messageEmails.js";
import type * as messageTemplates from "../messageTemplates.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as payments from "../payments.js";
import type * as referrals from "../referrals.js";
import type * as reviews from "../reviews.js";
import type * as saved from "../saved.js";
import type * as savedSearches from "../savedSearches.js";
import type * as search from "../search.js";
import type * as searchAlertEmails from "../searchAlertEmails.js";
import type * as searchAlerts from "../searchAlerts.js";
import type * as support from "../support.js";
import type * as supportEmails from "../supportEmails.js";
import type * as syncCalendars from "../syncCalendars.js";
import type * as users from "../users.js";
import type * as validators_calendars from "../validators/calendars.js";
import type * as validators_housing from "../validators/housing.js";
import type * as validators_listingDetails from "../validators/listingDetails.js";
import type * as validators_messaging from "../validators/messaging.js";
import type * as validators_photos from "../validators/photos.js";
import type * as validators_search from "../validators/search.js";
import type * as validators_support from "../validators/support.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  availability: typeof availability;
  calendarFeeds: typeof calendarFeeds;
  creem: typeof creem;
  crons: typeof crons;
  emails: typeof emails;
  files: typeof files;
  housingRequestEmails: typeof housingRequestEmails;
  housingRequests: typeof housingRequests;
  http: typeof http;
  inquiries: typeof inquiries;
  "lib/auth": typeof lib_auth;
  "lib/calendarFeeds": typeof lib_calendarFeeds;
  "lib/housing": typeof lib_housing;
  "lib/listingIds": typeof lib_listingIds;
  "lib/messageAccess": typeof lib_messageAccess;
  "lib/messaging": typeof lib_messaging;
  "lib/photos": typeof lib_photos;
  "lib/search": typeof lib_search;
  listings: typeof listings;
  messageEmails: typeof messageEmails;
  messageTemplates: typeof messageTemplates;
  messages: typeof messages;
  migrations: typeof migrations;
  payments: typeof payments;
  referrals: typeof referrals;
  reviews: typeof reviews;
  saved: typeof saved;
  savedSearches: typeof savedSearches;
  search: typeof search;
  searchAlertEmails: typeof searchAlertEmails;
  searchAlerts: typeof searchAlerts;
  support: typeof support;
  supportEmails: typeof supportEmails;
  syncCalendars: typeof syncCalendars;
  users: typeof users;
  "validators/calendars": typeof validators_calendars;
  "validators/housing": typeof validators_housing;
  "validators/listingDetails": typeof validators_listingDetails;
  "validators/messaging": typeof validators_messaging;
  "validators/photos": typeof validators_photos;
  "validators/search": typeof validators_search;
  "validators/support": typeof validators_support;
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

export declare const components: {};
