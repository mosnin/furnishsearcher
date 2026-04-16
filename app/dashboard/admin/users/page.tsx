"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn, formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink } from "lucide-react";

type RoleFilter = "all" | "tenant" | "landlord" | "admin";

function RoleBadge({ role }: { role: string }) {
  const cls =
    role === "admin"
      ? "bg-purple-100 text-purple-700"
      : role === "landlord"
      ? "bg-blue-100 text-blue-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        cls
      )}
    >
      {role}
    </span>
  );
}

export default function AdminUsersPage() {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const users = useQuery(api.users.getAll);

  const filtered =
    users?.filter((u) =>
      roleFilter === "all" ? true : u.role === roleFilter
    ) ?? [];

  const roleTabs: { label: string; value: RoleFilter }[] = [
    { label: "All", value: "all" },
    { label: "Tenant", value: "tenant" },
    { label: "Landlord", value: "landlord" },
    { label: "Admin", value: "admin" },
  ];

  const isLoading = users === undefined;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">All Users</h1>
        <p className="text-slate-500 text-sm mt-1">
          Browse and manage every user on the platform
        </p>
      </div>

      {/* Role filter tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit flex-wrap">
        {roleTabs.map((tab) => {
          const count =
            tab.value === "all"
              ? users?.length
              : users?.filter((u) => u.role === tab.value).length;
          return (
            <button
              key={tab.value}
              onClick={() => setRoleFilter(tab.value)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                roleFilter === tab.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              {tab.label}
              {count !== undefined && (
                <span className="ml-1.5 text-xs text-slate-400">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <p className="text-slate-500 text-sm">No users found</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Name</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Email</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Role</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Joined</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wide text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => (
                <TableRow key={user._id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium text-slate-900">
                    {user.displayName ?? user.name}
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={user.role} />
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-slate-700"
                      title="View profile"
                    >
                      <Link href={`/landlords/${user._id}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
