import Link from "next/link";
import { PublicFrame, PublicHeader } from "@/components/public-page";
const rentalResources = [
  {
    title: "Travel nurse housing",
    description: "Plan a monthly stay around your next assignment.",
    href: "/guides/travel-nurse",
  },
  {
    title: "Corporate housing",
    description: "Prepare for a work assignment or relocation.",
    href: "/guides/corporate-housing",
  },
  {
    title: "Moving checklist",
    description: "Confirm what is included before you move.",
    href: "/guides/moving",
  },
  {
    title: "For property owners",
    description:
      "Prepare your listing and understand publication requirements.",
    href: "/list-your-property",
  },
  {
    title: "Market insights",
    description: "Explore observed rental data and its coverage.",
    href: "/market-insights",
  },
  {
    title: "Help with your account",
    description: "Contact support or follow an existing case.",
    href: "/contact",
  },
];
export default function ResourcesPage() {
  return (
    <PublicFrame>
      <main className="public-content-width">
        <PublicHeader
          title="A little preparation. A better stay."
          description="Guides and practical resources for travelers and property owners."
        />
        <div className="public-content-grid">
          {rentalResources.map((item) => (
            <Link
              className="ds-panel public-content-card public-resource-link"
              key={item.href}
              href={item.href}
            >
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <span>
                Explore resource <span aria-hidden="true">↗</span>
              </span>
            </Link>
          ))}
        </div>
      </main>
    </PublicFrame>
  );
}
