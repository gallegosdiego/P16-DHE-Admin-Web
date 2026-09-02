"use client";

import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from "react";
import { cx } from "./cx";

export type HelpTipProps = {
  text: ReactNode;
  topic?: string;
  /** "inverse" para superficies de marca (topbar fucsia): botón blanco. */
  variant?: "default" | "inverse";
  className?: string;
};

/**
 * Símbolo de ayuda accesible '?' que abre un popover explicativo.
 * Reemplaza textos didácticos permanentes (hints/párrafos explicativos).
 */
export function HelpTip({ text, topic, variant = "default", className }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // El globo usa posición FIJA para escapar del recorte de contenedores con
  // overflow (el panel flotante de escritorio y el scroll interno recortaban
  // los que quedan pegados a la derecha — QA 2026-09-02). Se ancla al ?,
  // se limita a la pantalla y se voltea hacia abajo si no hay techo.
  useLayoutEffect(() => {
    if (!open) return;
    const popover = popoverRef.current;
    const anchor = containerRef.current;
    if (!popover || !anchor) return;
    const margin = 12;
    const anchorRect = anchor.getBoundingClientRect();
    const { width, height } = popover.getBoundingClientRect();
    let left = anchorRect.left + anchorRect.width / 2 - width / 2;
    left = Math.min(Math.max(left, margin), window.innerWidth - margin - width);
    let top = anchorRect.top - height - 8;
    if (top < margin) top = anchorRect.bottom + 8;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.visibility = "visible";
  }, [open]);

  // Con posición fija, el scroll lo desanclaría del ?: mejor cerrarlo.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

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
          "relative inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold transition-colors",
          "before:absolute before:-inset-2 before:content-['']", // Touch target >= 44px
          variant === "inverse"
            ? cx(
                "border-white/60 text-white/90 hover:border-white hover:text-white focus:border-white focus:text-white focus:outline-none focus:ring-2 focus:ring-white/30",
                open && "border-white bg-white/20 text-white"
              )
            : cx(
                "border-edge text-ink-secondary hover:border-brand hover:text-brand focus:border-brand focus:text-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
                open && "border-brand bg-brand-soft text-brand"
              )
        )}
      >
        ?
      </button>

      {open ? (
        <div
          ref={popoverRef}
          role="tooltip"
          className={cx(
            "invisible fixed z-50 w-64 max-w-[calc(100vw-1.5rem)] p-3",
            "rounded-card border border-edge bg-surface text-xs font-normal leading-relaxed text-ink shadow-md"
          )}
        >
          {text}
        </div>
      ) : null}
    </div>
  );
}
