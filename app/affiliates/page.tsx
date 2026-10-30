import { PublicFrame } from "@/components/public-page";
import type { Metadata } from "next";
import Link from "next/link";
import AffiliateForm from "./affiliate-form";
export const metadata: Metadata = {
  title: "Partnership Inquiries | globe",
  description: "Contact globe about a potential partnership.",
};
export default function AffiliatesPage() {
  return (
    <PublicFrame>
      <main className="min-h-screen bg-white">
        <section className="bg-white text-primary py-20 px-4">
          <div className="max-w-4xl mx-auto">
            <Link href="/" className="text-primary underline">
              Back to Home
            </Link>
            <h1 className="text-4xl font-semibold mt-6">
              Partnership inquiries
            </h1>
            <p className="mt-4 text-muted-foreground text-lg">
              Tell us about your audience, service or collaboration idea.
            </p>
          </div>
        </section>
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">Get in touch</h2>
            <p className="text-sm text-slate-600 mb-8">
              Submitting an inquiry does not enroll you in an affiliate program
              or establish a commission or payout agreement. No commission
              schedule or affiliate dashboard is currently offered on this page.
            </p>
            <AffiliateForm />
          </div>
        </section>
      </main>
    </PublicFrame>
  );
}
