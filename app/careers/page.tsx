import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "Careers | FurnishFinder",
  description: "Published career opportunities at FurnishFinder.",
};
export default function CareersPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="bg-[#1e3a8a] text-white py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <Link href="/" className="underline text-blue-300">
            Back to Home
          </Link>
          <h1 className="text-4xl sm:text-5xl font-extrabold mt-6">Careers</h1>
          <p className="mt-4 text-blue-200 text-lg">
            Published opportunities at FurnishFinder.
          </p>
        </div>
      </section>
      <section className="max-w-4xl mx-auto px-4 py-16">
        <div className="border rounded-xl p-8 space-y-4">
          <h2 className="text-2xl font-bold">No published openings</h2>
          <p className="text-slate-600">
            There are no job openings published here at this time.
          </p>
          <div className="flex flex-wrap gap-6">
            <Link className="underline text-[#1e3a8a]" href="/about">
              Explore the product
            </Link>
            <Link className="underline text-[#1e3a8a]" href="/contact">
              General inquiries
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
