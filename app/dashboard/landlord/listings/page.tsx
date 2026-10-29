"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Menu } from "@base-ui/react/menu";
import {
  Plus,
  DotsThree,
  House,
  CaretDown,
  CaretUp,
} from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { US_STATES } from "@/lib/locations";
import { formatPrice, formatDate } from "@/lib/utils";
import { IdentityPanel } from "@/components/identity-panel";
import { PublicationStatus } from "@/components/publication-status";
import { FeatureListingButton } from "@/components/checkout-button";
import {
  Button,
  ActionLink,
  Input,
  SelectField,
  CheckField,
  PageHeader,
  Panel,
  Modal,
  Empty,
  Status,
} from "@/components/ui-system/primitives";
import { ListingStatus } from "@/components/dashboard/home-widgets";
import { toast } from "sonner";
type ManagedListing = FunctionReturnType<
  typeof api.ownerDirectory.list
>["page"][number];
type StatusFilter = "all" | ManagedListing["status"];
const emptyFilters = {
  keyword: "",
  city: "",
  state: "",
  status: "all" as StatusFilter,
  includeHiddenUnits: true,
};
export default function LandlordListingsPage() {
  const { userId } = useAuth();
  const [draft, setDraft] = useState(emptyFilters),
    [filters, setFilters] = useState(emptyFilters);
  const [deleteTarget, setDeleteTarget] = useState<ManagedListing | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const user = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip",
  );
  const {
    results: filtered,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.ownerDirectory.list,
    user?.role === "landlord" ? filters : "skip",
    { initialNumItems: 10 },
  );
  const publish = useMutation(api.listings.publish),
    unpublish = useMutation(api.listings.unpublish),
    remove = useMutation(api.listings.deleteListing);
  const loading = user === undefined || status === "LoadingFirstPage";
  const more = status === "CanLoadMore" || status === "LoadingMore";
  const toggle = async (listing: ManagedListing) => {
    try {
      if (listing.publication.live) {
        await unpublish({ id: listing._id });
        toast.success("Listing hidden");
      } else {
        const result = await publish({ id: listing._id });
        toast.success(
          result.live
            ? "Listing is live"
            : "Publication requested. Review remaining requirements.",
        );
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not update publication",
      );
    }
  };
  const deleteListing = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await remove({ id: deleteTarget._id as Id<"listings"> });
      toast.success("Listing deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Could not delete listing");
    } finally {
      setDeleting(false);
    }
  };
  return (
    <div className="ds-page">
      <PageHeader
        title="Listings"
        description="Manage your properties, units and publication status."
        action={
          <ActionLink variant="primary" href="/dashboard/landlord/listings/new">
            <Plus size={14} />
            Add listing
          </ActionLink>
        }
      />
      <Panel>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setFilters({ ...draft });
          }}
        >
          <div className="ds-filter-bar">
            <label className="ds-field">
              Search properties and units
              <Input
                value={draft.keyword}
                maxLength={200}
                placeholder="Address, title or property number"
                onChange={(e) =>
                  setDraft({ ...draft, keyword: e.target.value })
                }
              />
            </label>
            <label className="ds-field">
              City
              <Input
                value={draft.city}
                maxLength={80}
                placeholder="Exact city"
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              />
            </label>
            <SelectField
              label="State"
              value={draft.state}
              onValueChange={(state) => setDraft({ ...draft, state })}
              options={[
                { value: "", label: "All states" },
                ...Object.entries(US_STATES).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
            <SelectField
              label="Listing status"
              value={draft.status}
              onValueChange={(status) =>
                setDraft({ ...draft, status: status as StatusFilter })
              }
              options={[
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active · currently live" },
                { value: "inactive", label: "Inactive · approved, not live" },
                { value: "incomplete", label: "Incomplete details" },
                { value: "pending", label: "Pending staff review" },
                { value: "rejected", label: "Rejected by staff" },
              ]}
            />
          </div>
          <div className="ds-filter-actions">
            <CheckField
              checked={draft.includeHiddenUnits}
              onCheckedChange={(includeHiddenUnits) =>
                setDraft({ ...draft, includeHiddenUnits })
              }
            >
              Include hidden units
            </CheckField>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(emptyFilters);
                setFilters(emptyFilters);
              }}
            >
              Clear filters
            </Button>
            <Button type="submit">Apply filters</Button>
          </div>
        </form>
        <div
          className="ds-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Property directory table"
        >
          <table className="ds-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Status</th>
                <th>Location</th>
                <th>Monthly rent</th>
                <th>Details</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((listing) => (
                <ListingRows
                  key={listing._id}
                  listing={listing}
                  expanded={expanded === listing._id}
                  onExpand={() =>
                    setExpanded(expanded === listing._id ? null : listing._id)
                  }
                  onToggle={() => void toggle(listing)}
                  onDelete={() => setDeleteTarget(listing)}
                  onMenuOpen={(element) => {
                    returnFocus.current = element;
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
        {loading ? (
          <Empty title="Searching your portfolio…" />
        ) : (
          filtered.length === 0 && (
            <Empty
              title={
                more ? "No matches in these records" : "No matching listings"
              }
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDraft(emptyFilters);
                    setFilters(emptyFilters);
                  }}
                >
                  Clear filters
                </Button>
              }
            >
              {more
                ? "Continue searching the next page of your portfolio."
                : "Adjust your filters or add a new property."}
            </Empty>
          )
        )}
        <footer className="ds-directory-foot">
          <span role="status">
            {loading
              ? "Loading…"
              : `${filtered.length} matching rentals loaded. ${more ? "More records remain to search." : "All portfolio records searched."}`}
          </span>
          {more && (
            <Button
              variant="secondary"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(10)}
            >
              {status === "LoadingMore" ? "Searching…" : "Search more records"}
            </Button>
          )}
        </footer>
      </Panel>
      <p className="ds-caption">
        Newest first. Status reflects current publication requirements. Hidden
        units are units you explicitly unpublished.{" "}
        <Link className="ds-link" href="/dashboard/landlord/billing">
          Review paid access
        </Link>
        .
      </p>
      <Panel>
        <IdentityPanel enabled={!!user?._id} />
      </Panel>
      <Modal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        title="Delete listing"
        description={`Delete ${deleteTarget?.title ?? "this listing"}? This permanently removes the listing and its saved entries. This action cannot be undone.`}
        finalFocus={returnFocus}
      >
        <footer className="ds-dialog-footer">
          <Button
            variant="secondary"
            disabled={deleting}
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={deleting}
            onClick={() => void deleteListing()}
          >
            {deleting ? "Deleting…" : "Delete listing"}
          </Button>
        </footer>
      </Modal>
    </div>
  );
}
function ListingRows({
  listing,
  expanded,
  onExpand,
  onToggle,
  onDelete,
  onMenuOpen,
}: {
  listing: ManagedListing;
  expanded: boolean;
  onExpand: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onMenuOpen: (element: HTMLElement) => void;
}) {
  const base = `/dashboard/landlord/listings/${listing._id}`;
  return (
    <>
      <tr>
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
              <Link href={`${base}/edit`}>
                <strong>{listing.title}</strong>
              </Link>
              <small>
                {listing.publicId ?? "Property draft"}
                {listing.unitName ? ` · ${listing.unitName}` : ""}
              </small>
            </div>
          </div>
        </td>
        <td>
          <ListingStatus status={listing.status} />
          {listing.moderationHold && (
            <small>
              <Link className="ds-link" href="/dashboard/support">
                Staff review
              </Link>
            </small>
          )}
          {listing.featured &&
            listing.featuredUntil &&
            listing.featuredUntil > Date.now() && (
              <small>
                <Status>Featured</Status>
              </small>
            )}
        </td>
        <td>
          {listing.city}, {listing.state}
          <small>{listing.zip}</small>
        </td>
        <td>{formatPrice(listing.price)}</td>
        <td>
          {listing.bedrooms} bd · {listing.bathrooms} ba
        </td>
        <td>
          <div className="ds-row-actions">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Publication details for ${listing.title}`}
              aria-expanded={expanded}
              onClick={onExpand}
            >
              {expanded ? <CaretUp size={13} /> : <CaretDown size={13} />}
            </Button>
            <ActionLink href={`${base}/edit`}>Edit</ActionLink>
            <Menu.Root>
              <Menu.Trigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Actions for ${listing.title}`}
                    onClick={(e) => onMenuOpen(e.currentTarget)}
                  />
                }
              >
                <DotsThree size={20} weight="bold" />
              </Menu.Trigger>
              <Menu.Portal>
                <div className="furnish-ui ds-portal">
                  <Menu.Positioner sideOffset={5} align="end">
                    <Menu.Popup className="ds-menu">
                      {[
                        {
                          label: "View listing",
                          href: `/listings/${listing._id}`,
                        },
                        {
                          label: "Manage availability",
                          href: `${base}/availability`,
                        },
                        {
                          label: listing.locationConfirmedAt
                            ? "Location confirmed"
                            : "Confirm map location",
                          href: `${base}/location`,
                        },
                        { label: "Property units", href: `${base}/units` },
                      ].map((item) => (
                        <Menu.Item
                          key={item.href}
                          className="ds-menu-item"
                          render={<Link href={item.href} />}
                        >
                          {item.label}
                        </Menu.Item>
                      ))}
                      <Menu.Item className="ds-menu-item" onClick={onToggle}>
                        {listing.publication.live
                          ? "Hide listing"
                          : "Request publication"}
                      </Menu.Item>
                      <Menu.Item
                        className="ds-menu-item ds-menu-item--danger"
                        onClick={onDelete}
                      >
                        Delete listing
                      </Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </div>
              </Menu.Portal>
            </Menu.Root>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="ds-expanded-property">
            <div>
              <p>
                {listing.address} · Created {formatDate(listing.createdAt)} ·{" "}
                {listing.views} legacy views
              </p>
              <PublicationStatus state={listing.publication} />
              {!(
                listing.featured &&
                listing.featuredUntil &&
                listing.featuredUntil > Date.now()
              ) && (
                <FeatureListingButton
                  listingId={listing._id}
                  className="m-4 h-8 text-xs"
                />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
