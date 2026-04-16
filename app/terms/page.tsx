import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | FurnishFinder",
  description:
    "Read the FurnishFinder Terms of Service. Learn about your rights and responsibilities when using our furnished rental marketplace.",
};

const SECTIONS = [
  {
    number: "1",
    title: "Acceptance of Terms",
    content:
      "By accessing or using FurnishFinder's website, mobile application, or any related services (collectively, the \"Service\"), you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing the Service. These Terms constitute a legally binding agreement between you and FurnishFinder, Inc.",
  },
  {
    number: "2",
    title: "Use of Service",
    content:
      "You may use the Service solely for lawful purposes and in accordance with these Terms. FurnishFinder grants you a limited, non-exclusive, non-transferable, revocable license to access and use the Service for its intended purposes. You agree not to use the Service in any manner that could disable, overburden, damage, or impair the platform, or interfere with any other party's use and enjoyment of the Service.",
  },
  {
    number: "3",
    title: "User Accounts",
    content:
      "To access certain features of the Service, you must register for an account and provide accurate, complete, and current information. You are solely responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. FurnishFinder reserves the right to terminate accounts, remove content, and refuse service to anyone at our sole discretion.",
  },
  {
    number: "4",
    title: "Listings & Content",
    content:
      "Landlords who post listings on FurnishFinder represent and warrant that all listing information is accurate, complete, and not misleading. FurnishFinder does not independently verify the accuracy of listings and makes no representations or warranties regarding the suitability, safety, or legality of any property listed on the Service. You acknowledge that you are solely responsible for any content you post, publish, or display through the Service.",
  },
  {
    number: "5",
    title: "No Booking Fees Policy",
    content:
      "FurnishFinder does not charge renters booking fees, service fees, or platform fees of any kind. Our marketplace is free to search, browse, and use for renters. Landlords may list one property at no cost. Any premium features offered in the future will be clearly disclosed prior to any charge. FurnishFinder will never add hidden fees to rental transactions conducted through our Service.",
  },
  {
    number: "6",
    title: "Payments & Transactions",
    content:
      "All rental transactions, including rent payments, security deposits, and any other financial arrangements, are conducted directly between landlords and renters. FurnishFinder is not a party to any rental agreement, does not hold funds in escrow, and bears no liability for payment disputes between landlords and tenants. You are solely responsible for complying with all applicable tax obligations arising from your use of the Service.",
  },
  {
    number: "7",
    title: "Prohibited Conduct",
    content:
      "You agree not to engage in any of the following: posting false, inaccurate, or misleading listings; using the Service for any unlawful purpose or in violation of any local, state, national, or international law; harassing, threatening, or intimidating other users; attempting to gain unauthorized access to any portion or feature of the Service; or using automated scripts, bots, or other means to scrape or collect data from the Service without our prior written consent.",
  },
  {
    number: "8",
    title: "Termination",
    content:
      "FurnishFinder reserves the right to suspend or terminate your access to the Service at any time, with or without cause, and with or without notice, effective immediately. Upon termination, your right to use the Service will cease immediately. All provisions of these Terms which by their nature should survive termination shall survive, including, without limitation, ownership provisions, warranty disclaimers, indemnity, and limitations of liability.",
  },
  {
    number: "9",
    title: "Disclaimer of Warranties",
    content:
      "The Service is provided on an \"AS IS\" and \"AS AVAILABLE\" basis without any warranties of any kind, whether express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement. FurnishFinder does not warrant that the Service will be uninterrupted, error-free, secure, or free of viruses or other harmful components. Your use of the Service is at your sole risk.",
  },
  {
    number: "10",
    title: "Contact",
    content:
      "If you have any questions about these Terms of Service, please contact us. Our legal and support teams are available to address any concerns regarding your rights and obligations under this agreement. We are committed to resolving disputes in a fair and timely manner.",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-[#1e3a8a] text-white py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center text-blue-300 hover:text-white text-sm mb-6 transition-colors"
          >
            &larr; Back to Home
          </Link>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Terms of Service
          </h1>
          <p className="mt-3 text-blue-200 text-base">
            Last updated: April 2026
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <p className="text-slate-600 leading-relaxed mb-12 text-lg border-l-4 border-[#1e3a8a] pl-4">
          Please read these Terms of Service carefully before using FurnishFinder.
          By using our Service, you agree to be bound by these terms.
        </p>

        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <div key={section.number} id={`section-${section.number}`}>
              <h2 className="text-xl font-bold text-[#1e3a8a] mb-3">
                {section.number}. {section.title}
              </h2>
              <p className="text-slate-600 leading-relaxed">{section.content}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-gray-200">
          <p className="text-slate-500 text-sm">
            Have questions about these terms?{" "}
            <Link
              href="/contact"
              className="text-[#1e3a8a] font-semibold hover:underline"
            >
              Contact our support team
            </Link>{" "}
            and we will respond within one business day.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1e3a8a] py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Ready to Find Your Next Home?
          </h2>
          <p className="mt-3 text-blue-200">
            Browse thousands of furnished rentals with no booking fees.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/search"
              className="inline-block bg-amber-400 hover:bg-amber-300 text-[#1e3a8a] font-bold px-8 py-3 rounded-lg transition-colors"
            >
              Search Listings
            </Link>
            <Link
              href="/sign-up"
              className="inline-block border border-white text-white hover:bg-white/10 font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Create Free Account
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
