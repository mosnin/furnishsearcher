"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreditCard, Star, Receipt, Calendar } from "lucide-react";
import { formatDate } from "@/lib/utils";

type Subscription = Doc<"subscriptions">;
type Payment = Doc<"payments">;

const PLAN_LABELS: Record<string, string> = {
  landlord_pro: "Landlord Pro",
  landlord_premium: "Landlord Premium",
  tenant_plus: "Tenant Plus",
};

function formatCents(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700",
    trialing: "bg-sky-100 text-sky-700",
    paused: "bg-amber-100 text-amber-700",
    canceled: "bg-slate-200 text-slate-600",
    expired: "bg-slate-100 text-slate-500",
    completed: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    failed: "bg-red-100 text-red-700",
    refunded: "bg-slate-200 text-slate-600",
  };
  const cls = map[status] ?? "bg-slate-100 text-slate-600";
  return <Badge className={`${cls} capitalize font-medium`}>{status}</Badge>;
}

export default function LandlordBillingPage() {
  const { userId: clerkId } = useAuth();
  const convexUser = useQuery(
    api.users.getByClerkId,
    clerkId ? { clerkId } : "skip"
  ) as { _id: Id<"users">; email: string } | null | undefined;

  const subscription = useQuery(
    api.payments.getActiveSubscription,
    convexUser?._id ? { userId: convexUser._id } : "skip"
  ) as Subscription | null | undefined;

  const payments = useQuery(
    api.payments.getPaymentsByUser,
    convexUser?._id ? { userId: convexUser._id } : "skip"
  ) as Payment[] | undefined;

  const loading = convexUser === undefined || payments === undefined;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
        <p className="text-slate-500 text-sm mt-1">
          Manage your subscription and view payment history.
        </p>
      </div>

      {/* Subscription card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Star className="h-5 w-5 text-amber-500" />
            Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : subscription ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold text-slate-900">
                    {PLAN_LABELS[subscription.plan] ?? subscription.plan}
                  </p>
                  <StatusBadge status={subscription.status} />
                </div>
                <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {subscription.cancelAtPeriodEnd ? "Cancels" : "Renews"} on{" "}
                  {formatDate(subscription.currentPeriodEnd)}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/pricing">Change plan</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-slate-900 font-medium">Free plan</p>
                <p className="text-sm text-slate-500 mt-1">
                  Upgrade to unlock featured listings, priority placement, and
                  advanced analytics.
                </p>
              </div>
              <Button asChild className="bg-[#1e3a8a] hover:bg-[#0f2044]">
                <Link href="/pricing">View plans</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment history */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5 text-slate-500" />
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !payments || payments.length === 0 ? (
            <div className="text-center py-10">
              <CreditCard className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">No payments yet</p>
              <p className="text-slate-500 text-sm mt-1">
                Your payment history will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {payments.map((p) => (
                <li
                  key={p._id}
                  className="py-3 flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm capitalize">
                      {p.purpose.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatDate(p.createdAt)}
                    </p>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <StatusBadge status={p.status} />
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">
                      {formatCents(p.amountCents, p.currency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
