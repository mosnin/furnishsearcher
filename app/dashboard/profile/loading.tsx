export default function ProfileLoading() {
  return (
    <div className="max-w-4xl mx-auto animate-pulse">
      <div className="bg-gray-100 rounded-xl p-6 mb-6 flex items-center gap-6">
        <div className="w-24 h-24 rounded-full bg-gray-300 shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="h-5 bg-gray-300 rounded w-40" />
          <div className="h-3 bg-gray-200 rounded w-24" />
          <div className="h-2 bg-gray-200 rounded-full w-full max-w-xs" />
        </div>
        <div className="h-9 bg-gray-200 rounded-lg w-36 hidden sm:block" />
      </div>
      <div className="flex gap-6 border-b border-gray-200 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 bg-gray-200 rounded w-24 mb-3" />
        ))}
      </div>
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((j) => (
              <div key={j} className="space-y-2">
                <div className="h-3 bg-gray-200 rounded w-20" />
                <div className="h-10 bg-gray-200 rounded-lg" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
