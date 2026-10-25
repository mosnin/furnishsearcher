import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "Press | FurnishFinder",
  description: "Product information and media inquiries for FurnishFinder.",
};
export default function PressPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="bg-[#1e3a8a] text-white py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <Link href="/" className="text-blue-300 underline">
            Back to Home
          </Link>
          <h1 className="text-4xl font-extrabold mt-6">Press resources</h1>
          <p className="mt-3 text-blue-200 text-lg">
            Product information and media inquiries.
          </p>
        </div>
      </section>
      <section className="max-w-4xl mx-auto px-4 py-16 space-y-8">
        <div className="border rounded-xl p-6">
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-3">
            Published coverage
          </h2>
          <p className="text-slate-600">
            No press coverage has been published here yet.
          </p>
        </div>
        <div className="bg-gray-50 border rounded-xl p-6">
          <h2 className="text-xl font-bold mb-3">About the product</h2>
          <p className="text-slate-600">
            FurnishFinder supports monthly furnished-rental search, direct owner
            conversations, saved searches and stay requests. Owners manage
            listing details, availability and inquiries in their dashboard.
          </p>
          <Link
            href="/search"
            className="inline-block underline mt-4 text-[#1e3a8a]"
          >
            Explore current listings
          </Link>
        </div>
        <div className="border rounded-xl p-6">
          <h2 className="text-xl font-bold mb-3">Media and brand inquiries</h2>
          <p className="text-slate-600 mb-4">
            Use the contact form for product information or permission to use
            brand materials.
          </p>
          <Link href="/contact" className="underline text-[#1e3a8a]">
            Contact us
          </Link>
        </div>
      </section>
    </main>
  );
}
