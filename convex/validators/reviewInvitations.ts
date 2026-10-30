import { v } from "convex/values";
import { deliveryStatus } from "./support";
export const invitationDeliveryStatus = v.union(
  deliveryStatus,
  v.literal("suppressed"),
);
