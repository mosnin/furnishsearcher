import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function MarketInsightsLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero / header skeleton */}
      <div className="bg-[#0f2044] py-14 px-4">
        <div className="max-w-5xl mx-auto space-y-4">
          <Skeleton className="h-9 w-64 bg-white/10 rounded-lg" />
          <Skeleton className="h-5 w-96 bg-white/10 rounded-lg" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        {/* 4 stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="shadow-sm">
              <CardContent className="p-6">
                <div className="space-y-3">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Large chart skeleton (h-96) */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="space-y-2">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-3.5 w-60" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-20 rounded-full" />
                <Skeleton className="h-8 w-20 rounded-full" />
                <Skeleton className="h-8 w-20 rounded-full" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Skeleton className="h-96 w-full rounded-lg" />
          </CardContent>
        </Card>

        {/* City grid of skeleton pills */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Array.from({ length: 18 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-9 rounded-full"
                style={{ width: `${60 + (i % 5) * 12}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
