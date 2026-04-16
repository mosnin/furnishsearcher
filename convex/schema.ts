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
});
