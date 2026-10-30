import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
export function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="public-auth">
      <Link href="/" className="public-brand">
        <Brand size={40} />
      </Link>
      <section className="ds-panel public-auth-card">
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
      </section>
      <Link href="/search" className="ds-caption">
        Continue browsing rentals
      </Link>
    </main>
  );
}
