import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authenticatedIssuance } from "../lib/contact-token";
import { limitedText } from "../lib/email-webhook";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const options = httpAction(
  async () => new Response(null, { status: 204, headers: cors }),
);
export const confirm = httpAction(async (ctx, request) => {
  const respond = (status: number, data: object) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  let issuedAt: number;
  try {
    // Convex verifies the signature/audience/expiry of THIS Authorization JWT.
    // UserIdentity strips reserved iat, so recover it from the same header.
    issuedAt = authenticatedIssuance(
      request.headers.get("authorization"),
      await ctx.auth.getUserIdentity(),
    );
  } catch {
    return respond(401, {
      error: "Sign in again to refresh contact confirmation.",
    });
  }
  let body:
    | { kind: "email"; clerkId: string }
    | { kind: "phone"; clerkId: string; phone: string };
  try {
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    )
      throw new Error();
    const raw = JSON.parse(await limitedText(request, 4096));
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      typeof raw.clerkId !== "string" ||
      raw.clerkId.length > 200 ||
      (raw.kind !== "email" && raw.kind !== "phone") ||
      Object.keys(raw).some(
        (key) =>
          ![
            "clerkId",
            "kind",
            ...(raw.kind === "phone" ? ["phone"] : []),
          ].includes(key),
      ) ||
      (raw.kind === "phone" &&
        (typeof raw.phone !== "string" || raw.phone.length > 40))
    )
      throw new Error();
    body = raw;
  } catch {
    return respond(400, { error: "Invalid contact confirmation request." });
  }
  try {
    if (body.kind === "email") {
      await ctx.runMutation(internal.emailContacts.confirmFromHttp, {
        clerkId: body.clerkId,
        issuedAt,
      });
      return respond(200, { ok: true });
    }
    const result = await ctx.runMutation(internal.users.confirmPhoneFromHttp, {
      clerkId: body.clerkId,
      phone: body.phone,
      issuedAt,
    });
    return respond(200, result);
  } catch {
    return respond(409, {
      error:
        "Your sign-in account has not confirmed this contact, or the session changed. Verify your primary contact, then refresh confirmation.",
    });
  }
});
