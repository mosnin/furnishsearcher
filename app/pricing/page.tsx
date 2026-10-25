import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { SubscriptionCheckoutButton } from "@/components/checkout-button";

export const metadata: Metadata = {
  title: "Pricing and Publication | FurnishFinder",
  description:
    "Review landlord subscription access and the requirements for publishing a furnished rental.",
};
const PLANS = [
  {
    plan: "landlord_pro" as const,
    name: "Landlord Pro",
    description: "For owners managing up to five active rental spaces.",
    features: [
      "Up to 5 active rental spaces",
      "Listing photos, pricing and availability",
      "Direct messages and stay requests",
      "Dated performance reports and CSV export",
    ],
  },
  {
    plan: "landlord_premium" as const,
    name: "Landlord Premium",
    description: "For owners managing a larger portfolio.",
    features: [
      "Active rental spaces beyond the Pro limit",
      "Listing photos, pricing and availability",
      "Direct messages and stay requests",
      "Dated performance reports and CSV export",
    ],
  },
];
const FAQS = [
  {
    q: "Can I prepare a listing before paying?",
    a: "Yes. Prepare a draft with photos, pricing and availability. Publication requires an active paid landlord subscription, identity verification and approval of the current listing revision. Paying does not bypass those checks.",
  },
  {
    q: "What will I be charged?",
    a: "Confirm the current amount, currency, billing interval and renewal terms on the payment provider's checkout before completing a purchase. This page does not publish an unverified price. Checkout may be unavailable while provider setup is incomplete.",
  },
  {
    q: "Does every property or room count separately?",
    a: "Each active rental space counts toward the Pro limit of five. Manage a property and its individual spaces in your landlord dashboard.",
  },
  {
    q: "What can renters do?",
    a: "Browse listings, save properties and searches, contact owners, and send housing or stay requests. Some actions require an account. Agree on rent, deposits, utilities and payment arrangements directly with the owner.",
  },
  {
    q: "Does featured placement replace a subscription?",
    a: "No. Featured placement is a separate paid option for an eligible published listing. It does not replace landlord access, identity verification or review, and does not guarantee search rank, inquiries or occupancy.",
  },
];
export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="bg-[#1e3a8a] text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <Link href="/" className="text-blue-300 underline">
            Back to Home
          </Link>
          <h1 className="text-4xl sm:text-5xl font-extrabold mt-8">
            Plans and publication
          </h1>
          <p className="mt-4 text-blue-200 text-lg">
            Prepare your draft, then complete the requirements for publishing
            your rental.
          </p>
        </div>
      </section>
      <section className="bg-amber-50 px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-bold text-slate-900 text-xl">
            Paid access is required to publish
          </h2>
          <p className="mt-2 text-slate-700">
            Your listing also needs completed identity verification, current
            photos and property details, staff approval and no publication hold.
            Your dashboard shows what remains to be completed.
          </p>
        </div>
      </section>
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          {PLANS.map((item) => (
            <div
              key={item.plan}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col"
            >
              <h2 className="text-2xl font-extrabold text-[#0f2044]">
                {item.name}
              </h2>
              <p className="mt-3 text-slate-600">{item.description}</p>
              <p className="mt-4 text-sm text-slate-600">
                Review current pricing and renewal terms at checkout.
              </p>
              <ul className="space-y-3 mt-6 flex-1">
                {item.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 text-sm text-slate-700"
                  >
                    <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <SubscriptionCheckoutButton
                plan={item.plan}
                label={`Review ${item.name} checkout`}
                className="w-full mt-8 whitespace-normal h-auto min-h-10 py-3"
              />
            </div>
          ))}
        </div>
      </section>
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-8">
            Questions about access
          </h2>
          <div className="space-y-4">
            {FAQS.map((faq) => (
              <div
                key={faq.q}
                className="border border-gray-200 rounded-xl p-6"
              >
                <h3 className="font-bold text-slate-900">{faq.q}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-6 mt-8">
            <Link
              href="/dashboard/landlord/listings"
              className="font-semibold text-[#1e3a8a] underline"
            >
              Manage listings
            </Link>
            <Link
              href="/search"
              className="font-semibold text-[#1e3a8a] underline"
            >
              Browse rentals
            </Link>
            <Link
              href="/contact"
              className="font-semibold text-[#1e3a8a] underline"
            >
              Contact support
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
