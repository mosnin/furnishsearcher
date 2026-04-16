import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Corporate Housing 101 | FurnishFinder",
  description:
    "A complete guide to corporate housing. Learn what corporate housing is, how it compares to hotels, how to choose the right option, and tax considerations.",
};

const HOTEL_VS_CORPORATE = [
  {
    aspect: "Space",
    hotel: "Studio-sized room, typically 300–500 sq ft",
    corporate: "Full apartment, typically 700–1,200+ sq ft",
  },
  {
    aspect: "Kitchen",
    hotel: "Mini fridge, microwave, no real cooking",
    corporate: "Full kitchen — cook real meals and save on dining",
  },
  {
    aspect: "Monthly Cost (avg.)",
    hotel: "$4,500–$7,000+",
    corporate: "$2,500–$4,500",
  },
  {
    aspect: "Lease Flexibility",
    hotel: "Night-by-night, no commitment needed",
    corporate: "30-day minimum, month-to-month or fixed term",
  },
  {
    aspect: "Work Environment",
    hotel: "Desk in the bedroom, distracting environment",
    corporate: "Separate living/work spaces, quieter",
  },
  {
    aspect: "Laundry",
    hotel: "On-site (pay per use) or valet",
    corporate: "In-unit washer/dryer in most furnished rentals",
  },
  {
    aspect: "Pet Policy",
    hotel: "Few allow pets, high pet fees",
    corporate: "Many landlords are pet-friendly",
  },
  {
    aspect: "Privacy",
    hotel: "Daily housekeeping, public common areas",
    corporate: "Your own private space, no daily interruptions",
  },
];

const HOW_TO_CHOOSE = [
  {
    title: "Define Your Stay Length",
    description:
      "For stays under 2 weeks, a hotel often makes sense. For 30 days or more, furnished corporate housing is almost always the better value. The longer your stay, the more the math favors a full apartment.",
  },
  {
    title: "Consider Your Productivity Needs",
    description:
      "If you're working remotely during your relocation, a separate workspace matters. Most furnished apartments have space for a dedicated desk; hotel rooms rarely do. Also confirm internet speed — ask for a speed test screenshot.",
  },
  {
    title: "Evaluate the Total Cost",
    description:
      "Compare the all-in cost: rent plus utilities plus dining out vs. cooking at home. Most employees who do this math find corporate housing saves their employer (or themselves) $1,500–$3,000 per month on a typical relocation.",
  },
  {
    title: "Check Location and Commute",
    description:
      "Proximity to the office matters, but so does access to grocery stores, gyms, and restaurants. Urban furnished apartments often offer better walkability than suburban extended-stay hotels.",
  },
];

const TAX_CONSIDERATIONS = [
  {
    heading: "Employer-Provided Housing",
    content:
      "When an employer pays for corporate housing directly, the value may be taxable income to the employee unless the housing is required as a condition of employment (e.g., on-site housing). Most short-term relocation housing is taxable. Consult a tax professional regarding your specific situation.",
  },
  {
    heading: "Home Office Deduction",
    content:
      "If you use a dedicated portion of your furnished corporate apartment exclusively and regularly for work as a self-employed contractor, you may qualify for the home office deduction. Employees of a company generally cannot claim this deduction. Consult a CPA for your jurisdiction.",
  },
  {
    heading: "Moving Expense Deductions",
    content:
      "As of 2018, moving expense deductions were suspended for most civilian employees under the Tax Cuts and Jobs Act. Active-duty military members may still deduct qualifying moving expenses. This provision is scheduled to expire after 2025 — check the current rules with a tax advisor.",
  },
  {
    heading: "Per Diem Rates",
    content:
      "Many companies reimburse corporate housing under a per diem allowance. The IRS sets annual per diem rates by location. Reimbursements up to the federal per diem rate are generally not taxable; amounts above the rate may be taxable income.",
  },
];

export default function CorporateHousingGuidePage() {
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
            Corporate Housing Guide
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Corporate Housing 101
          </h1>
          <p className="mt-4 text-blue-200 text-lg max-w-2xl">
            What corporate housing is, how it compares to hotels, how to choose
            the right option, and what you need to know about taxes.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-4xl mx-auto px-4 py-16 space-y-16">

        {/* Section 1 */}
        <div>
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-4">
            What Is Corporate Housing?
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            Corporate housing refers to fully furnished apartments, condos, or
            homes rented on a short- to medium-term basis — typically 30 days
            to 12 months — for business travelers, relocating employees, and
            professionals on temporary assignments.
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            Unlike traditional apartment leases, corporate housing comes move-in
            ready: furniture, bedding, kitchenware, and typically utilities and
            internet are all included in the monthly price. You bring your
            suitcase; the rest is waiting for you.
          </p>
          <p className="text-slate-600 leading-relaxed">
            Corporate housing is used by employees on project-based assignments,
            executives between home purchases, consultants on long-term
            engagements, employees relocating with a company, and individuals
            who need temporary housing during home renovation or after a
            life event.
          </p>
        </div>

        {/* Section 2 */}
        <div>
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-6">
            Corporate Housing vs. Extended-Stay Hotels
          </h2>
          <p className="text-slate-600 leading-relaxed mb-6">
            The most common question is: why not just book an extended-stay
            hotel? Here's a direct comparison:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#1e3a8a] text-white">
                  <th className="text-left px-4 py-3 font-semibold rounded-tl-lg">
                    Category
                  </th>
                  <th className="text-left px-4 py-3 font-semibold">
                    Extended-Stay Hotel
                  </th>
                  <th className="text-left px-4 py-3 font-semibold rounded-tr-lg">
                    Corporate Furnished Rental
                  </th>
                </tr>
              </thead>
              <tbody>
                {HOTEL_VS_CORPORATE.map((row, i) => (
                  <tr
                    key={row.aspect}
                    className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-700 border-b border-gray-100">
                      {row.aspect}
                    </td>
                    <td className="px-4 py-3 text-slate-500 border-b border-gray-100">
                      {row.hotel}
                    </td>
                    <td className="px-4 py-3 text-slate-700 border-b border-gray-100 font-medium">
                      {row.corporate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3 */}
        <div>
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-6">
            How to Choose the Right Corporate Housing
          </h2>
          <div className="space-y-5">
            {HOW_TO_CHOOSE.map((item, i) => (
              <div key={item.title} className="flex items-start gap-4">
                <div className="shrink-0 h-9 w-9 rounded-full bg-[#1e3a8a] flex items-center justify-center text-white font-bold text-sm">
                  {i + 1}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">{item.title}</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 4 — Tax */}
        <div>
          <h2 className="text-2xl font-bold text-[#1e3a8a] mb-3">
            Tax Considerations for Corporate Housing
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <p className="text-amber-800 text-sm">
              <strong>Disclaimer:</strong> The following is general information
              only and does not constitute tax advice. Consult a licensed tax
              professional or CPA for guidance specific to your situation and
              jurisdiction.
            </p>
          </div>
          <div className="space-y-6">
            {TAX_CONSIDERATIONS.map((item) => (
              <div key={item.heading}>
                <h3 className="font-bold text-slate-900 mb-2">
                  {item.heading}
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {item.content}
                </p>
              </div>
            ))}
          </div>
        </div>

      </section>

      {/* CTA */}
      <section className="bg-[#1e3a8a] py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Browse Corporate Rentals
          </h2>
          <p className="mt-3 text-blue-200">
            Find furnished monthly housing for your next assignment or
            relocation — no booking fees.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/search"
              className="inline-block bg-amber-400 hover:bg-amber-300 text-[#1e3a8a] font-bold px-8 py-3 rounded-lg transition-colors"
            >
              Browse Corporate Rentals
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
