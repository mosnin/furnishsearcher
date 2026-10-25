import { CalendarDays, Building2, MessageCircle, Bookmark } from "lucide-react";

const STATS = [
  {
    icon: CalendarDays,
    title: "Monthly Stays",
    description: "Search stays of 30 days or longer",
  },
  {
    icon: Building2,
    title: "Property Details",
    description: "Compare prices, amenities and availability",
  },
  {
    icon: MessageCircle,
    title: "Direct Messaging",
    description: "Discuss your stay with the owner",
  },
  {
    icon: Bookmark,
    title: "Saved Searches",
    description: "Keep the criteria that matter to you",
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

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {STATS.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.title}
                className="flex flex-col items-center text-center gap-3 group"
              >
                {/* Icon container */}
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition-colors flex-shrink-0">
                  <Icon className="w-6 h-6 text-blue-200" />
                </div>

                {/* Text */}
                <div>
                  <p className="text-white font-semibold text-[17px] leading-tight mb-1">
                    {stat.title}
                  </p>
                  <p className="text-blue-200/60 text-[14px] leading-snug">
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
