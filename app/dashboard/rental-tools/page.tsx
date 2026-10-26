import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RENTAL_TOOLS } from "@/lib/rental-tools";
import OwnerProtectionTools from "@/components/owner-protection-tools";
export default function RentalToolsPage() {
  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <h1 className="text-2xl font-bold">Rental tools</h1>
      <p className="text-slate-600">
        Prepare for a monthly stay with screening, legal documents and rent
        collection. Open a stay’s workspace to coordinate instructions, share
        private PDFs and use connected electronic signing when available.
      </p>
      <Button asChild>
        <Link href="/dashboard/inquiries">Open a stay workspace</Link>
      </Button>
      <div className="grid gap-5 md:grid-cols-3">
        {Object.entries(RENTAL_TOOLS).map(([key, tool]) => (
          <Card key={key}>
            <CardContent className="p-5 space-y-3">
              <h2 className="font-semibold text-lg">{tool.title}</h2>
              <p className="font-medium text-sm">{tool.provider}</p>
              <p className="text-sm text-slate-600">{tool.description}</p>
              <a
                className="underline text-sm"
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit {tool.provider}
              </a>
              <p className="text-xs text-slate-500">
                External account and provider terms apply. Provider charges and
                availability are set by the provider.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <OwnerProtectionTools />
      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="font-semibold">Keep each step clear</h2>
          <p className="text-sm">
            Screening consent and sensitive application data belong in the
            screening provider’s flow. A shared PDF or receipt acknowledgement
            does not create a signature. Rent schedules, bank details, deposits,
            refunds and payment receipts are managed in the rent provider
            account.
          </p>
          <p className="text-sm">
            FurnishSearcher’s subscription payments cover app access. A setup
            instruction or owner-reported completion here is separate from a
            verified provider outcome.
          </p>
          <Link className="underline text-sm" href="/dashboard/support">
            Get help with your workspace
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
