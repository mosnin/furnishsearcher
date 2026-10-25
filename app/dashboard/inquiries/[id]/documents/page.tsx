"use client";
import { use, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  useConvexAuth,
  useQuery,
  useMutation,
  useAction,
  usePaginatedQuery,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { convexSiteUrl } from "@/lib/photos";
type Row = FunctionReturnType<typeof api.rentalDocs.list>["page"][number];
type Kind = "lease" | "addendum" | "signed_copy" | "inventory" | "notice";
function site() {
  return convexSiteUrl(
    process.env.NEXT_PUBLIC_CONVEX_URL!,
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
  );
}
function DocumentCard({
  doc,
  me,
  owner,
  upload,
  download,
}: {
  doc: Row;
  me: Id<"users">;
  owner: boolean;
  upload: (file: File, doc: Row) => void;
  download: (version: NonNullable<Row["latest"]>) => void;
}) {
  const shared = doc.shared,
    version = doc.latest ?? shared,
    own = doc.creatorId === me;
  const share = useMutation(api.rentalDocs.share),
    unshare = useMutation(api.rentalDocs.unshare),
    ack = useMutation(api.rentalDocs.acknowledge),
    remove = useMutation(api.rentalDocs.removeDraft),
    consent = useMutation(api.rocketSignData.consent),
    withdraw = useMutation(api.rocketSignData.withdrawConsent),
    stop = useMutation(api.rocketSignData.stopPreparation);
  const prepare = useAction(api.rocketSign.start),
    check = useAction(api.rocketSign.check),
    sign = useAction(api.rocketSign.signingUrl);
  const status = useQuery(api.rocketSignData.status, { documentId: doc._id }),
    capabilities = useQuery(api.rocketSignData.capabilities, {});
  const [busy, setBusy] = useState(false),
    [legalName, setLegalName] = useState(""),
    [agree, setAgree] = useState(false),
    [signLink, setSignLink] = useState<string | null>(null);
  useEffect(() => {
    if (!signLink) return;
    const timer = setTimeout(() => setSignLink(null), 55000);
    return () => clearTimeout(timer);
  }, [signLink]);
  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not update document.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <h2 className="font-semibold">
          {doc.title} · {doc.kind.replaceAll("_", " ")}
        </h2>
        <p className="text-sm">
          {doc.state} · {version?.filename} · version {version?.version} ·{" "}
          {version ? Math.ceil(version.bytes / 1024) : 0} KB
        </p>
        {version?.source === "rocketlawyer_signed" ? (
          <p className="text-sm font-medium">
            {version.providerMode === "sandbox"
              ? "Rocket Lawyer sandbox output — test signatures only"
              : "Signed PDF retrieved from Rocket Lawyer"}
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Uploaded by a stay participant. Sharing or acknowledging receipt
            does not sign the document or verify its legal terms.
          </p>
        )}
        {shared?.acknowledgedAt && (
          <p className="text-sm">
            Receipt acknowledged{" "}
            {new Date(shared.acknowledgedAt).toLocaleString()}.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {version && (
            <Button variant="outline" onClick={() => download(version)}>
              Download{" "}
              {own && shared && shared._id !== version._id
                ? "latest private draft"
                : "PDF"}
            </Button>
          )}
          {own && shared && shared._id !== version?._id && (
            <Button variant="outline" onClick={() => download(shared)}>
              Download shared version {shared.version}
            </Button>
          )}
          {!own && shared && !shared.acknowledgedAt && (
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  () => ack({ versionId: shared._id }),
                  "Receipt acknowledged; no signature recorded",
                )
              }
            >
              Acknowledge receipt
            </Button>
          )}
          {own && !doc.signingSessionId && (
            <>
              {doc.latest && doc.latest._id !== shared?._id && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        share({
                          documentId: doc._id,
                          versionId: doc.latest!._id,
                        }),
                      "Exact document version shared",
                    )
                  }
                >
                  Share this version
                </Button>
              )}
              {shared && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => unshare({ documentId: doc._id }),
                      "Future access revoked; existing downloaded copies remain",
                    )
                  }
                >
                  Revoke future access
                </Button>
              )}
              <label className="inline-flex items-center text-sm underline cursor-pointer">
                Upload new version
                <input
                  className="sr-only"
                  type="file"
                  accept="application/pdf"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload(file, doc);
                    e.target.value = "";
                  }}
                />
              </label>
              {!shared && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => remove({ documentId: doc._id }),
                      "Unshared draft removed",
                    )
                  }
                >
                  Remove draft
                </Button>
              )}
            </>
          )}
        </div>
        {shared &&
          (owner ? own : !own) &&
          ["lease", "addendum"].includes(doc.kind) && (
            <section className="border-t pt-4 space-y-3">
              <h3 className="font-semibold">
                Electronic signing with Rocket Lawyer
              </h3>
              {!capabilities?.configured && (
                <p className="text-sm">
                  Electronic signing is not connected for this workspace. You
                  can share a PDF here or use Rocket Lawyer separately.
                </p>
              )}
              {capabilities?.mode === "sandbox" && (
                <p className="text-sm">
                  This connection is a sandbox. It produces test results rather
                  than a real signed rental agreement.
                </p>
              )}
              {status?.state ? (
                <>
                  <p className="text-sm">
                    Signing: {status.state}{" "}
                    {status.providerStatus ? `· ${status.providerStatus}` : ""}
                  </p>
                  {status.error && (
                    <p role="status" className="text-sm">
                      {status.error}
                    </p>
                  )}
                  {status.canStopPreparation && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => stop({ documentId: doc._id }),
                          "Preparation stopped before transfer; your signing permission was withdrawn",
                        )
                      }
                    >
                      Stop before provider transfer
                    </Button>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => check({ documentId: doc._id }),
                          "Provider status checked",
                        )
                      }
                    >
                      Refresh signing status
                    </Button>
                    {owner && doc.latest && status.state !== "completed" && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              prepare({
                                documentId: doc._id,
                                versionId: doc.latest!._id,
                                confirmed: true,
                              }),
                            "Signing preparation checked",
                          )
                        }
                      >
                        Retry preparation
                      </Button>
                    )}
                    {["invited", "completed", "finalised"].includes(
                      status.state,
                    ) && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          run(
                            async () =>
                              setSignLink(await sign({ documentId: doc._id })),
                            "Your short-lived provider link is ready",
                          )
                        }
                      >
                        Get my signing link
                      </Button>
                    )}
                  </div>
                  {signLink && (
                    <a
                      href={signLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block underline font-medium"
                    >
                      Continue to Rocket Lawyer (expires shortly)
                    </a>
                  )}
                </>
              ) : (
                capabilities?.configured && (
                  <>
                    <p className="text-sm">
                      Both participants confirm this exact PDF version and their
                      own names and verified email addresses before the owner
                      sends it to Rocket Lawyer. Signatures are collected on the
                      provider’s page.
                    </p>
                    <label className="block space-y-1">
                      My legal name
                      <Input
                        maxLength={160}
                        value={legalName}
                        onChange={(e) => setLegalName(e.target.value)}
                      />
                    </label>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={agree}
                        onChange={(e) => setAgree(e.target.checked)}
                      />
                      I reviewed this version and agree to send it, my legal
                      name and verified sign-in email to Rocket Lawyer for
                      electronic signing.
                    </label>
                    <Button
                      disabled={busy || !agree || legalName.trim().length < 2}
                      onClick={() =>
                        run(
                          () =>
                            consent({
                              documentId: doc._id,
                              versionId: shared._id,
                              legalName,
                              agreed: agree,
                            }),
                          "Permission for this exact version saved",
                        )
                      }
                    >
                      {status?.myConsent
                        ? "Update my signing permission"
                        : "Confirm my signing permission"}
                    </Button>
                    {status?.myConsent && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              withdraw({
                                documentId: doc._id,
                                versionId: shared._id,
                              }),
                            "Signing permission withdrawn before transmission",
                          )
                        }
                      >
                        Withdraw my signing permission
                      </Button>
                    )}
                    <p className="text-sm">
                      Your permission:{" "}
                      {status?.myConsent ? "confirmed" : "needed"} · Stay
                      partner: {status?.otherConsent ? "confirmed" : "needed"}
                    </p>
                    {owner && status?.myConsent && status.otherConsent && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              prepare({
                                documentId: doc._id,
                                versionId: shared._id,
                                confirmed: true,
                              }),
                            "Document sent for signing",
                          )
                        }
                      >
                        Send approved version to Rocket Lawyer
                      </Button>
                    )}
                  </>
                )
              )}
            </section>
          )}
      </CardContent>
    </Card>
  );
}
export default function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    inquiryId = id as Id<"bookingInquiries">,
    { isAuthenticated } = useConvexAuth(),
    { getToken, userId } = useAuth();
  const booking = useQuery(
      api.bookings.get,
      isAuthenticated ? { id: inquiryId } : "skip",
    ),
    me = useQuery(
      api.users.getByClerkId,
      isAuthenticated && userId ? { clerkId: userId } : "skip",
    ),
    capabilities = useQuery(api.rentalDocs.capabilities, {});
  const docs = usePaginatedQuery(
    api.rentalDocs.list,
    booking ? { inquiryId } : "skip",
    { initialNumItems: 10 },
  );
  const reserve = useMutation(api.rentalDocs.reserveUpload);
  const [title, setTitle] = useState(""),
    [kind, setKind] = useState<Kind>("lease"),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(false),
    inFlight = useRef(false),
    pending = useRef<{
      file: File;
      document?: Row;
      title: string;
      kind: Kind;
      requestId: string;
      reservation?: Id<"rentalDocumentUploads">;
    } | null>(null);
  async function perform() {
    const attempt = pending.current;
    if (!attempt || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("Sign in to upload this document.");
      attempt.reservation ??= await reserve({
        inquiryId,
        documentId: attempt.document?._id,
        expectedVersionId: attempt.document?.latest?._id,
        title: attempt.title,
        kind: attempt.kind,
        filename: attempt.file.name,
        requestId: attempt.requestId,
      });
      const response = await fetch(
        `${site()}/documents/upload?upload=${attempt.reservation}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/pdf",
          },
          body: attempt.file,
        },
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Upload failed.");
      }
      pending.current = null;
      setRetry(false);
      toast.success(
        "Private draft uploaded. Share the exact version when ready.",
      );
    } catch (e) {
      setRetry(true);
      toast.error(e instanceof Error ? e.message : "Document upload failed.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  function upload(file: File, doc?: Row) {
    if (inFlight.current) {
      toast.error("Wait for the current upload to finish.");
      return;
    }
    if (
      !file.name.toLowerCase().endsWith(".pdf") ||
      file.size > 10 * 1024 * 1024
    ) {
      toast.error("Choose a PDF up to 10 MB.");
      return;
    }
    pending.current = {
      file,
      document: doc,
      title: doc?.title ?? title,
      kind: doc?.kind ?? kind,
      requestId: crypto.randomUUID(),
    };
    void perform();
  }
  async function download(version: NonNullable<Row["latest"]>) {
    try {
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("Sign in to download this file.");
      const response = await fetch(
        `${site()}/documents/download?version=${version._id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok)
        throw new Error("Document is unavailable or access was revoked.");
      const url = URL.createObjectURL(await response.blob()),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = version.filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not download file.");
    }
  }
  if (!booking || !me)
    return (
      <p role="status" className="p-6">
        Loading private documents…
      </p>
    );
  return (
    <main className="mx-auto max-w-4xl p-6 space-y-5">
      <Link className="underline" href={`/dashboard/inquiries/${id}`}>
        Back to stay details
      </Link>
      <h1 className="text-2xl font-bold">Private rental documents</h1>
      <p>
        {booking.title} · {booking.otherName}
      </p>
      <p className="text-sm text-slate-600">
        Upload a lease you obtained from a legal-document provider, a signed
        copy, addendum, inventory or notice. Drafts stay private until you share
        a specific version with your stay partner. Keep screening reports,
        identity documents, bank details and payment-card information in their
        provider accounts.
      </p>
      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="font-semibold">Upload a new document</h2>
          {!capabilities?.privateFiles && (
            <p role="status">
              Private file storage is unavailable. Contact support before
              uploading rental documents.
            </p>
          )}
          <Label htmlFor="document-title">Document title</Label>
          <Input
            id="document-title"
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="block">
            Document type
            <select
              className="block border rounded-md p-2 mt-1"
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
            >
              <option value="lease">Lease</option>
              <option value="addendum">Addendum</option>
              <option value="signed_copy">Previously signed copy</option>
              <option value="inventory">Inventory / condition report</option>
              <option value="notice">Notice</option>
            </select>
          </label>
          <label className="block">
            PDF (up to 10 MB)
            <Input
              type="file"
              accept="application/pdf"
              disabled={
                busy || !capabilities?.privateFiles || title.trim().length < 3
              }
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
                e.target.value = "";
              }}
            />
          </label>
          {retry && (
            <Button disabled={busy} onClick={perform}>
              Retry the same upload
            </Button>
          )}
        </CardContent>
      </Card>
      {docs.results.map((doc) => (
        <DocumentCard
          key={doc._id}
          doc={doc}
          me={me._id}
          owner={booking.inquiry.landlordId === me._id}
          upload={upload}
          download={download}
        />
      ))}
      {docs.status === "Exhausted" && !docs.results.length && (
        <p>No documents shared for this stay yet.</p>
      )}
      {docs.status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => docs.loadMore(10)}>
          More documents
        </Button>
      )}
      <Link className="underline text-sm" href="/dashboard/rental-tools">
        Screening, document and rent-provider resources
      </Link>
    </main>
  );
}
