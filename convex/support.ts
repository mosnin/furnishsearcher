import { listingPhotos } from "./lib/photos";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import {
  mutation,
  query,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireUser } from "./lib/auth";
import {
  caseStatus,
  deliveryStatus,
  caseFields,
  replyFields,
  auditFields,
} from "./validators/support";

const hour = 3_600_000;
const reportCategories = [
  "Misleading or fraudulent listing",
  "Discrimination",
  "Safety or privacy concern",
  "Harassment or abusive conduct",
  "Spam or suspicious message",
  "Other",
];
function text(value: string, label: string, min: number, max: number) {
  const result = value.trim();
  if (result.length < min || result.length > max)
    throw new Error(`${label} must contain ${min}–${max} characters.`);
  return result;
}
async function optionalUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return requireUser(ctx);
}
async function admin(ctx: MutationCtx | QueryCtx) {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new Error("Staff access required.");
  return user;
}
async function allowed(ctx: MutationCtx | QueryCtx, id: Id<"supportCases">) {
  const user = await requireUser(ctx);
  const ticket = await ctx.db.get(id);
  if (!ticket || (user.role !== "admin" && ticket.userId !== user._id))
    throw new Error("Case not found.");
  return { user, ticket };
}
async function rateLimit(
  ctx: MutationCtx,
  email: string,
  userId?: Id<"users">,
) {
  const since = Date.now() - hour;
  const emails = await ctx.db
    .query("supportCases")
    .withIndex("by_email", (q) => q.eq("email", email).gte("createdAt", since))
    .take(6);
  if (emails.length >= 5)
    throw new Error("Too many requests. Please try again in an hour.");
  if (userId) {
    const cases = await ctx.db
      .query("supportCases")
      .withIndex("by_user", (q) =>
        q.eq("userId", userId).gte("createdAt", since),
      )
      .take(11);
    if (cases.length >= 10)
      throw new Error("Too many requests. Please try again in an hour.");
  }
}
async function insert(
  ctx: MutationCtx,
  fields: Omit<
    Doc<"supportCases">,
    | "_id"
    | "_creationTime"
    | "createdAt"
    | "updatedAt"
    | "status"
    | "notificationStatus"
  >,
) {
  const now = Date.now();
  const id = await ctx.db.insert("supportCases", {
    ...fields,
    createdAt: now,
    updatedAt: now,
    status: "open",
    notificationStatus: "pending",
  });
  await ctx.scheduler.runAfter(0, internal.supportEmails.notifyStaff, { id });
  return id;
}

export const submitContact = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    subject: v.string(),
    message: v.string(),
  },
  returns: v.id("supportCases"),
  handler: async (ctx, args) => {
    const name = text(args.name, "Name", 1, 100);
    const email = text(args.email, "Email", 3, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("Enter a valid email address.");
    const subjects = [
      "General Inquiry",
      "Report a Listing",
      "Landlord Support",
      "Technical Issue",
      "Partnership",
    ];
    if (!subjects.includes(args.subject))
      throw new Error("Select a supported subject.");
    const body = text(args.message, "Message", 10, 5000);
    const user = await optionalUser(ctx);
    // Caller-provided email never establishes ownership of an existing case.
    await rateLimit(ctx, email, user?._id);
    return insert(ctx, {
      name,
      email,
      subject: args.subject,
      body,
      kind: "support",
      ...(user ? { userId: user._id } : {}),
    });
  },
});

export const report = mutation({
  args: {
    listingId: v.optional(v.id("listings")),
    messageId: v.optional(v.id("messages")),
    category: v.string(),
    details: v.string(),
  },
  returns: v.id("supportCases"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!!args.listingId === !!args.messageId)
      throw new Error("Choose one report target.");
    if (!reportCategories.includes(args.category))
      throw new Error("Select a report reason.");
    const body = text(args.details, "Report details", 10, 5000);
    let listingId = args.listingId;
    let evidence: string;
    if (args.messageId) {
      const message = await ctx.db.get(args.messageId);
      if (!message || message.receiverId !== user._id)
        throw new Error("Only received messages can be reported.");
      listingId = message.listingId;
      evidence = JSON.stringify({
        content: message.content,
        senderId: message.senderId,
        receiverId: message.receiverId,
        createdAt: message.createdAt,
      });
    } else {
      const listing = await ctx.db.get(args.listingId!);
      if (!listing || listing.status !== "active")
        throw new Error("Listing unavailable. Use the contact form instead.");
      if (listing.landlordId === user._id)
        throw new Error("Use support for your own property.");
      evidence = JSON.stringify({
        title: listing.title.slice(0, 500),
        description: listing.description.slice(0, 20000),
        landlordId: listing.landlordId,
        city: listing.city,
        state: listing.state,
        price: listing.price,
        photos: (await listingPhotos(ctx, listing)).photos.slice(0, 30).map((url) => url.slice(0, 2048)),
      });
    }
    const previous = args.messageId
      ? await ctx.db
          .query("supportCases")
          .withIndex("by_user_message", (q) =>
            q.eq("userId", user._id).eq("messageId", args.messageId),
          )
          .order("desc")
          .first()
      : await ctx.db
          .query("supportCases")
          .withIndex("by_user_listing", (q) =>
            q
              .eq("userId", user._id)
              .eq("listingId", listingId)
              .eq("kind", "listing_report"),
          )
          .order("desc")
          .first();
    if (
      previous &&
      (previous.status === "open" || previous.status === "reviewing")
    )
      return previous._id;
    await rateLimit(ctx, user.email.toLowerCase(), user._id);
    return insert(ctx, {
      userId: user._id,
      name: user.name,
      email: user.email.toLowerCase(),
      kind: args.messageId ? "message_report" : "listing_report",
      subject: args.messageId ? "Message report" : "Property report",
      body,
      category: args.category,
      listingId,
      ...(args.messageId ? { messageId: args.messageId } : {}),
      evidence,
    });
  },
});

const summaryFields = {
  _id: v.id("supportCases"),
  subject: v.string(),
  kind: caseFields.kind,
  status: caseStatus,
  createdAt: v.number(),
  updatedAt: v.number(),
};
const summary = v.object(summaryFields);

export const mine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(summary),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await ctx.db
      .query("supportCases")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map(
        ({ _id, subject, kind, status, createdAt, updatedAt }) => ({
          _id,
          subject,
          kind,
          status,
          createdAt,
          updatedAt,
        }),
      ),
    };
  },
});
const staffSummary = v.object({
  ...summaryFields,
  name: v.string(),
  category: v.optional(v.string()),
  notificationStatus: deliveryStatus,
});
export const queue = query({
  args: {
    status: v.optional(caseStatus),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(staffSummary),
  handler: async (ctx, args) => {
    await admin(ctx);
    const result = await (
      args.status
        ? ctx.db
            .query("supportCases")
            .withIndex("by_status", (q) => q.eq("status", args.status!))
        : ctx.db.query("supportCases")
    )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map(
        ({
          _id,
          subject,
          kind,
          status,
          createdAt,
          updatedAt,
          name,
          category,
          notificationStatus,
        }) => ({
          _id,
          subject,
          kind,
          status,
          createdAt,
          updatedAt,
          name,
          category,
          notificationStatus,
        }),
      ),
    };
  },
});
export const get = query({
  args: { id: v.id("supportCases") },
  returns: v.object({
    ...caseFields,
    _id: v.id("supportCases"),
    _creationTime: v.number(),
    isStaff: v.boolean(),
    listingHeld: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { user, ticket } = await allowed(ctx, args.id);
    const isStaff = user.role === "admin";
    const listing = ticket.listingId
      ? await ctx.db.get(ticket.listingId)
      : null;
    return {
      ...ticket,
      evidence: isStaff ? ticket.evidence : undefined,
      isStaff,
      listingHeld: isStaff && !!listing?.moderationHold,
    };
  },
});
const replyDoc = v.object({
  ...replyFields,
  _id: v.id("supportReplies"),
  _creationTime: v.number(),
});
export const replies = query({
  args: { id: v.id("supportCases"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(replyDoc),
  handler: async (ctx, args) => {
    const { user } = await allowed(ctx, args.id);
    return (
      user.role === "admin"
        ? ctx.db
            .query("supportReplies")
            .withIndex("by_case", (q) => q.eq("caseId", args.id))
        : ctx.db
            .query("supportReplies")
            .withIndex("by_case_visibility", (q) =>
              q.eq("caseId", args.id).eq("internal", false),
            )
    )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
export const audit = query({
  args: { id: v.id("supportCases"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      ...auditFields,
      _id: v.id("supportAudit"),
      _creationTime: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await admin(ctx);
    return ctx.db
      .query("supportAudit")
      .withIndex("by_case", (q) => q.eq("caseId", args.id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
export const reply = mutation({
  args: { id: v.id("supportCases"), body: v.string(), internal: v.boolean() },
  returns: v.id("supportReplies"),
  handler: async (ctx, args) => {
    const { user, ticket } = await allowed(ctx, args.id);
    const staff = user.role === "admin";
    if (args.internal && !staff) throw new Error("Staff access required.");
    const body = text(args.body, "Reply", 1, 5000);
    const recent = await ctx.db
      .query("supportReplies")
      .withIndex("by_author", (q) =>
        q.eq("authorId", user._id).gte("createdAt", Date.now() - hour),
      )
      .take(31);
    if (recent.length >= 30)
      throw new Error("Too many replies. Please try again later.");
    const id = await ctx.db.insert("supportReplies", {
      caseId: args.id,
      authorId: user._id,
      staff,
      internal: args.internal,
      body,
      createdAt: Date.now(),
      ...(!args.internal ? { emailStatus: "pending" as const } : {}),
    });
    if (
      !staff &&
      (ticket.status === "resolved" || ticket.status === "dismissed")
    ) {
      await ctx.db.insert("supportAudit", {
        caseId: args.id,
        actorId: user._id,
        action: "reopened",
        note: "Requester added a follow-up.",
        createdAt: Date.now(),
      });
    }
    await ctx.db.patch(args.id, {
      updatedAt: Date.now(),
      ...(!staff &&
      (ticket.status === "resolved" || ticket.status === "dismissed")
        ? { status: "open" as const }
        : {}),
    });
    if (!args.internal)
      await ctx.scheduler.runAfter(0, internal.supportEmails.sendReply, {
        replyId: id,
      });
    return id;
  },
});
export const review = mutation({
  args: {
    id: v.id("supportCases"),
    status: caseStatus,
    note: v.string(),
    listingAction: v.optional(v.union(v.literal("hold"), v.literal("release"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await admin(ctx);
    const ticket = await ctx.db.get(args.id);
    if (!ticket) throw new Error("Case not found.");
    const note = text(args.note, "Review note", 3, 2000);
    if (args.listingAction) {
      const listing = ticket.listingId
        ? await ctx.db.get(ticket.listingId)
        : null;
      if (!listing) throw new Error("Reported listing no longer exists.");
      await ctx.db.patch(listing._id, {
        moderationHold: args.listingAction === "hold",
        ...(args.listingAction === "hold"
          ? { status: "inactive" as const }
          : {}),
      });
    }
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
    await ctx.db.insert("supportAudit", {
      caseId: args.id,
      actorId: actor._id,
      action: `${args.status}${args.listingAction ? `:listing_${args.listingAction}` : ""}`,
      note,
      createdAt: Date.now(),
    });
    return null;
  },
});
export const retryEmail = mutation({
  args: {
    id: v.id("supportCases"),
    replyId: v.optional(v.id("supportReplies")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await admin(ctx);
    if (args.replyId) {
      const reply = await ctx.db.get(args.replyId);
      if (!reply || reply.caseId !== args.id || reply.internal)
        throw new Error("Reply unavailable.");
      if (
        reply.emailStatus !== "failed" &&
        reply.emailStatus !== "unconfigured"
      )
        throw new Error("Email is already sent or pending.");
      await ctx.db.patch(reply._id, { emailStatus: "pending" });
      await ctx.scheduler.runAfter(0, internal.supportEmails.sendReply, {
        replyId: reply._id,
      });
    } else {
      const ticket = await ctx.db.get(args.id);
      if (
        !ticket ||
        (ticket.notificationStatus !== "failed" &&
          ticket.notificationStatus !== "unconfigured")
      )
        throw new Error("Email is already sent or pending.");
      await ctx.db.patch(args.id, { notificationStatus: "pending" });
      await ctx.scheduler.runAfter(0, internal.supportEmails.notifyStaff, {
        id: args.id,
      });
    }
    return null;
  },
});
export const emailDetails = internalQuery({
  args: {
    id: v.optional(v.id("supportCases")),
    replyId: v.optional(v.id("supportReplies")),
  },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      body: v.string(),
      caseId: v.id("supportCases"),
      toRequester: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.replyId) {
      const reply = await ctx.db.get(args.replyId);
      if (!reply || reply.internal || reply.emailStatus !== "pending")
        return null;
      const ticket = await ctx.db.get(reply.caseId);
      return ticket
        ? {
            email: ticket.email,
            body: reply.staff
              ? reply.body
              : "A requester added a follow-up to this support case.",
            caseId: ticket._id,
            toRequester: reply.staff,
          }
        : null;
    }
    const ticket = args.id ? await ctx.db.get(args.id) : null;
    return ticket?.notificationStatus === "pending"
      ? {
          email: ticket.email,
          body: "A new support case needs review.",
          caseId: ticket._id,
          toRequester: false,
        }
      : null;
  },
});
export const recordEmail = internalMutation({
  args: {
    id: v.optional(v.id("supportCases")),
    replyId: v.optional(v.id("supportReplies")),
    status: deliveryStatus,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.replyId) {
      const reply = await ctx.db.get(args.replyId);
      if (reply?.emailStatus === "pending")
        await ctx.db.patch(reply._id, { emailStatus: args.status });
    } else if (args.id) {
      const ticket = await ctx.db.get(args.id);
      if (ticket?.notificationStatus === "pending")
        await ctx.db.patch(ticket._id, { notificationStatus: args.status });
    }
    return null;
  },
});
