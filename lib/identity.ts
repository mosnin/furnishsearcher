export function identityConfig() {
  const region = process.env.JUMIO_REGION,
    clientId = process.env.JUMIO_CLIENT_ID,
    clientSecret = process.env.JUMIO_CLIENT_SECRET,
    workflowKey = process.env.JUMIO_WORKFLOW_KEY,
    mode = process.env.JUMIO_MODE;
  if (
    !region ||
    !["amer-1", "emea-1", "apac-1"].includes(region) ||
    !clientId ||
    !clientSecret ||
    !workflowKey ||
    !["test", "prod"].includes(mode ?? "")
  )
    throw new Error(
      "Identity verification is not configured. Contact support.",
    );
  return {
    region,
    clientId,
    clientSecret,
    workflowKey,
    mode: mode as "test" | "prod",
  };
}
export function identityConfigured() {
  try {
    identityConfig();
    return true;
  } catch {
    return false;
  }
}
export function hostedIdentityUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !(url.hostname.endsWith(".jumio.com") || url.hostname.endsWith(".jumio.ai"))
  )
    throw new Error("Invalid identity verification link.");
  return url.toString();
}
export function identityDecision(
  value: any,
  expected: {
    accountId: string;
    workflowId: string;
    reference: string;
    workflowKey: string;
  },
): "passed" | "pending" | "rejected" | "review" {
  if (
    value?.account?.id !== expected.accountId ||
    value?.workflow?.id !== expected.workflowId ||
    value?.workflow?.customerInternalReference !== expected.reference ||
    String(value?.workflow?.definitionKey) !== expected.workflowKey
  )
    throw new Error(
      "Identity result does not match this verification attempt.",
    );
  if (value.workflow.status !== "PROCESSED") return "pending";
  if (value.decision?.type === "REJECTED") return "rejected";
  const credentials = Array.isArray(value.credentials) ? value.credentials : [];
  return value.decision?.type === "PASSED" &&
    credentials.some((c: any) => c.category === "ID") &&
    credentials.some((c: any) => ["SELFIE", "FACEMAP"].includes(c.category))
    ? "passed"
    : "review";
}
