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
    <main className="min-h-screen bg-white">
      <Navbar />
      {/* Hero */}
      <section className="bg-[#0f2044] text-white py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
            List Your Furnished Property{" "}
            <span className="text-amber-400">For Monthly Stays</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto">
            Prepare your rental details, manage availability and communicate
            directly with prospective tenants.
          </p>
          <div className="mt-10">
            <Button
              asChild
              size="lg"
              className="bg-amber-400 hover:bg-amber-300 text-[#0f2044] font-bold text-lg px-10 py-6 rounded-xl shadow-lg"
            >
              <Link href="/sign-up">Prepare Your Listing</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-blue-200">
            Draft first. Paid access, verification and review are required for
            publication.
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            Tools for Landlords
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {BENEFITS.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <Card key={benefit.title} className="border-0 shadow-md">
                  <CardContent className="p-6 flex flex-col items-start gap-4">
                    <div className="h-12 w-12 rounded-xl bg-[#0f2044]/10 flex items-center justify-center">
                      <Icon className="h-6 w-6 text-[#0f2044]" />
                    </div>
                    <h3 className="font-semibold text-slate-900 text-lg">
                      {benefit.title}
                    </h3>
                    <p className="text-slate-500 text-sm leading-relaxed">
                      {benefit.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-14">
            How It Works
          </h2>
          <div className="relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-8 left-[calc(16.67%-1px)] right-[calc(16.67%-1px)] h-0.5 bg-[#0f2044]/20" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-6">
              {HOW_IT_WORKS.map((item) => (
                <div
                  key={item.step}
                  className="flex flex-col items-center text-center"
                >
                  <div className="h-16 w-16 rounded-full bg-[#0f2044] text-white flex items-center justify-center text-2xl font-extrabold shadow-md z-10 relative">
                    {item.step}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-500 leading-relaxed max-w-xs">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Separator />

      <section className="py-16 px-4 bg-blue-50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-slate-900">
            Before you publish
          </h2>
          <p className="mt-4 text-slate-600">
            A subscription alone does not approve a property. Keep your photos,
            pricing and availability current, complete the required
            verification, and submit your listing for staff review.
          </p>
          <Link
            href="/pricing"
            className="inline-block mt-6 font-semibold text-[#1e3a8a] underline"
          >
            Review plans and publication requirements
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {FAQS.map((faq, i) => (
              <div
                key={i}
                className="border border-gray-200 rounded-xl overflow-hidden"
              >
                <details className="group">
                  <summary className="flex items-center justify-between gap-4 p-5 cursor-pointer select-none list-none">
                    <span className="font-semibold text-slate-900">
                      {faq.question}
                    </span>
                    <CheckCircle className="h-5 w-5 text-[#0f2044] shrink-0 opacity-60" />
                  </summary>
                  <div className="px-5 pb-5 text-sm text-slate-600 leading-relaxed border-t border-gray-100 pt-4">
                    {faq.answer}
                  </div>
                </details>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* Final CTA */}
      <section className="py-20 px-4 bg-[#0f2044]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Ready to list?
          </h2>
          <p className="mt-4 text-blue-200 text-lg">
            Prepare your property details and review the publication
            requirements.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              asChild
              size="lg"
              className="bg-amber-400 hover:bg-amber-300 text-[#0f2044] font-bold px-8"
            >
              <Link href="/sign-up">Create an Account</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white text-white hover:bg-white/10 bg-transparent px-8"
            >
              <Link href="/sign-in">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
