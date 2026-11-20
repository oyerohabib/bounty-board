export default function BountyListSkeleton({ count }: { count: number }) {
  return (
    <ul className="space-y-6" aria-busy="true" aria-label="Loading bounties">
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          className="bounty-card border-b border-stone-200 pb-6 last:border-0"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="h-5 w-2/5 rounded bg-stone-200 animate-pulse" />
              <div className="mt-2 h-4 w-4/5 rounded bg-stone-200 animate-pulse" />
            </div>
            <div className="h-6 w-16 shrink-0 rounded bg-stone-100 animate-pulse" />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="h-4 w-28 rounded bg-stone-200 animate-pulse" />
            <div className="h-4 w-40 rounded bg-stone-200 animate-pulse sm:justify-self-end" />
          </div>
        </li>
      ))}
    </ul>
  );
}
