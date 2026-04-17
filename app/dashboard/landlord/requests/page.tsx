"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice, formatDate } from "@/lib/utils";
import { Home, BedDouble, DollarSign, CalendarDays, Clock } from "lucide-react";

export default function TenantRequestsPage() {
  const requests = useQuery(api.housingRequests.getOpen, {});

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tenant Housing Requests</h1>
        <p className="text-slate-500 text-sm mt-1">
          Browse open requests from tenants looking for furnished housing. List a matching property to reach them.
        </p>
      </div>

      {requests === undefined ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Home className="h-12 w-12 text-slate-300" />
            <h3 className="font-medium text-slate-900">No open requests</h3>
            <p className="text-sm text-slate-500">
              Check back soon — tenants actively looking for housing will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r: Doc<"housingRequests">) => (
            <Card key={r._id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <h3 className="font-semibold text-slate-900 text-base">
                        {r.city}, {r.state}
                      </h3>
                      <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 text-xs">
                        Open
                      </Badge>
                      {r.petFriendly && (
                        <Badge variant="secondary" className="text-xs">Pet friendly</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-4">
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <DollarSign className="h-4 w-4 text-slate-400 shrink-0" />
                        Up to {formatPrice(r.maxBudget)}/mo
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <BedDouble className="h-4 w-4 text-slate-400 shrink-0" />
                        {r.bedrooms}+ bedrooms
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" />
                        Move-in {formatDate(r.moveInDate)}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                        {r.duration} month{r.duration !== 1 ? "s" : ""}
                      </div>
                    </div>
                    {r.description && (
                      <p className="text-sm text-slate-500 mt-3 line-clamp-2">{r.description}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-2">
                      Posted {formatDate(r.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <Link
                      href="/dashboard/landlord/listings/new"
                      className="inline-flex items-center gap-1.5 bg-[#0f2044] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#1a3360] transition-colors whitespace-nowrap"
                    >
                      List a Property
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
