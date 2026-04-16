import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | FurnishFinder",
  description:
    "Learn how FurnishFinder collects, uses, and protects your personal information. Our Privacy Policy explains your rights and our data practices.",
};

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="mt-3 text-blue-200 text-base">Last updated: April 2026</p>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <p className="text-slate-600 leading-relaxed mb-12 text-lg border-l-4 border-[#1e3a8a] pl-4">
          FurnishFinder, Inc. (&quot;FurnishFinder,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to
          protecting your privacy. This Privacy Policy explains how we collect,
          use, disclose, and safeguard your information when you use our
          marketplace platform.
        </p>

        <div className="space-y-12">
          {/* Section 1 */}
          <div>
            <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">
              Information We Collect
            </h2>
            <div className="space-y-4 text-slate-600 leading-relaxed">
              <p>
                <strong className="text-slate-800">Account Information:</strong>{" "}
                When you register, we collect your name, email address, phone
                number, and password. Landlords may also provide property
                addresses, banking details for payouts, and government-issued ID
                for identity verification.
              </p>
              <p>
                <strong className="text-slate-800">Listing Data:</strong> Landlords
                who create listings provide property descriptions, photos, pricing,
                availability, and amenities. This information is displayed publicly
                on the platform.
              </p>
              <p>
                <strong className="text-slate-800">Usage Data:</strong> We
                automatically collect information about your interactions with the
                Service, including pages visited, search queries, filters applied,
                listings viewed, and messages sent. We also collect device
                information such as IP address, browser type, operating system,
                and referring URLs.
              </p>
              <p>
                <strong className="text-slate-800">Communications:</strong> When
                you contact us or communicate with other users through our
                messaging system, we store those communications to facilitate the
                service, resolve disputes, and improve user safety.
              </p>
            </div>
          </div>

          {/* Section 2 */}
          <div>
            <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">
              How We Use Your Information
            </h2>
            <ul className="list-disc pl-5 space-y-2 text-slate-600 leading-relaxed">
              <li>
                To operate and maintain the Service, including processing
                registrations, facilitating communications between landlords and
                renters, and enabling search and discovery of listings.
              </li>
              <li>
                To personalize your experience by surfacing relevant listings,
                saving your search preferences, and providing location-based
                results.
              </li>
              <li>
                To send transactional emails, service announcements, and, where
                you have opted in, promotional communications about FurnishFinder
                features and offers.
              </li>
              <li>
                To detect, investigate, and prevent fraudulent activity, abuse,
                spam, and other prohibited conduct.
              </li>
              <li>
                To comply with legal obligations, enforce our Terms of Service,
                and protect the rights, property, and safety of FurnishFinder,
                our users, and the public.
              </li>
              <li>
                To analyze usage patterns and improve the quality, security, and
                performance of our platform.
              </li>
            </ul>
          </div>

          {/* Section 3 */}
          <div>
            <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">
              Information Sharing
            </h2>
            <div className="space-y-4 text-slate-600 leading-relaxed">
              <p>
                We do not sell, rent, or trade your personal information to third
                parties for their own marketing purposes. We share information only
                as described in this policy.
              </p>
              <p>
                <strong className="text-slate-800">Between Users:</strong> When a
                renter contacts a landlord about a listing, certain profile
                information (name, profile photo, and message content) is shared to
                facilitate that communication. Landlords&apos; property information is
                publicly visible to all users of the Service.
              </p>
              <p>
                <strong className="text-slate-800">Service Providers:</strong> We
                share data with trusted third-party vendors who assist us in
                operating the platform, including cloud hosting providers, email
                delivery services, analytics providers, customer support tools, and
                payment processors. These parties are contractually obligated to
                protect your information and use it only for the services they
                provide to us.
              </p>
              <p>
                <strong className="text-slate-800">Legal Requirements:</strong> We
                may disclose your information if required to do so by law or in
                response to valid requests by public authorities (e.g., a court
                order or government agency subpoena).
              </p>
              <p>
                <strong className="text-slate-800">Business Transfers:</strong> In
                the event of a merger, acquisition, or sale of all or a portion of
                our assets, your information may be transferred as part of that
                transaction. We will notify you via email or prominent notice on
                our website before such a transfer occurs.
              </p>
            </div>
          </div>

          {/* Section 4 */}
          <div>
            <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">Cookies</h2>
            <p className="text-slate-600 leading-relaxed">
              We use cookies and similar tracking technologies to operate the
              Service, remember your preferences, analyze usage, and support our
              marketing efforts. Essential cookies are necessary for the site to
              function and cannot be disabled. Analytics cookies help us understand
              how users interact with the platform. You may manage non-essential
              cookies through your browser settings or our{" "}
              <Link href="/cookies" className="text-[#1e3a8a] font-semibold hover:underline">
                Cookie Policy
              </Link>
              .
            </p>
          </div>

          {/* Section 5 */}
          <div>
            <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">
              Data Security
            </h2>
            <p className="text-slate-600 leading-relaxed">
              We implement industry-standard technical and organizational measures
              to protect your personal information against unauthorized access,
              alteration, disclosure, or destruction. These measures include
              encryption of data in transit (TLS 1.2+) and at rest, strict access
              controls, regular security audits, and employee training on data
              privacy best practices. While we strive to use commercially
              acceptable means to protect your information, no method of
              transmission over the Internet or electronic storage is 100% secure,
              and we cannot guarantee absolute security.
            </p>
          </div>

          {/* Section 6 */}
          <div>
            <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">
              Data Retention
            </h2>
            <p className="text-slate-600 leading-relaxed">
              We retain your personal information for as long as your account is
              active or as needed to provide the Service. If you close your account,
              we will delete or anonymize your personal data within 90 days, except
              where we are required to retain it for legal or compliance purposes,
              such as records of completed transactions, fraud prevention data, or
              information subject to a legal hold. Listing data may be retained in
              anonymized form for analytics purposes.
            </p>
          </div>

          {/* Section 7 */}
          <div>
            <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">Your Rights</h2>
            <div className="space-y-4 text-slate-600 leading-relaxed">
              <p>
                Depending on your jurisdiction, you may have the following rights
                with respect to your personal information:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-slate-800">Access:</strong> Request a
                  copy of the personal data we hold about you.
                </li>
                <li>
                  <strong className="text-slate-800">Rectification:</strong> Request
                  that we correct inaccurate or incomplete personal data.
                </li>
                <li>
                  <strong className="text-slate-800">Erasure:</strong> Request
                  deletion of your personal data, subject to certain exceptions.
                </li>
                <li>
                  <strong className="text-slate-800">Portability:</strong> Receive
                  your personal data in a structured, machine-readable format.
                </li>
                <li>
                  <strong className="text-slate-800">Opt-Out:</strong> Unsubscribe
                  from marketing communications at any time by clicking
                  &quot;unsubscribe&quot; in any email we send.
                </li>
              </ul>
              <p>
                To exercise any of these rights, please contact us at{" "}
                <a
                  href="mailto:privacy@furnishfinder.com"
                  className="text-[#1e3a8a] font-semibold hover:underline"
                >
                  privacy@furnishfinder.com
                </a>
                . We will respond to all requests within 30 days.
              </p>
            </div>
          </div>

          {/* Section 8 */}
          <div>
            <h2 className="text-xl font-bold text-[#1e3a8a] mb-4">Contact Us</h2>
            <p className="text-slate-600 leading-relaxed">
              If you have questions, concerns, or complaints about this Privacy
              Policy or our data practices, please contact our Privacy Team at{" "}
              <a
                href="mailto:privacy@furnishfinder.com"
                className="text-[#1e3a8a] font-semibold hover:underline"
              >
                privacy@furnishfinder.com
              </a>{" "}
              or by writing to FurnishFinder, Inc., Attn: Privacy Team. You also
              have the right to lodge a complaint with your local data protection
              authority if you believe we have not handled your information in
              compliance with applicable law.
            </p>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-gray-200">
          <p className="text-slate-500 text-sm">
            Also see our{" "}
            <Link href="/terms" className="text-[#1e3a8a] font-semibold hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/cookies" className="text-[#1e3a8a] font-semibold hover:underline">
              Cookie Policy
            </Link>
            .
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1e3a8a] py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Your Privacy Is Our Priority
          </h2>
          <p className="mt-3 text-blue-200">
            Browse listings with confidence. We never sell your data.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/search"
              className="inline-block bg-amber-400 hover:bg-amber-300 text-[#1e3a8a] font-bold px-8 py-3 rounded-lg transition-colors"
            >
              Browse Listings
            </Link>
            <Link
              href="/contact"
              className="inline-block border border-white text-white hover:bg-white/10 font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
