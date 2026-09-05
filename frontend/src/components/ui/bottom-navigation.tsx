"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "./cx";

export type BottomNavLink = {
  href: string;
  label: string;
  /** Path SVG (viewBox 0 0 24 24, stroke). */
  icon: string;
};

type BottomNavigationProps = {
  /** Resto del menú que se muestra en el sheet inferior de "Más". */
  moreItems: BottomNavLink[];
  onLogout: () => void;
};

const TABS: { left: BottomNavLink[]; right: BottomNavLink[]; center: BottomNavLink } = {
  left: [
    { href: "/", label: "Inicio", icon: "M4 13h7V4H4v9Zm9 7h7V4h-7v16ZM4 20h7v-5H4v5Z" },
    { href: "/pedidos", label: "Paquetes", icon: "m3.5 7 8.5-4 8.5 4-8.5 4-8.5-4ZM3.5 7v10l8.5 4 8.5-4V7" },
  ],
  center: { href: "/recogidas/nueva", label: "Ingresar", icon: "M12 5v14M5 12h14" },
  right: [
    { href: "/recogidas", label: "Solicitudes", icon: "M5 5h14v4H5Zm0 6h14v8H5Zm2 2v4h4v-4Z" },
  ],
};

function NavIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cx("h-5 w-5 fill-none stroke-current stroke-2", className)}>
      <path d={path} />
    </svg>
  );
}

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function TabLink({ item, active }: { item: BottomNavLink; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "admin-touch-target flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium",
        active ? "text-brand" : "text-ink-secondary"
      )}
    >
      <NavIcon path={item.icon} />
      <span>{item.label}</span>
    </Link>
  );
}

/** Navegación inferior fija para móvil (<768px); reemplaza al drawer lateral. */
export function BottomNavigation({ moreItems, onLogout }: BottomNavigationProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSheetOpen(false);
  }, [pathname]);

  const moreActive = !sheetOpen && moreItems.some((item) => isActivePath(pathname, item.href));

  return (
    <>
      {sheetOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-ink/40 md:hidden"
          onClick={() => setSheetOpen(false)}
          aria-label="Cerrar menú"
        />
      ) : null}

      {sheetOpen ? (
        <div
          role="dialog"
          aria-label="Más opciones"
          className="admin-bottom-sheet-safe-area fixed inset-x-0 bottom-0 z-50 rounded-t-panel border-t border-edge bg-surface shadow-card md:hidden"
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-edge" aria-hidden="true" />
          <div className="max-h-[65dvh] overflow-y-auto overscroll-contain p-4">
            <p className="mb-3 font-display text-sm font-semibold text-ink">Más opciones</p>
            <ul className="grid grid-cols-2 gap-2">
              {moreItems.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setSheetOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "admin-touch-target flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium",
                        active
                          ? "border-brand-soft bg-brand-soft text-brand"
                          : "border-edge bg-surface text-ink"
                      )}
                    >
                      <NavIcon path={item.icon} className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => {
                setSheetOpen(false);
                onLogout();
              }}
              className="admin-touch-target mt-4 flex w-full items-center justify-center gap-2 rounded-button border border-danger/30 px-3 py-2.5 text-sm font-semibold text-danger"
            >
              <NavIcon path="M15 12H4m0 0 3-3m-3 3 3 3M10 4h9v16h-9" className="h-4 w-4" />
              Salir
            </button>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(19,24,38,0.06)] md:hidden"
      >
        <div className="flex items-stretch px-1">
          {TABS.left.map((item) => (
            <TabLink key={item.href} item={item} active={isActivePath(pathname, item.href) && !sheetOpen} />
          ))}

          {/* Botón central destacado: Ingresar */}
          <div className="flex flex-1 items-center justify-center">
            <Link
              href={TABS.center.href}
              aria-label={TABS.center.label}
              className="-mt-5 flex h-13 w-13 min-h-[52px] min-w-[52px] items-center justify-center rounded-full bg-brand text-white shadow-card transition-colors duration-150 hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <NavIcon path={TABS.center.icon} className="h-6 w-6" />
            </Link>
          </div>

          {TABS.right.map((item) => (
            <TabLink key={item.href} item={item} active={isActivePath(pathname, item.href) && !sheetOpen} />
          ))}

          <button
            type="button"
            onClick={() => setSheetOpen((prev) => !prev)}
            aria-label="Más opciones"
            aria-expanded={sheetOpen}
            className={cx(
              "admin-touch-target flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium",
              sheetOpen || moreActive ? "text-brand" : "text-ink-secondary"
            )}
          >
            <NavIcon path="M5 12h.01M12 12h.01M19 12h.01M5 12a1 1 0 1 0 0-.01M12 12a1 1 0 1 0 0-.01M19 12a1 1 0 1 0 0-.01" />
            <span>Más</span>
          </button>
        </div>
      </nav>
    </>
  );
}
