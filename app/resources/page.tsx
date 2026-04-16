import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  Stethoscope,
  Briefcase,
  Star,
  CheckSquare,
  HelpCircle,
} from "lucide-react";

const RESOURCES = [
  {
    icon: BookOpen,
    title: "Guide to Monthly Rentals",
    description:
      "What to look for in a furnished rental — from lease terms and included utilities to neighborhood walkability and furniture quality.",
    href: "#",
  },
  {
    icon: Stethoscope,
    title: "Travel Nurse Housing Guide",
    description:
      "Tips for finding safe, comfortable housing near hospitals and medical centers on short-term assignments across the country.",
    href: "#",
  },
  {
    icon: Briefcase,
    title: "Corporate Housing 101",
    description:
      "How corporate stays work, what employers typically cover, and how to negotiate housing allowances with your HR team.",
    href: "#",
  },
  {
    icon: Star,
    title: "Landlord Best Practices",
    description:
      "How to attract quality, long-term tenants — professional photos, competitive pricing, responsive communication, and more.",
    href: "#",
  },
  {
    icon: CheckSquare,
    title: "Moving Checklist",
    description:
      "What to bring to a furnished rental and what you can leave behind — a practical checklist for stress-free monthly moves.",
    href: "#",
  },
  {
    icon: HelpCircle,
    title: "FAQ",
    description:
      "Common questions answered — how FurnishFinder works, listing verification, messaging, payments, and tenant screening.",
    href: "#",
  },
];

export default function ResourcesPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-[#0f2044] text-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Resources for Renters &amp; Landlords
          </h1>
          <p className="mt-5 text-lg text-blue-200 max-w-xl mx-auto">
            Guides, checklists, and expert tips to help you navigate monthly
            furnished housing with confidence.
          </p>
        </div>
      </section>

      {/* Resource Cards */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {RESOURCES.map((resource) => {
              const Icon = resource.icon;
              return (
                <Card
                  key={resource.title}
                  className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col"
                >
                  <CardContent className="p-6 flex flex-col gap-4 flex-1">
                    <div className="h-12 w-12 rounded-xl bg-[#0f2044]/10 flex items-center justify-center shrink-0">
                      <Icon className="h-6 w-6 text-[#0f2044]" />
                    </div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {resource.title}
                    </h2>
                    <p className="text-sm text-slate-500 leading-relaxed flex-1">
                      {resource.description}
                    </p>
                    <Link
                      href={resource.href}
                      className="inline-flex items-center text-sm font-semibold text-[#0f2044] hover:underline mt-auto"
                    >
                      Read More &rarr;
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <Separator />

      {/* Newsletter Signup */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Stay in the Know
          </h2>
          <p className="mt-3 text-slate-500">
            Get our latest guides, market insights, and housing tips delivered
            straight to your inbox. No spam — ever.
          </p>
          <form
            className="mt-8 flex flex-col sm:flex-row gap-3"
            onSubmit={(e) => e.preventDefault()}
          >
            <Input
              type="email"
              placeholder="you@example.com"
              className="flex-1 h-11"
              required
            />
            <Button
              type="submit"
              className="bg-[#0f2044] hover:bg-[#1a3360] text-white h-11 px-8 font-semibold shrink-0"
            >
              Get Tips
            </Button>
          </form>
          <p className="mt-3 text-xs text-slate-400">
            Unsubscribe at any time.
          </p>
        </div>
      </section>
    </main>
  );
}
