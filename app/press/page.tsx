import { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

export const metadata: Metadata = {
  title: "Press | FurnishFinder",
  description:
    "FurnishFinder in the news. Press mentions, media coverage, and brand resources for journalists and media professionals.",
};

const PRESS_MENTIONS = [
  {
    publication: "TechCrunch",
    publicationLogo: "TC",
    logoColor: "bg-green-600",
    date: "March 2026",
    headline:
      "FurnishFinder Is Quietly Building a Fee-Free Alternative to the Furnished Rental Giants",
    excerpt:
      "While Airbnb and VRBO continue to raise service fees, FurnishFinder has taken the opposite approach — stripping out platform fees entirely and connecting landlords and renters directly. The startup now claims over 300,000 active listings across all 50 states, with particular strength in markets popular with travel nurses and corporate relocations.",
    href: "#",
  },
  {
    publication: "The Wall Street Journal",
    publicationLogo: "WSJ",
    logoColor: "bg-slate-900",
    date: "January 2026",
    headline:
      "Travel Nurses Are Rewriting the Furnished Rental Market — and Startups Are Taking Notice",
    excerpt:
      "The 1.8 million travel nurses in the United States need furnished housing for 13-week stints, creating a unique rental demand that traditional platforms struggle to serve. FurnishFinder, which focuses exclusively on monthly furnished rentals, says travel nurses account for nearly a third of its tenant base. 'We built specifically for people whose housing needs don't fit a standard lease,' said CEO Sarah Mitchell.",
    href: "#",
  },
  {
    publication: "Apartment Therapy",
    publicationLogo: "AT",
    logoColor: "bg-rose-600",
    date: "November 2025",
    headline:
      "The Best Websites for Finding a Furnished Apartment Month-to-Month in 2026",
    excerpt:
      "FurnishFinder stands out from the crowd by refusing to charge renters any fees whatsoever. You search, you contact the landlord, you move in — and FurnishFinder never touches your wallet. For landlords, listing a property is also free. It's a refreshingly simple approach in a market cluttered with hidden charges.",
    href: "#",
  },
];

const BRAND_FACTS = [
  { label: "Founded", value: "2014" },
  { label: "Headquarters", value: "San Francisco, CA" },
  { label: "Active Listings", value: "300,000+" },
  { label: "States Covered", value: "All 50" },
  { label: "Landlords", value: "240,000+" },
  { label: "Booking Fee", value: "$0" },
];

export default function PressPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-[#1e3a8a] text-white py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center text-blue-300 hover:text-white text-sm mb-6 transition-colors"
          >
            &larr; Back to Home
          </Link>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            FurnishFinder in the News
          </h1>
          <p className="mt-3 text-blue-200 text-lg">
            Media coverage, press resources, and company facts for journalists
            and media professionals.
          </p>
        </div>
      </section>

      {/* Press mentions */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-[#1e3a8a] mb-8">
          Recent Coverage
        </h2>
        <div className="space-y-8">
          {PRESS_MENTIONS.map((mention) => (
            <article
              key={mention.headline}
              className="border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`shrink-0 h-12 w-12 rounded-lg ${mention.logoColor} flex items-center justify-center`}
                >
                  <span className="text-white font-extrabold text-xs">
                    {mention.publicationLogo}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-900 text-sm">
                      {mention.publication}
                    </span>
                    <span className="text-slate-400 text-xs">&middot;</span>
                    <span className="text-slate-500 text-xs">
                      {mention.date}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-lg leading-snug mb-3">
                    {mention.headline}
                  </h3>
                  <p className="text-slate-600 text-sm leading-relaxed mb-4">
                    {mention.excerpt}
                  </p>
                  <a
                    href={mention.href}
                    className="inline-flex items-center gap-1.5 text-[#1e3a8a] font-semibold text-sm hover:underline"
                  >
                    Read the full article
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Company facts */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-8">
            Company Facts
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            {BRAND_FACTS.map((fact) => (
              <div
                key={fact.label}
                className="bg-white rounded-xl border border-gray-200 p-5 text-center shadow-sm"
              >
                <p className="text-2xl font-extrabold text-[#1e3a8a]">
                  {fact.value}
                </p>
                <p className="text-sm text-slate-500 mt-1">{fact.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Brand assets */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {/* Brand assets */}
          <div className="bg-[#1e3a8a]/5 border border-[#1e3a8a]/20 rounded-xl p-6">
            <h2 className="text-lg font-bold text-[#1e3a8a] mb-3">
              Brand Assets
            </h2>
            <p className="text-slate-600 text-sm leading-relaxed mb-4">
              For logos, brand marks, product screenshots, and other visual
              assets, email our press team. Please do not alter our logo or
              use our brand assets in any misleading way.
            </p>
            <a
              href="mailto:press@furnishfinder.com"
              className="inline-block text-[#1e3a8a] font-semibold hover:underline text-sm"
            >
              Request brand assets &rarr;
            </a>
            <p className="text-xs text-slate-400 mt-2">
              For logos and brand assets, email press@furnishfinder.com
            </p>
          </div>

          {/* Press contact */}
          <div className="bg-slate-900 rounded-xl p-6 text-white">
            <h2 className="text-lg font-bold mb-3">Press Contact</h2>
            <p className="text-slate-300 text-sm leading-relaxed mb-4">
              For media inquiries, interview requests, fact-checking, or press
              kit requests, please reach out to our communications team. We
              typically respond within one business day.
            </p>
            <a
              href="mailto:press@furnishfinder.com"
              className="inline-block font-bold text-amber-400 hover:text-amber-300 transition-colors"
            >
              press@furnishfinder.com
            </a>
            <p className="text-slate-500 text-xs mt-3">
              Response time: within 1 business day
            </p>
          </div>
        </div>
      </section>

      {/* Boilerplate */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="border border-gray-200 rounded-xl p-6 bg-gray-50">
          <h2 className="text-lg font-bold text-[#1e3a8a] mb-3">
            Company Boilerplate
          </h2>
          <p className="text-slate-600 text-sm leading-relaxed italic">
            FurnishFinder is a furnished monthly rental marketplace connecting
            renters — including travel nurses, corporate travelers, relocating
            families, and remote workers — with landlords offering quality
            furnished housing. The platform operates across all 50 states with
            over 300,000 active listings. FurnishFinder charges no booking fees
            to renters and offers a free listing tier to landlords. The company
            was founded in 2014 and is headquartered in San Francisco, California.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1e3a8a] py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Browse the Platform
          </h2>
          <p className="mt-3 text-blue-200">
            See FurnishFinder in action — thousands of furnished rentals, no
            fees.
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
              About Us
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
