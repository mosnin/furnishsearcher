import Link from "next/link";
import Navbar from "@/components/navbar";
import Hero from "@/components/hero";
import StatsBar from "@/components/stats-bar";
import HowItWorks from "@/components/how-it-works";
import FeaturedListings from "@/components/featured-listings";
import TrustSection from "@/components/trust-section";
import TopCities from "@/components/top-cities";
import Footer from "@/components/footer";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Link href="/search/guided" className="text-sm underline">
            Describe your ideal stay or refine your search
          </Link>
        </div>
        <StatsBar />
        <HowItWorks />
        <FeaturedListings />
        <TrustSection />
        <TopCities />
      </main>
      <Footer />
    </div>
  );
}
