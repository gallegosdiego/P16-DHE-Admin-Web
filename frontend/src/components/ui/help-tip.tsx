"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { cx } from "./cx";

export type HelpTipProps = {
  text: ReactNode;
  topic?: string;
  className?: string;
};

/**
 * Símbolo de ayuda accesible '?' que abre un popover explicativo.
 * Reemplaza textos didácticos permanentes (hints/párrafos explicativos).
 */
export function HelpTip({ text, topic, className }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cx("relative inline-flex items-center align-middle", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={topic ? `Ayuda: ${topic}` : "Ayuda"}
        aria-expanded={open}
        className={cx(
          "relative inline-flex h-5 w-5 items-center justify-center rounded-full border border-edge text-[11px] font-bold text-ink-secondary transition-colors",
          "before:absolute before:-inset-2 before:content-['']", // Touch target >= 44px
          "hover:border-brand hover:text-brand focus:border-brand focus:text-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
          open && "border-brand text-brand bg-brand-soft"
        )}
      >
        ?
      </button>

      {open ? (
        <div
          role="tooltip"
          className={cx(
            "absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-64 max-w-[calc(100vw-2rem)] p-3",
            "rounded-card border border-edge bg-surface shadow-md text-xs font-normal text-ink leading-relaxed",
            "sm:left-0 sm:translate-x-0"
          )}
        >
          {text}
        </div>
      ) : null}
    </div>
  );
}
