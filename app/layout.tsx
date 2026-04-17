import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { ConvexClientProvider } from "./providers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "FurnishFinder | Monthly Furnished Rentals",
    template: "%s | FurnishFinder",
  },
  description:
    "Find furnished monthly rentals for corporate travelers, travel nurses, relocating families & digital nomads. 300,000+ listings, no booking fees.",
  keywords: [
    "furnished rentals",
    "monthly rentals",
    "travel nurse housing",
    "corporate housing",
    "furnished apartments",
  ],
  openGraph: {
    siteName: "FurnishFinder",
    title: "FurnishFinder | Monthly Furnished Rentals",
    description:
      "Find furnished monthly rentals for corporate travelers, travel nurses, relocating families & digital nomads. 300,000+ listings, no booking fees.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "FurnishFinder | Monthly Furnished Rentals",
    description:
      "Find furnished monthly rentals for corporate travelers, travel nurses, relocating families & digital nomads. 300,000+ listings, no booking fees.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ConvexClientProvider>
          {children}
          <Toaster position="bottom-right" richColors />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
