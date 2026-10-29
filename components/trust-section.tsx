import Link from "next/link";
import { CalendarDays, MessageCircle, FileText } from "lucide-react";
const STEPS = [
  {
    icon: CalendarDays,
    title: "Check the dates",
    description:
      "Use exact or flexible stay dates, then confirm availability and arrival details with the owner.",
    href: "/search",
    label: "Search monthly rentals",
  },
  {
    icon: MessageCircle,
    title: "Ask the owner",
    description:
      "Discuss utilities, pets, accessibility and the monthly rate before agreeing to a stay.",
    href: "/dashboard/messages",
    label: "Open your conversations",
  },
  {
    icon: FileText,
    title: "Keep the details together",
    description:
      "Review your stay request, agreed changes and shared documents in your account.",
    href: "/dashboard/inquiries",
    label: "View your stay requests",
  },
];
export default function TrustSection() {
  return (
    <section className="py-20 lg:py-28 bg-slate-50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-block text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-3 bg-slate-100 px-4 py-1.5 rounded-full">
            Plan your monthly stay
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight mb-4">
            Make an informed choice
          </h2>
          <p className="text-lg text-slate-500 max-w-xl mx-auto">
            Review the listing and discuss what matters to you before
            committing.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {STEPS.map(({ icon: Icon, title, description, href, label }) => (
            <div
              key={title}
              className="bg-white rounded-2xl p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] flex flex-col gap-4"
            >
              <Icon className="w-6 h-6 text-primary" />
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="text-slate-700 text-[14px] leading-[1.6] flex-1">
                {description}
              </p>
              <Link className="text-sm underline text-primary" href={href}>
                {label}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
