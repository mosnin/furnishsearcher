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
    title: "No Listing Fees",
    description:
      "List your furnished property completely free. No monthly fees, no commissions — ever.",
  },
  {
    icon: MessageCircle,
    title: "Direct Tenant Contact",
    description:
      "Connect directly with prospective tenants via our built-in messaging. No middlemen.",
  },
  {
    icon: Users,
    title: "300k+ Monthly Renters",
    description:
      "Get your property in front of hundreds of thousands of verified renters every month.",
  },
  {
    icon: LayoutDashboard,
    title: "Easy Listing Management",
    description:
      "Update availability, photos, and pricing in seconds from your landlord dashboard.",
  },
];

const HOW_IT_WORKS = [
  {
    step: 1,
    title: "Create Your Listing",
    description:
      "Sign up for free and add your property details, photos, and availability in minutes.",
  },
  {
    step: 2,
    title: "Get Inquiries",
    description:
      "Qualified renters browse your listing and reach out through our secure messaging platform.",
  },
  {
    step: 3,
    title: "Choose Your Tenant",
    description:
      "Review profiles, verify employment, and select the tenant that's the best fit for you.",
  },
];

const FAQS = [
  {
    question: "How much does it cost?",
    answer:
      "FurnishFinder is completely free for landlords. There are no listing fees, no subscription costs, and no commissions on rent collected. We make money through optional premium upgrades for tenants.",
  },
  {
    question: "How do I get paid?",
    answer:
      "Payment is arranged directly between you and your tenant — by bank transfer, check, or whichever method you both agree on. FurnishFinder does not handle rent payments, which means you keep every dollar.",
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
            List Your Furnished Property —{" "}
            <span className="text-amber-400">For Free</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto">
            Join 240,000+ landlords who use FurnishFinder to fill vacancies fast
            with pre-screened, high-quality monthly renters.
          </p>
          <div className="mt-10">
            <Button
              asChild
              size="lg"
              className="bg-amber-400 hover:bg-amber-300 text-[#0f2044] font-bold text-lg px-10 py-6 rounded-xl shadow-lg"
            >
              <Link href="/sign-up">Start Earning Today</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-blue-200">
            No credit card required · Free forever
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            Why Landlords Love FurnishFinder
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
                <div key={item.step} className="flex flex-col items-center text-center">
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

      {/* Testimonial */}
      <section className="py-20 px-4 bg-blue-50">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-5xl text-[#0f2044]/30 font-serif leading-none mb-4">"</div>
          <blockquote className="text-xl sm:text-2xl font-medium text-slate-800 leading-snug">
            I listed my condo on a Friday and had three qualified inquiries by
            Sunday morning. FurnishFinder is the only platform I use now.
          </blockquote>
          <div className="mt-8 flex flex-col items-center gap-2">
            <div className="h-14 w-14 rounded-full bg-[#0f2044] text-white flex items-center justify-center text-xl font-bold">
              MR
            </div>
            <span className="font-semibold text-slate-900">Marcus Reynolds</span>
            <span className="text-sm text-slate-500">
              Landlord · Austin, TX · Member since 2021
            </span>
          </div>
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
            Join thousands of landlords earning more with less hassle.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              asChild
              size="lg"
              className="bg-amber-400 hover:bg-amber-300 text-[#0f2044] font-bold px-8"
            >
              <Link href="/sign-up">Sign Up Free</Link>
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
