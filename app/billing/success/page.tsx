"use client";
import Link from "next/link";
import { use } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
export default function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout_id?: string }>;
}) {
  const { checkout_id } = use(searchParams),
    { isAuthenticated, isLoading } = useConvexAuth();
  const payment = useQuery(
    api.payments.getCheckout,
    isAuthenticated && checkout_id ? { checkoutId: checkout_id } : "skip",
  );
  const paid = payment?.status === "completed";
  const title = paid
    ? "Payment confirmed"
    : payment?.status === "refunded"
      ? "Payment refunded"
      : payment?.status === "partially_refunded"
        ? "Payment partially refunded"
        : payment?.status === "disputed"
          ? "Payment under review"
          : payment?.status === "failed"
            ? "Payment failed"
            : "Checking payment status";
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <h1 className="text-2xl font-bold text-primary">{title}</h1>
        <p
          className="mt-3 text-slate-600 text-sm leading-relaxed"
          role="status"
        >
          {isLoading
            ? "Loading your account…"
            : !isAuthenticated
              ? "Sign in to view your private payment status."
              : !checkout_id
                ? "No checkout reference was supplied. Check your billing dashboard for confirmed payments."
                : payment === undefined
                  ? "Waiting for your account's payment record…"
                  : payment === null
                    ? "This checkout is not available in your account. Check your billing dashboard or contact support."
                    : paid
                      ? "The payment provider confirmed this checkout. Subscription access depends on its confirmed paid period; listing publication has additional requirements."
                      : payment.status === "pending"
                        ? "Confirmation has not arrived yet. This page updates when the provider confirms payment. If it remains pending, check billing or contact support before starting another checkout."
                        : "View billing for the recorded status or contact support."}
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href={isAuthenticated ? "/dashboard/landlord/billing" : "/sign-in"}
            className="w-full bg-primary text-white font-semibold px-5 py-3 rounded-lg"
          >
            {isAuthenticated ? "View billing" : "Sign in"}
          </Link>
          <Link href="/dashboard" className="text-slate-600 px-5 py-2">
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
