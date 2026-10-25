import { canonicalEmail } from "./email-contact";
import { canonicalPhone } from "./contact-verification";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid event object");
  return value as RecordValue;
};
function timestamp(value: unknown, now: number) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > now + 60_000
  )
    throw new Error("Invalid event time");
  return value;
}
function primary(data: RecordValue, channel: "email" | "phone") {
  const id =
    data[
      channel === "email"
        ? "primary_email_address_id"
        : "primary_phone_number_id"
    ];
  const values =
    data[channel === "email" ? "email_addresses" : "phone_numbers"];
  if (
    !Array.isArray(values) ||
    values.length > 1000 ||
    !(id === null || typeof id === "string")
  )
    throw new Error("Missing primary contact snapshot");
  if (id === null) return null;
  const entries = values.map(record).filter((value) => value.id === id);
  if (entries.length !== 1)
    throw new Error("Invalid primary contact reference");
  const entry = entries[0],
    verification =
      entry.verification === null
        ? { status: "unverified" }
        : record(entry.verification);
  if (verification.status !== "verified") return null;
  const value = entry[channel === "email" ? "email_address" : "phone_number"];
  if (typeof value !== "string") throw new Error("Invalid primary contact");
  return channel === "email" ? canonicalEmail(value) : canonicalPhone(value);
}
export function parseClerkContactEvent(
  payload: string,
  instance: string,
  now = Date.now(),
) {
  const event = record(JSON.parse(payload));
  if (
    event.object !== "event" ||
    event.instance_id !== instance ||
    typeof event.type !== "string"
  )
    throw new Error("Invalid event source");
  if (!["user.created", "user.updated", "user.deleted"].includes(event.type))
    return null;
  const data = record(event.data);
  if (
    typeof data.id !== "string" ||
    !/^user_[A-Za-z0-9_-]{1,200}$/.test(data.id)
  )
    throw new Error("Invalid account reference");
  const eventAt = timestamp(event.timestamp, now),
    deleted = event.type === "user.deleted";
  if (deleted && data.deleted !== true)
    throw new Error("Invalid deleted account event");
  if (!deleted && data.object !== "user")
    throw new Error("Invalid account snapshot");
  return {
    clerkId: data.id,
    deleted,
    eventAt,
    updatedAt: deleted ? eventAt : timestamp(data.updated_at, now),
    email: deleted ? null : primary(data, "email"),
    phone: deleted ? null : primary(data, "phone"),
  };
}
export async function contactHash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
