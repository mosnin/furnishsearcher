import { emailProofCurrent, type EmailProof } from "../../lib/email-contact";

export function emailContactMode(): "test" | "prod" {
  const mode = process.env.CLERK_EMAIL_MODE ?? "test";
  if (mode !== "test" && mode !== "prod")
    throw new Error("Email confirmation is not configured. Contact support.");
  return mode;
}

export function messageEmailRecipient(user: EmailProof): string | null {
  if (
    user.messageEmailsEnabled !== true ||
    !emailProofCurrent(user, emailContactMode())
  )
    return null;
  return user.notificationEmail!;
}
