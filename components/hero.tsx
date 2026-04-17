import Image from "next/image";
import SearchBar from "@/components/search-bar";
import { CheckCircle } from "lucide-react";

const TRUST_ITEMS = [
  "No booking fees",
  "300,000+ listings",
  "Direct landlord contact",
];

export default function Hero() {
  return (
    <section className="relative min-h-[88vh] flex flex-col justify-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1920&q=80"
          alt="Beautifully furnished modern living room"
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        {/* Gradient overlay — dark navy at left/bottom, transparent at right */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f2044]/90 via-[#0f2044]/70 to-[#0f2044]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f2044]/60 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-3xl">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white/90 text-[12px] font-semibold uppercase tracking-widest">
              #1 Furnished Rental Marketplace
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-5">
            Find Your Perfect{" "}
            <span className="relative inline-block">
              <span className="relative z-10">Monthly Rental</span>
              <span
                className="absolute bottom-1 left-0 right-0 h-3 bg-white/20 -rotate-1 rounded"
                aria-hidden="true"
              />
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-white/75 mb-10 max-w-xl leading-relaxed font-[450]">
            Furnished homes for corporate travelers, travel nurses, relocating
            families &amp; digital nomads. Monthly terms, no short-term
            premiums.
          </p>

          {/* Search Bar */}
          <SearchBar />

          {/* Trust indicators */}
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
            {TRUST_ITEMS.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-white/70 text-[14px] font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom wave decoration */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <svg
          viewBox="0 0 1440 60"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full"
          preserveAspectRatio="none"
        >
          <path
            d="M0 60L1440 60L1440 20C1200 60 960 0 720 20C480 40 240 0 0 20L0 60Z"
            fill="white"
          />
        </svg>
      </div>
    </section>
  );
}
