import { createHmac, createHash } from "node:crypto";
import { convexTest } from "convex-test";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { conversationKey } from "../convex/lib/messageAccess";
import { verifyEmailWebhook, limitedText } from "../lib/email-webhook";
import { receivedReply, REPLY_MARKER } from "../lib/received-email";
const modules = import.meta.glob("../convex/**/*.ts");
const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));
const now = Date.UTC(2026, 9, 25),
  secret =
    "whsec_" +
    Buffer.from("synthetic-webhook-secret-32-bytes!").toString("base64"),
  domain = "replies.example.test";
const emailId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  for (const [name, value] of Object.entries({
    CLERK_EMAIL_MODE: "test",
    RESEND_API_KEY: "synthetic",
    EMAIL_FROM: "notice@example.test",
    NEXT_PUBLIC_APP_URL: "https://app.example.test",
    MESSAGE_REPLY_DOMAIN: domain,
    MESSAGE_REPLY_KEY: "ab".repeat(32),
    RESEND_RECEIVING_WEBHOOK_SECRET: secret,
  }))
    vi.stubEnv(name, value);
  send.mockResolvedValue({ data: { id: "synthetic-accepted" }, error: null });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  send.mockReset();
});
function headers(
  body: string,
  timestamp = String(Math.floor(Date.now() / 1000)),
) {
  const id = "msg_synthetic",
    mac = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
      .update(`${id}.${timestamp}.${body}`)
      .digest("base64");
  return new Headers({
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${mac}`,
  });
}
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      clerkId: "owner",
      name: "Owner",
      role: "landlord",
      email: "untrusted@example.test",
      createdAt: now,
      notificationEmail: "owner@example.test",
      notificationEmailVerifiedAt: now,
      notificationEmailExpiresAt: now + 30 * 86400000,
      notificationEmailRevision: 1,
      notificationEmailMode: "test",
      messageEmailsEnabled: true,
    });
    const tenant = await ctx.db.insert("users", {
      clerkId: "tenant",
      name: "Tenant",
      role: "tenant",
      email: "tenant@example.test",
      createdAt: now,
    });
    const other = await ctx.db.insert("users", {
      clerkId: "other",
      name: "Other",
      role: "tenant",
      email: "other@example.test",
      createdAt: now,
    });
    const listing = await ctx.db.insert("listings", {
      landlordId: owner,
      title: "Synthetic home",
      description: "Fixture",
      address: "Private street",
      city: "Austin",
      state: "TX",
      zip: "78701",
      price: 1900,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: "House",
      amenities: [],
      photos: [],
      petFriendly: false,
      utilitiesIncluded: true,
      parkingIncluded: true,
      availableFrom: now,
      minStay: 1,
      status: "inactive",
      createdAt: now,
      views: 0,
    });
    const key = conversationKey(owner, tenant, listing);
    const conv = await ctx.db.insert("conversations", {
      key,
      listingId: listing,
      tenantId: tenant,
      landlordId: owner,
      lastMessage: "Initial note",
      lastMessageAt: now,
      tenantRead: true,
      landlordRead: false,
      tenantArchived: true,
      landlordArchived: true,
    });
    const message = await ctx.db.insert("messages", {
      conversationId: key,
      conversationDocId: conv,
      listingId: listing,
      senderId: tenant,
      receiverId: owner,
      content: "Initial note",
      read: false,
      createdAt: now,
      emailStatus: "pending",
    });
    return { owner, tenant, other, listing, conv, message };
  });
  await t.action(internal.messageEmails.notify, { messageId: ids.message });
  const address = send.mock.calls.at(-1)?.[0].replyTo as string;
  expect(address).toMatch(
    new RegExp(`^[a-f0-9]{64}@${domain.replaceAll(".", "\\.")}$`),
  );
  const digest = createHash("sha256")
    .update(address.split("@")[0])
    .digest("hex");
  const owner = t.withIdentity({ subject: "owner" }),
    tenant = t.withIdentity({ subject: "tenant" });
  const mail = (patch: Record<string, unknown> = {}) => ({
    id: emailId,
    from: "Owner <owner@example.test>",
    to: [address],
    text: `Yes, those dates work.\n\n${REPLY_MARKER}\nOriginal private note`,
    authentication: { dmarc: "pass", dkim: "pass", spf: "pass" },
    headers: {},
    attachments: [],
    ...patch,
  });
  const post = async (id = emailId) => {
    const body = JSON.stringify({
      type: "email.received",
      data: { email_id: id, to: [address] },
    });
    return t.fetch("/webhooks/resend-replies", {
      method: "POST",
      headers: headers(body),
      body,
    });
  };
  const receipt = async (id = emailId) =>
    (await t.run((ctx) =>
      ctx.db
        .query("inboundEmailReceipts")
        .withIndex("by_email", (q) => q.eq("emailId", id))
        .unique(),
    ))!;
  return { t, ids, owner, tenant, mail, post, receipt, address, digest };
}
it("matches the published Svix signature vector and rejects mutation, replay and unsupported signatures", async () => {
  const body = '{"event_type":"ping","data":{"success":true}}';
  const h = new Headers({
    "svix-id": "msg_loFOjxBNrRLzqYUf",
    "svix-timestamp": "1731705121",
    "svix-signature": "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=",
  });
  expect(
    await verifyEmailWebhook(
      body,
      h,
      "whsec_plJ3nmyCDGBKInavdOK15jsl",
      1731705121000,
    ),
  ).toBe(true);
  expect(
    await verifyEmailWebhook(
      body + " ",
      h,
      "whsec_plJ3nmyCDGBKInavdOK15jsl",
      1731705121000,
    ),
  ).toBe(false);
  expect(
    await verifyEmailWebhook(
      body,
      h,
      "whsec_plJ3nmyCDGBKInavdOK15jsl",
      1731705501000,
    ),
  ).toBe(false);
  h.set(
    "svix-signature",
    "v2,bad v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=",
  );
  expect(
    await verifyEmailWebhook(
      body,
      h,
      "whsec_plJ3nmyCDGBKInavdOK15jsl",
      1731705121000,
    ),
  ).toBe(true);
  await expect(limitedText(new Response("0123456789"), 5)).rejects.toThrow(
    "too_large",
  );
  await expect(
    limitedText(new Response(new Uint8Array([255])), 5),
  ).rejects.toThrow();
});
it("uses receiving-server authentication and bounded plain/HTML text, excluding quotes and active content", async () => {
  const f = await fixture();
  expect(receivedReply(f.mail(), emailId, domain).content).toBe(
    "Yes, those dates work.",
  );
  expect(
    receivedReply(
      f.mail({
        authentication: null,
        headers: { "Authentication-Results": "dmarc=pass" },
      }),
      emailId,
      domain,
    ).reason,
  ).toBe("sender_unverified");
  expect(
    receivedReply(
      f.mail({ authentication: { dmarc: "gray", dkim: "pass" } }),
      emailId,
      domain,
    ).content,
  ).toBeTruthy();
  expect(
    receivedReply(
      f.mail({ authentication: { dmarc: "gray", spf: "pass" } }),
      emailId,
      domain,
    ).reason,
  ).toBe("sender_unverified");
  const html = receivedReply(
    f.mail({
      text: null,
      html: '<p>Hello &amp; thanks</p><script>bad()</script><img src="https://tracking.invalid"><blockquote>old private text</blockquote>',
      attachments: [{ filename: "image.png" }],
    }),
    emailId,
    domain,
  );
  expect(html.content).toBe("Hello & thanks");
  expect(html.attachmentsOmitted).toBe(true);
  expect(
    receivedReply(f.mail({ text: "x".repeat(2001) }), emailId, domain).reason,
  ).toBe("message_too_long");
  expect(
    receivedReply(f.mail({ text: "", attachments: [{}] }), emailId, domain)
      .reason,
  ).toBe("attachments_only");
  expect(
    receivedReply(
      f.mail({ headers: { "Auto-Submitted": "auto-replied" } }),
      emailId,
      domain,
    ).reason,
  ).toBe("automated_email");
  expect(
    receivedReply(
      f.mail({ from: "owner@example.test\r\nBcc: victim@example.test" }),
      emailId,
      domain,
    ).reason,
  ).toBe("malformed_email");
});
it("appends a signed, authenticated reply once, updates the private inbox, and preserves email provenance", async () => {
  const f = await fixture(),
    fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(f.mail({ attachments: [{}] }))),
      );
  vi.stubGlobal("fetch", fetcher);
  expect((await f.post()).status).toBe(202);
  const row = await f.receipt();
  await f.t.action(internal.inboundEmailActions.receive, { id: row._id });
  expect((await f.receipt()).state).toBe("accepted");
  expect(fetcher.mock.calls[0][0]).toBe(
    `https://api.resend.com/emails/receiving/${emailId}?html_format=cid`,
  );
  expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  const accepted = await f.receipt();
  const message = await f.t.run((ctx) => ctx.db.get(accepted.messageId!));
  expect(message).toMatchObject({
    senderId: f.ids.owner,
    receiverId: f.ids.tenant,
    content: "Yes, those dates work.",
    origin: "email",
    emailAttachmentsOmitted: true,
    read: false,
  });
  expect(await f.t.run((ctx) => ctx.db.get(f.ids.conv))).toMatchObject({
    tenantRead: false,
    tenantArchived: false,
    landlordArchived: false,
  });
  expect(
    (
      await f.owner.query(api.inboundEmails.mine, {
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page[0].state,
  ).toBe("accepted");
  expect(
    (
      await f.tenant.query(api.inboundEmails.mine, {
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page,
  ).toEqual([]);
  expect((await f.post()).status).toBe(202);
  await f.t.action(internal.inboundEmailActions.receive, { id: row._id });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    await f.t.run((ctx) => ctx.db.query("messages").collect()),
  ).toHaveLength(2);
});
it("rejects a forged sender or forged authentication result without saving its content", async () => {
  for (const patch of [
    { from: "other@example.test" },
    { authentication: null },
  ]) {
    const f = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(f.mail(patch)))),
    );
    await f.post();
    const row = await f.receipt();
    await f.t.action(internal.inboundEmailActions.receive, { id: row._id });
    expect((await f.receipt()).state).toBe("rejected");
    expect(
      await f.t.run((ctx) => ctx.db.query("messages").collect()),
    ).toHaveLength(1);
    expect(JSON.stringify(await f.receipt())).not.toContain(
      "Yes, those dates work",
    );
  }
});
it("revalidates blocking, confirmation revocation, recipient changes, expiry and property ownership at commit", async () => {
  for (const change of [
    "block",
    "revoke",
    "change_email",
    "expire",
    "owner",
  ] as const) {
    const f = await fixture();
    await f.post();
    const row = await f.receipt();
    const claim = (await f.t.mutation(internal.inboundEmails.claim, {
      id: row._id,
    }))!;
    if (change === "block")
      await f.tenant.mutation(api.messages.setBlocked, {
        conversationId: f.ids.conv,
        blocked: true,
      });
    if (change === "revoke")
      await f.owner.mutation(api.emailContacts.setMessageEmails, {
        clerkId: "owner",
        enabled: false,
      });
    if (change === "change_email")
      await f.t.run((ctx) =>
        ctx.db.patch(f.ids.owner, { notificationEmail: "new@example.test" }),
      );
    if (change === "expire") vi.setSystemTime(now + 31 * 86400000);
    if (change === "owner")
      await f.t.run((ctx) =>
        ctx.db.patch(f.ids.listing, { landlordId: f.ids.other }),
      );
    await f.t.mutation(internal.inboundEmails.finalize, {
      id: row._id,
      attempt: claim.attempt,
      digest: f.digest,
      sender: "owner@example.test",
      content: "Must not be saved",
      attachmentsOmitted: false,
    });
    expect((await f.receipt()).state).toBe("rejected");
    expect(
      await f.t.run((ctx) => ctx.db.query("messages").collect()),
    ).toHaveLength(1);
    vi.setSystemTime(now);
  }
});
it("recovers stalled leases, fences old workers and stops retrying after six provider attempts", async () => {
  const f = await fixture();
  await f.post();
  const row = await f.receipt();
  const first = (await f.t.mutation(internal.inboundEmails.claim, {
    id: row._id,
  }))!;
  expect(
    await f.t.mutation(internal.inboundEmails.claim, { id: row._id }),
  ).toBeNull();
  vi.setSystemTime(now + 120001);
  const second = (await f.t.mutation(internal.inboundEmails.claim, {
    id: row._id,
  }))!;
  expect(second.attempt).toBe(2);
  await f.t.mutation(internal.inboundEmails.finalize, {
    id: row._id,
    attempt: first.attempt,
    digest: f.digest,
    sender: "owner@example.test",
    content: "Stale worker",
    attachmentsOmitted: false,
  });
  expect((await f.receipt()).state).toBe("processing");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("provider offline")),
  );
  for (let attempt = 2; attempt <= 6; attempt++) {
    await f.t.mutation(internal.inboundEmails.retry, { id: row._id, attempt });
    if (attempt < 6) {
      vi.setSystemTime((await f.receipt()).dueAt);
      await f.t.mutation(internal.inboundEmails.claim, { id: row._id });
    }
  }
  expect(await f.receipt()).toMatchObject({
    state: "rejected",
    attempt: 6,
    reason: "provider_unavailable",
  });
});
it("rejects malformed, stale and oversized HTTP deliveries before accepting work", async () => {
  const f = await fixture();
  expect(
    (
      await f.t.fetch("/webhooks/resend-replies", {
        method: "POST",
        body: "{}",
      })
    ).status,
  ).toBe(401);
  const body = JSON.stringify({
    type: "email.received",
    data: { email_id: "invalid" },
  });
  expect(
    (
      await f.t.fetch("/webhooks/resend-replies", {
        method: "POST",
        body,
        headers: headers(body),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.t.fetch("/webhooks/resend-replies", {
        method: "POST",
        body: "x".repeat(262145),
      })
    ).status,
  ).toBe(413);
  vi.stubEnv("MESSAGE_REPLY_KEY", "");
  expect((await f.post()).status).toBe(503);
  expect(
    await f.t.run((ctx) => ctx.db.query("inboundEmailReceipts").collect()),
  ).toEqual([]);
});

it("retries a temporary provider failure and then commits exactly one successful result", async () => {
  const f = await fixture();
  await f.post();
  const row = await f.receipt();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(f.mail())));
  vi.stubGlobal("fetch", fetcher);
  await f.t.action(internal.inboundEmailActions.receive, { id: row._id });
  expect(await f.receipt()).toMatchObject({ state: "retrying", attempt: 1 });
  vi.setSystemTime((await f.receipt()).dueAt);
  await f.t.action(internal.inboundEmailActions.receive, { id: row._id });
  expect(await f.receipt()).toMatchObject({ state: "accepted", attempt: 2 });
  expect(
    await f.t.run((ctx) => ctx.db.query("messages").collect()),
  ).toHaveLength(2);
});
it("ignores unrelated domains and unknown capabilities before provider fetches", async () => {
  const f = await fixture();
  for (const to of [
    ["someone@unrelated.test"],
    [`${"a".repeat(64)}@${domain}`],
    [f.address, `${"b".repeat(64)}@${domain}`],
  ]) {
    const body = JSON.stringify({
      type: "email.received",
      data: { email_id: emailId, to },
    });
    expect([202, 204]).toContain(
      (
        await f.t.fetch("/webhooks/resend-replies", {
          method: "POST",
          body,
          headers: headers(body),
        })
      ).status,
    );
  }
  expect(
    await f.t.run((ctx) => ctx.db.query("inboundEmailReceipts").collect()),
  ).toEqual([]);
});
it("paginates only the caller's minimal reply receipts and rejects anonymous readers", async () => {
  const f = await fixture();
  await f.t.run(async (ctx) => {
    for (let i = 0; i < 25; i++)
      await ctx.db.insert("inboundEmailReceipts", {
        emailId: `synthetic-${i}`,
        userId: f.ids.owner,
        conversationId: f.ids.conv,
        state: "rejected",
        attempt: 1,
        reason: "empty_reply",
        dueAt: now,
        createdAt: now,
      });
    await ctx.db.insert("inboundEmailReceipts", {
      emailId: "other-private",
      userId: f.ids.other,
      state: "rejected",
      attempt: 1,
      dueAt: now,
      createdAt: now,
    });
  });
  const page = await f.owner.query(api.inboundEmails.mine, {
    paginationOpts: { cursor: null, numItems: 100 },
  });
  expect(page.page).toHaveLength(20);
  expect(page.isDone).toBe(false);
  const next = await f.owner.query(api.inboundEmails.mine, {
    paginationOpts: { cursor: page.continueCursor, numItems: 100 },
  });
  expect(next.page).toHaveLength(5);
  expect(next.isDone).toBe(true);
  expect(JSON.stringify(page)).not.toContain("emailId");
  expect(JSON.stringify(page)).not.toContain("other-private");
  await expect(
    f.t.query(api.inboundEmails.mine, {
      paginationOpts: { cursor: null, numItems: 10 },
    }),
  ).rejects.toThrow("sign in");
});
