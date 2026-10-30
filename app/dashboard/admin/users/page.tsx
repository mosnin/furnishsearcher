"use client";
import { useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { AccountRole } from "@/lib/dashboard-access";
import {
  PageHeader,
  Panel,
  Input,
  SelectField,
  Button,
  Modal,
  Status,
  Empty,
} from "@/components/ui-system/primitives";
import { formatDate } from "@/lib/utils";
type Account = FunctionReturnType<
  typeof api.adminAccounts.list
>["page"][number];
const roles = [
  { value: "tenant", label: "Traveler" },
  { value: "landlord", label: "Property owner" },
  { value: "admin", label: "Platform admin" },
];
export default function AdminUsers() {
  const { userId } = useAuth();
  const caller = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip",
  );
  const [draft, setDraft] = useState({ role: "all", search: "" }),
    [filter, setFilter] = useState(draft);
  const { results, status, loadMore } = usePaginatedQuery(
    api.adminAccounts.list,
    caller?.role === "admin"
      ? { role: filter.role as AccountRole | "all", search: filter.search }
      : "skip",
    { initialNumItems: 20 },
  );
  const update = useMutation(api.adminAccounts.update);
  const [selected, setSelected] = useState<Account | null>(null),
    [name, setName] = useState(""),
    [role, setRole] = useState<AccountRole>("tenant"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const focus = useRef<HTMLElement | null>(null);
  const more = status === "CanLoadMore" || status === "LoadingMore";
  return (
    <div className="ds-page">
      <PageHeader
        title="User accounts"
        description="Manage traveler, property owner and platform admin accounts."
      />
      <Panel>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFilter({ ...draft });
          }}
        >
          <div className="ds-filter-bar">
            <label className="ds-field">
              Find an account
              <Input
                value={draft.search}
                maxLength={120}
                placeholder="Name or email"
                onChange={(e) => setDraft({ ...draft, search: e.target.value })}
              />
            </label>
            <SelectField
              label="Account type"
              value={draft.role}
              onValueChange={(role) => setDraft({ ...draft, role })}
              options={[{ value: "all", label: "All account types" }, ...roles]}
            />
          </div>
          <div className="ds-filter-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setDraft({ role: "all", search: "" });
                setFilter({ role: "all", search: "" });
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
          aria-label="User accounts"
        >
          <table className="ds-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Type</th>
                <th>Status</th>
                <th>Joined</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((account) => (
                <tr key={account.id}>
                  <td>
                    <strong>{account.name}</strong>
                    <small>{account.email}</small>
                  </td>
                  <td>{roles.find((r) => r.value === account.role)?.label}</td>
                  <td>
                    <Status>
                      {account.offboarded ? "Offboarded" : "Active"}
                    </Status>
                  </td>
                  <td>{formatDate(account.createdAt)}</td>
                  <td>
                    <Button
                      variant="secondary"
                      disabled={account.offboarded}
                      onClick={(e) => {
                        focus.current = e.currentTarget;
                        setSelected(account);
                        setName(account.name);
                        setRole(account.role);
                        setError("");
                      }}
                      aria-label={`Edit account ${account.name}`}
                    >
                      Edit account
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {status === "LoadingFirstPage" ? (
          <Empty title="Loading accounts…" />
        ) : (
          !results.length && (
            <Empty
              title={
                more ? "No matches in these records" : "No matching accounts"
              }
            >
              Adjust the filters or continue to the next page.
            </Empty>
          )
        )}
        <footer className="ds-directory-foot">
          <span role="status">
            {results.length} accounts loaded.{" "}
            {more ? "More records remain to search." : "All records searched."}
          </span>
          {more && (
            <Button
              variant="secondary"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(20)}
            >
              {status === "LoadingMore" ? "Loading…" : "Search more accounts"}
            </Button>
          )}
        </footer>
      </Panel>
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
        title="Edit account"
        description={selected?.email}
        finalFocus={focus}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!selected || busy) return;
            setBusy(true);
            setError("");
            try {
              await update({ userId: selected.id, name, role });
              setSelected(null);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not update this account.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="ds-dialog-body ds-workshop-form">
            <label className="ds-field">
              Display name
              <Input
                required
                maxLength={120}
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <SelectField
              label="Account type"
              value={role}
              onValueChange={(value) => setRole(value as AccountRole)}
              options={
                selected?.id === caller?._id
                  ? roles.filter((r) => r.value === "admin")
                  : roles
              }
            />
            {selected?.id === caller?._id && (
              <p className="ds-caption">
                Another platform admin must change your admin account type.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
          <footer className="ds-dialog-footer">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save account"}
            </Button>
          </footer>
        </form>
      </Modal>
    </div>
  );
}
