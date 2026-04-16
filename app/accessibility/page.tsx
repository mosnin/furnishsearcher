import { Metadata } from "next";
import Link from "next/link";
import { CheckCircle, AlertCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Accessibility Statement | FurnishFinder",
  description:
    "FurnishFinder's commitment to digital accessibility. We strive to meet WCAG 2.1 AA standards so everyone can use our furnished rental marketplace.",
};

const COMMITMENTS = [
  "Semantic HTML structure with proper heading hierarchy",
  "Sufficient color contrast ratios meeting WCAG AA standards (4.5:1 for normal text)",
  "All images include descriptive alt text or are marked as decorative",
  "Full keyboard navigation support with visible focus indicators",
  "Form inputs are labeled and errors are described to assistive technologies",
  "Interactive elements have accessible names and roles via ARIA attributes",
  "No content flashes more than three times per second",
  "Pages are functional at 400% zoom without horizontal scrolling",
];

const KNOWN_ISSUES = [
  {
    issue: "Interactive map view",
    description:
      "Our Leaflet-based map view has limited screen reader support. We recommend using the list view as an alternative when browsing listings with assistive technology.",
    workaround: "Toggle to list view using the view switcher above search results.",
  },
  {
    issue: "Photo gallery carousel",
    description:
      "The listing photo gallery may not announce image transitions to all screen readers in all browsers.",
    workaround: "All photos can also be viewed individually via keyboard navigation.",
  },
];

export default function AccessibilityPage() {
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
            Accessibility Statement
          </h1>
          <p className="mt-3 text-blue-200 text-base">
            Last updated: April 2026
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <p className="text-slate-600 leading-relaxed mb-12 text-lg border-l-4 border-[#1e3a8a] pl-4">
          FurnishFinder is committed to ensuring digital accessibility for
          people with disabilities. We continually improve the user experience
          for everyone and apply the relevant accessibility standards.
        </p>

        {/* WCAG Commitment */}
        <div className="mb-12">
          <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">
            Our Conformance Standard
          </h2>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="shrink-0 h-12 w-12 rounded-full bg-[#1e3a8a] flex items-center justify-center">
                <span className="text-white font-bold text-sm">AA</span>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">
                  WCAG 2.1 Level AA
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  We aim to conform to the{" "}
                  <strong>Web Content Accessibility Guidelines (WCAG) 2.1
                  Level AA</strong>. These guidelines explain how to make web
                  content more accessible to people with disabilities, including
                  visual, auditory, motor, and cognitive impairments. Conformance
                  with these guidelines helps make the web more accessible for
                  all users.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* What we've done */}
        <div className="mb-12">
          <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">
            Accessibility Features
          </h2>
          <p className="text-slate-600 leading-relaxed mb-6">
            FurnishFinder has implemented the following accessibility features
            to help ensure a barrier-free experience:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COMMITMENTS.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-600 leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Known issues */}
        <div className="mb-12">
          <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">
            Known Limitations
          </h2>
          <p className="text-slate-600 leading-relaxed mb-6">
            Despite our efforts, some areas of the platform may not yet fully
            conform to WCAG 2.1 AA. The following known limitations are
            actively being addressed:
          </p>
          <div className="space-y-4">
            {KNOWN_ISSUES.map((issue) => (
              <div
                key={issue.issue}
                className="border border-amber-200 rounded-xl p-5 bg-amber-50"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-1">
                      {issue.issue}
                    </h3>
                    <p className="text-sm text-slate-600 mb-2">
                      {issue.description}
                    </p>
                    <p className="text-sm text-slate-700">
                      <strong>Workaround:</strong> {issue.workaround}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Technical approach */}
        <div className="mb-12">
          <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">
            Technical Approach
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            FurnishFinder is built using Next.js with semantic HTML5 markup.
            We rely on native browser accessibility features wherever possible,
            supplemented by WAI-ARIA attributes for dynamic, interactive
            components. Our codebase is tested with automated accessibility
            scanning tools as part of our continuous integration process, and
            we conduct periodic manual audits using screen readers including
            NVDA (Windows), JAWS (Windows), and VoiceOver (macOS and iOS).
          </p>
          <p className="text-slate-600 leading-relaxed">
            We test across major browsers and operating systems. If you
            encounter an accessibility barrier, we want to hear from you.
          </p>
        </div>

        {/* Contact */}
        <div className="mb-12 bg-[#1e3a8a]/5 border border-[#1e3a8a]/20 rounded-xl p-6">
          <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">
            Report an Accessibility Issue
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            We welcome your feedback on the accessibility of FurnishFinder. If
            you experience any barriers or have suggestions for improvement,
            please contact our accessibility team. We aim to respond to all
            accessibility inquiries within 2 business days.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-1">
                Accessibility Team Email
              </p>
              <a
                href="mailto:accessibility@furnishfinder.com"
                className="text-[#1e3a8a] font-bold hover:underline text-lg"
              >
                accessibility@furnishfinder.com
              </a>
            </div>
            <div className="sm:border-l sm:border-gray-300 sm:pl-4">
              <p className="text-sm font-semibold text-slate-700 mb-1">
                General Support
              </p>
              <Link
                href="/contact"
                className="text-[#1e3a8a] font-semibold hover:underline"
              >
                Contact Form &rarr;
              </Link>
            </div>
          </div>
          <p className="text-slate-500 text-sm mt-4">
            When reporting an issue, please include the URL of the page, a
            description of the barrier you encountered, and the browser and
            assistive technology you were using.
          </p>
        </div>

        {/* Formal complaints */}
        <div className="mb-12">
          <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">
            Formal Complaints
          </h2>
          <p className="text-slate-600 leading-relaxed">
            If you are not satisfied with our response to your accessibility
            inquiry, you may contact the relevant enforcement authority in your
            jurisdiction. In the United States, accessibility complaints
            related to websites may be filed with the U.S. Department of
            Justice under Title III of the Americans with Disabilities Act (ADA).
          </p>
        </div>

        <div className="mt-16 pt-8 border-t border-gray-200">
          <p className="text-slate-500 text-sm">
            This statement was prepared in April 2026 and will be reviewed
            annually. See also our{" "}
            <Link
              href="/privacy"
              className="text-[#1e3a8a] font-semibold hover:underline"
            >
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link
              href="/terms"
              className="text-[#1e3a8a] font-semibold hover:underline"
            >
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1e3a8a] py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Find Your Next Home
          </h2>
          <p className="mt-3 text-blue-200">
            Browse thousands of furnished rentals — accessible to everyone.
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
