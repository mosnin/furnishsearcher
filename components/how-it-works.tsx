import { Search, MessageSquare, KeyRound } from "lucide-react";

const STEPS = [
  {
    number: "01",
    icon: Search,
    title: "Search",
    description:
      "Browse 300,000+ furnished rentals filtered by location, move-in date, and budget. Save favorites and compare options side by side.",
    color: "bg-blue-50",
    iconColor: "text-blue-600",
    borderColor: "border-blue-100",
  },
  {
    number: "02",
    icon: MessageSquare,
    title: "Connect",
    description:
      "Message landlords directly — no middlemen, no booking agents. Ask questions, schedule tours, and negotiate terms on your timeline.",
    color: "bg-navy-50",
    iconColor: "text-[#0f2044]",
    borderColor: "border-slate-100",
  },
  {
    number: "03",
    icon: KeyRound,
    title: "Move In",
    description:
      "Flexible monthly terms with everything included. Furnished, WiFi-ready, and set up for your arrival — just bring your suitcase.",
    color: "bg-emerald-50",
    iconColor: "text-emerald-600",
    borderColor: "border-emerald-100",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="py-20 lg:py-28 bg-white"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <span className="inline-block text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-3 bg-slate-100 px-4 py-1.5 rounded-full">
            Simple Process
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight mb-4">
            How FurnishFinder Works
          </h2>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            From search to move-in in three straightforward steps — no hidden
            fees, no complicated booking process.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connector line (desktop) */}
          <div className="hidden lg:block absolute top-16 left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.number}
                  className="flex flex-col items-center text-center group"
                >
                  {/* Number + Icon combined */}
                  <div className="relative mb-6">
                    {/* Large background number */}
                    <span className="absolute -top-4 -left-4 text-8xl font-black text-slate-100/80 select-none leading-none z-0">
                      {step.number}
                    </span>
                    {/* Icon circle */}
                    <div
                      className={`relative z-10 w-16 h-16 rounded-3xl ${step.color} ring-1 ring-black/5 flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:-translate-y-1 transition-all duration-300`}
                    >
                      <Icon className={`w-7 h-7 ${step.iconColor}`} />
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="text-[18px] font-semibold text-slate-900 mb-3">
                    {step.title}
                  </h3>
                  <p className="text-slate-500 leading-relaxed text-[14px] max-w-xs">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <a
            href="/search"
            className="inline-flex items-center gap-2 bg-[#0f2044] hover:bg-[#1a3360] text-white font-semibold rounded-2xl px-8 py-3 transition-all duration-200 shadow-lg shadow-[#0f2044]/20 hover:shadow-xl hover:shadow-[#0f2044]/30 hover:-translate-y-0.5 text-[15px]"
          >
            <Search className="w-4 h-4" />
            Start Searching Free
          </a>
        </div>
      </div>
    </section>
  );
}
