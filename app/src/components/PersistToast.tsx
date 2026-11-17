"use client";

import { useSonner } from "sonner";

type PersistToastProps = {
  toastId: string | number;
  ordinal: number;
  variant: "success" | "error" | "warning";
  title: string;
  description?: string;
  onClose: () => void;
};

const variantStyles = {
  success: {
    wrap: "border-teal-700/30 bg-teal-50 text-teal-950",
    badge: "bg-teal-800 text-white",
    close: "text-teal-800 hover:bg-teal-100",
  },
  error: {
    wrap: "border-red-700/30 bg-red-50 text-red-950",
    badge: "bg-red-800 text-white",
    close: "text-red-800 hover:bg-red-100",
  },
  warning: {
    wrap: "border-amber-700/30 bg-amber-50 text-amber-950",
    badge: "bg-amber-800 text-white",
    close: "text-amber-900 hover:bg-amber-100",
  },
} as const;

export function PersistToast({
  toastId,
  ordinal,
  variant,
  title,
  description,
  onClose,
}: PersistToastProps) {
  const { toasts } = useSonner();
  const total = Math.max(toasts.length, 1);
  // Sonner lists newest first — position 1 is the front (latest) toast.
  const index = toasts.findIndex((t) => t.id === toastId);
  const position = index >= 0 ? index + 1 : 1;
  const styles = variantStyles[variant];

  return (
    <div
      className={`flex w-[min(100vw-2rem,22rem)] items-start gap-3 rounded-lg border px-3.5 py-3 shadow-lg ${styles.wrap}`}
      role="status"
    >
      <span
        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${styles.badge}`}
        title={`Toast #${ordinal}; ${position} of ${total} (newest is 1)`}
      >
        {position}/{total}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wider opacity-70">
          #{ordinal}
          {position === 1 && total > 1 ? ` · ${total} open` : ""}
        </p>
        <p className="mt-0.5 text-sm font-medium leading-snug">{title}</p>
        {description ? (
          <p className="mt-1 break-all text-xs leading-snug opacity-80">
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className={`-mr-1 -mt-1 shrink-0 rounded p-1 text-lg leading-none ${styles.close}`}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
