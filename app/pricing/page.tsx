import { Metadata } from "next";
import Link from "next/link";
import { CheckCircle, Zap, Star, Building2 } from "lucide-react";
import { SubscriptionCheckoutButton } from "@/components/checkout-button";

export const metadata: Metadata = {
  title: "Pricing | FurnishFinder",
  description:
    "FurnishFinder is free for renters and free to list for landlords. No booking fees, no hidden charges. See our simple, transparent pricing.",
};

const RENTER_FEATURES = [
  "Search thousands of furnished listings",
  "Contact landlords directly — no middleman",
  "Save your favorite listings",
  "Save and manage multiple searches",
  "Submit housing requests to landlords",
  "Read and leave reviews",
  "Unlimited inquiries, no caps",
];

const LANDLORD_FEATURES = [
  "1 free listing, no credit card required",
  "Unlimited tenant inquiries",
  "Direct tenant contact — no booking fees",
  "Photo uploads and detailed amenity listing",
  "Listing analytics (views, inquiries)",
  "Verified landlord badge",
  "24/7 listing visibility",
];

const FAQS = [
  {
    q: "Will FurnishFinder ever charge renters?",
    a: "No. Searching, browsing, contacting landlords, saving listings, and submitting housing requests are and always will be free for renters. Our no-booking-fee policy is a core commitment, not a temporary promotion.",
  },
  {
    q: "What does the 'Premium' landlord tier include?",
    a: "We are actively developing a premium landlord tier that will include features like multiple listings, priority placement in search results, advanced analytics, and dedicated support. Pricing will be announced before launch and will never be retroactively applied to existing free listings.",
  },
  {
    q: "Are there any fees taken from rent payments?",
    a: "No. FurnishFinder does not process or touch rental payments. All transactions happen directly between landlords and tenants. We do not take a percentage of rent, charge service fees on payments, or add any cost to the rental transaction.",
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-[#1e3a8a] text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <Link
            href="/"
            className="inline-flex items-center text-blue-300 hover:text-white text-sm mb-8 transition-colors"
          >
            &larr; Back to Home
          </Link>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Simple, Transparent Pricing
          </h1>
          <p className="mt-4 text-blue-200 text-lg max-w-2xl mx-auto">
            No hidden fees. No booking charges. No surprises. FurnishFinder
            is free for renters and free to list for landlords.
          </p>
        </div>
      </section>

      {/* No fees statement */}
      <section className="bg-amber-400 py-6 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[#1e3a8a] text-2xl sm:text-3xl font-extrabold tracking-tight">
            No booking fees. Ever.
          </p>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {/* Renter card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-[#1e3a8a] px-8 py-8 text-white">
                <p className="text-blue-300 text-sm font-semibold uppercase tracking-widest mb-2">
                  For Renters
                </p>
                <h2 className="text-3xl font-extrabold">Free Forever</h2>
                <p className="mt-2 text-blue-200 text-sm">
                  Everything you need to find your next furnished home.
                </p>
              </div>
              <div className="px-8 py-8 flex-1 flex flex-col">
                <ul className="space-y-3 flex-1">
                  {RENTER_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                      <span className="text-slate-700 text-sm leading-relaxed">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <Link
                    href="/sign-up"
                    className="block w-full text-center bg-[#1e3a8a] hover:bg-[#1e40af] text-white font-bold px-6 py-3 rounded-lg transition-colors"
                  >
                    Create Free Account
                  </Link>
                  <p className="text-center text-xs text-slate-400 mt-2">
                    No credit card required
                  </p>
                </div>
              </div>
            </div>

            {/* Landlord card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-slate-800 px-8 py-8 text-white">
                <p className="text-slate-400 text-sm font-semibold uppercase tracking-widest mb-2">
                  For Landlords
                </p>
                <h2 className="text-3xl font-extrabold">Free to List</h2>
                <p className="mt-2 text-slate-300 text-sm">
                  List your furnished rental and connect with quality tenants.
                </p>
              </div>
              <div className="px-8 py-8 flex-1 flex flex-col">
                <ul className="space-y-3 flex-1">
                  {LANDLORD_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                      <span className="text-slate-700 text-sm leading-relaxed">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <Link
                    href="/list-your-property"
                    className="block w-full text-center bg-amber-400 hover:bg-amber-300 text-[#1e3a8a] font-bold px-6 py-3 rounded-lg transition-colors"
                  >
                    List Your Property
                  </Link>
                  <p className="text-center text-xs text-slate-400 mt-2">
                    Free — no credit card required
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Paid landlord upgrade tiers */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-amber-600 text-sm font-semibold uppercase tracking-widest">
              Optional Upgrades
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0f2044] mt-2">
              Grow faster with Landlord Pro
            </h2>
            <p className="mt-3 text-slate-600 max-w-2xl mx-auto">
              Upgrade whenever you want to fill vacancies faster, manage
              multiple properties, and get priority placement in search.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Landlord Pro */}
            <div className="relative bg-white rounded-2xl border-2 border-[#1e3a8a] shadow-lg overflow-hidden flex flex-col">
              <div className="absolute top-4 right-4 bg-amber-400 text-[#1e3a8a] text-xs font-bold px-3 py-1 rounded-full">
                MOST POPULAR
              </div>
              <div className="px-8 pt-8 pb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="h-5 w-5 text-amber-500 fill-amber-400" />
                  <p className="text-[#1e3a8a] text-sm font-semibold uppercase tracking-widest">
                    Landlord Pro
                  </p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold text-[#0f2044]">
                    $29
                  </span>
                  <span className="text-slate-500 text-sm">/month</span>
                </div>
                <p className="mt-2 text-slate-600 text-sm">
                  Perfect for hosts with 1–5 properties.
                </p>
              </div>
              <div className="px-8 pb-8 flex-1 flex flex-col">
                <ul className="space-y-3 flex-1">
                  {[
                    "Up to 5 active listings",
                    "Featured placement in search results",
                    "Verified landlord badge",
                    "Advanced analytics (views, saves, inquiry funnel)",
                    "Priority email support within 24 hours",
                    "Cancel anytime",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="text-slate-700 text-sm">{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <SubscriptionCheckoutButton
                    plan="landlord_pro"
                    label="Upgrade to Pro"
                    className="w-full py-6 text-base"
                  />
                </div>
              </div>
            </div>

            {/* Landlord Premium */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-lg overflow-hidden flex flex-col text-white">
              <div className="px-8 pt-8 pb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-5 w-5 text-amber-400" />
                  <p className="text-amber-400 text-sm font-semibold uppercase tracking-widest">
                    Landlord Premium
                  </p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold">$99</span>
                  <span className="text-slate-400 text-sm">/month</span>
                </div>
                <p className="mt-2 text-slate-300 text-sm">
                  For property managers and professional hosts.
                </p>
              </div>
              <div className="px-8 pb-8 flex-1 flex flex-col">
                <ul className="space-y-3 flex-1">
                  {[
                    "Unlimited active listings",
                    "Top-of-search priority placement",
                    "Premium verified badge + profile boost",
                    "Full analytics dashboard + CSV export",
                    "Bulk upload and API access",
                    "Dedicated account manager",
                    "Cancel anytime",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                      <span className="text-slate-200 text-sm">{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <SubscriptionCheckoutButton
                    plan="landlord_premium"
                    label="Upgrade to Premium"
                    variant="outline"
                    className="w-full py-6 text-base border-amber-400 text-amber-400 hover:bg-amber-400 hover:text-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* One-time feature listing callout */}
          <div className="mt-12 bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Zap className="h-8 w-8 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-slate-900">
                Just need a one-time boost?
              </p>
              <p className="text-slate-600 text-sm mt-1">
                Feature any single listing for 30 days with a one-time
                payment of $29 — no subscription required. Available from
                any listing&apos;s management page.
              </p>
            </div>
            <Link
              href="/dashboard/landlord/listings"
              className="bg-amber-400 hover:bg-amber-500 text-slate-900 font-semibold px-5 py-2.5 rounded-lg text-sm whitespace-nowrap"
            >
              Manage listings &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* How we make money */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-4">
            How Does FurnishFinder Make Money?
          </h2>
          <p className="text-slate-600 leading-relaxed max-w-2xl mx-auto">
            We are currently in growth mode, focused on building the best
            marketplace for furnished rentals. Future revenue will come from
            optional premium landlord tools and B2B partnerships — never from
            booking fees or renter charges. Our business model is aligned with
            helping you find great housing, not extracting fees from you.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-10 text-center">
            Pricing FAQ
          </h2>
          <div className="space-y-6">
            {FAQS.map((faq) => (
              <div
                key={faq.q}
                className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm"
              >
                <h3 className="font-bold text-slate-900 mb-2">{faq.q}</h3>
                <p className="text-slate-600 leading-relaxed text-sm">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1e3a8a] py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Start for Free Today
          </h2>
          <p className="mt-3 text-blue-200">
            No credit card. No commitment. Just great furnished rentals.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/search"
              className="inline-block bg-amber-400 hover:bg-amber-300 text-[#1e3a8a] font-bold px-8 py-3 rounded-lg transition-colors"
            >
              Search Listings
            </Link>
            <Link
              href="/list-your-property"
              className="inline-block border border-white text-white hover:bg-white/10 font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              List Your Property
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
