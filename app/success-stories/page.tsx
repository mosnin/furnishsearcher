import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Success Stories | FurnishFinder",
  description:
    "Real stories from travel nurses, corporate travelers, and landlords who found success on FurnishFinder's furnished rental marketplace.",
};

const TESTIMONIALS = [
  {
    name: "Priya Nair",
    location: "San Diego, CA",
    role: "Travel Nurse",
    avatar: "https://i.pravatar.cc/150?img=47",
    rating: 5,
    quote:
      "I was assigned a 13-week contract at Scripps Health and had 10 days to find housing. FurnishFinder had six furnished options within 2 miles of the hospital — I signed a lease in 48 hours. The landlord was incredibly responsive and the apartment was exactly as described. I've now used FurnishFinder for four consecutive travel contracts.",
  },
  {
    name: "Marcus Webb",
    location: "Chicago, IL",
    role: "Corporate Relocation",
    avatar: "https://i.pravatar.cc/150?img=12",
    rating: 5,
    quote:
      "My company relocated me from Atlanta to Chicago with three weeks' notice. Finding a furnished place that didn't require a 12-month lease felt impossible — until FurnishFinder. I found a beautiful apartment in River North, month-to-month, and didn't pay a single booking fee. The direct contact with the landlord made the whole process feel personal and trustworthy.",
  },
  {
    name: "Jennifer Holloway",
    location: "Austin, TX",
    role: "Landlord — 2 listings",
    avatar: "https://i.pravatar.cc/150?img=32",
    rating: 5,
    quote:
      "I had a furnished condo sitting vacant for three months before a friend told me about FurnishFinder. I listed it for free in about 20 minutes, and within a week I had six qualified inquiries. My unit has been occupied almost continuously for the past two years. The tenants — mostly traveling professionals — are respectful and easy to work with.",
  },
  {
    name: "Tomás Guerrero",
    location: "Seattle, WA",
    role: "Digital Nomad",
    avatar: "https://i.pravatar.cc/150?img=68",
    rating: 5,
    quote:
      "I work remotely full-time and move cities every two to four months. FurnishFinder has become my go-to for finding quality furnished apartments in walkable neighborhoods. I love that I can filter for fast WiFi, a dedicated workspace, and pet-friendly options. My golden retriever, Biscuit, approves.",
  },
  {
    name: "Diane Schuster",
    location: "Boston, MA",
    role: "Relocating Family",
    avatar: "https://i.pravatar.cc/150?img=25",
    rating: 5,
    quote:
      "We were between homes after selling and needed a furnished place for two to three months while we searched for our next house. Hotel suites were going to cost us a fortune. FurnishFinder had a gorgeous townhouse that fit all four of us, including the dog. The monthly rate was nearly half of what a comparable hotel suite would have cost. Total lifesaver.",
  },
  {
    name: "Calvin Osei",
    location: "Denver, CO",
    role: "Landlord — 1 listing",
    avatar: "https://i.pravatar.cc/150?img=53",
    rating: 5,
    quote:
      "I'm a small-time landlord with one furnished property near the University of Denver medical campus. I used to list on a major short-term rental platform and paid 15–20% in booking fees. Switching to FurnishFinder meant I could offer tenants a lower monthly rate, keep more revenue, and still attract quality monthly renters. The math was obvious.",
  },
];

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className={`h-4 w-4 ${i < count ? "text-amber-400" : "text-gray-200"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export default function SuccessStoriesPage() {
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
            Real Stories from Real Renters &amp; Landlords
          </h1>
          <p className="mt-4 text-blue-200 text-lg max-w-2xl mx-auto">
            Thousands of people use FurnishFinder every month to find furnished
            housing or fill vacancies. Here are a few of their stories.
          </p>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-amber-400 py-6 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-extrabold text-[#1e3a8a]">300k+</p>
            <p className="text-xs font-semibold text-[#1e3a8a]/70 uppercase tracking-wide">
              Active Listings
            </p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-[#1e3a8a]">240k+</p>
            <p className="text-xs font-semibold text-[#1e3a8a]/70 uppercase tracking-wide">
              Landlords
            </p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-[#1e3a8a]">50</p>
            <p className="text-xs font-semibold text-[#1e3a8a]/70 uppercase tracking-wide">
              States
            </p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col"
              >
                <StarRating count={t.rating} />
                <blockquote className="mt-4 text-slate-600 text-sm leading-relaxed flex-1">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <div className="mt-6 flex items-center gap-3 pt-4 border-t border-gray-100">
                  <img
                    src={t.avatar}
                    alt={t.name}
                    className="h-10 w-10 rounded-full object-cover border-2 border-[#1e3a8a]/10"
                  />
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">
                      {t.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t.role} &middot; {t.location}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Landlord CTA mid-page */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-4">
            Join 240,000+ landlords and find your next tenant
          </h2>
          <p className="text-slate-600 max-w-xl mx-auto mb-8">
            List your furnished rental for free and connect directly with
            travel nurses, corporate travelers, relocating families, and
            remote workers looking for monthly housing.
          </p>
          <Link
            href="/list-your-property"
            className="inline-block bg-[#1e3a8a] hover:bg-[#1e40af] text-white font-bold px-8 py-3 rounded-lg transition-colors"
          >
            List Your Property — Free
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1e3a8a] py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Ready to Write Your Own Story?
          </h2>
          <p className="mt-3 text-blue-200">
            Find furnished monthly rentals with no booking fees, no middlemen.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/search"
              className="inline-block bg-amber-400 hover:bg-amber-300 text-[#1e3a8a] font-bold px-8 py-3 rounded-lg transition-colors"
            >
              Search Listings
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
