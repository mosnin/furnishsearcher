export function rocketConfig() {
  const mode = process.env.ROCKET_API_MODE,
    clientId = process.env.ROCKET_CLIENT_ID,
    clientSecret = process.env.ROCKET_CLIENT_SECRET;
  if (!clientId || !clientSecret || (mode !== "sandbox" && mode !== "prod"))
    throw new Error(
      "Rocket Lawyer requires an approved application and server configuration.",
    );
  let signUrl: URL;
  try {
    signUrl = new URL(
      process.env.ROCKET_SIGN_UI_URL ??
        (mode === "prod" ? "https://www.rocketlawyer.com/us/en/sign" : ""),
    );
  } catch {
    throw new Error(
      "Configure the approved Rocket Lawyer signing page for this environment.",
    );
  }
  if (
    signUrl.protocol !== "https:" ||
    !["www.rocketlawyer.com", "sandbox.rocketlawyer.com"].includes(
      signUrl.hostname,
    ) ||
    signUrl.username ||
    signUrl.password ||
    signUrl.search ||
    signUrl.hash
  )
    throw new Error("Invalid Rocket Lawyer signing-page configuration.");
  return {
    mode,
    clientId,
    clientSecret,
    signUrl: signUrl.toString(),
    origin:
      mode === "sandbox"
        ? "https://api-sandbox.rocketlawyer.com"
        : "https://api.rocketlawyer.com",
  } as const;
}
export function rocketId(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(value))
    throw new Error("Invalid Rocket Lawyer record reference.");
  return value;
}
async function bounded(response: Response, limit = 512 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Rocket Lawyer response exceeds the allowed size.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
export async function rocketRequest(
  path: string,
  token: string | null,
  method = "GET",
  body?: object | Uint8Array,
  pdf = false,
) {
  if (
    !/^\/(partners\/v1\/auth\/|document-manager\/v1\/binders)/.test(path) ||
    path.includes("..") ||
    path.includes("\\")
  )
    throw new Error("Invalid Rocket Lawyer API route.");
  const cfg = rocketConfig(),
    headers: Record<string, string> = {
      Accept: pdf ? "application/pdf" : "application/json",
    };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body)
    headers["Content-Type"] =
      body instanceof Uint8Array ? "application/pdf" : "application/json";
  const response = await fetch(cfg.origin + path, {
    method,
    headers,
    body:
      body instanceof Uint8Array
        ? new Uint8Array(body)
        : body
          ? JSON.stringify(body)
          : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Rocket Lawyer request failed (${response.status}).`);
  }
  const bytes = await bounded(response, pdf ? 10 * 1024 * 1024 : 512 * 1024);
  if (pdf)
    return {
      bytes,
      location: response.headers.get("location"),
      data: null as any,
    };
  let data: any = null;
  if (bytes.length)
    try {
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error("Rocket Lawyer returned an invalid response.");
    }
  return { data, location: response.headers.get("location"), bytes };
}
export async function rocketToken() {
  const c = rocketConfig(),
    r = await rocketRequest("/partners/v1/auth/accesstoken", null, "POST", {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: "client_credentials",
    });
  if (
    typeof r.data?.access_token !== "string" ||
    r.data.access_token.length < 8 ||
    r.data.access_token.length > 12000 ||
    !/^[A-Za-z0-9._~+/=-]+$/.test(r.data.access_token)
  )
    throw new Error("Rocket Lawyer access token is unavailable.");
  return r.data.access_token as string;
}
export function binderReference(versionId: string) {
  return `Rental document ${versionId}`;
}
export function bindRocket(
  data: any,
  s: {
    binderId: string;
    versionId: string;
    providerDocumentId?: string;
    ownerPartyId?: string;
    tenantPartyId?: string;
    ownerId: string;
    tenantId: string;
    ownerEmail: string;
    tenantEmail: string;
    ownerLegalName: string;
    tenantLegalName: string;
  },
) {
  if (
    !data ||
    data.id !== s.binderId ||
    data.name !== binderReference(s.versionId) ||
    !Array.isArray(data.parties) ||
    data.parties.length !== 2 ||
    !Array.isArray(data.documents) ||
    data.documents.length !== 1
  )
    throw new Error(
      "Rocket Lawyer binder does not match this document and its two parties.",
    );
  const owner = data.parties.find((p: any) => p.reference === s.ownerId),
    tenant = data.parties.find((p: any) => p.reference === s.tenantId);
  if (
    !owner ||
    !tenant ||
    owner.email?.toLowerCase() !== s.ownerEmail.toLowerCase() ||
    tenant.email?.toLowerCase() !== s.tenantEmail.toLowerCase() ||
    !owner.roles?.includes("OWNER") ||
    !owner.roles?.includes("SIGNER") ||
    !tenant.roles?.includes("SIGNER") ||
    owner.legalName !== s.ownerLegalName ||
    tenant.legalName !== s.tenantLegalName
  )
    throw new Error(
      "Rocket Lawyer signer binding does not match the verified stay participants.",
    );
  if (
    (s.ownerPartyId && owner.id !== s.ownerPartyId) ||
    (s.tenantPartyId && tenant.id !== s.tenantPartyId)
  )
    throw new Error("Provider signer identities changed.");
  const d = data.documents[0];
  if (
    d.name !== `Rental PDF ${s.versionId}` ||
    (s.providerDocumentId && d.id !== s.providerDocumentId) ||
    d.signable !== true
  )
    throw new Error("Rocket Lawyer PDF reference changed.");
  const signatures = Array.isArray(d.inputs)
    ? d.inputs.filter((input: any) => input.type === "SIGNATURE_TEXT")
    : [];
  if (
    signatures.length !== 2 ||
    ![s.ownerId, s.tenantId].every((ref) =>
      signatures.some(
        (input: any) => input.partyReference === ref && input.optional !== true,
      ),
    )
  )
    throw new Error("Provider signature requirements changed.");
  if (
    ![
      "IN_PREPARATION",
      "REVIEW_AND_SHARE",
      "SIGN_IN_PROGRESS",
      "SIGN_COMPLETED",
    ].includes(data.status)
  )
    throw new Error("Provider signing state requires review.");
  return {
    ownerPartyId: rocketId(owner.id),
    tenantPartyId: rocketId(tenant.id),
    providerDocumentId: rocketId(d.id),
    status: typeof data.status === "string" ? data.status : "UNKNOWN",
  };
}
