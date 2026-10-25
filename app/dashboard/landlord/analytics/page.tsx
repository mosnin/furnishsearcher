"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPrice } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
export default function LandlordAnalyticsPage() {
  const { userId } = useAuth(),
    [selected, setSelected] = useState("");
  const me = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip",
  );
  const rows = useQuery(
    api.analytics.getListingPerformance,
    me ? { landlordId: me._id } : "skip",
  );
  if (!userId) return <p>Please sign in to view your listing performance.</p>;
  if (me === undefined)
    return <p role="status">Loading listing performance…</p>;
  if (!me) return <p>Complete your account profile first.</p>;
  if (rows === undefined)
    return <p role="status">Loading listing performance…</p>;
  const filtered = selected ? rows.filter((row) => row._id === selected) : rows;
  const stats = [
    { label: "Rental spaces", value: filtered.length },
    {
      label: "Marked active",
      value: filtered.filter((row) => row.status === "active").length,
    },
    {
      label: "Average listed monthly rent",
      value: filtered.length
        ? formatPrice(
            filtered.reduce(
              (sum, row) => sum + Math.round(row.price * 100),
              0,
            ) /
              filtered.length /
              100,
          )
        : "—",
    },
    {
      label: "Recorded page views",
      value: filtered.reduce((sum, row) => sum + row.views, 0),
    },
    {
      label: "Conversation threads",
      value: filtered.reduce((sum, row) => sum + row.messages, 0),
    },
    {
      label: "Current saves",
      value: filtered.reduce((sum, row) => sum + row.saved, 0),
    },
  ];
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">
          Listing performance
        </h1>
        <p className="text-sm text-slate-600 mt-2">
          Saved counters and current records for your properties. Views are not
          unique visitors, threads are not individual replies, and saves are
          current favorites.
        </p>
      </header>
      <label className="block text-sm">
        Property or unit
        <select
          className="block mt-1 border rounded-md p-2 max-w-full"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">All my rental spaces</option>
          {rows.map((row) => (
            <option key={row._id} value={row._id}>
              {row.title}
            </option>
          ))}
        </select>
      </label>
      <div className="grid sm:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">{stat.label}</p>
              <p className="text-2xl font-semibold mt-2">
                {stat.value.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Active is the saved listing status; publication also requires current
        eligibility. These are stored totals, not a dated traffic series.
        Earlier daily traffic cannot be reconstructed from lifetime counters. No
        synthetic trend or estimated daily views are displayed.
      </p>
      {rows.length === 0 ? (
        <p>No rental spaces are associated with this account.</p>
      ) : (
        <div className="overflow-x-auto bg-white border rounded-xl p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-3">Rental space</th>
                <th>Status</th>
                <th>Monthly rent</th>
                <th>Views</th>
                <th>Threads</th>
                <th>Current saves</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row._id} className="border-b last:border-0">
                  <td className="py-3 pr-3">
                    <Link
                      className="underline text-[#1e3a8a]"
                      href={`/dashboard/landlord/listings/${row._id}/edit`}
                    >
                      {row.title}
                    </Link>
                  </td>
                  <td className="capitalize pr-3">{row.status}</td>
                  <td>{formatPrice(row.price)}</td>
                  <td>{row.views.toLocaleString()}</td>
                  <td>{row.messages.toLocaleString()}</td>
                  <td>{row.saved.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Link
        className="inline-block text-sm underline text-[#1e3a8a]"
        href="/market-insights"
      >
        Explore market supply and recorded demand
      </Link>
    </div>
  );
}
