import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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
  }).index("by_clerk_id", ["clerkId"]),

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
    propertyType: v.string(),
    amenities: v.array(v.string()),
    photos: v.array(v.string()),
    petFriendly: v.boolean(),
    utilitiesIncluded: v.boolean(),
    parkingIncluded: v.boolean(),
    availableFrom: v.number(),
    minStay: v.number(),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("pending")),
    createdAt: v.number(),
    views: v.number(),
  })
    .index("by_landlord", ["landlordId"])
    .index("by_status", ["status"])
    .index("by_city_state", ["city", "state"])
    .index("by_status_city", ["status", "city"]),

  savedListings: defineTable({
    tenantId: v.id("users"),
    listingId: v.id("listings"),
    savedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_listing", ["tenantId", "listingId"]),

  messages: defineTable({
    conversationId: v.string(),
    senderId: v.id("users"),
    receiverId: v.id("users"),
    listingId: v.id("listings"),
    content: v.string(),
    read: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_receiver", ["receiverId"])
    .index("by_conversation_read", ["conversationId", "read"]),

  conversations: defineTable({
    listingId: v.id("listings"),
    tenantId: v.id("users"),
    landlordId: v.id("users"),
    lastMessage: v.string(),
    lastMessageAt: v.number(),
    tenantRead: v.boolean(),
    landlordRead: v.boolean(),
  })
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
    .index("by_reviewer", ["reviewerId"]),

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
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  housingRequests: defineTable({
    userId: v.id("users"),
    city: v.string(),
    state: v.string(),
    moveInDate: v.number(),
    duration: v.number(),
    maxBudget: v.number(),
    bedrooms: v.number(),
    petFriendly: v.boolean(),
    description: v.string(),
    status: v.union(v.literal("open"), v.literal("fulfilled"), v.literal("closed")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_city_state", ["city", "state"])
    .index("by_status", ["status"]),
});
