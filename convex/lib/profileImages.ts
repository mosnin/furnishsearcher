import type { Doc } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
export type ImageKind = "profile" | "pet";
export function imageFields(kind: ImageKind) {
  return kind === "profile"
    ? ({
        id: "profilePhotoStorageId",
        revision: "profilePhotoRevision",
        removed: "profilePhotoRemoved",
        legacy: "profilePhoto",
      } as const)
    : ({
        id: "petPhotoStorageId",
        revision: "petPhotoRevision",
        removed: "petPhotoRemoved",
        legacy: "petPhoto",
      } as const);
}
function legacyImage(value?: string) {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export async function profileImage(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  kind: ImageKind,
) {
  const f = imageFields(kind);
  if (user[f.removed]) return null;
  if (user[f.id]) {
    const row = await ctx.db
      .query("profileImageUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", user[f.id]))
      .unique();
    return row &&
      row.ownerId === user._id &&
      row.kind === kind &&
      row.revision === (user[f.revision] ?? 0) &&
      row.retiredAt === undefined
      ? ctx.storage.getUrl(user[f.id]!)
      : null;
  }
  return (
    legacyImage(user[f.legacy]) ??
    (kind === "profile" ? legacyImage(user.avatar) : null)
  );
}
export async function profileView<T extends Doc<"users">>(
  ctx: QueryCtx | MutationCtx,
  user: T,
) {
  const [profile, pet] = await Promise.all([
    profileImage(ctx, user, "profile"),
    profileImage(ctx, user, "pet"),
  ]);
  return {
    ...user,
    profilePhoto: profile ?? undefined,
    petPhoto: pet ?? undefined,
    avatar: profile ?? undefined,
  };
}
export async function retireImage(
  ctx: MutationCtx,
  user: Doc<"users">,
  kind: ImageKind,
) {
  const storageId = user[imageFields(kind).id];
  if (!storageId) return;
  const row = await ctx.db
    .query("profileImageUploads")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .unique();
  // Never delete unrelated listing/document storage through a profile operation.
  if (
    !row ||
    row.ownerId !== user._id ||
    row.kind !== kind ||
    row.revision !== (user[imageFields(kind).revision] ?? 0)
  )
    throw new Error("Profile photo needs support review before replacement.");
  await ctx.storage.delete(storageId);
  await ctx.db.patch(row._id, { storageId: undefined, retiredAt: Date.now() });
}
