// A confirmation is deliberately time-limited. Legacy booleans are not proof.
export const PHONE_PROOF_LIFETIME = 30 * 24 * 60 * 60 * 1000;
export function canonicalPhone(value: string) {
  const phone = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(phone))
    throw new Error(
      "Enter a phone number with country code, for example +14155552671.",
    );
  return phone;
}
export function phoneIsConfirmed(
  user: {
    phone?: string;
    phoneVerified?: boolean;
    phoneVerificationSource?: string;
    phoneVerificationMode?: string;
    phoneVerifiedAt?: number;
    phoneVerificationExpiresAt?: number;
  },
  now = Date.now(),
) {
  return (
    user.phoneVerified === true &&
    user.phoneVerificationSource === "clerk" &&
    (user.phoneVerificationMode === "test" ||
      user.phoneVerificationMode === "prod") &&
    !!user.phone &&
    /^\+[1-9]\d{7,14}$/.test(user.phone) &&
    typeof user.phoneVerifiedAt === "number" &&
    user.phoneVerifiedAt <= now &&
    typeof user.phoneVerificationExpiresAt === "number" &&
    user.phoneVerificationExpiresAt > now &&
    user.phoneVerificationExpiresAt <=
      user.phoneVerifiedAt + PHONE_PROOF_LIFETIME
  );
}
