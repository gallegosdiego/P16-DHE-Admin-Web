import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { cx } from "./cx";

export type FilterChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Indicates that this option is the active filter. */
  selected?: boolean;
};

/** Compact, selectable filter control. Its visible surface is 36px high while the wrapper keeps a 44px touch target. */
export function FilterChip({ selected = false, className, children, type = "button", ...props }: FilterChipProps) {
  return (
    <span className="inline-flex min-h-11 shrink-0 items-center">
      <button
        {...props}
        type={type}
        aria-pressed={selected}
        className={cx(
          "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-button border px-3 text-sm font-semibold transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          "disabled:cursor-not-allowed disabled:opacity-50",
          selected
            ? "border-brand bg-brand-soft text-brand"
            : "border-edge bg-surface text-ink-secondary hover:bg-app-secondary",
          className
        )}
      >
        {children}
      </button>
    </span>
  );
}

export type FilterChipGroupProps = PropsWithChildren<{
  /** Accessible name for the set of related filter chips. */
  label: string;
  className?: string;
}>;

/** Named horizontal chip rail that keeps overflow inside the filter row. */
export function FilterChipGroup({ label, className, children }: FilterChipGroupProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        "flex min-w-0 min-h-11 items-center gap-2 overflow-x-auto overscroll-x-contain",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {children}
    </div>
  );
}
