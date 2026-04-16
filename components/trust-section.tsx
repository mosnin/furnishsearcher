import { Star, Shield, Clock, Users } from "lucide-react";

const TESTIMONIALS = [
  {
    quote:
      "Found my apartment in Austin in under 48 hours. No middleman, no crazy fees — just a great landlord and a move-in ready home.",
    name: "Sarah K.",
    role: "Travel Nurse, Austin TX",
    rating: 5,
    avatar: "SK",
  },
  {
    quote:
      "As a corporate relo specialist, FurnishFinder saves my clients thousands every assignment. The landlord quality is consistently excellent.",
    name: "Marcus T.",
    role: "Corporate Relocation Manager",
    rating: 5,
    avatar: "MT",
  },
  {
    quote:
      "Three months in Denver for a project, fully furnished, month-to-month. FurnishFinder made what seemed impossible completely effortless.",
    name: "Priya N.",
    role: "Digital Nomad & Consultant",
    rating: 5,
    avatar: "PN",
  },
];

const TRUST_BADGES = [
  {
    icon: Shield,
    title: "Verified Landlords",
    description: "Every landlord is identity-verified before listing",
  },
  {
    icon: Clock,
    title: "Respond in Hours",
    description: "Average landlord response time under 4 hours",
  },
  {
    icon: Users,
    title: "240,000+ Landlords",
    description: "The largest network of furnished rental owners",
  },
];

export default function TrustSection() {
  return (
    <section className="py-20 lg:py-28 bg-gray-50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <span className="inline-block text-xs font-bold text-[#0f2044] uppercase tracking-widest mb-3 bg-blue-50 px-4 py-1.5 rounded-full">
            Trusted by 1M+ Renters
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight mb-4">
            Real People, Real Homes
          </h2>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Join over a million renters who found their perfect furnished home
            without a booking fee.
          </p>
        </div>

        {/* Testimonials */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={t.name}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col gap-4"
            >
              {/* Stars */}
              <div className="flex items-center gap-0.5">
                {Array.from({ length: t.rating }).map((_, si) => (
                  <Star
                    key={si}
                    className="w-4 h-4 text-amber-400 fill-amber-400"
                  />
                ))}
              </div>

              {/* Quote */}
              <p className="text-gray-700 text-sm leading-relaxed flex-1">
                &ldquo;{t.quote}&rdquo;
              </p>

              {/* Reviewer */}
              <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                <div className="w-9 h-9 rounded-full bg-[#0f2044] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">{t.avatar}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Trust badges */}
        <div className="bg-[#0f2044] rounded-2xl p-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {TRUST_BADGES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-blue-300" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm mb-1">{title}</p>
                <p className="text-blue-200/70 text-xs leading-relaxed">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
