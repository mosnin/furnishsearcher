import { Metadata } from "next";
import Link from "next/link";
import { CheckCircle, Zap } from "lucide-react";

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

                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                  <Zap className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      Premium Tier — Coming Soon
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Multiple listings, priority placement, and advanced
                      analytics. Pricing to be announced.
                    </p>
                  </div>
                </div>

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
