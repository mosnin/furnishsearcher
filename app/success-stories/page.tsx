import { PublicFrame } from "@/components/public-page";
import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "Customer Stories | globe",
  description: "Customer stories and property reviews on globe.",
};
export default function SuccessStoriesPage() {
  return (
    <PublicFrame>
      <main className="min-h-screen bg-white">
        <section className="bg-white text-primary py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/" className="text-primary underline">
              Back to Home
            </Link>
            <h1 className="text-4xl sm:text-5xl font-semibold mt-6">
              Customer stories
            </h1>
            <p className="mt-4 text-muted-foreground text-lg">
              Experiences with monthly furnished rentals.
            </p>
          </div>
        </section>
        <section className="py-20 px-4 bg-gray-50">
          <div className="max-w-3xl mx-auto bg-white rounded-2xl border p-8 space-y-4">
            <h2 className="text-2xl font-bold">No published stories yet</h2>
            <p className="text-slate-600">
              There are no published customer stories here yet. You can find
              available property reviews on individual listing pages.
            </p>
            <Link
              href="/search"
              className="inline-block underline text-primary"
            >
              Browse listings and reviews
            </Link>
          </div>
        </section>
        <section className="py-16 px-4">
          <div className="max-w-3xl mx-auto space-y-4">
            <h2 className="text-2xl font-bold">Planning your next stay?</h2>
            <p className="text-slate-600">
              Compare availability and amenities, ask the owner questions, and
              review the terms before agreeing to a stay.
            </p>
            <div className="flex flex-wrap gap-6">
              <Link className="underline text-primary" href="/search">
                Search rentals
              </Link>
              <Link
                className="underline text-primary"
                href="/list-your-property"
              >
                Explore owner tools
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicFrame>
  );
}
