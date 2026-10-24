/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as analytics from "../analytics.js";
import type * as availability from "../availability.js";
import type * as calendarFeeds from "../calendarFeeds.js";
import type * as creem from "../creem.js";
import type * as emails from "../emails.js";
import type * as files from "../files.js";
import type * as housingRequestEmails from "../housingRequestEmails.js";
import type * as housingRequests from "../housingRequests.js";
import type * as http from "../http.js";
import type * as inquiries from "../inquiries.js";
import type * as listings from "../listings.js";
import type * as messages from "../messages.js";
import type * as payments from "../payments.js";
import type * as referrals from "../referrals.js";
import type * as reviews from "../reviews.js";
import type * as saved from "../saved.js";
import type * as savedSearches from "../savedSearches.js";
import type * as syncCalendars from "../syncCalendars.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  availability: typeof availability;
  calendarFeeds: typeof calendarFeeds;
  creem: typeof creem;
  emails: typeof emails;
  files: typeof files;
  housingRequestEmails: typeof housingRequestEmails;
  housingRequests: typeof housingRequests;
  http: typeof http;
  inquiries: typeof inquiries;
  listings: typeof listings;
  messages: typeof messages;
  payments: typeof payments;
  referrals: typeof referrals;
  reviews: typeof reviews;
  saved: typeof saved;
  savedSearches: typeof savedSearches;
  syncCalendars: typeof syncCalendars;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
