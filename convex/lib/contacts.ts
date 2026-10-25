import { phoneIsConfirmed } from "../../lib/contact-verification";
export function contactMode(): "test" | "prod" {
  const mode = process.env.CLERK_CONTACT_MODE ?? "test";
  if (mode !== "test" && mode !== "prod")
    throw new Error("Phone confirmation is not configured. Contact support.");
  return mode;
}
export function currentPhoneProof(
  user: Parameters<typeof phoneIsConfirmed>[0],
) {
  return user.phoneVerificationMode === contactMode() && phoneIsConfirmed(user);
}
