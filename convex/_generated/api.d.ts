/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountOffboarding from "../accountOffboarding.js";
import type * as analytics from "../analytics.js";
import type * as availability from "../availability.js";
import type * as billingWebhook from "../billingWebhook.js";
import type * as bookingEmails from "../bookingEmails.js";
import type * as bookings from "../bookings.js";
import type * as calendarFeeds from "../calendarFeeds.js";
import type * as clerkContactWebhook from "../clerkContactWebhook.js";
import type * as contactHttp from "../contactHttp.js";
import type * as creem from "../creem.js";
import type * as crons from "../crons.js";
import type * as documentFiles from "../documentFiles.js";
import type * as emailContacts from "../emailContacts.js";
import type * as emailIngress from "../emailIngress.js";
import type * as emails from "../emails.js";
import type * as files from "../files.js";
import type * as geo from "../geo.js";
import type * as guidedSearch from "../guidedSearch.js";
import type * as housingRequestEmails from "../housingRequestEmails.js";
import type * as housingRequests from "../housingRequests.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as inboundEmailActions from "../inboundEmailActions.js";
import type * as inboundEmails from "../inboundEmails.js";
import type * as inbox from "../inbox.js";
import type * as inquiries from "../inquiries.js";
import type * as leadNotifications from "../leadNotifications.js";
import type * as leadOffers from "../leadOffers.js";
import type * as lib_accountOffboarding from "../lib/accountOffboarding.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_billing from "../lib/billing.js";
import type * as lib_bookings from "../lib/bookings.js";
import type * as lib_calendarFeeds from "../lib/calendarFeeds.js";
import type * as lib_contacts from "../lib/contacts.js";
import type * as lib_documentCrypto from "../lib/documentCrypto.js";
import type * as lib_emailContact from "../lib/emailContact.js";
import type * as lib_emailReplies from "../lib/emailReplies.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_housing from "../lib/housing.js";
import type * as lib_inbox from "../lib/inbox.js";
import type * as lib_leadEmail from "../lib/leadEmail.js";
import type * as lib_leadOffers from "../lib/leadOffers.js";
import type * as lib_listingIds from "../lib/listingIds.js";
import type * as lib_mapEligibility from "../lib/mapEligibility.js";
import type * as lib_market from "../lib/market.js";
import type * as lib_messageAccess from "../lib/messageAccess.js";
import type * as lib_messaging from "../lib/messaging.js";
import type * as lib_performance from "../lib/performance.js";
import type * as lib_photoRetention from "../lib/photoRetention.js";
import type * as lib_photos from "../lib/photos.js";
import type * as lib_profileImages from "../lib/profileImages.js";
import type * as lib_providerContacts from "../lib/providerContacts.js";
import type * as lib_publication from "../lib/publication.js";
import type * as lib_rentalDocs from "../lib/rentalDocs.js";
import type * as lib_reviews from "../lib/reviews.js";
import type * as lib_rocket from "../lib/rocket.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_threadContext from "../lib/threadContext.js";
import type * as lib_unitSetup from "../lib/unitSetup.js";
import type * as lib_units from "../lib/units.js";
import type * as listingPerformance from "../listingPerformance.js";
import type * as listings from "../listings.js";
import type * as mapEligibility from "../mapEligibility.js";
import type * as marketInsights from "../marketInsights.js";
import type * as marketSupply from "../marketSupply.js";
import type * as messageEmails from "../messageEmails.js";
import type * as messageSearch from "../messageSearch.js";
import type * as messageTemplates from "../messageTemplates.js";
import type * as messages from "../messages.js";
import type * as migrations from "../migrations.js";
import type * as payments from "../payments.js";
import type * as phoneContacts from "../phoneContacts.js";
import type * as photoRetention from "../photoRetention.js";
import type * as profileImageFiles from "../profileImageFiles.js";
import type * as profileImages from "../profileImages.js";
import type * as publication from "../publication.js";
import type * as referrals from "../referrals.js";
import type * as rentalDocs from "../rentalDocs.js";
import type * as rentalTools from "../rentalTools.js";
import type * as reviewEmails from "../reviewEmails.js";
import type * as reviewNotices from "../reviewNotices.js";
import type * as reviews from "../reviews.js";
import type * as rocketSign from "../rocketSign.js";
import type * as rocketSignData from "../rocketSignData.js";
import type * as saved from "../saved.js";
import type * as savedSearches from "../savedSearches.js";
import type * as search from "../search.js";
import type * as searchAlertEmails from "../searchAlertEmails.js";
import type * as searchAlerts from "../searchAlerts.js";
import type * as support from "../support.js";
import type * as supportEmails from "../supportEmails.js";
import type * as syncCalendars from "../syncCalendars.js";
import type * as threadContext from "../threadContext.js";
import type * as units from "../units.js";
import type * as users from "../users.js";
import type * as validators_billing from "../validators/billing.js";
import type * as validators_bookings from "../validators/bookings.js";
import type * as validators_calendars from "../validators/calendars.js";
import type * as validators_geo from "../validators/geo.js";
import type * as validators_housing from "../validators/housing.js";
import type * as validators_identity from "../validators/identity.js";
import type * as validators_listingDetails from "../validators/listingDetails.js";
import type * as validators_market from "../validators/market.js";
import type * as validators_messaging from "../validators/messaging.js";
import type * as validators_performance from "../validators/performance.js";
import type * as validators_photos from "../validators/photos.js";
import type * as validators_profileImages from "../validators/profileImages.js";
import type * as validators_rentalDocs from "../validators/rentalDocs.js";
import type * as validators_rentalTools from "../validators/rentalTools.js";
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
  accountOffboarding: typeof accountOffboarding;
  analytics: typeof analytics;
  availability: typeof availability;
  billingWebhook: typeof billingWebhook;
  bookingEmails: typeof bookingEmails;
  bookings: typeof bookings;
  calendarFeeds: typeof calendarFeeds;
  clerkContactWebhook: typeof clerkContactWebhook;
  contactHttp: typeof contactHttp;
  creem: typeof creem;
  crons: typeof crons;
  documentFiles: typeof documentFiles;
  emailContacts: typeof emailContacts;
  emailIngress: typeof emailIngress;
  emails: typeof emails;
  files: typeof files;
  geo: typeof geo;
  guidedSearch: typeof guidedSearch;
  housingRequestEmails: typeof housingRequestEmails;
  housingRequests: typeof housingRequests;
  http: typeof http;
  identity: typeof identity;
  inboundEmailActions: typeof inboundEmailActions;
  inboundEmails: typeof inboundEmails;
  inbox: typeof inbox;
  inquiries: typeof inquiries;
  leadNotifications: typeof leadNotifications;
  leadOffers: typeof leadOffers;
  "lib/accountOffboarding": typeof lib_accountOffboarding;
  "lib/auth": typeof lib_auth;
  "lib/billing": typeof lib_billing;
  "lib/bookings": typeof lib_bookings;
  "lib/calendarFeeds": typeof lib_calendarFeeds;
  "lib/contacts": typeof lib_contacts;
  "lib/documentCrypto": typeof lib_documentCrypto;
  "lib/emailContact": typeof lib_emailContact;
  "lib/emailReplies": typeof lib_emailReplies;
  "lib/geo": typeof lib_geo;
  "lib/housing": typeof lib_housing;
  "lib/inbox": typeof lib_inbox;
  "lib/leadEmail": typeof lib_leadEmail;
  "lib/leadOffers": typeof lib_leadOffers;
  "lib/listingIds": typeof lib_listingIds;
  "lib/mapEligibility": typeof lib_mapEligibility;
  "lib/market": typeof lib_market;
  "lib/messageAccess": typeof lib_messageAccess;
  "lib/messaging": typeof lib_messaging;
  "lib/performance": typeof lib_performance;
  "lib/photoRetention": typeof lib_photoRetention;
  "lib/photos": typeof lib_photos;
  "lib/profileImages": typeof lib_profileImages;
  "lib/providerContacts": typeof lib_providerContacts;
  "lib/publication": typeof lib_publication;
  "lib/rentalDocs": typeof lib_rentalDocs;
  "lib/reviews": typeof lib_reviews;
  "lib/rocket": typeof lib_rocket;
  "lib/search": typeof lib_search;
  "lib/threadContext": typeof lib_threadContext;
  "lib/unitSetup": typeof lib_unitSetup;
  "lib/units": typeof lib_units;
  listingPerformance: typeof listingPerformance;
  listings: typeof listings;
  mapEligibility: typeof mapEligibility;
  marketInsights: typeof marketInsights;
  marketSupply: typeof marketSupply;
  messageEmails: typeof messageEmails;
  messageSearch: typeof messageSearch;
  messageTemplates: typeof messageTemplates;
  messages: typeof messages;
  migrations: typeof migrations;
  payments: typeof payments;
  phoneContacts: typeof phoneContacts;
  photoRetention: typeof photoRetention;
  profileImageFiles: typeof profileImageFiles;
  profileImages: typeof profileImages;
  publication: typeof publication;
  referrals: typeof referrals;
  rentalDocs: typeof rentalDocs;
  rentalTools: typeof rentalTools;
  reviewEmails: typeof reviewEmails;
  reviewNotices: typeof reviewNotices;
  reviews: typeof reviews;
  rocketSign: typeof rocketSign;
  rocketSignData: typeof rocketSignData;
  saved: typeof saved;
  savedSearches: typeof savedSearches;
  search: typeof search;
  searchAlertEmails: typeof searchAlertEmails;
  searchAlerts: typeof searchAlerts;
  support: typeof support;
  supportEmails: typeof supportEmails;
  syncCalendars: typeof syncCalendars;
  threadContext: typeof threadContext;
  units: typeof units;
  users: typeof users;
  "validators/billing": typeof validators_billing;
  "validators/bookings": typeof validators_bookings;
  "validators/calendars": typeof validators_calendars;
  "validators/geo": typeof validators_geo;
  "validators/housing": typeof validators_housing;
  "validators/identity": typeof validators_identity;
  "validators/listingDetails": typeof validators_listingDetails;
  "validators/market": typeof validators_market;
  "validators/messaging": typeof validators_messaging;
  "validators/performance": typeof validators_performance;
  "validators/photos": typeof validators_photos;
  "validators/profileImages": typeof validators_profileImages;
  "validators/rentalDocs": typeof validators_rentalDocs;
  "validators/rentalTools": typeof validators_rentalTools;
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
