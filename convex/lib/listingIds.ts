import type { MutationCtx } from "../_generated/server";
export async function nextListingId(ctx: MutationCtx) {
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", "publicListingId"))
    .unique();
  let value = counter?.value ?? 100000;
  let available = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    value++;
    if (
      !(await ctx.db
        .query("listings")
        .withIndex("by_publicId", (q) => q.eq("publicId", `FS-${value}`))
        .first())
    ) {
      available = true;
      break;
    }
  }
  if (!available) throw new Error("Property ID allocation needs review.");
  if (counter) await ctx.db.patch(counter._id, { value });
  else await ctx.db.insert("counters", { name: "publicListingId", value });
  return `FS-${value}`;
}
