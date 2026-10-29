import type { ReactNode } from "react";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import "@/components/public-experience/account.css";
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-site w-account-site">
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
