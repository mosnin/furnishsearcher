export const RENTAL_TOOLS = {
  screening: {
    title: "Tenant screening",
    provider: "TransUnion SmartMove",
    url: "https://www.mysmartmove.com/",
    description:
      "The owner creates a screening request in their provider account. The traveler supplies consent and personal information directly to the screening service.",
    tenant:
      "Wait for your owner’s official screening invitation. Do not upload credit reports, Social Security numbers, or identity documents here.",
  },
  lease: {
    title: "Leases and legal documents",
    provider: "Rocket Lawyer",
    url: "https://www.rocketlawyer.com/",
    description:
      "Prepare a document with a legal-document provider or upload your own PDF. Private sharing and optional connected signing are available from each stay’s document workspace.",
    tenant:
      "Review the exact document version and discuss its terms with your owner before signing.",
  },
  rent_collection: {
    title: "Rent and deposit collection",
    provider: "Baselane",
    url: "https://www.baselane.com/rent-collection",
    description:
      "The owner sets up the property, rent schedule and tenant invitation in Baselane. Payment methods, processing and receipts remain in the provider account.",
    tenant:
      "Wait for an official payment invitation from your owner’s provider. globe does not collect bank or card details for rent.",
  },
} as const;
export type RentalTool = keyof typeof RENTAL_TOOLS;
