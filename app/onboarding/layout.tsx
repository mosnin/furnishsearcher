import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get Started | FurnishFinder",
  description: "Tell us how you plan to use FurnishFinder.",
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
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#0f2044] rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm select-none">FF</span>
          </div>
          <span className="text-[#0f2044] font-semibold text-xl tracking-tight">
            FurnishFinder
          </span>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
