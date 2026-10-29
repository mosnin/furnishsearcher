"use client";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import { RENTAL_TOOLS } from "@/lib/rental-tools";
import {
  PageHeader,
  Widget,
  ActionLink,
  Empty,
} from "@/components/ui-system/primitives";
import OwnerProtectionTools from "@/components/owner-protection-tools";
export default function RentalToolPage() {
  const { userId } = useAuth();
  const me = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip",
  );
  const { tool } = useParams<{ tool: string }>();
  const key = tool === "rent-collection" ? "rent_collection" : tool;
  const selected =
    key === "screening" || key === "lease" || key === "rent_collection"
      ? RENTAL_TOOLS[key]
      : null;
  if (tool === "insurance" || tool === "damage-protection")
    return (
      <div className="ds-page">
        <PageHeader
          title={
            tool === "insurance" ? "Landlord insurance" : "Damage protection"
          }
          eyebrow="Rental tools"
          description="Review provider availability and your property protection options."
        />
        <OwnerProtectionTools
          only={tool === "insurance" ? "insurance" : "damage"}
        />
      </div>
    );
  if (!selected)
    return (
      <div className="ds-page">
        <Empty
          title="Tool not found"
          action={
            <ActionLink href="/dashboard/rental-tools/screening">
              Open rental tools
            </ActionLink>
          }
        />
      </div>
    );
  return (
    <div className="ds-page ds-tool-page">
      <PageHeader
        title={selected.title}
        eyebrow="Rental tools"
        description={selected.description}
      />
      <Widget title={selected.provider} description="External provider">
        <div className="ds-widget-body space-y-4">
          <p>
            {me?.role === "landlord"
              ? {
                  screening:
                    "Create the screening request with your provider. The traveler shares their consent and personal information directly with that service.",
                  lease:
                    "Prepare the lease and share the exact version in the stay workspace. Agree on the terms with your traveler before signing.",
                  rent_collection:
                    "Set up the rent schedule in your provider account, then send its payment invitation to your traveler.",
                }[key as "screening" | "lease" | "rent_collection"]
              : selected.tenant}
          </p>
          <p className="ds-caption">
            Provider terms, eligibility, charges and availability apply.
          </p>
          <div className="flex gap-3 flex-wrap">
            <a
              className="ds-button ds-button--primary"
              href={selected.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit {selected.provider}
            </a>
            <ActionLink href="/dashboard/inquiries">
              Open a stay workspace
            </ActionLink>
          </div>
        </div>
      </Widget>
      {key === "lease" && (
        <Widget title="Your document workspace">
          <div className="ds-widget-body">
            <p>
              Open a stay to upload and share private PDFs, review exact
              versions, and use connected signing when available. A shared file
              or acknowledgement does not create a legal signature.
            </p>
          </div>
        </Widget>
      )}
      {key === "rent_collection" && (
        <Widget title="Payments stay with your provider">
          <div className="ds-widget-body">
            <p>
              Rent schedules, bank details, deposits, refunds and payment
              receipts are managed in your rent provider account. App
              subscription payments are separate from rent.
            </p>
          </div>
        </Widget>
      )}
    </div>
  );
}
