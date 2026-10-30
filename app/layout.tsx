import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import "@/components/ui-system/generated-tokens-v2.css";
import "@/components/ui-system/styles.css";
import "@/components/ui-system/public.css";
import "@/components/public-experience/experience.css";
import "@/components/ui-system/motion.css";
import { PublicAuthProvider } from "@/components/public-experience/auth-context";
import { ConvexClientProvider } from "./providers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "globe | Monthly Furnished Rentals",
    template: "%s | globe",
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
    siteName: "globe",
    title: "globe | Monthly Furnished Rentals",
    description:
      "Search furnished monthly rentals by location, dates, budget and amenities. Contact owners and manage your stay requests.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "globe | Monthly Furnished Rentals",
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
      <body className="furnish-ui">
        <ConvexClientProvider>
          <PublicAuthProvider>{children}</PublicAuthProvider>
          <Toaster position="bottom-right" richColors />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
