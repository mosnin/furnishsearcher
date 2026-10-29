import type { ReactNode } from "react";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
export function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <div className="public-content">{children}</div>
      <Footer />
    </>
  );
}
export function PublicHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="public-content-header">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {children}
    </header>
  );
}
