"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { House, Plus, ArrowUpRight } from "@phosphor-icons/react";
import {
  PageHeader,
  ActionLink,
  ViewTabs,
  Metric,
  Widget,
  Empty,
} from "@/components/ui-system/primitives";
import {
  PerformanceWidget,
  RecentMessages,
  ListingStatus,
} from "@/components/dashboard/home-widgets";
import OwnerNextSteps from "@/components/owner-next-steps";
import { formatPrice } from "@/lib/utils";

export default function LandlordDashboardPage() {
  const { userId } = useAuth();
  const [view, setView] = useState("overview");
  const user = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip",
  );
  const directory = useQuery(
    api.ownerDirectory.list,
    user?.role === "landlord"
      ? { paginationOpts: { cursor: null, numItems: 5 } }
      : "skip",
  );
  const inbox = useQuery(api.inbox.summary, user?._id ? {} : "skip");
  const listings = directory?.page ?? [];
  const live = listings.filter((l) => l.publication.live).length;
  const loading = directory === undefined;
  return (
    <div className="ds-page">
      <PageHeader
        title="Home"
        description="Your rental workspace, at a glance."
        action={
          <ActionLink variant="primary" href="/dashboard/landlord/listings/new">
            <Plus size={14} />
            Add listing
          </ActionLink>
        }
      />
      <ViewTabs
        value={view}
        onValueChange={setView}
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "activity", label: "Activity" },
        ]}
      >
        <div className="ds-metrics">
          <Metric
            label="Recent listings"
            value={listings.length}
            detail="Up to 5 newest rentals"
            loading={loading}
          />
          <Metric
            label="Live listings"
            value={live}
            detail="Within recent listings"
            loading={loading}
          />
          <Metric
            label="Not live"
            value={listings.filter((l) => !l.publication.live).length}
            detail="Within recent listings"
            loading={loading}
          />
          <Metric
            label="Unread conversations"
            value={inbox?.ready ? inbox.unread : "—"}
            detail={inbox?.ready ? "Your complete inbox" : "Inbox is updating"}
            loading={!inbox}
          />
        </div>
        {view === "overview" ? (
          <div className="ds-home-grid">
            <PerformanceWidget enabled={user?.role === "landlord"} />
            <Widget
              title="Recent portfolio"
              description="Current publication state"
              action={
                <ActionLink variant="ghost" href="/dashboard/landlord/listings">
                  View all
                </ActionLink>
              }
            >
              <div className="ds-workspace-rows">
                {loading ? (
                  <Empty title="Loading portfolio…" />
                ) : listings.length === 0 ? (
                  <Empty
                    title="Your first rental starts here"
                    action={
                      <ActionLink href="/dashboard/landlord/listings/new">
                        Add listing
                      </ActionLink>
                    }
                  >
                    Add a property to manage its details, availability and
                    inquiries.
                  </Empty>
                ) : (
                  [
                    { label: "Live", count: live },
                    {
                      label: "In review",
                      count: listings.filter((l) => l.status === "pending")
                        .length,
                    },
                    {
                      label: "Incomplete",
                      count: listings.filter((l) => l.status === "incomplete")
                        .length,
                    },
                    {
                      label: "Other nonlive",
                      count: listings.filter(
                        (l) =>
                          !l.publication.live &&
                          !["pending", "incomplete"].includes(l.status),
                      ).length,
                    },
                  ].map((row) => (
                    <div className="ds-workspace-row" key={row.label}>
                      <span>{row.label}</span>
                      <strong>{row.count}</strong>
                    </div>
                  ))
                )}
              </div>
              <footer className="ds-widget-footer">
                {directory?.isDone
                  ? "All portfolio records loaded."
                  : "This preview covers your five newest rentals."}
              </footer>
            </Widget>
            {user?.role === "landlord" && <OwnerNextSteps />}
            <RecentMessages enabled={!!user} />
            <Widget
              title="Recent listings"
              className="ds-full"
              description="Continue working on your properties"
              action={
                <ActionLink variant="ghost" href="/dashboard/landlord/listings">
                  Manage listings <ArrowUpRight size={13} />
                </ActionLink>
              }
            >
              <div className="ds-table-wrap">
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Status</th>
                      <th>Monthly rent</th>
                      <th>Location</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {listings.map((listing) => (
                      <tr key={listing._id}>
                        <td>
                          <div className="ds-property">
                            <span className="ds-property-thumb">
                              {listing.photos[0] ? (
                                <img src={listing.photos[0]} alt="" />
                              ) : (
                                <House size={18} />
                              )}
                            </span>
                            <div>
                              <Link
                                href={`/dashboard/landlord/listings/${listing._id}/edit`}
                              >
                                <strong>{listing.title}</strong>
                              </Link>
                              <small>
                                {listing.publicId ?? "Property draft"}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <ListingStatus status={listing.status} />
                        </td>
                        <td>{formatPrice(listing.price)}</td>
                        <td>
                          {listing.city}, {listing.state}
                        </td>
                        <td>
                          <ActionLink
                            href={`/dashboard/landlord/listings/${listing._id}/edit`}
                          >
                            Edit
                          </ActionLink>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!loading && listings.length === 0 && (
                <Empty title="No listings yet" />
              )}
            </Widget>
          </div>
        ) : (
          <div className="ds-home-grid">
            <PerformanceWidget enabled={user?.role === "landlord"} />
            <RecentMessages enabled={!!user} />
          </div>
        )}
      </ViewTabs>
    </div>
  );
}
