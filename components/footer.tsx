import Link from "next/link";
import { Home, Twitter, Facebook, Linkedin, Instagram } from "lucide-react";

const FOOTER_LINKS = {
  "For Renters": [
    { label: "Search Listings", href: "/search" },
    { label: "How It Works", href: "/#how-it-works" },
    { label: "Saved Listings", href: "/dashboard/tenant" },
    { label: "Renter Resources", href: "/resources" },
    { label: "FAQ", href: "/resources" },
  ],
  "For Landlords": [
    { label: "List Your Property", href: "/list-your-property" },
    { label: "Landlord Dashboard", href: "/dashboard" },
    { label: "Pricing", href: "/pricing" },
    { label: "Landlord Resources", href: "/resources" },
    { label: "Success Stories", href: "/success-stories" },
  ],
  Resources: [
    { label: "Blog", href: "/blog" },
    { label: "Travel Nurse Guide", href: "/guides/travel-nurse" },
    { label: "Corporate Housing", href: "/guides/corporate-housing" },
    { label: "Moving Checklist", href: "/guides/moving" },
    { label: "City Guides", href: "/cities" },
  ],
  Company: [
    { label: "About Us", href: "/about" },
    { label: "Press", href: "/press" },
    { label: "Careers", href: "/careers" },
    { label: "Contact Us", href: "/contact" },
    { label: "Affiliates", href: "/affiliates" },
  ],
};

const SOCIAL_LINKS = [
  { icon: Twitter, href: "https://twitter.com", label: "Twitter" },
  { icon: Facebook, href: "https://facebook.com", label: "Facebook" },
  { icon: Linkedin, href: "https://linkedin.com", label: "LinkedIn" },
  { icon: Instagram, href: "https://instagram.com", label: "Instagram" },
];

const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Cookie Policy", href: "/cookies" },
  { label: "Accessibility", href: "/accessibility" },
];

export default function Footer() {
  return (
    <footer className="bg-[#0f2044] text-white">
      {/* Main footer content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8">
          {/* Brand column */}
          <div className="lg:col-span-1 space-y-5">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center group-hover:bg-white/15 transition-colors">
                <Home className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-[17px] text-white tracking-tight">
                FurnishFinder
              </span>
            </Link>

            {/* Tagline */}
            <p className="text-blue-200/60 text-[14px] leading-relaxed max-w-[220px]">
              The #1 marketplace for furnished monthly rentals — connecting
              renters and landlords directly.
            </p>

            {/* Social icons */}
            <div className="flex items-center gap-3">
              {SOCIAL_LINKS.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <Icon className="w-4 h-4 text-blue-200" />
                </a>
              ))}
            </div>

            {/* Award badge */}
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <span className="text-yellow-400 text-base">★</span>
              <div>
                <p className="text-white text-xs font-semibold leading-none">
                  Newsweek Award
                </p>
                <p className="text-blue-200/60 text-[10px] mt-0.5">
                  Best Online Platform 2025
                </p>
              </div>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
            <div key={heading}>
              <h3 className="text-white/90 font-semibold text-[12px] mb-4 uppercase tracking-widest">
                {heading}
              </h3>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-blue-200/55 hover:text-white/95 text-[14px] transition-colors hover:underline underline-offset-2"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-blue-200/45 text-[12px]">
            &copy; {new Date().getFullYear()} FurnishFinder, Inc. All rights
            reserved.
          </p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-blue-200/45 hover:text-blue-200 text-[12px] transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
