import { DollarSign, Building2, MessageCircle, Award } from "lucide-react";

const STATS = [
  {
    icon: DollarSign,
    title: "$0 Booking Fees",
    description: "Save thousands vs short-term platforms",
    highlight: true,
  },
  {
    icon: Building2,
    title: "300,000+ Listings",
    description: "From 240,000+ verified landlords",
    highlight: false,
  },
  {
    icon: MessageCircle,
    title: "Direct Contact",
    description: "Talk to landlords before booking",
    highlight: false,
  },
  {
    icon: Award,
    title: "#1 Ranked",
    description: "Newsweek's Best Online Platform 2025",
    highlight: false,
  },
];

export default function StatsBar() {
  return (
    <section className="bg-[#0f2044] relative overflow-hidden">
      {/* Subtle background texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 50%, white 1px, transparent 1px), radial-gradient(circle at 75% 50%, white 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {STATS.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.title}
                className="flex flex-col items-center text-center gap-3 group"
              >
                {/* Icon container */}
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition-colors flex-shrink-0">
                  <Icon className="w-6 h-6 text-blue-300" />
                </div>

                {/* Text */}
                <div>
                  <p className="text-white font-bold text-lg leading-tight mb-1">
                    {stat.title}
                  </p>
                  <p className="text-blue-200/70 text-sm leading-snug">
                    {stat.description}
                  </p>
                </div>

                {/* Divider (hidden on last item on lg) */}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
