import "@/components/public-experience/property.css";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
export default function ListingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public-site">
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
