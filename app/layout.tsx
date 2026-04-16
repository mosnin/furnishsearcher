import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { ConvexClientProvider } from "./providers";

export const metadata: Metadata = {
  title: "FurnishFinder | Monthly Furnished Rentals",
  description:
    "Find furnished monthly rentals for corporate travelers, travel nurses, relocating families, and digital nomads. Browse 300,000+ listings with no booking fees.",
  keywords: [
    "furnished rentals",
    "monthly rentals",
    "corporate housing",
    "travel nurse housing",
    "furnished apartments",
  ],
  openGraph: {
    title: "FurnishFinder | Monthly Furnished Rentals",
    description:
      "Find furnished monthly rentals for corporate travelers, travel nurses, relocating families, and digital nomads.",
    type: "website",
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
