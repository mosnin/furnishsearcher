import { PublicFrame } from "@/components/public-page";
import Link from "next/link";
import "@/components/public-experience/account.css";
export const metadata = {
  title: "Legal | globe",
  description: "Read the policies for using globe.",
};
const policies = [
  {
    title: "Terms of Service",
    href: "/terms",
    action: "Read Terms of Service",
  },
  { title: "Privacy Policy", href: "/privacy", action: "Read Privacy Policy" },
  { title: "Cookie Policy", href: "/cookies", action: "Read Cookie Policy" },
  {
    title: "Accessibility",
    href: "/accessibility",
    action: "Read Accessibility Statement",
  },
];
export default function LegalPage() {
  return (
    <PublicFrame>
      <main className="w-legal-index">
        <h1>Legal</h1>
        <p>
          Browse our policies to understand how we protect your data and set
          expectations for using globe.
        </p>
        <div>
          {policies.map((policy) => (
            <section className="w-legal-index-row" key={policy.href}>
              <h2>{policy.title}</h2>
              <Link className="w-account-pill" href={policy.href}>
                {policy.action}
              </Link>
            </section>
          ))}
        </div>
      </main>
    </PublicFrame>
  );
}
