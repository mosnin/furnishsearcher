import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { housingRequestFields } from "./validators/housing";
import { caseFields, replyFields, auditFields } from "./validators/support";
import { messageFields, conversationFields, templateFields } from "./validators/messaging";
import { calendarFeedFields } from "./validators/calendars";

export default defineSchema({
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
  supportAudit: defineTable(auditFields).index("by_case", ["caseId", "createdAt"]),
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    avatar: v.optional(v.string()),
    role: v.union(v.literal("tenant"), v.literal("landlord"), v.literal("admin")),
    createdAt: v.number(),
    // Extended profile fields
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerified: v.optional(v.boolean()),
    profilePhoto: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    hometown: v.optional(v.string()),
    occupation: v.optional(v.string()),
    company: v.optional(v.string()),
    bio: v.optional(v.string()),
    petInfo: v.optional(v.string()),
    petPhoto: v.optional(v.string()),
    linkedinVerified: v.optional(v.boolean()),
    // Referral system
    referralCode: v.optional(v.string()),
  }).index("by_clerk_id", ["clerkId"])
    .index("by_referral_code", ["referralCode"]),

  listings: defineTable({
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
    propertyType: v.string(),
    amenities: v.array(v.string()),
    photos: v.array(v.string()),
    petFriendly: v.boolean(),
    utilitiesIncluded: v.boolean(),
    parkingIncluded: v.boolean(),
    availableFrom: v.number(),
    calendarSyncThrough: v.optional(v.number()),
    moderationHold: v.optional(v.boolean()),
    minStay: v.number(),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("pending"), v.literal("rejected")),
    createdAt: v.number(),
    views: v.number(),
    // Featured listing (paid boost via Creem.io)
    featured: v.optional(v.boolean()),
    featuredUntil: v.optional(v.number()),
  })
    .index("by_landlord", ["landlordId"])
    .index("by_landlord_status", ["landlordId", "status"])
    .index("by_status", ["status"])
    .index("by_city_state", ["city", "state"])
    .index("by_status_city", ["status", "city"])
    .index("by_featured", ["featured", "featuredUntil"]),

  savedListings: defineTable({
    tenantId: v.id("users"),
    listingId: v.id("listings"),
    savedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_listing", ["tenantId", "listingId"]),

  userBlocks: defineTable({ blockerId: v.id("users"), blockedId: v.id("users"), createdAt: v.number() })
    .index("by_pair", ["blockerId", "blockedId"])
    .index("by_blocker", ["blockerId"]),
  messageTemplates: defineTable(templateFields)
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "normalizedName"]),
  messagingPreferences: defineTable({ userId: v.id("users"), signature: v.string() }).index("by_user", ["userId"]),
  messages: defineTable(messageFields)
    .index("by_conversation", ["conversationId"])
    .index("by_receiver", ["receiverId"])
    .index("by_sender_request", ["senderId", "clientRequestId"])
    .index("by_conversation_receiver_read", ["conversationId", "receiverId", "read"])
    .index("by_conversation_read", ["conversationId", "read"]),
  conversations: defineTable(conversationFields)
    .index("by_key", ["key"])
    .index("by_tenant", ["tenantId"])
    .index("by_landlord", ["landlordId"])
    .index("by_listing_tenant", ["listingId", "tenantId"]),

  reviews: defineTable({
    listingId: v.id("listings"),
    landlordId: v.id("users"),
    reviewerId: v.id("users"),
    rating: v.number(),
    comment: v.string(),
    createdAt: v.number(),
  })
    .index("by_listing", ["listingId"])
    .index("by_landlord", ["landlordId"])
    .index("by_reviewer", ["reviewerId"])
    .index("by_reviewer_listing", ["reviewerId", "listingId"]),

  savedSearches: defineTable({
    userId: v.id("users"),
    name: v.string(),
    location: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    maxPrice: v.optional(v.number()),
    bedrooms: v.optional(v.number()),
    propertyType: v.optional(v.string()),
    petFriendly: v.optional(v.boolean()),
    emailAlerts: v.optional(v.boolean()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  // Creem.io subscription plans
  subscriptions: defineTable({
    userId: v.id("users"),
    creemCustomerId: v.optional(v.string()),
    creemSubscriptionId: v.string(),
    creemProductId: v.string(),
    plan: v.union(
      v.literal("landlord_pro"),
      v.literal("landlord_premium"),
      v.literal("tenant_plus")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("paused"),
      v.literal("canceled"),
      v.literal("expired")
    ),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_creem_subscription", ["creemSubscriptionId"])
    .index("by_status", ["status"]),

  // One-time payments (featured listing boosts, security deposits, etc.)
  payments: defineTable({
    userId: v.id("users"),
    creemCustomerId: v.optional(v.string()),
    creemCheckoutId: v.string(),
    creemTransactionId: v.optional(v.string()),
    productId: v.string(),
    purpose: v.union(
      v.literal("feature_listing"),
      v.literal("subscription"),
      v.literal("security_deposit"),
      v.literal("other")
    ),
    listingId: v.optional(v.id("listings")),
    amountCents: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("refunded")
    ),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
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
    requestId: v.id("housingRequests"), listingId: v.id("listings"), landlordId: v.id("users"),
    createdAt: v.number(), respondedAt: v.optional(v.number()), conversationId: v.optional(v.id("conversations")),
  }).index("by_requestId_and_listingId", ["requestId", "listingId"])
    .index("by_requestId_and_landlordId", ["requestId", "landlordId"]),

  housingRequestDeliveries: defineTable({
    requestId: v.id("housingRequests"), landlordId: v.id("users"), createdAt: v.number(),
    readAt: v.optional(v.number()),
    emailStatus: v.union(v.literal("queued"), v.literal("sent"), v.literal("unconfigured"), v.literal("failed"), v.literal("suppressed")),
  }).index("by_requestId_and_landlordId", ["requestId", "landlordId"])
    .index("by_landlordId", ["landlordId"]),

  calendarFeeds: defineTable(calendarFeedFields)
    .index("by_listingId_and_provider", ["listingId", "provider"])
    .index("by_nextSyncAt", ["nextSyncAt"]),

  // Landlord availability calendar blocks
  availabilityBlocks: defineTable({
    listingId: v.id("listings"),
    startDate: v.number(),
    endDate: v.number(),
    type: v.union(v.literal("unavailable"), v.literal("booked")),
    note: v.optional(v.string()),
    calendarFeedId: v.optional(v.id("calendarFeeds")),
    createdAt: v.number(),
  })
    .index("by_listing", ["listingId"])
    .index("by_listing_start", ["listingId", "startDate"])
    .index("by_calendarFeedId", ["calendarFeedId"]),

  bookingInquiries: defineTable({
    listingId: v.id("listings"),
    tenantId: v.id("users"),
    landlordId: v.id("users"),
    moveIn: v.number(),
    moveOut: v.number(),
    occupants: v.number(),
    pets: v.boolean(),
    message: v.string(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined"), v.literal("withdrawn")),
    createdAt: v.number(),
    updatedAt: v.number(),
    availabilityBlockId: v.optional(v.id("availabilityBlocks")),
  }).index("by_tenantId", ["tenantId"])
    .index("by_landlordId", ["landlordId"])
    .index("by_listingId_and_status", ["listingId", "status"]),

  // Referral program
  referrals: defineTable({
    referrerId: v.id("users"),
    referralCode: v.string(),
    referredUserId: v.optional(v.id("users")),
    status: v.union(
      v.literal("code_created"),
      v.literal("signed_up"),
      v.literal("converted")
    ),
    createdAt: v.number(),
    convertedAt: v.optional(v.number()),
  })
    .index("by_referrer", ["referrerId"])
    .index("by_code", ["referralCode"])
    .index("by_referred_user", ["referredUserId"]),
});
