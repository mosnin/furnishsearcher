import Link from "next/link";
import { PublicFrame, PublicHeader } from "@/components/public-page";
export const metadata = { title: "Housing guides | globe" };
export default function BlogPage() {
  return (
    <PublicFrame>
      <main className="public-content-width">
        <PublicHeader
          title="Ideas for your next chapter."
          description="Explore our housing guides and moving resources."
        />
        <div className="public-content-grid">
          {[
            {
              title: "Travel nurse housing",
              description:
                "Questions to ask when planning a stay for an assignment.",
              href: "/guides/travel-nurse",
            },
            {
              title: "Corporate housing",
              description: "Prepare for a monthly work stay or relocation.",
              href: "/guides/corporate-housing",
            },
            {
              title: "Moving checklist",
              description: "Check the details before you arrive.",
              href: "/guides/moving",
            },
          ].map((item) => (
            <Link
              className="ds-panel public-content-card public-resource-link"
              key={item.href}
              href={item.href}
            >
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <span>Read guide ↗</span>
            </Link>
          ))}
        </div>
      </main>
    </PublicFrame>
  );
}
