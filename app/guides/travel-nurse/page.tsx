import { Metadata } from "next";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Travel Nurse Housing Guide | FurnishFinder",
  description:
    "The complete guide to finding furnished housing as a travel nurse. Learn what to look for, how to search, questions to ask landlords, and what to pack.",
};

const PACKING_LIST = [
  "Scrubs and comfortable work shoes",
  "Stethoscope and personal medical equipment",
  "Laptop and chargers",
  "Personal bedding (if allergies are a concern)",
  "Favorite kitchen items (spices, coffee maker)",
  "Workout clothes and equipment",
  "Personal documents: license, certifications, insurance cards",
  "Small toolkit (great for any minor move-in issues)",
  "Power strip and extension cords",
  "First aid kit with any prescription medications",
];

const QUESTIONS_TO_ASK = [
  {
    q: "Is the lease truly month-to-month, or are there minimum stay requirements?",
    a: "Many landlords on FurnishFinder offer 30-day minimums, but it's important to confirm this and that the end date is flexible if your contract extends.",
  },
  {
    q: "Is high-speed internet included? What are the speeds?",
    a: "As a nurse, you may need to complete online training, chart remotely, or do telehealth calls. Confirm the internet provider and ask for a speed test screenshot.",
  },
  {
    q: "What is included in the furniture package?",
    a: "At minimum, verify: bed with mattress, linens, pillows, towels, full kitchen with cookware, and a workspace. Ask about a TV, washer/dryer, and parking.",
  },
  {
    q: "What is the policy on early departure?",
    a: "If your assignment is cut short or changes location, understand if there's a penalty for early departure and how much notice is required.",
  },
  {
    q: "Are utilities included in the monthly price?",
    a: "Some listings include all utilities (electricity, gas, water, internet); others quote rent only. Clarify this before signing to avoid unexpected bills.",
  },
];

export default function TravelNurseGuidePage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-[#1e3a8a] text-white py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center text-blue-300 hover:text-white text-sm mb-6 transition-colors"
          >
            &larr; Back to Home
          </Link>
          <p className="text-amber-400 font-semibold uppercase tracking-widest text-sm mb-3">
            Renter Guide
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            The Complete Travel Nurse Housing Guide
          </h1>
          <p className="mt-4 text-blue-200 text-lg max-w-2xl">
            Everything you need to find, evaluate, and move into a furnished
            rental for your next travel nursing contract — quickly and
            confidently.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-4xl mx-auto px-4 py-16 space-y-16">

        {/* Section 1 */}
        <div>
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-4">
            Why Furnished Rentals Are Ideal for Travel Nurses
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            Travel nurses face a housing challenge unlike almost any other
            worker: they need a comfortable, fully equipped home — but only for
            13 weeks at a time. Hotel rooms are expensive and feel impersonal
            after the first week. Signing a year-long lease is out of the
            question when your next assignment could be across the country.
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            Furnished monthly rentals hit the sweet spot. You get a real home
            — your own kitchen, bedroom, and often a washer/dryer — at a
            fraction of extended-stay hotel prices, with the flexibility to
            leave when your contract ends. Many landlords on FurnishFinder
            specialize in travel nurse housing and understand your schedule.
          </p>
          <p className="text-slate-600 leading-relaxed">
            The key advantage: <strong>no booking fees</strong>. Unlike
            short-term rental platforms that add 15–20% service fees on top of
            the advertised rent, FurnishFinder connects you directly with
            landlords. The price you see is the price you pay.
          </p>
        </div>

        {/* Section 2 */}
        <div>
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-6">
            What to Look For in Travel Nurse Housing
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                title: "Proximity to Hospital",
                desc: "Aim for within 15–20 minutes of your facility. Factor in shift hours — a 30-minute commute at 3am feels very different from rush hour.",
              },
              {
                title: "True Furnished Kitchen",
                desc: "Cooking your own meals saves hundreds per month. Verify the listing includes pots/pans, plates, utensils, and a coffee maker.",
              },
              {
                title: "In-Unit or On-Site Laundry",
                desc: "After 12-hour shifts, hauling laundry to a laundromat isn't realistic. In-unit washer/dryer is the gold standard.",
              },
              {
                title: "Fast, Reliable Internet",
                desc: "Required for online charting, telehealth, and your personal life. Ask for the provider and speeds before committing.",
              },
              {
                title: "Flexible Lease Terms",
                desc: "Look for month-to-month leases or exact 13-week options. Confirm the policy if your contract extends or ends early.",
              },
              {
                title: "Safety and Security",
                desc: "Check the neighborhood, building security features, and whether there's a secure parking option — especially for night shift workers.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-gray-50 border border-gray-200 rounded-xl p-5"
              >
                <h3 className="font-bold text-slate-900 mb-1">{item.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Section 3 */}
        <div>
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-4">
            How to Search Effectively
          </h2>
          <p className="text-slate-600 leading-relaxed mb-6">
            The best approach is to start your housing search as soon as you
            accept your assignment — ideally 3–4 weeks out. Here's a proven
            workflow:
          </p>
          <ol className="space-y-4">
            {[
              "Search by your hospital's address or neighborhood to find listings in the right radius.",
              "Use filters to narrow by furnished, monthly lease, pet-friendly (if needed), and budget.",
              "Save your search so you get alerts when new listings that match your criteria are posted.",
              "Contact multiple landlords in parallel — don't put all your eggs in one basket until you have a signed lease.",
              "Video-call or virtual tour the apartment before committing if you can't visit in person.",
              "Review the lease carefully: confirm the start date, end date, utilities policy, and early departure terms.",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-4">
                <div className="shrink-0 h-8 w-8 rounded-full bg-[#1e3a8a] flex items-center justify-center text-white font-bold text-sm">
                  {i + 1}
                </div>
                <p className="text-slate-600 leading-relaxed pt-1">{step}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Section 4 — Questions to Ask */}
        <div>
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-6">
            Questions to Ask Your Potential Landlord
          </h2>
          <div className="space-y-4">
            {QUESTIONS_TO_ASK.map((item) => (
              <div
                key={item.q}
                className="border border-gray-200 rounded-xl overflow-hidden"
              >
                <div className="bg-[#1e3a8a]/5 px-5 py-3 border-b border-gray-200">
                  <p className="font-semibold text-slate-900 text-sm">
                    {item.q}
                  </p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-slate-600 text-sm leading-relaxed">
                    {item.a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 5 — Packing list */}
        <div>
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-4">
            Travel Nurse Packing List
          </h2>
          <p className="text-slate-600 leading-relaxed mb-6">
            Furnished rentals provide the essentials, but you'll still want
            to bring a few personal items. Here's what experienced travel nurses
            recommend:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PACKING_LIST.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <p className="text-slate-600 text-sm leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>

      </section>

      {/* CTA */}
      <section className="bg-[#1e3a8a] py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Find Housing Near Your Next Assignment
          </h2>
          <p className="mt-3 text-blue-200">
            Search furnished rentals near any hospital — no booking fees, direct
            landlord contact.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/search"
              className="inline-block bg-amber-400 hover:bg-amber-300 text-[#1e3a8a] font-bold px-8 py-3 rounded-lg transition-colors"
            >
              Search Near Hospitals
            </Link>
            <Link
              href="/sign-up"
              className="inline-block border border-white text-white hover:bg-white/10 font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Create Free Account
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
