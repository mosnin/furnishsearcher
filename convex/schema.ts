import { storedPerformanceCounts } from "./validators/performance";
import { toolFields } from "./validators/rentalTools";
import {
  documentFields,
  versionFields,
  signatureFields,
  documentKind,
} from "./validators/rentalDocs";
import {
  inquiryStatus,
  changeFields,
  eventAction,
  originalRequest,
} from "./validators/bookings";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { bucket as marketBucket, demandKind } from "./validators/market";
import { housingRequestFields, leadResponse } from "./validators/housing";
import {
  caseFields,
  replyFields,
  auditFields,
  deliveryStatus,
} from "./validators/support";
import {
  messageFields,
  conversationFields,
  templateFields,
} from "./validators/messaging";
import { searchFields, searchDeliveryStatus } from "./validators/search";
import { calendarFeedFields } from "./validators/calendars";

import { listingDetails } from "./validators/listingDetails";

import { photoAsset } from "./validators/photos";

import { subscriptionStatus } from "./validators/billing";

import { reviewStatus, reviewKind } from "./validators/reviews";
import { placeCandidate } from "./validators/geo";
import { identityStatus } from "./validators/identity";

export default defineSchema({
  listingLeadEmailPreferences: defineTable({
    listingId: v.id("listings"),
    ownerId: v.id("users"),
    enabled: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_listing_owner", ["listingId", "ownerId"]),
  listingPhoneLimits: defineTable({
    userId: v.id("users"),
    day: v.number(),
    listingIds: v.array(v.id("listings")),
  })
    .index("by_user_day", ["userId", "day"])
    .index("by_day", ["day"]),
  ownerPerformanceState: defineTable({
    ownerId: v.id("users"),
    mode: v.union(v.literal("test"), v.literal("prod")),
    startedAt: v.number(),
    phoneStartedAt: v.optional(v.number()),
    unmatchedStartedAt: v.optional(v.number()),
  }).index("by_owner_mode", ["ownerId", "mode"]),
  ownerPerformanceDays: defineTable({
    ownerId: v.id("users"),
    mode: v.union(v.literal("test"), v.literal("prod")),
    day: v.number(),
    ...storedPerformanceCounts,
  })
    .index("by_owner_day", ["ownerId", "mode", "day"])
    .index("by_day", ["day"]),
  listingPerformanceState: defineTable({
    listingId: v.id("listings"),
    ownerId: v.id("users"),
    mode: v.union(v.literal("test"), v.literal("prod")),
    startedAt: v.number(),
    phoneStartedAt: v.optional(v.number()),
    unmatchedStartedAt: v.optional(v.number()),
  }).index("by_listing_owner_mode", ["listingId", "ownerId", "mode"]),
  listingPerformanceDays: defineTable({
    listingId: v.id("listings"),
    ownerId: v.id("users"),
    mode: v.union(v.literal("test"), v.literal("prod")),
    day: v.number(),
    ...storedPerformanceCounts,
  })
    .index("by_listing_day", ["listingId", "ownerId", "mode", "day"])
    .index("by_day", ["day"]),
  listingObservationLimits: defineTable({
    actor: v.string(),
    day: v.number(),
    keys: v.array(v.string()),
  })
    .index("by_actor_day", ["actor", "day"])
    .index("by_day", ["day"]),
  guidedSearchLimits: defineTable({
    key: v.string(),
    day: v.number(),
    minute: v.number(),
    dayCount: v.number(),
    minuteCount: v.number(),
    updatedAt: v.number(),
    lastRequest: v.optional(v.string()),
    requestIds: v.optional(v.array(v.string())),
    busyUntil: v.optional(v.number()),
  })
    .index("by_key", ["key"])
    .index("by_updated", ["updatedAt"]),
  identityResultAudit: defineTable({
    checkId: v.id("identityChecks"),
    status: v.string(),
    observedAt: v.number(),
  }).index("by_check", ["checkId", "observedAt"]),
  identityReviewAudit: defineTable({
    checkId: v.id("identityChecks"),
    reviewerId: v.id("users"),
    action: v.union(
      v.literal("hold"),
      v.literal("recheck"),
      v.literal("recover"),
    ),
    note: v.string(),
    createdAt: v.number(),
  }).index("by_check", ["checkId", "createdAt"]),
  identityChecks: defineTable({
    userId: v.id("users"),
    status: identityStatus,
    mode: v.union(v.literal("test"), v.literal("prod")),
    region: v.string(),
    workflowKey: v.string(),
    accountId: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    hostedUrl: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    checkedAt: v.optional(v.number()),
    verifiedAt: v.optional(v.number()),
    lastPollAt: v.optional(v.number()),
    refreshGeneration: v.optional(v.number()),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_status_poll", ["status", "lastPollAt"]),
  providerTokens: defineTable({
    key: v.string(),
    token: v.string(),
    expiresAt: v.number(),
  }).index("by_key", ["key"]),
  listingReviews: defineTable({
    listingId: v.id("listings"),
    reviewerId: v.id("users"),
    revision: v.number(),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    note: v.string(),
    createdAt: v.number(),
  }).index("by_listing", ["listingId", "createdAt"]),
  billingAdjustments: defineTable({
    transactionId: v.string(),
    mode: v.union(v.literal("test"), v.literal("prod")),
    refundedAmount: v.number(),
    paidAmount: v.number(),
    disputed: v.boolean(),
    updatedAt: v.number(),
  }).index("by_transaction_mode", ["transactionId", "mode"]),
  billingCustomers: defineTable({
    userId: v.id("users"),
    customerId: v.string(),
    mode: v.union(v.literal("test"), v.literal("prod")),
    verifiedAt: v.number(),
  })
    .index("by_user", ["userId", "verifiedAt"])
    .index("by_customer_mode", ["customerId", "mode"]),
  photoUploads: defineTable({
    storageId: v.id("_storage"),
    ownerId: v.id("users"),
    createdAt: v.number(),
    cleanupVersion: v.optional(v.literal(1)),
    expiresAt: v.optional(v.number()),
    urlKey: v.optional(v.string()),
  })
    .index("by_storage", ["storageId"])
    .index("by_owner_time", ["ownerId", "createdAt"])
    .index("by_cleanup_version", ["cleanupVersion"])
    .index("by_url_key", ["urlKey"])
    .index("by_expiry", ["expiresAt"]),
  listingPhotoReferences: defineTable({
    listingId: v.id("listings"),
    storageId: v.id("_storage"),
  })
    .index("by_listing", ["listingId"])
    .index("by_storage", ["storageId"]),
  profileImageUploads: defineTable({
    ownerId: v.id("users"),
    kind: v.union(v.literal("profile"), v.literal("pet")),
    requestId: v.string(),
    expectedRevision: v.number(),
    revision: v.number(),
    storageId: v.optional(v.id("_storage")),
    bytes: v.number(),
    contentType: v.string(),
    digest: v.string(),
    createdAt: v.number(),
    retiredAt: v.optional(v.number()),
  })
    .index("by_owner_request", ["ownerId", "requestId"])
    .index("by_storage", ["storageId"])
    .index("by_owner_time", ["ownerId", "createdAt"])
    .index("by_retired", ["retiredAt"]),
  counters: defineTable({ name: v.string(), value: v.number() }).index(
    "by_name",
    ["name"],
  ),
  dataMigrations: defineTable({
    name: v.string(),
    cursor: v.union(v.string(), v.null()),
    complete: v.boolean(),
  }).index("by_name", ["name"]),
  savedSearchDeliveries: defineTable({
    searchId: v.id("savedSearches"),
    listingId: v.id("listings"),
    createdAt: v.number(),
    status: searchDeliveryStatus,
    lastAttemptAt: v.number(),
  })
    .index("by_search_listing", ["searchId", "listingId"])
    .index("by_search", ["searchId", "createdAt"]),
  supportCases: defineTable(caseFields)
    .index("by_user", ["userId", "createdAt"])
    .index("by_email", ["email", "createdAt"])
    .index("by_status", ["status", "updatedAt"])
    .index("by_user_listing", ["userId", "listingId", "kind", "createdAt"])
    .index("by_user_message", ["userId", "messageId", "createdAt"]),
  supportReplies: defineTable(replyFields)
    .index("by_case", ["caseId", "createdAt"])
    .index("by_case_visibility", ["caseId", "internal", "createdAt"])
    .index("by_author", ["authorId", "createdAt"]),
  supportAudit: defineTable(auditFields).index("by_case", [
    "caseId",
    "createdAt",
  ]),
  emailReplyBindings: defineTable({
    digest: v.string(),
    messageId: v.id("messages"),
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    email: v.string(),
    revision: v.number(),
    domain: v.string(),
    mode: v.union(v.literal("test"), v.literal("prod")),
    expiresAt: v.number(),
  })
    .index("by_digest", ["digest"])
    .index("by_source", ["messageId"])
    .index("by_expiry", ["expiresAt"]),
  inboundEmailReceipts: defineTable({
    bindingId: v.optional(v.id("emailReplyBindings")),
    emailId: v.string(),
    state: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("retrying"),
      v.literal("accepted"),
      v.literal("rejected"),
    ),
    attempt: v.number(),
    dueAt: v.number(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    reason: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    conversationId: v.optional(v.id("conversations")),
    messageId: v.optional(v.id("messages")),
    attachmentsOmitted: v.optional(v.boolean()),
  })
    .index("by_email", ["emailId"])
    .index("by_due", ["state", "dueAt"])
    .index("by_user", ["userId"]),
  marketState: defineTable({
    key: v.string(),
    collectedSince: v.number(),
    latestSupplyId: v.optional(v.id("marketSupplyRuns")),
    buildingSupplyId: v.optional(v.id("marketSupplyRuns")),
  }).index("by_key", ["key"]),
  marketSupplyRuns: defineTable({
    state: v.union(
      v.literal("building"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    cursor: v.union(v.string(), v.null()),
    startedAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    mode: v.union(v.literal("test"), v.literal("prod")),
  }).index("by_started", ["startedAt"]),
  marketSupply: defineTable({
    runId: v.id("marketSupplyRuns"),
    scope: v.string(),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    count: v.number(),
    sumCents: v.number(),
    avgCents: v.number(),
    owners: v.number(),
    cities: v.number(),
    buckets: v.array(marketBucket),
  })
    .index("by_scope", ["runId", "scope"])
    .index("by_price", ["runId", "avgCents"]),
  marketSupplyOwners: defineTable({
    runId: v.id("marketSupplyRuns"),
    ownerId: v.id("users"),
  })
    .index("by_owner", ["runId", "ownerId"])
    .index("by_run", ["runId"]),
  marketDemandDays: defineTable({
    scope: v.string(),
    kind: demandKind,
    day: v.number(),
    count: v.number(),
    buckets: v.array(marketBucket),
  })
    .index("by_scope", ["scope", "kind", "day"])
    .index("by_day", ["day"]),
  marketContributors: defineTable({
    scope: v.string(),
    kind: demandKind,
    actor: v.string(),
    lastSeen: v.number(),
  })
    .index("by_actor", ["scope", "kind", "actor"])
    .index("by_recent", ["scope", "kind", "lastSeen"])
    .index("by_time", ["lastSeen"]),
  marketSearchLimits: defineTable({
    actor: v.string(),
    day: v.number(),
    fingerprints: v.array(v.string()),
  })
    .index("by_actor", ["actor", "day"])
    .index("by_day", ["day"]),
  mapEligibilityTotals: defineTable({
    listingId: v.optional(v.id("listings")),
    ownerId: v.id("users"),
    mode: v.union(v.literal("test"), v.literal("prod")),
    eligibleSpaceDays: v.number(),
    observedSpaceDays: v.number(),
    firstCheckedAt: v.number(),
    lastCheckedAt: v.number(),
  }).index("by_listing_owner_mode", ["listingId", "ownerId", "mode"]),
  mapEligibilityDays: defineTable({
    listingId: v.id("listings"),
    ownerId: v.id("users"),
    mode: v.union(v.literal("test"), v.literal("prod")),
    day: v.number(),
    qualified: v.boolean(),
    lastQualified: v.boolean(),
    firstCheckedAt: v.number(),
    lastCheckedAt: v.number(),
  })
    .index("by_listing_owner_mode_day", ["listingId", "ownerId", "mode", "day"])
    .index("by_day", ["day"]),
  ownerMapEligibilityDays: defineTable({
    ownerId: v.id("users"),
    mode: v.union(v.literal("test"), v.literal("prod")),
    day: v.number(),
    observedSpaces: v.number(),
    eligibleSpaces: v.number(),
    firstCheckedAt: v.number(),
    lastCheckedAt: v.number(),
  })
    .index("by_owner_mode_day", ["ownerId", "mode", "day"])
    .index("by_day", ["day"]),
  clerkContactSnapshots: defineTable({
    clerkId: v.string(),
    mode: v.union(v.literal("test"), v.literal("prod")),
    instanceId: v.string(),
    updatedAt: v.number(),
    eventAt: v.number(),
    deleted: v.boolean(),
    uncertain: v.boolean(),
    emailHash: v.union(v.string(), v.null()),
    phoneHash: v.union(v.string(), v.null()),
    emailChangedAt: v.optional(v.number()),
    phoneChangedAt: v.optional(v.number()),
    eventId: v.string(),
    appliedAt: v.number(),
  })
    .index("by_clerk_mode", ["clerkId", "mode"])
    .index("by_deleted", ["deleted"]),

  users: defineTable({
    identityCheckId: v.optional(v.id("identityChecks")),
    identityHold: v.optional(v.boolean()),
    clerkId: v.string(),
    clerkDeletedAt: v.optional(v.number()),
    name: v.string(),
    email: v.string(),
    avatar: v.optional(v.string()),
    messageEmailsEnabled: v.optional(v.boolean()),
    notificationEmail: v.optional(v.string()),
    notificationEmailVerifiedAt: v.optional(v.number()),
    notificationEmailExpiresAt: v.optional(v.number()),
    notificationEmailMode: v.optional(
      v.union(v.literal("test"), v.literal("prod")),
    ),
    notificationEmailProofAfter: v.optional(v.number()),
    notificationEmailRevision: v.optional(v.number()),
    welcomeEmailAttemptedAt: v.optional(v.number()),
    role: v.union(
      v.literal("tenant"),
      v.literal("landlord"),
      v.literal("admin"),
    ),
    createdAt: v.number(),
    // Extended profile fields
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    receiveUnmatchedLeads: v.optional(v.boolean()),
    housingLeadEmailsEnabled: v.optional(v.boolean()),
    phone: v.optional(v.string()),
    phoneVerified: v.optional(v.boolean()),
    phoneVerificationSource: v.optional(v.literal("clerk")),
    phoneVerificationMode: v.optional(
      v.union(v.literal("test"), v.literal("prod")),
    ),
    phoneVerifiedAt: v.optional(v.number()),
    phoneVerificationExpiresAt: v.optional(v.number()),
    phoneRevision: v.optional(v.number()),
    phoneProofAfter: v.optional(v.number()),
    listingPhoneConsent: v.optional(
      v.object({ revision: v.number(), expiresAt: v.number() }),
    ),
    profilePhoto: v.optional(v.string()),
    profilePhotoStorageId: v.optional(v.id("_storage")),
    profilePhotoRevision: v.optional(v.number()),
    profilePhotoRemoved: v.optional(v.boolean()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    hometown: v.optional(v.string()),
    occupation: v.optional(v.string()),
    company: v.optional(v.string()),
    bio: v.optional(v.string()),
    petInfo: v.optional(v.string()),
    petPhoto: v.optional(v.string()),
    petPhotoStorageId: v.optional(v.id("_storage")),
    petPhotoRevision: v.optional(v.number()),
    petPhotoRemoved: v.optional(v.boolean()),
    linkedinVerified: v.optional(v.boolean()),
    // Referral system
    referralCode: v.optional(v.string()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_referral_code", ["referralCode"]),

  listingLocations: defineTable({
    listingId: v.id("listings"),
    addressKey: v.string(),
    generation: v.number(),
    status: v.union(
      v.literal("looking_up"),
      v.literal("candidate"),
      v.literal("confirmed"),
      v.literal("failed"),
    ),
    candidates: v.array(placeCandidate),
    exactLatitude: v.optional(v.number()),
    exactLongitude: v.optional(v.number()),
    provider: v.optional(v.string()),
    matchedAddress: v.optional(v.string()),
    confirmedBy: v.optional(v.id("users")),
    updatedAt: v.number(),
  }).index("by_listing", ["listingId"]),
  geoRequests: defineTable({
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_time", ["createdAt"]),
  locationAudit: defineTable({
    listingId: v.id("listings"),
    actorId: v.id("users"),
    action: v.string(),
    note: v.string(),
    createdAt: v.number(),
  }).index("by_listing", ["listingId"]),
  properties: defineTable({
    ownerId: v.id("users"),
    primaryListingId: v.id("listings"),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    locationVersion: v.number(),
    approvedLocationVersion: v.optional(v.number()),
    mapLatitude: v.optional(v.number()),
    mapLongitude: v.optional(v.number()),
    locationConfirmedAt: v.optional(v.number()),
    unitCount: v.number(),
    setupCompletedAt: v.number(),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  unitAudit: defineTable({
    propertyId: v.id("properties"),
    listingId: v.id("listings"),
    actorId: v.id("users"),
    action: v.string(),
    note: v.string(),
    createdAt: v.number(),
  }).index("by_property", ["propertyId"]),
  listings: defineTable({
    propertyGroupId: v.optional(v.id("properties")),
    parentListingId: v.optional(v.id("listings")),
    propertyLocationVersion: v.optional(v.number()),
    unitName: v.optional(v.string()),
    unitNameKey: v.optional(v.string()),
    independentSpaceConfirmedAt: v.optional(v.number()),
    mapLatitude: v.optional(v.number()),
    mapLongitude: v.optional(v.number()),
    locationConfirmedAt: v.optional(v.number()),
    locationGeneration: v.optional(v.number()),
    firstPublishedAt: v.optional(v.number()),
    publicationRequested: v.optional(v.boolean()),
    revision: v.optional(v.number()),
    approvalStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
    approvedRevision: v.optional(v.number()),
    publicId: v.optional(v.string()),
    searchCity: v.optional(v.string()),
    searchState: v.optional(v.string()),
    landlordId: v.id("users"),
    title: v.string(),
    description: v.string(),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    address: v.string(),
    price: v.number(),
    bedrooms: v.number(),
    bathrooms: v.number(),
    maxOccupancy: v.optional(v.number()),
    details: v.optional(listingDetails),
    propertyType: v.string(),
    amenities: v.array(v.string()),
    photos: v.array(v.string()),
    photoAssets: v.optional(v.array(photoAsset)),
    petFriendly: v.boolean(),
    utilitiesIncluded: v.boolean(),
    parkingIncluded: v.boolean(),
    availableFrom: v.number(),
    calendarSyncThrough: v.optional(v.number()),
    moderationHold: v.optional(v.boolean()),
    minStay: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("pending"),
      v.literal("rejected"),
    ),
    createdAt: v.number(),
    views: v.number(),
    // Featured listing (paid boost via Creem.io)
    featured: v.optional(v.boolean()),
    featuredUntil: v.optional(v.number()),
    featuredPaymentId: v.optional(v.id("payments")),
    featuredMode: v.optional(v.union(v.literal("test"), v.literal("prod"))),
  })
    .index("by_property", ["propertyGroupId"])
    .index("by_property_name", ["propertyGroupId", "unitNameKey"])
    .index("by_property_newest", ["propertyGroupId", "status", "createdAt"])
    .index("by_property_price", ["propertyGroupId", "status", "price"])
    .index("by_property_views", ["propertyGroupId", "status", "views"])
    .index("by_landlord", ["landlordId"])
    .index("by_landlord_status", ["landlordId", "status"])
    .index("by_status", ["status"])
    .index("by_city_state", ["city", "state"])
    .index("by_status_city", ["status", "city"])
    .index("by_featured", ["featured", "featuredUntil"])
    .index("by_featured_mode", ["featuredMode", "featured", "featuredUntil"])
    .index("by_publicId", ["publicId"])
    .index("by_search_newest", ["status", "createdAt"])
    .index("by_search_price", ["status", "price"])
    .index("by_search_views", ["status", "views"])
    .index("by_city_newest", ["status", "searchCity", "createdAt"])
    .index("by_city_price", ["status", "searchCity", "price"])
    .index("by_city_views", ["status", "searchCity", "views"]),

  savedListings: defineTable({
    tenantId: v.id("users"),
    listingId: v.id("listings"),
    savedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_saved", ["tenantId", "savedAt"])
    .index("by_listing", ["listingId"])
    .index("by_tenant_listing", ["tenantId", "listingId"]),

  userBlocks: defineTable({
    blockerId: v.id("users"),
    blockedId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_pair", ["blockerId", "blockedId"])
    .index("by_blocker", ["blockerId"]),
  messageTemplates: defineTable(templateFields)
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "normalizedName"]),
  messagingPreferences: defineTable({
    userId: v.id("users"),
    signature: v.string(),
  }).index("by_user", ["userId"]),
  messages: defineTable(messageFields)
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["senderId", "receiverId"],
    })
    .index("by_conversation", ["conversationId"])
    .index("by_receiver", ["receiverId"])
    .index("by_sender_request", ["senderId", "clientRequestId"])
    .index("by_conversation_receiver_read", [
      "conversationId",
      "receiverId",
      "read",
    ])
    .index("by_conversation_read", ["conversationId", "read"]),
  conversations: defineTable(conversationFields)
    .index("by_listing", ["listingId"])
    .index("by_tenant_latest", ["tenantId", "lastMessageAt"])
    .index("by_landlord_latest", ["landlordId", "lastMessageAt"])
    .index("by_key", ["key"])
    .index("by_tenant", ["tenantId"])
    .index("by_landlord", ["landlordId"])
    .index("by_listing_tenant", ["listingId", "tenantId"])
    .index("by_tenant_landlord", ["tenantId", "landlordId"]),
  conversationInbox: defineTable({
    personText: v.optional(v.string()),
    userId: v.id("users"),
    otherId: v.id("users"),
    conversationId: v.id("conversations"),
    folder: v.union(
      v.literal("inbox"),
      v.literal("archived"),
      v.literal("blocked"),
    ),
    unread: v.boolean(),
    lastMessageAt: v.number(),
  })
    .searchIndex("search_person", {
      searchField: "personText",
      filterFields: ["userId", "folder", "unread"],
    })
    .index("by_other", ["otherId"])
    .index("by_conversation_user", ["conversationId", "userId"])
    .index("by_user_folder_time", ["userId", "folder", "lastMessageAt"])
    .index("by_user_folder_unread_time", [
      "userId",
      "folder",
      "unread",
      "lastMessageAt",
    ])
    .index("by_user_other", ["userId", "otherId"]),
  inboxStats: defineTable({
    userId: v.id("users"),
    inbox: v.number(),
    unread: v.number(),
    archived: v.number(),
    blocked: v.number(),
  }).index("by_user", ["userId"]),
  participantNameJobs: defineTable({
    userId: v.id("users"),
    generation: v.number(),
    pending: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_pending", ["pending"]),
  inboxFolderJobs: defineTable({
    userId: v.id("users"),
    otherId: v.id("users"),
    generation: v.number(),
    pending: v.boolean(),
  })
    .index("by_pending", ["pending"])
    .index("by_pair", ["userId", "otherId"])
    .index("by_user_pending", ["userId", "pending"]),

  reviewNotices: defineTable({
    reviewId: v.optional(v.id("reviews")),
    inquiryId: v.optional(v.id("bookingInquiries")),
    recipientId: v.id("users"),
    senderId: v.optional(v.id("users")),
    kind: v.union(v.literal("decision"), v.literal("invitation")),
    body: v.string(),
    emailStatus: deliveryStatus,
    createdAt: v.number(),
    lastAttemptAt: v.optional(v.number()),
  })
    .index("by_recipient", ["recipientId"])
    .index("by_inquiry_recipient", ["inquiryId", "recipientId"])
    .index("by_recipient_kind", ["recipientId", "kind"]),
  reviewStats: defineTable({
    key: v.string(),
    count: v.number(),
    sum: v.number(),
  }).index("by_key", ["key"]),
  reviewEvents: defineTable({
    reviewId: v.id("reviews"),
    actorId: v.id("users"),
    action: v.string(),
    note: v.string(),
    revision: v.number(),
    snapshot: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_review", ["reviewId"]),
  reviews: defineTable({
    listingId: v.id("listings"),
    landlordId: v.id("users"),
    reviewerId: v.id("users"),
    rating: v.number(),
    comment: v.string(),
    kind: v.optional(reviewKind),
    subjectId: v.optional(v.id("users")),
    title: v.optional(v.string()),
    phone: v.optional(v.string()),
    stayStart: v.optional(v.number()),
    stayEnd: v.optional(v.number()),
    bookingId: v.optional(v.id("bookingInquiries")),
    stayEvidence: v.optional(v.string()),
    experienceConfirmed: v.optional(v.boolean()),
    status: v.optional(reviewStatus),
    revision: v.optional(v.number()),
    moderationNote: v.optional(v.string()),
    counted: v.optional(v.boolean()),
    removalRequested: v.optional(v.boolean()),
    removalReason: v.optional(v.string()),
    response: v.optional(v.string()),
    responseStatus: v.optional(reviewStatus),
    responseRevision: v.optional(v.number()),
    responseAt: v.optional(v.number()),
    responseNote: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_listing_status", ["listingId", "status"])
    .index("by_listing_kind_status", ["listingId", "kind", "status"])
    .index("by_landlord_kind_status", ["landlordId", "kind", "status"])
    .index("by_subject_kind_status", ["subjectId", "kind", "status"])
    .index("by_reviewer_kind_subject", ["reviewerId", "kind", "subjectId"])
    .index("by_status", ["status"])
    .index("by_response_status", ["responseStatus"])
    .index("by_removal", ["removalRequested"])
    .index("by_listing", ["listingId"])
    .index("by_landlord", ["landlordId"])
    .index("by_reviewer", ["reviewerId"])
    .index("by_reviewer_listing", ["reviewerId", "listingId"]),

  savedSearches: defineTable({
    ...searchFields,
    userId: v.id("users"),
    name: v.string(),
    emailAlerts: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_email_alerts", ["emailAlerts"]),

  // Creem.io subscription plans
  subscriptions: defineTable({
    userId: v.id("users"),
    creemCustomerId: v.optional(v.string()),
    creemSubscriptionId: v.string(),
    creemProductId: v.string(),
    plan: v.union(
      v.literal("landlord_pro"),
      v.literal("landlord_premium"),
      v.literal("tenant_plus"),
    ),
    status: subscriptionStatus,
    verifiedAt: v.optional(v.number()),
    paidThrough: v.optional(v.number()),
    lastPaidTransactionId: v.optional(v.string()),
    billingHold: v.optional(v.boolean()),
    entitlementExpiresAt: v.optional(v.number()),
    entitlementCheckedAt: v.optional(v.number()),
    lastEventAt: v.optional(v.number()),
    mode: v.optional(v.union(v.literal("test"), v.literal("prod"))),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_paid", ["userId", "mode", "status", "paidThrough"])
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_creem_subscription", ["creemSubscriptionId"])
    .index("by_status", ["status"]),

  // One-time payments (featured listing boosts, security deposits, etc.)
  payments: defineTable({
    refundedAmountCents: v.optional(v.number()),
    trustedCheckout: v.optional(v.boolean()),
    requestId: v.optional(v.string()),
    plan: v.optional(
      v.union(
        v.literal("landlord_pro"),
        v.literal("landlord_premium"),
        v.literal("tenant_plus"),
      ),
    ),
    checkoutUrl: v.optional(v.string()),
    returnUrl: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("test"), v.literal("prod"))),
    userId: v.id("users"),
    creemCustomerId: v.optional(v.string()),
    creemCheckoutId: v.string(),
    creemTransactionId: v.optional(v.string()),
    productId: v.string(),
    purpose: v.union(
      v.literal("feature_listing"),
      v.literal("subscription"),
      v.literal("security_deposit"),
      v.literal("other"),
    ),
    listingId: v.optional(v.id("listings")),
    amountCents: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("refunded"),
      v.literal("partially_refunded"),
      v.literal("disputed"),
    ),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_request", ["requestId"])
    .index("by_creem_checkout", ["creemCheckoutId"])
    .index("by_listing", ["listingId"])
    .index("by_status", ["status"]),

  // Raw webhook events for audit/replay protection
  webhookEvents: defineTable({
    source: v.string(),
    eventId: v.string(),
    eventType: v.string(),
    payload: v.string(),
    processedAt: v.number(),
  }).index("by_source_event", ["source", "eventId"]),

  housingRequests: defineTable(housingRequestFields)
    .index("by_user", ["userId"])
    .index("by_city_state", ["city", "state"])
    .index("by_status", ["status"]),

  housingRequestMatches: defineTable({
    rankVersion: v.optional(v.literal(1)),
    offerKind: v.optional(v.number()),
    offerDifferences: v.optional(v.number()),
    offerArea: v.optional(v.number()),
    offerBedrooms: v.optional(v.number()),
    offerPrice: v.optional(v.number()),
    kind: v.optional(v.union(v.literal("matched"), v.literal("unmatched"))),
    matchedAt: v.optional(v.number()),
    unmatchedAt: v.optional(v.number()),
    requestId: v.id("housingRequests"),
    listingId: v.id("listings"),
    landlordId: v.id("users"),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
    conversationId: v.optional(v.id("conversations")),
  })
    .index("by_requestId_and_listingId", ["requestId", "listingId"])
    .index("by_requestId_and_landlordId", ["requestId", "landlordId"])
    .index("by_request_owner_response", [
      "requestId",
      "landlordId",
      "respondedAt",
    ])
    .index("by_request_owner_conversation", [
      "requestId",
      "landlordId",
      "conversationId",
    ])
    .index("by_rank_version", ["rankVersion"])
    .index("by_request_owner_rank", [
      "requestId",
      "landlordId",
      "rankVersion",
      "offerKind",
      "offerDifferences",
      "offerArea",
      "offerBedrooms",
      "offerPrice",
    ]),

  housingRequestDeliveries: defineTable({
    response: v.optional(leadResponse),
    emailGeneration: v.optional(v.number()),
    emailSelectionStartedAt: v.optional(v.number()),
    notificationListingId: v.optional(v.id("listings")),
    emailAttemptedAt: v.optional(v.number()),
    emailProviderId: v.optional(v.string()),
    kind: v.optional(v.union(v.literal("matched"), v.literal("unmatched"))),
    requestId: v.id("housingRequests"),
    landlordId: v.id("users"),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
    emailStatus: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("unconfigured"),
      v.literal("failed"),
      v.literal("unknown"),
      v.literal("suppressed"),
    ),
  })
    .index("by_requestId_and_landlordId", ["requestId", "landlordId"])
    .index("by_landlordId", ["landlordId"])
    .index("by_email_status_time", ["emailStatus", "emailSelectionStartedAt"]),

  calendarFeeds: defineTable(calendarFeedFields)
    .index("by_listingId_and_provider", ["listingId", "provider"])
    .index("by_nextSyncAt", ["nextSyncAt"]),

  // Landlord availability calendar blocks
  availabilityBlocks: defineTable({
    listingId: v.id("listings"),
    inquiryId: v.optional(v.id("bookingInquiries")),
    startDate: v.number(),
    endDate: v.number(),
    type: v.union(v.literal("unavailable"), v.literal("booked")),
    title: v.optional(v.string()),
    note: v.optional(v.string()),
    calendarFeedId: v.optional(v.id("calendarFeeds")),
    createdAt: v.number(),
  })
    .index("by_listing", ["listingId"])
    .index("by_inquiry", ["inquiryId"])
    .index("by_listing_start", ["listingId", "startDate"])
    .index("by_listing_end", ["listingId", "endDate"])
    .index("by_calendarFeedId", ["calendarFeedId"]),

  bookingInquiries: defineTable({
    conversationId: v.optional(v.id("conversations")),
    originalRequest: v.optional(originalRequest),
    listingId: v.id("listings"),
    tenantId: v.id("users"),
    landlordId: v.id("users"),
    moveIn: v.number(),
    moveOut: v.number(),
    occupants: v.number(),
    pets: v.boolean(),
    message: v.string(),
    status: inquiryStatus,
    minimumStayDaysAtConfirmation: v.optional(v.number()),
    lifecycleRevision: v.optional(v.number()),
    pendingBookingChangeId: v.optional(v.id("bookingChanges")),
    cancelledAt: v.optional(v.number()),
    cancelledEffectiveEnd: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    availabilityBlockId: v.optional(v.id("availabilityBlocks")),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_availability_block", ["availabilityBlockId"])
    .index("by_listing_tenant_status_dates", [
      "listingId",
      "tenantId",
      "status",
      "moveIn",
      "moveOut",
    ])
    .index("by_landlordId", ["landlordId"])
    .index("by_listingId_and_status", ["listingId", "status"])
    .index("by_listing_status_end", ["listingId", "status", "moveOut"])
    .index("by_tenant_landlord", ["tenantId", "landlordId"])
    .index("by_listing_tenant", ["listingId", "tenantId"]),

  bookingChanges: defineTable(changeFields)
    .index("by_inquiry", ["inquiryId"])
    .index("by_request", ["inquiryId", "proposerId", "clientRequestId"]),
  bookingEvents: defineTable({
    inquiryId: v.id("bookingInquiries"),
    actorId: v.id("users"),
    recipientId: v.id("users"),
    action: eventAction,
    changeId: v.optional(v.id("bookingChanges")),
    reason: v.string(),
    beforeMoveIn: v.number(),
    beforeMoveOut: v.number(),
    afterMoveIn: v.number(),
    afterMoveOut: v.number(),
    revision: v.number(),
    createdAt: v.number(),
    emailStatus: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("unconfigured"),
      v.literal("suppressed"),
    ),
    emailAttempt: v.optional(v.number()),
    emailAttemptedAt: v.optional(v.number()),
  })
    .index("by_inquiry", ["inquiryId"])
    .index("by_prior_stay", [
      "inquiryId",
      "beforeMoveIn",
      "beforeMoveOut",
      "action",
    ]),
  rentalToolRequests: defineTable(toolFields)
    .index("by_inquiry", ["inquiryId"])
    .index("by_owner_request", ["ownerId", "requestId"])
    .index("by_inquiry_kind_status", ["inquiryId", "kind", "status"]),
  rentalDocuments: defineTable(documentFields).index("by_inquiry", [
    "inquiryId",
  ]),
  rentalDocumentVersions: defineTable(versionFields).index("by_document", [
    "documentId",
  ]),
  rentalDocumentUploads: defineTable({
    inquiryId: v.id("bookingInquiries"),
    creatorId: v.id("users"),
    documentId: v.optional(v.id("rentalDocuments")),
    title: v.string(),
    kind: documentKind,
    filename: v.string(),
    expectedVersionId: v.optional(v.id("rentalDocumentVersions")),
    requestId: v.string(),
    createdAt: v.number(),
    state: v.union(v.literal("reserved"), v.literal("completed")),
    versionId: v.optional(v.id("rentalDocumentVersions")),
  })
    .index("by_request", ["creatorId", "requestId"])
    .index("by_creator_time", ["creatorId", "createdAt"]),
  rentalDocumentAudit: defineTable({
    inquiryId: v.id("bookingInquiries"),
    documentId: v.id("rentalDocuments"),
    versionId: v.optional(v.id("rentalDocumentVersions")),
    actorId: v.id("users"),
    action: v.string(),
    createdAt: v.number(),
  })
    .index("by_inquiry", ["inquiryId"])
    .index("by_document", ["documentId"]),
  rentalSignatureConsents: defineTable({
    documentId: v.id("rentalDocuments"),
    versionId: v.id("rentalDocumentVersions"),
    userId: v.id("users"),
    legalName: v.string(),
    email: v.string(),
    verifiedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_version_user", ["versionId", "userId"]),
  rentalSignatures: defineTable(signatureFields)
    .index("by_document", ["documentId"])
    .index("by_state_poll", ["state", "lastPollAt"]),
  // Referral program
  referrals: defineTable({
    referrerId: v.id("users"),
    referralCode: v.string(),
    referredUserId: v.optional(v.id("users")),
    status: v.union(
      v.literal("code_created"),
      v.literal("signed_up"),
      v.literal("converted"),
    ),
    createdAt: v.number(),
    convertedAt: v.optional(v.number()),
  })
    .index("by_referrer", ["referrerId"])
    .index("by_code", ["referralCode"])
    .index("by_referred_user", ["referredUserId"]),
});
