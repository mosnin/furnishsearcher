export async function limitedText(response: Request | Response, limit: number) {
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("too_large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("missing_body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function verifyEmailWebhook(
  body: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
) {
  const id = headers.get("svix-id") ?? "",
    timestamp = headers.get("svix-timestamp") ?? "",
    signatures = headers.get("svix-signature") ?? "";
  if (
    !/^[\w-]{1,200}$/.test(id) ||
    !/^\d{1,12}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    signatures.length > 2048 ||
    !secret.startsWith("whsec_")
  )
    return false;
  try {
    const bytes = Uint8Array.from(atob(secret.slice(6)), (c) =>
      c.charCodeAt(0),
    );
    if (bytes.length < 16) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const payload = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
    for (const signature of signatures.split(" ").slice(0, 8)) {
      if (!/^v1,[A-Za-z0-9+/]+={0,2}$/.test(signature)) continue;
      const candidate = Uint8Array.from(atob(signature.slice(3)), (c) =>
        c.charCodeAt(0),
      );
      if (
        candidate.length === 32 &&
        (await crypto.subtle.verify("HMAC", key, candidate, payload))
      )
        return true;
    }
  } catch {
    return false;
  }
  return false;
}
