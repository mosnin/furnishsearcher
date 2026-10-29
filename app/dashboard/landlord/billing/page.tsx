"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useQuery, useAction, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, Star, Receipt, Calendar } from "lucide-react";
import { formatDate } from "@/lib/utils";

type Subscription = Doc<"subscriptions"> & { paidAccessGranted: boolean };
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
    partially_refunded: "bg-amber-100 text-amber-700",
    disputed: "bg-red-100 text-red-700",
    past_due: "bg-red-100 text-red-700",
    unpaid: "bg-red-100 text-red-700",
  };
  const cls = map[status] ?? "bg-slate-100 text-slate-600";
  return <Badge className={`${cls} capitalize font-medium`}>{status}</Badge>;
}

export default function LandlordBillingPage() {
  const { userId: clerkId } = useAuth();
  const convexUser = useQuery(
    api.users.getByClerkId,
    clerkId ? { clerkId } : "skip",
  ) as { _id: Id<"users">; email: string } | null | undefined;

  const subscription = useQuery(
    api.payments.getSubscription,
    convexUser?._id ? { userId: convexUser._id } : "skip",
  ) as Subscription | null | undefined;

  const {
    results: payments,
    status: paymentStatus,
    loadMore,
  } = usePaginatedQuery(
    api.payments.listPayments,
    convexUser?._id ? { userId: convexUser._id } : "skip",
    { initialNumItems: 20 },
  );
  const portal = useAction(api.creem.createCustomerPortal);
  const [openingPortal, setOpeningPortal] = useState(false);
  async function openPortal() {
    setOpeningPortal(true);
    try {
      window.location.assign(await portal({}));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to open billing portal",
      );
    } finally {
      setOpeningPortal(false);
    }
  }
  const loading =
    convexUser === undefined || paymentStatus === "LoadingFirstPage";

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
                  {!subscription.paidAccessGranted && (
                    <Badge variant="outline">Paid access not confirmed</Badge>
                  )}
                  {subscription.billingHold && (
                    <Badge variant="outline">Billing review required</Badge>
                  )}
                  {subscription.mode === "test" && (
                    <Badge variant="outline">Test billing</Badge>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {subscription.currentPeriodEnd > 0
                    ? `${subscription.cancelAtPeriodEnd ? "Scheduled to cancel" : "Current period ends"} on ${formatDate(subscription.currentPeriodEnd)}`
                    : "Awaiting a confirmed payment period"}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  disabled={openingPortal}
                  onClick={openPortal}
                >
                  {openingPortal ? "Opening…" : "Manage billing & invoices"}
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/pricing">View plans</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-slate-900 font-medium">Free plan</p>
                <p className="text-sm text-slate-500 mt-1">
                  View available plans and their current features.
                </p>
              </div>
              <Button asChild className="bg-primary hover:bg-primary">
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
                      {!p.trustedCheckout ? " · Legacy record, unverified" : ""}
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
          {paymentStatus === "CanLoadMore" && (
            <Button variant="outline" onClick={() => loadMore(20)}>
              Load more payments
            </Button>
          )}
          {paymentStatus === "LoadingMore" && (
            <p role="status" className="text-sm text-slate-500">
              Loading more payments…
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
