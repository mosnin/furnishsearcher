import { readFile } from "node:fs/promises";
import { createClerkClient } from "@clerk/backend";
import { localPreviewRequestAllowed } from "@/lib/local-preview";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  if (!localPreviewRequestAllowed(process.env, request.headers)) {
    return new Response(null, { status: 404, headers });
  }
  try {
    const credentials = JSON.parse(
      await readFile(".clerk/.tmp/keyless.json", "utf8"),
    );
    if (
      !credentials.publishableKey.startsWith("pk_test_") ||
      credentials.publishableKey !==
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ) {
      throw new Error("Wrong development instance");
    }
    const clerk = createClerkClient({ secretKey: credentials.secretKey });
    const user = await clerk.users.getUser(process.env.LOCAL_PREVIEW_USER_ID!);
    if (
      !user.externalId?.startsWith("furnishsearcher-qa-") ||
      !user.emailAddresses.some((email) =>
        email.emailAddress.endsWith("+clerk_test@example.com"),
      )
    ) {
      throw new Error("Reserved preview account required");
    }
    const ticket = await clerk.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 60,
    });
    return Response.json(
      { ticket: ticket.token, userId: user.id },
      { headers },
    );
  } catch {
    return Response.json(
      {
        error:
          "Local preview authentication is unavailable. Restart npm run dev:preview.",
      },
      { status: 503, headers },
    );
  }
}
