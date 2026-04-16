import { Metadata } from "next";
import ContactForm from "./contact-form";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Mail, Clock, Calendar, AlertCircle, ExternalLink } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Us | FurnishFinder",
  description:
    "Get in touch with the FurnishFinder team. We're here to help renters and landlords with any questions or issues.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-[#0f2044] text-white py-14 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-bold tracking-tight mb-3">Contact Us</h1>
          <p className="text-blue-200/80 text-lg">We&apos;d love to hear from you</p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Left column: Contact Form */}
          <div className="lg:col-span-2">
            <Card className="shadow-sm">
              <CardContent className="p-6 sm:p-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-1">Send us a message</h2>
                <p className="text-sm text-gray-500 mb-6">
                  Fill out the form below and we&apos;ll get back to you as soon as possible.
                </p>
                <ContactForm />
              </CardContent>
            </Card>
          </div>

          {/* Right column: Contact info sidebar */}
          <div className="space-y-4">
            {/* Email card */}
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-[#1e3a8a]" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Email
                    </p>
                    <a
                      href="mailto:support@furnishfinder.com"
                      className="text-sm font-medium text-[#1e3a8a] hover:underline break-all"
                    >
                      support@furnishfinder.com
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Response time */}
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 text-green-700" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Response Time
                    </p>
                    <p className="text-sm font-medium text-gray-800">Within 24 hours</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Business hours */}
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-amber-700" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Hours
                    </p>
                    <p className="text-sm font-medium text-gray-800">Mon–Fri 9am–6pm ET</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Separator />

            {/* Urgent notice */}
            <Card className="shadow-sm border-amber-200 bg-amber-50">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 leading-relaxed">
                    For urgent listing issues, use the{" "}
                    <span className="font-semibold">&ldquo;Report a Listing&rdquo;</span> option in
                    the subject field above.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* FAQ link */}
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Before you write
                </p>
                <p className="text-sm text-gray-600 mb-3">
                  You might find your answer in our resources section.
                </p>
                <Link
                  href="/resources"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1e3a8a] hover:underline"
                >
                  Browse FAQ & Resources
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
