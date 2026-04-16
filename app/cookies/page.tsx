import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookie Policy | FurnishFinder",
  description:
    "Learn how FurnishFinder uses cookies and similar technologies. Understand your options for managing cookie preferences.",
};

const COOKIE_TYPES = [
  {
    name: "Essential Cookies",
    badge: "Always Active",
    badgeColor: "bg-green-100 text-green-800",
    description:
      "These cookies are strictly necessary for the website to function and cannot be switched off in our systems. They are usually set in response to actions made by you which amount to a request for services, such as setting your privacy preferences, logging in, or filling in forms.",
    examples: [
      "Session authentication tokens to keep you logged in",
      "Security cookies to prevent cross-site request forgery",
      "Load balancing cookies to distribute server traffic",
      "Cookie consent preferences you have set",
    ],
    canDisable: false,
  },
  {
    name: "Analytics Cookies",
    badge: "Optional",
    badgeColor: "bg-blue-100 text-blue-800",
    description:
      "These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site. They help us understand which pages are the most and least popular and see how visitors move around the site. All information these cookies collect is aggregated and therefore anonymous.",
    examples: [
      "Page view counts and session duration",
      "Search queries and filter usage patterns",
      "Feature interaction and click-through rates",
      "Error tracking and performance monitoring",
    ],
    canDisable: true,
  },
  {
    name: "Preference Cookies",
    badge: "Optional",
    badgeColor: "bg-purple-100 text-purple-800",
    description:
      "These cookies enable the website to provide enhanced functionality and personalisation. They may be set by us or by third-party providers whose services we have added to our pages. Preference cookies remember choices you make to give you a more personalised experience.",
    examples: [
      "Saved search filters and sort preferences",
      "Map view vs. list view display preference",
      "Notification and email digest settings",
      "Recently viewed listings and saved searches",
    ],
    canDisable: true,
  },
];

export default function CookiesPage() {
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
            Cookie Policy
          </h1>
          <p className="mt-3 text-blue-200 text-base">
            Last updated: April 2026
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <p className="text-slate-600 leading-relaxed mb-12 text-lg border-l-4 border-[#1e3a8a] pl-4">
          FurnishFinder uses cookies and similar tracking technologies to
          operate our platform, remember your preferences, and improve your
          experience. This policy explains what cookies we use and why.
        </p>

        {/* What are cookies */}
        <div className="mb-12">
          <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">
            What Are Cookies?
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            Cookies are small text files that are placed on your device when
            you visit a website. They are widely used to make websites work
            more efficiently and to provide information to site owners.
            Cookies do not contain personally identifiable information on
            their own, but they can be used in combination with other
            information to identify you.
          </p>
          <p className="text-slate-600 leading-relaxed">
            We also use similar technologies such as web beacons, pixel tags,
            and local storage objects that function similarly to cookies. For
            simplicity, this policy refers to all such technologies as
            &quot;cookies.&quot;
          </p>
        </div>

        {/* Cookie types */}
        <div className="space-y-8 mb-12">
          <h2 className="text-xl font-bold text-[#1e3a8a] mb-6">
            Types of Cookies We Use
          </h2>
          {COOKIE_TYPES.map((type) => (
            <div
              key={type.name}
              className="border border-gray-200 rounded-xl overflow-hidden"
            >
              <div className="bg-gray-50 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-slate-900 text-lg">
                    {type.name}
                  </h3>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${type.badgeColor}`}
                  >
                    {type.badge}
                  </span>
                </div>
                <div className="text-sm text-slate-500">
                  {type.canDisable ? (
                    <span className="italic">Preferences managed by your browser</span>
                  ) : (
                    <span className="font-medium text-green-700">
                      Required for site to function
                    </span>
                  )}
                </div>
              </div>
              <div className="px-6 py-5">
                <p className="text-slate-600 leading-relaxed mb-4">
                  {type.description}
                </p>
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">
                    Examples:
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    {type.examples.map((example) => (
                      <li key={example} className="text-sm text-slate-500">
                        {example}
                      </li>
                    ))}
                  </ul>
                </div>
                {type.canDisable && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      <strong>Managing these cookies:</strong> You can disable
                      optional cookies through your browser&apos;s privacy settings.
                      Disabling analytics or preference cookies will not prevent
                      you from using FurnishFinder, but some features may work
                      differently.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Third-party cookies */}
        <div className="mb-12">
          <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">
            Third-Party Cookies
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            Some cookies on our site are set by third-party services we use,
            including Google Analytics for usage analysis, Mapbox for
            interactive maps, and Stripe for payment processing. These
            third parties have their own privacy policies governing the use
            of cookies they set.
          </p>
          <p className="text-slate-600 leading-relaxed">
            We do not control third-party cookies and are not responsible for
            the privacy practices of third-party websites. We encourage you to
            review the privacy policies of any third-party services you
            interact with through our platform.
          </p>
        </div>

        {/* How to manage */}
        <div className="mb-12">
          <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">
            How to Manage Cookies
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            Most browsers allow you to manage cookies through their settings.
            You can typically find these settings in the &quot;Options&quot; or
            &quot;Preferences&quot; menu of your browser. The following links may be
            helpful:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-slate-600">
            <li>
              <strong>Chrome:</strong> Settings &rarr; Privacy and security &rarr; Cookies
            </li>
            <li>
              <strong>Firefox:</strong> Options &rarr; Privacy &amp; Security &rarr; Cookies and Site Data
            </li>
            <li>
              <strong>Safari:</strong> Preferences &rarr; Privacy &rarr; Manage Website Data
            </li>
            <li>
              <strong>Edge:</strong> Settings &rarr; Cookies and site permissions
            </li>
          </ul>
          <p className="text-slate-600 leading-relaxed mt-4">
            Note that disabling essential cookies will impair your ability to
            use core features of the FurnishFinder platform, including logging
            in and saving preferences.
          </p>
        </div>

        <div className="mt-16 pt-8 border-t border-gray-200">
          <p className="text-slate-500 text-sm">
            For more information about how we handle your data, see our{" "}
            <Link
              href="/privacy"
              className="text-[#1e3a8a] font-semibold hover:underline"
            >
              Privacy Policy
            </Link>
            . Questions? Contact us at{" "}
            <a
              href="mailto:privacy@furnishfinder.com"
              className="text-[#1e3a8a] font-semibold hover:underline"
            >
              privacy@furnishfinder.com
            </a>
            .
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1e3a8a] py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Browse Listings with Confidence
          </h2>
          <p className="mt-3 text-blue-200">
            We use cookies to make your experience better — never to sell your
            data.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/search"
              className="inline-block bg-amber-400 hover:bg-amber-300 text-[#1e3a8a] font-bold px-8 py-3 rounded-lg transition-colors"
            >
              Search Listings
            </Link>
            <Link
              href="/privacy"
              className="inline-block border border-white text-white hover:bg-white/10 font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
