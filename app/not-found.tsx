import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <p className="text-8xl font-bold text-gray-200 select-none">404</p>
      <h1 className="mt-4 text-3xl font-semibold text-gray-900">
        Page Not Found
      </h1>
      <p className="mt-3 max-w-sm text-center text-gray-500">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-8 flex gap-3">
        <Button asChild className="bg-[#1B2A6B] hover:bg-[#15236a] text-white">
          <Link href="/">Go Home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/search">Browse Listings</Link>
        </Button>
      </div>
    </div>
  );
}
