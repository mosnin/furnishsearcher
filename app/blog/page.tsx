import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog | FurnishFinder",
  description:
    "Tips, guides, and resources for renters and landlords. Travel nurse housing, corporate relocation, furnished apartment checklists, and more.",
};

const POSTS = [
  {
    title: "The Ultimate Travel Nurse Housing Guide for 2026",
    category: "Travel Nurse",
    categoryColor: "bg-blue-100 text-blue-800",
    date: "April 10, 2026",
    excerpt:
      "Landing a 13-week contract is exciting — finding housing shouldn't be the hard part. We break down how to find furnished rentals near any hospital, what to look for, and how to negotiate a flexible lease that matches your assignment dates.",
    href: "#",
  },
  {
    title: "Corporate Relocation Housing: Hotel vs. Furnished Apartment",
    category: "Corporate Housing",
    categoryColor: "bg-purple-100 text-purple-800",
    date: "March 28, 2026",
    excerpt:
      "Extended-stay hotels charge a premium for amenities you may not need. A furnished apartment typically offers more space, a full kitchen, and lower monthly costs. Here's how to compare your options and make the right call for your relocation.",
    href: "#",
  },
  {
    title: "Pet-Friendly Furnished Rentals: How to Search and What to Ask",
    category: "Renter Tips",
    categoryColor: "bg-green-100 text-green-800",
    date: "March 15, 2026",
    excerpt:
      "Finding a furnished rental that welcomes your pet takes extra legwork, but it's absolutely doable. Learn how to filter for pet-friendly listings, what fees to expect, and the questions to ask a landlord before signing anything.",
    href: "#",
  },
  {
    title: "10 Things Every Landlord Should Include in a Furnished Listing",
    category: "Landlord Tips",
    categoryColor: "bg-orange-100 text-orange-800",
    date: "March 5, 2026",
    excerpt:
      "Listings with detailed amenity information get 3x more inquiries than bare-bones posts. We analyzed thousands of high-performing listings on FurnishFinder and compiled the information tenants care about most — don't leave these out.",
    href: "#",
  },
  {
    title: "Best Cities for Furnished Monthly Rentals: 2026 Edition",
    category: "City Guides",
    categoryColor: "bg-red-100 text-red-800",
    date: "February 20, 2026",
    excerpt:
      "From healthcare hubs in Nashville and Boston to tech corridors in Austin and Denver, some cities have a far deeper supply of furnished monthly rentals than others. Our annual city guide ranks the top markets by availability, price, and walkability.",
    href: "#",
  },
  {
    title: "Furnished Apartment Checklist: What's Usually Included (and What's Not)",
    category: "Renter Tips",
    categoryColor: "bg-green-100 text-green-800",
    date: "February 8, 2026",
    excerpt:
      "\"Fully furnished\" means different things to different landlords. Before you move in, use this comprehensive checklist to verify what's provided — from kitchen essentials and bedding to office furniture and high-speed internet — and what you'll need to bring yourself.",
    href: "#",
  },
];

export default function BlogPage() {
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
            FurnishFinder Blog
          </h1>
          <p className="mt-4 text-blue-200 text-lg">
            Tips for Renters &amp; Landlords
          </p>
        </div>
      </section>

      {/* Posts grid */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {POSTS.map((post) => (
              <article
                key={post.title}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                {/* Color accent bar */}
                <div className="h-1.5 bg-[#1e3a8a]" />
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${post.categoryColor}`}
                    >
                      {post.category}
                    </span>
                  </div>
                  <h2 className="font-bold text-slate-900 text-lg leading-snug mb-3 flex-1">
                    {post.title}
                  </h2>
                  <p className="text-slate-500 text-sm leading-relaxed mb-4">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-100">
                    <span className="text-xs text-slate-400">{post.date}</span>
                    <Link
                      href={post.href}
                      className="text-[#1e3a8a] font-semibold text-sm hover:underline"
                    >
                      Read More &rarr;
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-3">
            Get New Guides in Your Inbox
          </h2>
          <p className="text-slate-600 text-sm mb-6 max-w-md mx-auto">
            We publish new tips and guides for renters and landlords every two
            weeks. No spam, unsubscribe anytime.
          </p>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
          >
            <input
              type="email"
              placeholder="your@email.com"
              aria-label="Email address"
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent"
            />
            <button
              type="submit"
              className="bg-[#1e3a8a] hover:bg-[#1e40af] text-white font-bold px-6 py-2.5 rounded-lg transition-colors text-sm whitespace-nowrap"
            >
              Subscribe
            </button>
          </form>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1e3a8a] py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Ready to Find Your Next Furnished Home?
          </h2>
          <p className="mt-3 text-blue-200">
            Browse thousands of listings with no booking fees.
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
