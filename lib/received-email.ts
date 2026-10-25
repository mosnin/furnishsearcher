import { createHash } from "node:crypto";
import { convert } from "html-to-text";
import { canonicalEmail } from "./email-contact";

export const REPLY_MARKER = "--- Reply above this line ---";
function mailbox(value: unknown): string {
  if (typeof value !== "string" || value.length > 500)
    throw new Error("invalid_mailbox");
  const match = /^(?:[^<>\r\n]*<([^<>\r\n]+)>|([^<>\s]+@[^<>\s]+))$/.exec(
    value.trim(),
  );
  if (!match) throw new Error("invalid_mailbox");
  return canonicalEmail(match[1] ?? match[2]);
}
export type ReceivedReply = {
  digest?: string;
  sender?: string;
  content?: string;
  reason?: string;
  attachmentsOmitted: boolean;
};
export function receivedReply(
  data: unknown,
  emailId: string,
  domain: string,
): ReceivedReply {
  const out: ReceivedReply = { attachmentsOmitted: false };
  if (!data || typeof data !== "object")
    return { ...out, reason: "malformed_email" };
  const mail = data as Record<string, unknown>;
  if (mail.id !== emailId || !Array.isArray(mail.to) || mail.to.length > 50)
    return { ...out, reason: "malformed_email" };
  try {
    const tokens = new Set(
      mail.to
        .map(mailbox)
        .filter((address) => address.endsWith(`@${domain}`))
        .map((address) => address.split("@")[0])
        .filter((local) => /^[a-f0-9]{64}$/.test(local)),
    );
    if (tokens.size !== 1) return { ...out, reason: "unrecognized_reply" };
    out.digest = createHash("sha256")
      .update([...tokens][0])
      .digest("hex");
    out.sender = mailbox(mail.from);
  } catch {
    return { ...out, reason: "malformed_email" };
  }
  // These are receiving-server results, never the sender's Authentication-Results header.
  const auth = mail.authentication as Record<string, unknown> | null;
  if (
    !auth ||
    !(auth.dmarc === "pass" || (auth.dmarc === "gray" && auth.dkim === "pass"))
  )
    return { ...out, reason: "sender_unverified" };
  const headers = Object.fromEntries(
    Object.entries(
      (mail.headers && typeof mail.headers === "object"
        ? mail.headers
        : {}) as Record<string, unknown>,
    ).map(([key, value]) => [
      key.toLowerCase(),
      typeof value === "string" ? value.toLowerCase().trim() : "",
    ]),
  );
  if (
    (headers["auto-submitted"] && headers["auto-submitted"] !== "no") ||
    /^(bulk|list|junk)$/.test(headers.precedence ?? "") ||
    headers["x-autoreply"] ||
    headers["x-autorespond"]
  )
    return { ...out, reason: "automated_email" };
  if (!Array.isArray(mail.attachments))
    return { ...out, reason: "malformed_email" };
  out.attachmentsOmitted = mail.attachments.length > 0;
  let body = typeof mail.text === "string" ? mail.text : "";
  if (body.length > 512 * 1024) return { ...out, reason: "message_too_long" };
  if (!body.trim() && typeof mail.html === "string") {
    if (mail.html.length > 256 * 1024)
      return { ...out, reason: "message_too_long" };
    body = convert(mail.html, {
      wordwrap: false,
      limits: {
        maxInputLength: 256 * 1024,
        maxDepth: 60,
        maxChildNodes: 10000,
      },
      selectors: [
        ...[
          "script",
          "style",
          "iframe",
          "object",
          "form",
          "img",
          "blockquote",
          ".gmail_quote",
        ].map((selector) => ({ selector, format: "skip" })),
      ],
    });
  }
  const lines = body
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .split("\n");
  const quote = lines.findIndex(
    (line, i) =>
      /^\s*(?:>\s*)*--- Reply above this line ---\s*$/.test(line) ||
      (/^On .{1,300}wrote:\s*$/i.test(line.trim()) &&
        lines.slice(i + 1, i + 4).some((next) => /^\s*>/.test(next))) ||
      (/^From:\s+.+/i.test(line) &&
        lines.slice(i + 1, i + 6).some((next) => /^Subject:\s+.+/i.test(next))),
  );
  body = (quote >= 0 ? lines.slice(0, quote) : lines).join("\n").trim();
  if (!body)
    return {
      ...out,
      reason: out.attachmentsOmitted ? "attachments_only" : "empty_reply",
    };
  if (body.length > 2000) return { ...out, reason: "message_too_long" };
  return { ...out, content: body };
}
