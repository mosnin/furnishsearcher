export const EMAIL_PROOF_LIFETIME = 30 * 24 * 60 * 60 * 1000;

// Deliberately accept a single ordinary mailbox, never display-name/header syntax.
export function canonicalEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
      email,
    ) ||
    email.split("@")[0].length > 64 ||
    email.startsWith(".") ||
    email.includes("..") ||
    email.includes(".@")
  )
    throw new Error("A verified account email is required.");
  return email;
}

export type EmailProof = {
  clerkDeletedAt?: number;
  notificationEmail?: string;
  notificationEmailVerifiedAt?: number;
  notificationEmailExpiresAt?: number;
  notificationEmailMode?: "test" | "prod";
  messageEmailsEnabled?: boolean;
};

export function emailProofCurrent(
  user: EmailProof,
  mode: "test" | "prod",
  now = Date.now(),
) {
  return (
    user.clerkDeletedAt === undefined &&
    !!user.notificationEmail &&
    user.notificationEmailMode === mode &&
    typeof user.notificationEmailVerifiedAt === "number" &&
    user.notificationEmailVerifiedAt <= now &&
    typeof user.notificationEmailExpiresAt === "number" &&
    user.notificationEmailExpiresAt > now &&
    user.notificationEmailExpiresAt <=
      user.notificationEmailVerifiedAt + EMAIL_PROOF_LIFETIME
  );
}
