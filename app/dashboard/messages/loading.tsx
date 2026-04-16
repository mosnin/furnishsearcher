import { Skeleton } from "@/components/ui/skeleton";

export default function MessagesLoading() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Left column — conversation list, fixed 320px */}
      <div className="w-80 shrink-0 border-r border-gray-200 flex flex-col">
        {/* List header */}
        <div className="p-4 border-b border-gray-200">
          <Skeleton className="h-6 w-32" />
        </div>

        {/* Conversation items */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 p-4">
              {/* Avatar circle */}
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right column — message area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>

        {/* Message bubbles */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Message received (left) */}
          <div className="flex items-end gap-2">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className="h-10 w-56 rounded-2xl rounded-bl-none" />
          </div>

          {/* Message sent (right) */}
          <div className="flex items-end justify-end gap-2">
            <Skeleton className="h-10 w-44 rounded-2xl rounded-br-none" />
          </div>

          {/* Message received (left) */}
          <div className="flex items-end gap-2">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className="h-16 w-64 rounded-2xl rounded-bl-none" />
          </div>
        </div>

        {/* Bottom input area */}
        <div className="px-6 py-4 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 flex-1 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
}
