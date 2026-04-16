import { Skeleton } from "@/components/ui/skeleton";

export default function ListingDetailLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6">
        {/* Breadcrumb */}
        <Skeleton className="h-4 w-72 mb-4" />

        {/* Photo gallery skeleton */}
        <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[420px] rounded-xl overflow-hidden mb-8">
          <Skeleton className="col-span-2 row-span-2 rounded-none" />
          <Skeleton className="rounded-none" />
          <Skeleton className="rounded-none" />
          <Skeleton className="rounded-none" />
          <Skeleton className="rounded-none" />
        </div>

        {/* Two-column skeleton */}
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Left column */}
          <div className="flex-1 min-w-0 flex flex-col gap-6">
            {/* Badges + title */}
            <div>
              <div className="flex gap-2 mb-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="h-9 w-full mb-2" />
              <Skeleton className="h-9 w-3/4 mb-3" />
              <Skeleton className="h-4 w-40" />
            </div>

            {/* Price */}
            <Skeleton className="h-11 w-52" />

            <Skeleton className="h-px w-full" />

            {/* Key details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[88px] rounded-xl" />
              ))}
            </div>

            <Skeleton className="h-px w-full" />

            {/* About */}
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-48 mb-1" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>

            <Skeleton className="h-px w-full" />

            {/* Amenities */}
            <div className="flex flex-col gap-3">
              <Skeleton className="h-6 w-36 mb-1" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 rounded-lg" />
                ))}
              </div>
            </div>

            <Skeleton className="h-px w-full" />

            {/* Availability */}
            <div>
              <Skeleton className="h-6 w-36 mb-3" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
          </div>

          {/* Right column */}
          <div className="lg:w-[380px] shrink-0">
            <div className="sticky top-6">
              <Skeleton className="h-[380px] w-full rounded-xl" />
            </div>
          </div>
        </div>

        {/* Similar listings */}
        <div className="mt-14">
          <div className="flex items-center justify-between mb-5">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border overflow-hidden">
                <Skeleton className="aspect-[4/3] w-full rounded-none" />
                <div className="p-4 flex flex-col gap-3">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
