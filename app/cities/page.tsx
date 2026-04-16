import { Metadata } from "next";
import Link from "next/link";
import TopCities from "@/components/top-cities";
import { TOP_CITIES, STATES } from "@/lib/cities";

export const metadata: Metadata = {
  title: "Browse Furnished Rentals by City | FurnishFinder",
  description:
    "Find furnished monthly rentals in 100+ cities across all 50 states. Browse by city or state and connect directly with landlords — no booking fees.",
};

export default function CitiesPage() {
  const popularCities = TOP_CITIES.filter((c) => c.popular);

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
            Browse Furnished Rentals by City
          </h1>
          <p className="mt-4 text-blue-200 text-lg max-w-2xl">
            Find monthly furnished housing near hospitals, corporate campuses,
            and city centers — no booking fees, direct landlord contact.
          </p>
        </div>
      </section>

      {/* Hero stats */}
      <section className="bg-amber-400 py-6 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-extrabold text-[#1e3a8a]">100+</p>
            <p className="text-xs font-semibold text-[#1e3a8a]/70 uppercase tracking-wide">
              Cities
            </p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-[#1e3a8a]">
              {STATES.length}
            </p>
            <p className="text-xs font-semibold text-[#1e3a8a]/70 uppercase tracking-wide">
              States
            </p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-[#1e3a8a]">300k+</p>
            <p className="text-xs font-semibold text-[#1e3a8a]/70 uppercase tracking-wide">
              Listings
            </p>
          </div>
        </div>
      </section>

      {/* Stat callout */}
      <section className="py-10 px-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-slate-600 text-lg font-medium">
            Listings in{" "}
            <span className="text-[#1e3a8a] font-bold">100+ cities</span>{" "}
            across{" "}
            <span className="text-[#1e3a8a] font-bold">all 50 states</span>
          </p>
        </div>
      </section>

      {/* Popular cities quick links */}
      <section className="py-8 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-lg font-bold text-[#1e3a8a] mb-5">
            Most Popular Cities
          </h2>
          <div className="flex flex-wrap gap-2">
            {popularCities.map((city) => (
              <Link
                key={`${city.name}-${city.stateCode}`}
                href={`/search?location=${encodeURIComponent(
                  `${city.name}, ${city.stateCode}`
                )}&city=${encodeURIComponent(city.name)}&state=${encodeURIComponent(
                  city.stateCode
                )}`}
                className="inline-block bg-white border border-[#1e3a8a]/20 hover:border-[#1e3a8a] hover:bg-[#1e3a8a]/5 text-[#1e3a8a] font-medium text-sm px-4 py-2 rounded-full transition-colors"
              >
                {city.name}, {city.stateCode}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Full city browser — the interactive client component */}
      <TopCities />

      {/* CTA */}
      <section className="bg-[#1e3a8a] py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Don't See Your City?
          </h2>
          <p className="mt-3 text-blue-200">
            We're adding new cities every week. Search by zip code or
            neighborhood — you might be surprised what's available.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/search"
              className="inline-block bg-amber-400 hover:bg-amber-300 text-[#1e3a8a] font-bold px-8 py-3 rounded-lg transition-colors"
            >
              Search All Listings
            </Link>
            <Link
              href="/housing-request"
              className="inline-block border border-white text-white hover:bg-white/10 font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Submit a Housing Request
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
