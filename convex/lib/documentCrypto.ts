export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export function documentKeys() {
  const active = process.env.RENTAL_DOCUMENT_ACTIVE_KEY;
  let keys: Record<string, string>;
  try {
    keys = JSON.parse(process.env.RENTAL_DOCUMENT_KEYRING ?? "{}");
  } catch {
    throw new Error("Private document storage is not configured.");
  }
  if (
    !active ||
    !/^[a-zA-Z0-9_-]{1,40}$/.test(active) ||
    !keys ||
    Array.isArray(keys) ||
    typeof keys !== "object" ||
    !Object.values(keys).every(
      (k) => typeof k === "string" && /^[a-f0-9]{64}$/i.test(k),
    ) ||
    !Object.prototype.hasOwnProperty.call(keys, active) ||
    !keys[active]
  )
    throw new Error("Private document storage is not configured.");
  return { active, keys };
}
export async function documentKey(keyId: string) {
  const { keys } = documentKeys(),
    raw = keys[keyId];
  if (!raw)
    throw new Error(
      "This document’s encryption key is unavailable. Contact support.",
    );
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(raw.match(/../g)!, (b) => parseInt(b, 16)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptDocument(bytes: Uint8Array) {
  const { active } = documentKeys(),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    key = await documentKey(active);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new Uint8Array(bytes),
    ),
  );
  const payload = new Uint8Array(12 + encrypted.length);
  payload.set(iv);
  payload.set(encrypted, 12);
  return { keyId: active, payload };
}
export async function decryptDocument(blob: Blob, keyId: string) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length < 29 || bytes.length > MAX_DOCUMENT_BYTES + 28)
    throw new Error("Document content is unavailable.");
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      await documentKey(keyId),
      bytes.slice(12),
    ),
  );
}
export async function documentHash(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function validatePdf(bytes: Uint8Array) {
  if (
    bytes.length < 12 ||
    bytes.length > MAX_DOCUMENT_BYTES ||
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-" ||
    !new TextDecoder().decode(bytes.slice(-1024)).includes("%%EOF")
  )
    throw new Error(
      "Choose a PDF up to 10 MB with a valid PDF header and end marker.",
    );
}
export function documentFilename(value: string) {
  const name = value.trim().replace(/[\\/\u0000-\u001f\u007f]/g, "_");
  if (
    name.length < 5 ||
    name.length > 160 ||
    !name.toLowerCase().endsWith(".pdf")
  )
    throw new Error("Use a PDF filename of 5–160 characters.");
  return name;
}
