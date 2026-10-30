import { PublicFrame, PublicHeader } from "@/components/public-page";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { SubscriptionCheckoutButton } from "@/components/checkout-button";

export const metadata: Metadata = {
  title: "Pricing and Publication | globe",
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
    <PublicFrame>
      <main className="public-content-width">
        <PublicHeader
          title="Plans for your rental business"
          description="Prepare a draft, then review the requirements for publishing your property."
        />
        <div className="public-content-grid public-content-grid--two">
          {PLANS.map((item) => (
            <section className="ds-panel public-plan" key={item.plan}>
              <h2>{item.name}</h2>
              <p>{item.description}</p>
              <p className="ds-caption">
                Review current pricing and renewal terms at checkout.
              </p>
              <ul>
                {item.features.map((feature) => (
                  <li key={feature}>
                    <CheckCircle size={16} aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              <SubscriptionCheckoutButton
                plan={item.plan}
                label={`Review ${item.name} checkout`}
                className="w-full mt-6"
              />
            </section>
          ))}
        </div>
        <section className="public-content-section">
          <h2>Before your listing goes live</h2>
          <p>
            A paid subscription, identity verification and approval of the
            current listing revision are required. Your dashboard shows the
            remaining steps.
          </p>
          <Link
            className="ds-button ds-button--secondary"
            href="/dashboard/landlord/listings"
          >
            Manage listings
          </Link>
        </section>
        <section className="public-content-section">
          <h2>Questions about access</h2>
          <div className="public-faq">
            {FAQS.map((faq) => (
              <details key={faq.q}>
                <summary>{faq.q}</summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </PublicFrame>
  );
}
