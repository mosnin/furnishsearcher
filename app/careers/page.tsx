import { Metadata } from "next";
import Link from "next/link";
import { MapPin, Clock, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Careers | FurnishFinder",
  description:
    "Join the FurnishFinder team. We're hiring engineers, designers, and growth marketers to build the best furnished rental marketplace in the US.",
};

const OPEN_ROLES = [
  {
    title: "Senior Full-Stack Engineer",
    location: "Remote",
    type: "Full-time",
    department: "Engineering",
    description:
      "We're looking for a seasoned full-stack engineer to help scale FurnishFinder's marketplace infrastructure. You'll work across our Next.js frontend, Convex backend, and search systems — designing features that connect tens of thousands of landlords with renters every month. Experience with TypeScript, React, and real-time data is a plus.",
  },
  {
    title: "Product Designer",
    location: "Remote",
    type: "Full-time",
    department: "Design",
    description:
      "We're seeking a product designer who cares deeply about usability and loves the challenge of simplifying complex user flows. You'll own the end-to-end design of new features — from discovery and search to landlord onboarding and messaging — and collaborate closely with our engineering and product teams. A portfolio demonstrating shipped product work is required.",
  },
  {
    title: "Growth Marketing Manager",
    location: "Remote",
    type: "Full-time",
    department: "Marketing",
    description:
      "FurnishFinder is growing rapidly and we need a data-driven growth marketer to accelerate both landlord acquisition and renter engagement. You'll own SEO, content strategy, paid acquisition, and lifecycle email programs. Experience marketing a two-sided marketplace or rental platform is strongly preferred.",
  },
];

const VALUES = [
  {
    emoji: "🏠",
    title: "We're building for real people",
    description:
      "Our users are travel nurses, families in transition, and landlords trying to fill vacancies. Every feature we ship has a real-world impact on someone's housing.",
  },
  {
    emoji: "🚫",
    title: "No fees, no bullshit",
    description:
      "Our business model is honest. We don't extract value from users with hidden fees. We win when our users win — that clarity shapes how we build.",
  },
  {
    emoji: "🌎",
    title: "Remote-first, async by default",
    description:
      "We're a distributed team. We value clear writing, deep focus, and hiring the best people regardless of geography.",
  },
];

export default function CareersPage() {
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
            Join the FurnishFinder Team
          </h1>
          <p className="mt-4 text-blue-200 text-lg max-w-2xl">
            We're on a mission to make furnished monthly rentals simple,
            transparent, and fee-free. If you want to work on a product that
            helps real people find homes, we'd love to hear from you.
          </p>
        </div>
      </section>

      {/* Mission / Values */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-8">
            Why FurnishFinder
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {VALUES.map((v) => (
              <div
                key={v.title}
                className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm"
              >
                <div className="text-3xl mb-3" role="img" aria-hidden="true">
                  {v.emoji}
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{v.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {v.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open roles */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-8">
            Open Roles
          </h2>
          <div className="space-y-6">
            {OPEN_ROLES.map((role) => (
              <div
                key={role.title}
                className="border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-xs font-semibold bg-[#1e3a8a]/10 text-[#1e3a8a] px-2.5 py-1 rounded-full">
                        {role.department}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-1">
                      {role.title}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {role.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {role.type}
                      </span>
                    </div>
                    <p className="text-slate-600 text-sm leading-relaxed">
                      {role.description}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <a
                      href={`mailto:careers@furnishfinder.com?subject=Application: ${encodeURIComponent(role.title)}`}
                      className="inline-flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1e40af] text-white font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm"
                    >
                      Apply
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Perks */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-8">
            What We Offer
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              "Competitive salary and equity compensation",
              "Fully remote — work from anywhere in the US",
              "Comprehensive health, dental, and vision benefits",
              "Home office stipend ($1,500 on start)",
              "Flexible PTO — take what you need",
              "Annual team retreat",
              "Learning &amp; development budget ($2,000/year)",
              "No-meeting Fridays (protected deep work time)",
            ].map((perk) => (
              <div key={perk} className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-4 py-3">
                <span className="text-green-600 font-bold text-lg leading-none">✓</span>
                <span
                  className="text-slate-700 text-sm"
                  dangerouslySetInnerHTML={{ __html: perk }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open application */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-[#1e3a8a]/5 border border-[#1e3a8a]/20 rounded-2xl p-8 text-center">
            <h2 className="text-xl font-bold text-[#1e3a8a] mb-3">
              Don't see your role?
            </h2>
            <p className="text-slate-600 text-sm leading-relaxed max-w-lg mx-auto mb-6">
              We're a small, growing team and sometimes hire for roles we
              haven't posted yet. If you're passionate about housing, marketplaces,
              or consumer tech, send us your resume and a note about what you'd
              like to work on.
            </p>
            <a
              href="mailto:careers@furnishfinder.com?subject=Open Application"
              className="inline-flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1e40af] text-white font-bold px-8 py-3 rounded-lg transition-colors"
            >
              Send Us Your Resume
              <ArrowRight className="h-4 w-4" />
            </a>
            <p className="text-slate-400 text-xs mt-3">
              careers@furnishfinder.com
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1e3a8a] py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            See What We're Building
          </h2>
          <p className="mt-3 text-blue-200">
            Explore the product our team works on every day.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/search"
              className="inline-block bg-amber-400 hover:bg-amber-300 text-[#1e3a8a] font-bold px-8 py-3 rounded-lg transition-colors"
            >
              Browse Listings
            </Link>
            <Link
              href="/about"
              className="inline-block border border-white text-white hover:bg-white/10 font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              About FurnishFinder
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
