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
    "Search furnished monthly rentals by location, dates, budget and amenities. Contact owners and manage your stay requests.",
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
      "Search furnished monthly rentals by location, dates, budget and amenities. Contact owners and manage your stay requests.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "FurnishFinder | Monthly Furnished Rentals",
    description:
      "Search furnished monthly rentals by location, dates, budget and amenities. Contact owners and manage your stay requests.",
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
