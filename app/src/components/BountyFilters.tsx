"use client";

import type { AssetFilter, StatusFilter } from "@/lib/boardQuery";

const ASSET_FILTERS: { value: AssetFilter; label: string }[] = [
  { value: "all", label: "All assets" },
  { value: "sol", label: "SOL" },
  { value: "usdc", label: "USDC" },
  { value: "other", label: "Other SPL" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
];

function chipClass(selected: boolean) {
  return `rounded border px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 ${
    selected
      ? "border-teal-800 bg-teal-800 text-white"
      : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
  }`;
}

export default function BountyFilters({
  query,
  onQuery,
  asset,
  onAsset,
  status,
  onStatus,
}: {
  query: string;
  onQuery: (value: string) => void;
  asset: AssetFilter;
  onAsset: (value: AssetFilter) => void;
  status?: StatusFilter;
  onStatus?: (value: StatusFilter) => void;
}) {
  return (
    <div className="mt-4 grid gap-3">
      <input
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Search title, description, or address"
        aria-label="Search bounties"
        className="rounded border border-stone-300 bg-white px-3 py-2"
      />
      <fieldset>
        <legend className="sr-only">Asset</legend>
        <div className="flex flex-wrap gap-2">
          {ASSET_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={asset === option.value}
              onClick={() => onAsset(option.value)}
              className={chipClass(asset === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
      {status !== undefined && onStatus && (
        <fieldset>
          <legend className="sr-only">Status</legend>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={status === option.value}
                onClick={() => onStatus(option.value)}
                className={chipClass(status === option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
