import Navbar from "@/components/navbar";
export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public-site">
      <Navbar />
      {children}
    </div>
  );
}
