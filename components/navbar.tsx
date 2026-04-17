"use client";

import * as React from "react";
import Link from "next/link";
import { useUser, SignInButton, UserButton } from "@clerk/nextjs";
import { Home, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Find Rentals", href: "/search" },
  { label: "Pricing", href: "/pricing" },
  { label: "Market Insights", href: "/market-insights", badge: "NEW" },
  { label: "Resources", href: "/resources" },
];

export default function Navbar() {
  const { isSignedIn, user } = useUser();
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on route change via click
  const handleMobileClose = () => setMobileOpen(false);

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-white/80 backdrop-blur-xl",
          scrolled
            ? "border-b border-slate-300/60"
            : "border-b border-slate-200/60"
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link
              href="/"
              className="flex items-center gap-2 group flex-shrink-0"
            >
              <div className="w-8 h-8 bg-[#0f2044] rounded-lg flex items-center justify-center shadow-sm group-hover:bg-[#1a3360] transition-colors">
                <Home className="w-4 h-4 text-white" />
              </div>
              <span className="text-[#0f2044] font-semibold text-[17px] tracking-tight hidden sm:block">
                FurnishFinder
              </span>
              <span className="text-[#0f2044] font-semibold text-[17px] tracking-tight sm:hidden">
                FF
              </span>
            </Link>

            {/* Desktop Nav Links */}
            <nav className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[15px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/60 transition-colors"
                >
                  {link.label}
                  {"badge" in link && link.badge && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-[#0f2044] text-white leading-none">
                      {link.badge}
                    </span>
                  )}
                </Link>
              ))}
            </nav>

            {/* Desktop Right Actions */}
            <div className="hidden md:flex items-center gap-3">
              {isSignedIn ? (
                <>
                  <Link
                    href="/list-your-property"
                    className="text-slate-600 hover:text-slate-900 text-[15px] font-medium transition-colors"
                  >
                    List Your Property
                  </Link>
                  <UserButton />
                </>
              ) : (
                <>
                  <SignInButton mode="modal">
                    <button className="text-[15px] font-medium text-slate-700 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100/60 transition-colors">
                      Sign In
                    </button>
                  </SignInButton>
                  <Link href="/list-your-property">
                    <Button
                      size="sm"
                      className="bg-[#0f2044] hover:bg-[#1a3360] text-white text-[15px] font-medium px-4 py-2 rounded-xl shadow-sm"
                    >
                      List Your Property
                    </Button>
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Hamburger */}
            <button
              className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100/60 transition-colors"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Drawer */}
        <div
          className={cn(
            "md:hidden overflow-hidden transition-all duration-300 ease-in-out",
            mobileOpen ? "max-h-screen opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="bg-white/95 backdrop-blur-xl border-t border-slate-200/60 px-4 py-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={handleMobileClose}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[15px] font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100/60 transition-colors"
              >
                {link.label}
                {"badge" in link && link.badge && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-[#0f2044] text-white leading-none">
                    {link.badge}
                  </span>
                )}
              </Link>
            ))}
            <div className="pt-3 border-t border-slate-200/60 mt-3 space-y-2">
              {isSignedIn ? (
                <div className="flex items-center gap-3 px-3 py-2">
                  <UserButton />
                  <span className="text-[15px] font-medium text-slate-700">{user?.firstName}</span>
                </div>
              ) : (
                <>
                  <SignInButton mode="modal">
                    <button
                      className="block w-full text-left px-3.5 py-2 rounded-lg text-[15px] font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100/60 transition-colors"
                      onClick={handleMobileClose}
                    >
                      Sign In
                    </button>
                  </SignInButton>
                  <Link href="/list-your-property" onClick={handleMobileClose}>
                    <Button className="w-full bg-[#0f2044] hover:bg-[#1a3360] text-white text-[15px] font-medium rounded-xl shadow-sm">
                      List Your Property
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Spacer to prevent content from hiding behind fixed navbar */}
      <div className="h-16" />
    </>
  );
}
