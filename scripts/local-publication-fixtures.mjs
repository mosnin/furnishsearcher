import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { syntheticPanel } from "./synthetic-photo.mjs";
let context;
export async function prepareLocalPublication(listingIds) {
  if (!context) {
    const source = readFileSync(".env.local", "utf8"),
      url = source
        .match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1]
        .trim()
        .replace(/^"|"$/g, "");
    assert(
      url &&
        ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) &&
        /^CONVEX_DEPLOYMENT=anonymous:/m.test(source) &&
        !/^CONVEX_DEPLOY_KEY=/m.test(source),
      "Publication fixtures refuse hosted or non-anonymous targets",
    );
    const cfg = JSON.parse(
      readFileSync(".convex/local/default/config.json", "utf8"),
    );
    assert.equal(Number(new URL(url).port), cfg.ports.cloud);
    const env = { ...process.env };
    for (const key of [
      "CONVEX_DEPLOY_KEY",
      "CONVEX_DEPLOYMENT",
      "CONVEX_SELF_HOSTED_URL",
      "CONVEX_SELF_HOSTED_ADMIN_KEY",
    ])
      delete env[key];
    const cli = (args) =>
      spawnSync(
        process.execPath,
        [
          "node_modules/convex/bin/main.js",
          ...args,
          "--env-file",
          ".env.local",
        ],
        { encoding: "utf8", env },
      );
    const readEnv = (name) => {
      const result = cli(["env", "get", name]);
      return result.status === 0 ? result.stdout.trim() : "";
    };
    assert.equal(
      readEnv("CREEM_API_KEY"),
      "creem_test_local_synthetic",
      "Run test:local-billing first; fixtures refuse real billing configuration",
    );
    assert.equal(readEnv("CREEM_PRODUCT_LANDLORD_PRO"), "prod_localQA");
    assert.equal(
      readEnv("RESEND_API_KEY"),
      "",
      "Do not send real notifications during synthetic publication QA",
    );
    const make = (subject) => {
      const client = new ConvexHttpClient(url);
      client.setAdminAuth(cfg.adminKey, {
        subject,
        issuer: "https://qa.furnishsearcher.invalid",
      });
      return client;
    };
    const owner = make("qa-owner-search"),
      staff = make("qa-publication-staff");
    let reviewer = await staff.query(
      makeFunctionReference("users:getByClerkId"),
      { clerkId: "qa-publication-staff" },
    );
    if (!reviewer) {
      const file = ".convex/synthetic-reviewer.json";
      writeFileSync(
        file,
        JSON.stringify([
          {
            clerkId: "qa-publication-staff",
            name: "Synthetic QA Publication Staff",
            email: "qa-staff@example.test",
            role: "admin",
            createdAt: Date.now(),
          },
        ]),
        { mode: 0o600 },
      );
      const result = cli(["import", file, "--table", "users", "--append"]);
      if (result.status !== 0)
        throw new Error(
          "Could not create the isolated synthetic staff fixture",
        );
      reviewer = await staff.query(
        makeFunctionReference("users:getByClerkId"),
        { clerkId: "qa-publication-staff" },
      );
    }
    assert.equal(reviewer?.role, "admin");
    context = {
      owner,
      staff,
      url,
      site: `http://127.0.0.1:${cfg.ports.site}`,
      cfg,
    };
  }
  const { owner, staff, cfg, site } = context;
  const call = (client, type, name, args) =>
    client[type](makeFunctionReference(name), args);
  const user = await call(owner, "query", "users:getByClerkId", {
    clerkId: "qa-owner-search",
  });
  assert.equal(user?.email, "qa-owner@example.test");
  const beginning = await call(owner, "mutation", "identity:begin", {
    mode: "test",
    region: "amer-1",
    workflowKey: "synthetic-local-publication",
  });
  assert.equal(
    beginning.check.workflowKey,
    "synthetic-local-publication",
    "Refusing to alter an unrelated identity check",
  );
  if (beginning.check.status === "creating")
    await call(owner, "mutation", "identity:finish", {
      id: beginning.check._id,
      accountId: "synthetic-local-account",
      workflowId: "synthetic-local-workflow",
      hostedUrl:
        "https://hosted.jumio.com/synthetic-local-only-not-a-real-session",
    });
  if (beginning.check.status !== "passed")
    await call(owner, "mutation", "identity:apply", {
      id: beginning.check._id,
      status: "passed",
    });
  const paid = await call(owner, "query", "payments:getActiveSubscription", {
    userId: user._id,
  });
  if (!paid || !["landlord_pro", "landlord_premium"].includes(paid.plan)) {
    const pending = await call(owner, "mutation", "payments:prepareCheckout", {
      userId: user._id,
      productId: "prod_localQA",
      purpose: "subscription",
      plan: "landlord_pro",
      mode: "test",
      returnUrl: "http://localhost:3015/billing/success",
      clientRequestId: randomUUID(),
    });
    await call(owner, "mutation", "billingWebhook:process", {
      payload: JSON.stringify({
        id: `evt_QApublication${randomUUID()}`,
        eventType: "subscription.paid",
        created_at: Date.now(),
        object: {
          id: "sub_QApublicationOwner",
          product: "prod_localQA",
          customer: "cust_QApublicationOwner",
          status: "active",
          mode: "test",
          metadata: { requestId: pending.requestId },
          last_transaction_id: `tran_QApublication${randomUUID()}`,
          current_period_start_date: new Date(Date.now() - 1000).toISOString(),
          current_period_end_date: new Date(
            Date.now() + 30 * 86400000,
          ).toISOString(),
        },
      }),
    });
  }
  const authorization = `Convex ${cfg.adminKey}:${Buffer.from(JSON.stringify({ subject: "qa-owner-search", issuer: "https://qa.furnishsearcher.invalid" })).toString("base64")}`;
  for (const id of listingIds) {
    let listing = await call(owner, "query", "listings:getById", { id });
    assert(
      listing &&
        listing.landlordId === user._id &&
        listing.title.startsWith("[QA]"),
      "Only named synthetic properties may be prepared",
    );
    if ((listing.photoAssets?.length ?? 0) < 2) {
      const assets = [];
      for (const [i, color] of ["#d7e7ed", "#d9e8d7"].entries()) {
        const response = await fetch(`${site}/photos/upload`, {
          method: "POST",
          headers: {
            Authorization: authorization,
            "Content-Type": "image/png",
          },
          body: syntheticPanel(color),
        });
        assert.equal(response.status, 200);
        const uploaded = await response.json();
        assets.push({
          storageId: uploaded.storageId,
          caption: `[QA] Synthetic color panel ${i + 1}; no property is shown`,
        });
      }
      await call(owner, "mutation", "listings:update", {
        id,
        photos: [],
        photoAssets: assets,
      });
      listing = await call(owner, "query", "listings:getById", { id });
    }
    await call(owner, "mutation", "listings:publish", { id });
    const current = await call(owner, "query", "publication:getReadiness", {
      id,
    });
    if (!current.live) {
      const reviewed = await call(
        staff,
        "mutation",
        "listings:approveListing",
        {
          id,
          expectedRevision: listing.revision ?? 0,
          note: "Synthetic local publication fixture; no real property or provider verification",
        },
      );
      assert(reviewed.live, reviewed.issues.join(" "));
    }
  }
  return {
    syntheticOnly: true,
    identityAndPayment:
      "Privileged local fixture state; not actual Jumio verification or a Creem transaction",
    staffApproval:
      "Actual authorized local mutation with the expected content revision",
  };
}
