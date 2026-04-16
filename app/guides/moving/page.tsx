import { Metadata } from "next";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Furnished Rental Moving Checklist | FurnishFinder",
  description:
    "A complete moving checklist for furnished rental tenants. Before you move, day of, after arrival, and what to bring.",
};

const CHECKLIST_SECTIONS = [
  {
    title: "Before You Move",
    color: "border-blue-400 bg-blue-50",
    headingColor: "text-[#1e3a8a]",
    items: [
      "Confirm move-in date, time, and key pickup process with your landlord",
      "Review the lease thoroughly — understand utilities, parking, pet policy, and notice requirements",
      "Take photos of your ID and lease and save them to cloud storage",
      "Set up renters insurance — many landlords require it (takes 10 minutes online, costs ~$15–20/month)",
      "Forward your mail via USPS (takes effect within 7–10 business days)",
      "Notify your employer, bank, insurance providers, and subscriptions of your new address",
      "Confirm all utilities are active: electricity, gas, water, internet",
      "If driving, check parking availability, assigned spots, and any permits required",
      "Plan your moving route and time to avoid rush hour",
      "Research the neighborhood: grocery stores, urgent care, pharmacy, gym",
    ],
  },
  {
    title: "Day Of",
    color: "border-amber-400 bg-amber-50",
    headingColor: "text-amber-900",
    items: [
      "Do a walkthrough before unpacking and document any pre-existing damage with dated photos",
      "Email those photos to your landlord immediately to create a record",
      "Locate the circuit breaker, water shut-off valve, and fire extinguisher",
      "Test all smoke and carbon monoxide detectors",
      "Test all locks, windows, and door latches",
      "Confirm internet credentials work and run a speed test",
      "Check all appliances: refrigerator, oven, microwave, washer/dryer",
      "Confirm heating and air conditioning function",
      "Note any maintenance items to report to your landlord (minor issues are normal)",
      "Get a signed or emailed move-in checklist from your landlord if possible",
    ],
  },
  {
    title: "After Arrival",
    color: "border-green-400 bg-green-50",
    headingColor: "text-green-900",
    items: [
      "Update your driver's license or state ID with your new address (required within 30 days in most states)",
      "Register to vote at your new address if applicable",
      "Update your address with the IRS (Form 8822 or via your next tax return)",
      "Set up recurring rent payment with your landlord (bank transfer, check, or agreed platform)",
      "Introduce yourself to neighbors — it makes the stay more pleasant and improves security",
      "Familiarize yourself with building rules: quiet hours, recycling, guest policy",
      "Save your landlord's contact information and the property management emergency line",
      "Set a calendar reminder 30 days before your lease ends to confirm renewal or departure plans",
    ],
  },
  {
    title: "What to Bring",
    color: "border-purple-400 bg-purple-50",
    headingColor: "text-purple-900",
    items: [
      "Personal bedding and pillows (furnished units provide these, but bring your own if sensitive to allergens)",
      "Towels and bath items",
      "Your own coffee maker or preferred appliances if the landlord doesn't include them",
      "Spices, pantry staples, and a reusable grocery bag",
      "Work-from-home setup: monitor, keyboard, headset if needed",
      "Power strips and extension cords",
      "Personal medications and a small first-aid kit",
      "Important documents: passport, lease, insurance cards, vehicle registration",
      "A few comfort items from home to make the space feel yours",
      "Any special equipment for hobbies or fitness",
    ],
  },
];

export default function MovingChecklistPage() {
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
          <p className="text-amber-400 font-semibold uppercase tracking-widest text-sm mb-3">
            Moving Guide
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Furnished Rental Moving Checklist
          </h1>
          <p className="mt-4 text-blue-200 text-lg max-w-2xl">
            A comprehensive, categorized checklist to help you move into your
            furnished rental smoothly — from signing the lease to settling in.
          </p>
        </div>
      </section>

      {/* Intro */}
      <section className="max-w-4xl mx-auto px-4 pt-16 pb-4">
        <p className="text-slate-600 leading-relaxed text-lg border-l-4 border-[#1e3a8a] pl-4">
          Moving into a furnished rental is dramatically easier than a
          traditional move — no furniture truck, no assembly required. But
          there are still important steps to take before, during, and after
          move-in to protect yourself and start your stay on the right foot.
        </p>
      </section>

      {/* Checklist sections */}
      <section className="max-w-4xl mx-auto px-4 py-12 space-y-12">
        {CHECKLIST_SECTIONS.map((section) => (
          <div key={section.title}>
            <div
              className={`border-l-4 ${section.color} rounded-r-xl px-6 py-4 mb-6`}
            >
              <h2 className={`text-2xl font-bold ${section.headingColor}`}>
                {section.title}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {section.items.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  <p className="text-slate-600 text-sm leading-relaxed">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Pro tips */}
      <section className="py-12 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-6">
            Pro Tips from Experienced Renters
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              {
                tip: "Document Everything",
                detail:
                  "Take a timestamped video walkthrough of the entire unit on move-in day. This is your best protection if there's a dispute about the security deposit when you leave.",
              },
              {
                tip: "Communicate in Writing",
                detail:
                  "Even if you speak to your landlord by phone, follow up with a quick email summary. Written records protect both parties and make it easy to reference agreements later.",
              },
              {
                tip: "Test the WiFi First",
                detail:
                  "Internet issues are the #1 complaint from remote workers and travel nurses in furnished rentals. Run a speed test before you're dependent on it for work.",
              },
              {
                tip: "Set Up the Kitchen Early",
                detail:
                  "The kitchen is what makes a furnished apartment feel like home. Make a quick grocery run on day one — coffee, basics, and a few favorites. It changes the vibe immediately.",
              },
            ].map((tip) => (
              <div
                key={tip.tip}
                className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
              >
                <h3 className="font-bold text-slate-900 mb-1">{tip.tip}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {tip.detail}
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
            Find Your Next Home
          </h2>
          <p className="mt-3 text-blue-200">
            Browse furnished rentals in 100+ cities — no booking fees, direct
            landlord contact.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/search"
              className="inline-block bg-amber-400 hover:bg-amber-300 text-[#1e3a8a] font-bold px-8 py-3 rounded-lg transition-colors"
            >
              Find Your Next Home
            </Link>
            <Link
              href="/sign-up"
              className="inline-block border border-white text-white hover:bg-white/10 font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Create Free Account
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
