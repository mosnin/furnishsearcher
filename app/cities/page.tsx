import { PublicFrame, PublicHeader } from "@/components/public-page";
import { ActionLink } from "@/components/ui-system/primitives";
import TopCities from "@/components/top-cities";
export const metadata = {
  title: "Explore cities | globe",
  description: "Browse city and state searches for monthly furnished rentals.",
};
export default function CitiesPage() {
  return (
    <PublicFrame>
      <main>
        <div className="public-content-width">
          <PublicHeader
            title="Where will your next chapter take you?"
            description="Explore city and state searches. Check current listings for availability, pricing and property details."
          />
        </div>
        <TopCities />
        <section className="public-content-width public-content-section">
          <h2>Have a place in mind?</h2>
          <p>
            Search by city, state or ZIP, or share your housing needs with
            property owners.
          </p>
          <div className="public-content-actions">
            <ActionLink href="/search" variant="primary">
              Search rentals
            </ActionLink>
            <ActionLink href="/housing-request">
              Create a housing request
            </ActionLink>
          </div>
        </section>
      </main>
    </PublicFrame>
  );
}
