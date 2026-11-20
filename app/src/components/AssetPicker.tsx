"use client";

import { useRef } from "react";

export type AssetChoice = "sol" | "usdc" | "custom";

const OPTIONS: { value: AssetChoice; label: string; hint: string }[] = [
  {
    value: "sol",
    label: "SOL",
    hint: "Native SOL in the program vault.",
  },
  {
    value: "usdc",
    label: "USDC",
    hint: "Circle's Devnet USDC mint.",
  },
  {
    value: "custom",
    label: "Custom",
    hint: "A classic SPL Token mint.",
  },
];

export default function AssetPicker({
  value,
  onChange,
}: {
  value: AssetChoice;
  onChange: (value: AssetChoice) => void;
}) {
  const buttons = useRef<Partial<Record<AssetChoice, HTMLButtonElement>>>({});

  function move(from: AssetChoice, direction: 1 | -1) {
    const index = OPTIONS.findIndex((option) => option.value === from);
    const next = OPTIONS[(index + direction + OPTIONS.length) % OPTIONS.length];
    onChange(next.value);
    buttons.current[next.value]?.focus();
  }

  return (
    <div>
      <p id="asset-label" className="text-sm text-stone-600">
        Select asset
      </p>
      <div
        role="radiogroup"
        aria-labelledby="asset-label"
        className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            move(value, 1);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            move(value, -1);
          }
        }}
      >
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                buttons.current[option.value] = node ?? undefined;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={`rounded border px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 ${
                selected
                  ? "border-teal-800 bg-[var(--panel)]"
                  : "border-stone-300 bg-white/70 hover:border-stone-400"
              }`}
            >
              <span className="block text-sm font-medium text-stone-900">
                {option.label}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-stone-500">
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
