import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CheckCircle } from "lucide-react";

const STATS = [
  { label: "Founded", value: "2014" },
  { label: "Listings", value: "300k+" },
  { label: "Landlords", value: "240k+" },
  { label: "States Served", value: "50" },
];

const TEAM = [
  {
    name: "Sarah Mitchell",
    title: "Co-Founder & CEO",
    avatar: "https://i.pravatar.cc/150?img=47",
    bio: "Former real estate attorney turned tech entrepreneur. Sarah started FurnishFinder after struggling to find furnished housing during her own cross-country relocation.",
  },
  {
    name: "David Park",
    title: "Co-Founder & CTO",
    avatar: "https://i.pravatar.cc/150?img=12",
    bio: "Full-stack engineer with 15 years of experience building marketplace products. David leads engineering and product development.",
  },
  {
    name: "Alicia Reeves",
    title: "Head of Growth",
    avatar: "https://i.pravatar.cc/150?img=32",
    bio: "Growth marketer who previously scaled two B2C marketplaces from zero to millions of users. Alicia oversees landlord and tenant acquisition.",
  },
];

const VALUES = [
  {
    title: "No Fees",
    description:
      "We never charge landlords to list, and tenants can browse freely. Our model is built on transparency, not hidden costs.",
  },
  {
    title: "Transparency",
    description:
      "Verified profiles, honest pricing, and no algorithmic black boxes. What you see is what you get.",
  },
  {
    title: "Direct Connection",
    description:
      "We connect landlords and renters directly — no property managers, no middlemen taking a cut of your rent.",
  },
  {
    title: "Quality Housing",
    description:
      "Every listing is reviewed for completeness and accuracy. We reject spam and enforce our community standards.",
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero / Mission */}
      <section className="bg-[#0f2044] text-white py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-amber-400 font-semibold uppercase tracking-widest text-sm mb-4">
            Our Mission
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            We connect people who need a furnished place to stay monthly with
            landlords who have one.
          </h1>
          <p className="mt-6 text-lg text-blue-200 max-w-2xl mx-auto">
            FurnishFinder was built to solve a simple but frustrating problem:
            finding a quality furnished rental for a month — or three — shouldn't
            require calling a dozen property managers and scrolling through
            endless irrelevant listings.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <p className="text-4xl font-extrabold text-[#0f2044]">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-slate-500 font-medium">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* Team */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            Meet the Team
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {TEAM.map((member) => (
              <Card key={member.name} className="border border-gray-200 shadow-sm text-center">
                <CardContent className="p-6 flex flex-col items-center gap-4">
                  <img
                    src={member.avatar}
                    alt={member.name}
                    className="h-24 w-24 rounded-full object-cover border-4 border-[#0f2044]/10"
                  />
                  <div>
                    <h3 className="font-semibold text-slate-900 text-lg">
                      {member.name}
                    </h3>
                    <p className="text-sm text-[#0f2044] font-medium mt-0.5">
                      {member.title}
                    </p>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {member.bio}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* Values */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            What We Stand For
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {VALUES.map((value) => (
              <div
                key={value.title}
                className="flex items-start gap-4 bg-white rounded-xl border border-gray-200 p-6 shadow-sm"
              >
                <div className="shrink-0 h-10 w-10 rounded-full bg-[#0f2044]/10 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-[#0f2044]" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-1">
                    {value.title}
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {value.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Join Us CTA */}
      <section className="py-20 px-4 bg-[#0f2044]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Join Us
          </h2>
          <p className="mt-4 text-blue-200 text-lg">
            Whether you're a renter looking for your next furnished home or a
            landlord ready to fill a vacancy — we're here for you.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              asChild
              size="lg"
              className="bg-amber-400 hover:bg-amber-300 text-[#0f2044] font-bold px-8"
            >
              <Link href="/sign-up">Create Free Account</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white text-white hover:bg-white/10 bg-transparent px-8"
            >
              <Link href="/search">Browse Listings</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
