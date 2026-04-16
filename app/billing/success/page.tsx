import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payment Successful | FurnishFinder",
  description: "Thanks for your purchase.",
};

export default function BillingSuccessPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-5">
          <CheckCircle2 className="w-9 h-9 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-[#0f2044]">Payment successful</h1>
        <p className="mt-3 text-slate-600 text-sm leading-relaxed">
          Thanks for your purchase! We&apos;re applying your upgrade right
          now. You&apos;ll get a confirmation email within a few minutes, and
          your new features should be active in your dashboard shortly.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/dashboard/landlord/billing"
            className="w-full bg-[#1e3a8a] hover:bg-[#0f2044] text-white font-semibold px-5 py-3 rounded-lg transition-colors"
          >
            View your billing dashboard
          </Link>
          <Link
            href="/dashboard"
            className="w-full text-slate-600 hover:text-slate-900 font-medium px-5 py-2 rounded-lg transition-colors"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
