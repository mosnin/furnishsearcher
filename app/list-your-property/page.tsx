import { PublicFrame, PublicHeader } from "@/components/public-page";
import { ActionLink } from "@/components/ui-system/primitives";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import {
  DollarSign,
  MessageCircle,
  Users,
  LayoutDashboard,
  CheckCircle,
} from "lucide-react";

const BENEFITS = [
  {
    icon: DollarSign,
    title: "Prepare Your Listing",
    description:
      "Create a draft with property details and photos. Paid access and publication checks are required to appear in search.",
  },
  {
    icon: MessageCircle,
    title: "Direct Tenant Contact",
    description:
      "Connect directly with prospective tenants via our built-in messaging. No middlemen.",
  },
  {
    icon: Users,
    title: "Stay Requests",
    description:
      "Review proposed dates and tenant messages before accepting a stay.",
  },
  {
    icon: LayoutDashboard,
    title: "Easy Listing Management",
    description:
      "Manage availability, photos, pricing and individual rental spaces from your landlord dashboard.",
  },
];

const HOW_IT_WORKS = [
  {
    step: 1,
    title: "Create Your Listing",
    description:
      "Create an account and prepare property details, photos and availability.",
  },
  {
    step: 2,
    title: "Complete Publication Checks",
    description:
      "Complete identity verification, an active paid landlord subscription and staff review before your listing can be published.",
  },
  {
    step: 3,
    title: "Choose Your Tenant",
    description:
      "Review inquiries, discuss terms and accept or decline proposed stays. Arrange screening with your chosen provider.",
  },
];

const FAQS = [
  {
    question: "How much does it cost?",
    answer:
      "You can prepare a draft before purchasing a subscription. Publishing requires active paid landlord access and completed verification and review. See Pricing for plan details; confirm the amount and billing terms at checkout.",
  },
  {
    question: "How do I get paid?",
    answer:
      "Payment is arranged directly between you and your tenant — by bank transfer, check, or whichever method you both agree on. Confirm rent, deposits and any provider fees with your tenant before signing.",
  },
  {
    question: "Can I choose my tenants?",
    answer:
      "Absolutely. You are always in full control. Review every applicant's profile, ask follow-up questions via messaging, and accept or decline any inquiry. We never assign tenants to you.",
  },
];

export default function ListYourPropertyPage() {
  return (
    <PublicFrame>
      <main className="public-content-width">
        <PublicHeader
          title="Make room for a monthly stay."
          description="Prepare your furnished rental, manage availability and speak directly with prospective travelers."
        >
          <div className="public-content-actions">
            <ActionLink
              href="/dashboard/landlord/listings/new"
              variant="primary"
            >
              Prepare your listing
            </ActionLink>
            <ActionLink href="/pricing">Review plans</ActionLink>
          </div>
        </PublicHeader>
        <section className="public-content-section">
          <h2>Your property. One workspace.</h2>
          <div className="public-content-grid">
            {BENEFITS.map((item) => (
              <article
                className="ds-panel public-content-card"
                key={item.title}
              >
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="public-content-section">
          <h2>From draft to your next tenant</h2>
          <ol className="public-workflow">
            {HOW_IT_WORKS.map((item) => (
              <li key={item.step}>
                <span>{String(item.step).padStart(2, "0")}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="public-content-section">
          <h2>Before you publish</h2>
          <p>
            Keep photos, pricing and availability current, complete identity
            verification and submit your listing for staff review. Paid access
            alone does not approve a property.
          </p>
          <ActionLink href="/pricing">
            Plans and publication requirements
          </ActionLink>
        </section>
        <section className="public-content-section">
          <h2>Owner questions</h2>
          <div className="public-faq">
            {FAQS.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </PublicFrame>
  );
}
