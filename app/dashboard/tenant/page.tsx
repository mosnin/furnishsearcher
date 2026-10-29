"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  PageHeader,
  ActionLink,
  Button,
  Widget,
  Metric,
  ViewTabs,
  Empty,
  Status,
} from "@/components/ui-system/primitives";
import TravelerNextSteps, {
  TravelerStays,
  useTravelerDashboard,
} from "@/components/traveler-next-steps";
import { RecentMessages } from "@/components/dashboard/home-widgets";
import { MagnifyingGlass, House } from "@phosphor-icons/react";
import { formatPrice, formatDate } from "@/lib/utils";
import { buildSearchUrl, criteriaOnly } from "@/lib/search";
import { toast } from "sonner";
export default function TravelerHome() {
  const { userId } = useAuth();
  const [view, setView] = useState("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const user = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip",
  );
  const saved = useQuery(api.saved.summary, user ? {} : "skip");
  const inbox = useQuery(api.inbox.summary, user ? {} : "skip");
  const searches = useQuery(
    api.savedSearches.getByUser,
    user ? { userId: user._id } : "skip",
  );
  const requests = useQuery(
    api.housingRequests.getByUser,
    user ? { userId: user._id } : "skip",
  );
  const featured = useQuery(api.listings.getFeatured, {});
  const dashboard = useTravelerDashboard(!!user);
  const removeSearch = useMutation(api.savedSearches.remove),
    closeRequest = useMutation(api.housingRequests.close);
  const act = async (id: string, kind: "search" | "request") => {
    if (busy) return;
    setBusy(id);
    try {
      if (kind === "search")
        await removeSearch({ id: id as Id<"savedSearches"> });
      else await closeRequest({ id: id as Id<"housingRequests"> });
      toast.success(
        kind === "search" ? "Saved search removed" : "Housing request closed",
      );
    } catch {
      toast.error("Could not save this change");
    } finally {
      setBusy(null);
    }
  };
  if (user === null)
    return (
      <div className="ds-page">
        <PageHeader
          title="Complete your profile"
          description="Set up your profile to view your private traveler workspace."
        />
        <ActionLink href="/onboarding">Continue profile setup</ActionLink>
      </div>
    );
  return (
    <div className="ds-page">
      <PageHeader
        title="Traveler home"
        description="Your search, conversations and next stay."
        action={
          <ActionLink variant="primary" href="/search">
            <MagnifyingGlass size={14} />
            Find a rental
          </ActionLink>
        }
      />
      <ViewTabs
        value={view}
        onValueChange={setView}
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "searches", label: "Searches & requests" },
        ]}
      >
        <div className="ds-metrics">
          <Metric
            label="Saved rentals"
            value={saved ? `${saved.count}${saved.hasMore ? "+" : ""}` : "—"}
            detail="Your private shortlist"
            loading={!saved}
          />
          <Metric
            label="Unread conversations"
            value={inbox?.ready ? inbox.unread : "—"}
            detail={inbox?.ready ? "Your complete inbox" : "Inbox is updating"}
            loading={!inbox}
          />
          <Metric
            label="Active stays"
            value={dashboard.active}
            detail="Accepted records loaded"
            loading={dashboard.loading}
          />
          <Metric
            label="Upcoming stays"
            value={dashboard.upcoming}
            detail="Accepted records loaded"
            loading={dashboard.loading}
          />
        </div>
        {view === "overview" ? (
          <div className="ds-home-grid">
            <TravelerStays dashboard={dashboard} />
            <TravelerNextSteps
              dashboard={dashboard}
              unread={inbox?.unread ?? 0}
              inboxReady={!!inbox?.ready}
            />
            <Widget
              title="Saved rentals"
              description="Your most recently saved properties"
              action={
                <ActionLink variant="ghost" href="/dashboard/tenant/saved">
                  View all
                </ActionLink>
              }
            >
              {!saved ? (
                <Empty title="Loading saved rentals…" />
              ) : !saved.recent.length ? (
                <Empty
                  title="Build your shortlist"
                  action={
                    <ActionLink href="/search">Browse rentals</ActionLink>
                  }
                >
                  Save properties to compare them in one place.
                </Empty>
              ) : (
                <div className="ds-workspace-rows">
                  {saved.recent.map((entry) => (
                    <div className="ds-workspace-row" key={entry._id}>
                      <div>
                        {entry.listing ? (
                          <>
                            <Link href={`/listings/${entry.listing._id}`}>
                              <strong>{entry.listing.title}</strong>
                            </Link>
                            <small className="ds-caption block">
                              {entry.listing.city}, {entry.listing.state}
                            </small>
                          </>
                        ) : (
                          <>
                            <strong>Listing unavailable</strong>
                            <small className="ds-caption block">
                              This saved listing is not currently public.
                            </small>
                          </>
                        )}
                      </div>
                      {entry.listing && (
                        <span>{formatPrice(entry.listing.price)}/mo</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Widget>
            <RecentMessages enabled={!!user} />
            <Widget
              title="Rental highlights"
              description="A limited selection of currently eligible rentals"
              className="ds-full"
              action={
                <ActionLink variant="ghost" href="/search">
                  Full search
                </ActionLink>
              }
            >
              {!featured ? (
                <Empty title="Loading rentals…" />
              ) : !featured.length ? (
                <Empty title="No rentals in this showcase">
                  Try the full search for your location and dates.
                </Empty>
              ) : (
                <div className="ds-table-wrap">
                  <table className="ds-table">
                    <thead>
                      <tr>
                        <th>Rental</th>
                        <th>Location</th>
                        <th>Monthly rent</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {featured.map((listing) => (
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
                                <strong>{listing.title}</strong>
                                {listing.featured && <Status>Sponsored</Status>}
                              </div>
                            </div>
                          </td>
                          <td>
                            {listing.city}, {listing.state}
                          </td>
                          <td>{formatPrice(listing.price)}</td>
                          <td>
                            <ActionLink href={`/listings/${listing._id}`}>
                              View rental
                            </ActionLink>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Widget>
          </div>
        ) : (
          <div className="ds-home-grid">
            <Widget
              title="Saved searches"
              description="Resume your exact criteria"
              action={
                <ActionLink variant="ghost" href="/dashboard/tenant/searches">
                  Manage searches
                </ActionLink>
              }
            >
              {!searches ? (
                <Empty title="Loading saved searches…" />
              ) : !searches.length ? (
                <Empty
                  title="No saved searches"
                  action={
                    <ActionLink href="/search">Start a search</ActionLink>
                  }
                >
                  Save a search to return to its location, budget, dates and
                  amenities.
                </Empty>
              ) : (
                <div className="ds-task-list">
                  {searches.map((search) => {
                    let href = "/dashboard/tenant/searches";
                    try {
                      href = buildSearchUrl(criteriaOnly(search));
                    } catch {}
                    return (
                      <article className="ds-task-row" key={search._id}>
                        <div>
                          <h3>{search.name}</h3>
                          <p>
                            {[search.city, search.state]
                              .filter(Boolean)
                              .join(", ") || "Saved location criteria"}
                          </p>
                          <ActionLink href={href}>Resume search</ActionLink>
                        </div>
                        <Button
                          variant="ghost"
                          disabled={busy === search._id}
                          onClick={() => void act(search._id, "search")}
                          aria-label={`Remove saved search ${search.name}`}
                        >
                          {busy === search._id ? "Removing…" : "Remove"}
                        </Button>
                      </article>
                    );
                  })}
                </div>
              )}
            </Widget>
            <Widget
              title="Housing requests"
              description="Your requests to property owners"
              action={
                <ActionLink variant="ghost" href="/dashboard/housing-requests">
                  Manage requests
                </ActionLink>
              }
            >
              {!requests ? (
                <Empty title="Loading requests…" />
              ) : !requests.length ? (
                <Empty
                  title="No housing requests"
                  action={
                    <ActionLink href="/dashboard/housing-requests">
                      Create a request
                    </ActionLink>
                  }
                >
                  Share your housing needs with property owners.
                </Empty>
              ) : (
                <div className="ds-task-list">
                  {requests.map((request) => (
                    <article className="ds-task-row" key={request._id}>
                      <div>
                        <Status>{request.status}</Status>
                        <h3>
                          {request.city}, {request.state}
                        </h3>
                        <p>
                          {formatDate(request.moveInDate)} · Up to{" "}
                          {formatPrice(request.maxBudget)}/mo
                        </p>
                      </div>
                      {request.status === "open" && (
                        <Button
                          variant="secondary"
                          disabled={busy === request._id}
                          onClick={() => void act(request._id, "request")}
                        >
                          {busy === request._id ? "Closing…" : "Close request"}
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </Widget>
          </div>
        )}
      </ViewTabs>
    </div>
  );
}
