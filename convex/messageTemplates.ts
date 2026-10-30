import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { templateDoc } from "./validators/messaging";
function clean(value: string, field: string, max: number) {
  const result = value.trim();
  if (!result || result.length > max)
    throw new Error(`${field} must contain 1–${max} characters.`);
  return result;
}
export const getSettings = query({
  args: {},
  returns: v.object({ templates: v.array(templateDoc), signature: v.string() }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const templates = await ctx.db
      .query("messageTemplates")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(11);
    if (templates.length > 10)
      throw new Error("Template limit requires review.");
    const prefs = await ctx.db
      .query("messagingPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return { templates, signature: prefs?.signature ?? "" };
  },
});
export const save = mutation({
  args: {
    id: v.optional(v.id("messageTemplates")),
    name: v.string(),
    body: v.string(),
  },
  returns: v.id("messageTemplates"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      name = clean(args.name, "Template name", 80),
      body = clean(args.body, "Template", 2000);
    const normalizedName = name.toLowerCase().replace(/\s+/g, " ");
    const duplicate = await ctx.db
      .query("messageTemplates")
      .withIndex("by_user_name", (q) =>
        q.eq("userId", user._id).eq("normalizedName", normalizedName),
      )
      .unique();
    if (duplicate && duplicate._id !== args.id)
      throw new Error("A template already uses this name.");
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.userId !== user._id)
        throw new Error("Template not found.");
      await ctx.db.patch(args.id, {
        name,
        normalizedName,
        body,
        updatedAt: Date.now(),
      });
      return args.id;
    }
    const existing = await ctx.db
      .query("messageTemplates")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(10);
    if (existing.length >= 10)
      throw new Error("You can save up to 10 templates.");
    return ctx.db.insert("messageTemplates", {
      userId: user._id,
      name,
      normalizedName,
      body,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
export const remove = mutation({
  args: { id: v.id("messageTemplates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      template = await ctx.db.get(args.id);
    if (!template || template.userId !== user._id)
      throw new Error("Template not found.");
    await ctx.db.delete(args.id);
    return null;
  },
});
export const saveSignature = mutation({
  args: { signature: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx),
      signature = args.signature.trim();
    if (signature.length > 500)
      throw new Error("Signature must be at most 500 characters.");
    const existing = await ctx.db
      .query("messagingPreferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { signature });
    else
      await ctx.db.insert("messagingPreferences", {
        userId: user._id,
        signature,
      });
    return null;
  },
});
