import { Metadata } from "next";
import Link from "next/link";
import AffiliateForm from "./affiliate-form";

export const metadata: Metadata = {
  title: "Affiliate Program | FurnishFinder",
  description:
    "Partner with FurnishFinder and earn for every landlord or renter you refer. Apply to our affiliate program today.",
};

const STEPS = [
  {
    step: "01",
    title: "Apply to the Program",
    description:
      "Fill out the short application below. We review applications weekly and aim to respond within 3 business days. Any content creator, real estate professional, or community platform is eligible.",
  },
  {
    step: "02",
    title: "Get Your Referral Link",
    description:
      "Once approved, you'll receive a unique referral link and access to our affiliate dashboard where you can track clicks, sign-ups, and earnings in real time.",
  },
  {
    step: "03",
    title: "Earn Per Referral",
    description:
      "Earn a commission for every landlord who signs up and publishes a listing through your link. Payouts are processed monthly via direct deposit or PayPal.",
  },
];

const BENEFITS = [
  {
    title: "Earn Per Referral",
    description:
      "Receive a commission for each landlord who creates an active listing through your unique affiliate link. Rates are competitive and increase with volume.",
  },
  {
    title: "Dedicated Affiliate Support",
    description:
      "Every affiliate gets a dedicated point of contact on our team. We're here to help you maximize your earnings and answer any questions.",
  },
  {
    title: "Ready-Made Marketing Materials",
    description:
      "Access a library of banners, email copy, social media templates, and landing page assets created by our design team — ready to use immediately.",
  },
  {
    title: "Real-Time Dashboard",
    description:
      "Track every click, sign-up, and commission from your affiliate dashboard. Transparent reporting with no hidden deductions.",
  },
];

export default function AffiliatesPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-[#1e3a8a] text-white py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center text-blue-300 hover:text-white text-sm mb-6 transition-colors"
          >
            &larr; Back to Home
          </Link>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Partner with FurnishFinder
          </h1>
          <p className="mt-4 text-blue-200 text-lg max-w-2xl">
            Refer landlords and renters to the fastest-growing furnished rental
            marketplace in the US — and earn a commission for every successful
            sign-up.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-10 text-center">
            How the Affiliate Program Works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {STEPS.map((step) => (
              <div key={step.step} className="relative">
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm h-full">
                  <div className="h-12 w-12 rounded-full bg-[#1e3a8a] flex items-center justify-center mb-4">
                    <span className="text-white font-extrabold text-sm">
                      {step.step}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-10 text-center">
            Affiliate Benefits
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {BENEFITS.map((benefit) => (
              <div
                key={benefit.title}
                className="flex items-start gap-4 border border-gray-200 rounded-xl p-6 shadow-sm"
              >
                <div className="shrink-0 h-8 w-8 rounded-full bg-amber-400 flex items-center justify-center">
                  <span className="text-[#1e3a8a] font-extrabold text-sm">✓</span>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">
                    {benefit.title}
                  </h3>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    {benefit.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Application form */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-3 text-center">
            Apply to Become an Affiliate
          </h2>
          <p className="text-slate-500 text-center text-sm mb-10">
            Applications are reviewed weekly. We'll be in touch within 3
            business days.
          </p>
          <AffiliateForm />
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1e3a8a] py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Questions About the Program?
          </h2>
          <p className="mt-3 text-blue-200">
            Email our partnerships team — we're happy to share more details.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:affiliates@furnishfinder.com"
              className="inline-block bg-amber-400 hover:bg-amber-300 text-[#1e3a8a] font-bold px-8 py-3 rounded-lg transition-colors"
            >
              affiliates@furnishfinder.com
            </a>
            <Link
              href="/search"
              className="inline-block border border-white text-white hover:bg-white/10 font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Browse the Platform
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
