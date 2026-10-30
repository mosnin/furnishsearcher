import { Brand } from "@/components/brand";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get Started | globe",
  description: "Tell us how you plan to use globe.",
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Minimal header — logo only */}
      <header className="px-6 py-5 border-b border-border/60">
        <Brand size={34} />
      </header>

      {/* Page content */}
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
