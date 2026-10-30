import { PublicFrame } from "@/components/public-page";
import Link from "next/link";
const FEATURES = [
  {
    title: "Search monthly stays",
    description:
      "Use location, dates, budget and amenities to narrow your search.",
    href: "/search",
    label: "Browse rentals",
  },
  {
    title: "Speak with the owner",
    description:
      "Discuss the property, availability and stay arrangements in your conversations.",
    href: "/dashboard/messages",
    label: "Open messages",
  },
  {
    title: "Manage rental spaces",
    description:
      "Keep property details, calendars, inquiries and shared stay documents in your dashboard. Publication requirements apply.",
    href: "/list-your-property",
    label: "Explore owner tools",
  },
];
export default function AboutPage() {
  return (
    <PublicFrame>
      <main className="min-h-screen bg-white">
        <section className="bg-white text-primary py-24 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <Link href="/" className="text-primary underline">
              Back to Home
            </Link>
            <h1 className="text-4xl sm:text-5xl font-semibold mt-6">
              A place to search for your monthly stay
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              globe connects people looking for furnished monthly
              housing with owners offering rental spaces.
            </p>
          </div>
        </section>
        <section className="py-20 px-4 bg-gray-50">
          <div className="max-w-5xl mx-auto grid sm:grid-cols-3 gap-8">
            {FEATURES.map((item) => (
              <div
                key={item.title}
                className="bg-white border rounded-xl p-6 space-y-4"
              >
                <h2 className="text-xl font-semibold">{item.title}</h2>
                <p className="text-sm text-slate-600">{item.description}</p>
                <Link
                  href={item.href}
                  className="inline-block underline text-primary"
                >
                  {item.label}
                </Link>
              </div>
            ))}
          </div>
        </section>
        <section className="max-w-3xl mx-auto px-4 py-16 space-y-4">
          <h2 className="text-2xl font-bold">Review the details</h2>
          <p className="text-slate-600">
            Amenities, rates and availability come from listing information.
            Confirm that a property meets your needs and review any agreement
            before committing.
          </p>
          <div className="flex flex-wrap gap-6">
            <Link href="/pricing" className="underline text-primary">
              Plans and publication requirements
            </Link>
            <Link href="/contact" className="underline text-primary">
              Contact us
            </Link>
          </div>
        </section>
      </main>
    </PublicFrame>
  );
}
