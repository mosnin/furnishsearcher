import { limitedText } from "../../lib/email-webhook";
import { US_STATES, normalizeState } from "../../lib/locations";

export function steadilyAvailable() {
  return (
    process.env.STEADILY_ENABLED === "1" &&
    !!process.env.STEADILY_API_KEY?.trim()
  );
}
export type InsuranceAddress = {
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
};
export function insuranceAddressKey(address: InsuranceAddress) {
  return JSON.stringify([
    address.street_address,
    address.city,
    address.state,
    address.zip_code,
  ]);
}
export function insuranceAddress(listing: {
  address: string;
  city: string;
  state: string;
  zip: string;
}): InsuranceAddress {
  const address = {
    street_address: listing.address.trim(),
    city: listing.city.trim(),
    state: normalizeState(listing.state),
    zip_code: listing.zip.trim(),
  };
  if (
    !address.street_address ||
    address.street_address.length > 250 ||
    /[\u0000-\u001f]/.test(address.street_address + address.city) ||
    !address.city ||
    address.city.length > 100 ||
    !Object.hasOwn(US_STATES, address.state) ||
    !/^\d{5}(-\d{4})?$/.test(address.zip_code)
  )
    throw new Error(
      "Add a complete US property address before requesting an estimate.",
    );
  return address;
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function estimateLink(value: unknown, listingId: string) {
  const estimates = record(value)?.estimates;
  if (!Array.isArray(estimates) || estimates.length !== 1)
    throw new Error("Steadily did not return an estimate for this property.");
  const result = record(estimates[0]);
  if (
    result?.property_id !== listingId ||
    result.error ||
    typeof result.start_url !== "string"
  )
    throw new Error(
      "Steadily could not prepare this property. You can continue on its website.",
    );
  let url: URL;
  try {
    url = new URL(result.start_url);
  } catch {
    throw new Error("Steadily returned an invalid continuation link.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !(url.hostname === "steadily.com" || url.hostname.endsWith(".steadily.com"))
  )
    throw new Error("Steadily returned an unsupported continuation link.");
  return url.toString();
}
export async function requestEstimate(
  listingId: string,
  address: InsuranceAddress,
) {
  if (!steadilyAvailable())
    throw new Error(
      "Insurance estimates require an approved Steadily connection.",
    );
  const response = await fetch("https://api.steadily.com/v1/quote/estimate", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Steadily-ApiKey": process.env.STEADILY_API_KEY!.trim(),
    },
    body: JSON.stringify({ properties: [{ property_id: listingId, address }] }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      "Steadily could not complete the estimate. No automatic retry was made.",
    );
  }
  return estimateLink(
    JSON.parse(await limitedText(response, 128 * 1024)),
    listingId,
  );
}
