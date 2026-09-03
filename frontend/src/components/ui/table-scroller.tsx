"use client";

import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { cx } from "./cx";

export type TableScrollerProps = PropsWithChildren<{
  className?: string;
}>;

/** Keeps a table's horizontal scrollbar available at the bottom of its visible panel. */
export function TableScroller({ children, className }: TableScrollerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const proxyRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [contentWidth, setContentWidth] = useState(0);
  const [proxyOffset, setProxyOffset] = useState(0);
  const [isInPanel, setIsInPanel] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const updateDesktop = () => setIsDesktop(media.matches);
    updateDesktop();
    media.addEventListener("change", updateDesktop);

    return () => media.removeEventListener("change", updateDesktop);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const measure = () => {
      const width = content.scrollWidth;
      setContentWidth(width);
      setHasOverflow(isDesktop && width > viewport.clientWidth + 1);

      const root = rootRef.current;
      const panel = root?.closest("main");
      if (root && panel) {
        const panelRect = panel.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        const visible = rootRect.bottom > panelRect.top && rootRect.top < panelRect.bottom;
        setIsInPanel(visible);
        const nextOffset = Math.max(0, Math.ceil(panelRect.bottom - rootRect.top - 12));
        setProxyOffset((current) => Math.abs(current - nextOffset) > 1 ? nextOffset : current);
      }
    };

    const syncScroll = (source: HTMLDivElement, target: HTMLDivElement) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      target.scrollLeft = source.scrollLeft;
      frameRef.current = window.requestAnimationFrame(() => {
        syncingRef.current = false;
      });
    };

    const handleViewportScroll = () => {
      if (proxyRef.current) syncScroll(viewport, proxyRef.current);
    };
    const handleProxyScroll = () => {
      syncScroll(proxyRef.current as HTMLDivElement, viewport);
    };

    measure();
    viewport.addEventListener("scroll", handleViewportScroll, { passive: true });
    const proxy = proxyRef.current;
    proxy?.addEventListener("scroll", handleProxyScroll, { passive: true });

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    const panel = rootRef.current?.closest("main");
    panel?.addEventListener("scroll", measure, { passive: true });

    return () => {
      viewport.removeEventListener("scroll", handleViewportScroll);
      proxy?.removeEventListener("scroll", handleProxyScroll);
      panel?.removeEventListener("scroll", measure);
      observer.disconnect();
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [isDesktop, hasOverflow, isInPanel]);

  return (
    <div ref={rootRef} className={cx("min-w-0", className)}>
      {isDesktop && hasOverflow && isInPanel ? (
        <div
          ref={proxyRef}
          aria-label="Desplazamiento horizontal de la tabla"
          style={{ transform: `translateY(${proxyOffset}px)` }}
          className="sticky bottom-0 z-10 mt-[-1px] hidden h-3 overflow-x-auto border-t border-edge bg-surface/95 md:block [scrollbar-color:theme(colors.ink.secondary)_transparent]"
        >
          <div aria-hidden="true" style={{ width: contentWidth }} className="h-px" />
        </div>
      ) : null}
      <div ref={viewportRef} className="overflow-x-auto">
        <div ref={contentRef} className="w-max min-w-full">
          {children}
        </div>
      </div>
    </div>
  );
}
