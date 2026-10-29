"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  PageHeader,
  Widget,
  Metric,
  ActionLink,
  Empty,
  Status,
} from "@/components/ui-system/primitives";
import { StaffListingReview } from "@/components/staff-listing-review";
import { ListingStatus } from "@/components/dashboard/home-widgets";
import { formatDate } from "@/lib/utils";
export default function AdminHome() {
  const listings = useQuery(api.listings.getAll, {});
  const accounts = useQuery(api.adminAccounts.list, {
    paginationOpts: { cursor: null, numItems: 5 },
  });
  const pending = listings?.filter((row) => row.status === "pending") ?? [];
  return (
    <div className="ds-page">
      <PageHeader
        title="Platform overview"
        description="Account administration, listing review and platform support."
        action={
          <ActionLink variant="primary" href="/dashboard/admin/users">
            Manage accounts
          </ActionLink>
        }
      />
      <div className="ds-metrics">
        <Metric
          label="Listings"
          value={listings?.length ?? "—"}
          detail="Platform listing records"
          loading={!listings}
        />
        <Metric
          label="Awaiting review"
          value={pending.length}
          detail="Current review queue"
          loading={!listings}
        />
        <Metric
          label="Active records"
          value={
            listings?.filter((row) => row.status === "active").length ?? "—"
          }
          detail="Stored listing status"
          loading={!listings}
        />
        <Metric
          label="Recent accounts"
          value={accounts?.page.length ?? "—"}
          detail="Up to 5 newest records"
          loading={!accounts}
        />
      </div>
      <div className="ds-home-grid">
        <Widget
          title="Listing review queue"
          action={
            <ActionLink variant="ghost" href="/dashboard/admin/listings">
              All listings
            </ActionLink>
          }
        >
          {!listings ? (
            <Empty title="Loading review queue…" />
          ) : !pending.length ? (
            <Empty title="No listings awaiting review">
              New listing submissions appear here.
            </Empty>
          ) : (
            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Listing</th>
                    <th>Status</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.slice(0, 10).map((listing) => (
                    <tr key={listing._id}>
                      <td>
                        <strong>{listing.title}</strong>
                        <small>
                          {listing.city}, {listing.state}
                        </small>
                      </td>
                      <td>
                        <ListingStatus status={listing.status} />
                      </td>
                      <td>
                        <StaffListingReview id={listing._id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <footer className="ds-widget-footer">
            Showing up to 10 pending records. Review current content and
            revision before approving.
          </footer>
        </Widget>
        <Widget title="Administration">
          <div className="ds-task-list">
            {[
              {
                title: "User accounts",
                detail:
                  "Manage traveler, property owner and platform admin profiles.",
                href: "/dashboard/admin/users",
              },
              {
                title: "Support & reports",
                detail: "Review private cases, reports and current holds.",
                href: "/dashboard/admin/support",
              },
              {
                title: "Review moderation",
                detail: "Review submitted property and traveler feedback.",
                href: "/dashboard/admin/reviews",
              },
              {
                title: "Platform reports",
                detail: "Inspect the available platform reporting data.",
                href: "/dashboard/admin/reports",
              },
            ].map((item) => (
              <article className="ds-task-row" key={item.href}>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </div>
                <ActionLink href={item.href}>Open</ActionLink>
              </article>
            ))}
          </div>
        </Widget>
        <Widget
          title="Recent accounts"
          className="ds-full"
          action={
            <ActionLink variant="ghost" href="/dashboard/admin/users">
              All account types
            </ActionLink>
          }
        >
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {accounts?.page.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <strong>{account.name}</strong>
                      <small>{account.email}</small>
                    </td>
                    <td>
                      <Status>
                        {account.role === "admin"
                          ? "Platform admin"
                          : account.role === "landlord"
                            ? "Property owner"
                            : "Traveler"}
                      </Status>
                    </td>
                    <td>{formatDate(account.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Widget>
      </div>
    </div>
  );
}
