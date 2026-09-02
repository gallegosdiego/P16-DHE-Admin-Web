"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiGet, apiSend } from "@/lib/api";
import { CommandPalette } from "@/components/command-palette";
import { useToast } from "@/components/toast";
import { BottomNavigation, type BottomNavLink } from "@/components/ui/bottom-navigation";
import { cx } from "@/components/ui/cx";
import type { AppNotification, PaginatedResponse } from "@/lib/types";

function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cx("h-4 w-4 fill-none stroke-current stroke-2", className)}>
      <path d={path} />
    </svg>
  );
}

type NavItem = { href: string; label: string; icon: string };

/** Inicio vive suelto arriba, fuera de las secciones. */
const homeItem: NavItem = { href: "/", label: "Inicio", icon: "M4 13h7V4H4v9Zm9 7h7V4h-7v16ZM4 20h7v-5H4v5Z" };

type NavSection = { id: string; label: string; items: NavItem[] };

/** Secciones desplegables del sidebar (QA 2026-09-02): agrupación guiada por
    el panel anterior, con candado para fijar cada sección abierta. */
const navSections: NavSection[] = [
  {
    id: "operaciones",
    label: "Operaciones",
    items: [
      { href: "/recogidas", label: "Ingreso de paquetes", icon: "M5 5h14v4H5Zm0 6h14v8H5Zm2 2v4h4v-4Z" },
      { href: "/pedidos", label: "Envíos y guías", icon: "m3.5 7 8.5-4 8.5 4-8.5 4-8.5-4ZM3.5 7v10l8.5 4 8.5-4V7" },
      { href: "/rutas", label: "Rutas", icon: "M3 6h15M3 12h11M3 18h7M20 6a2 2 0 1 0 0-.01M16 12a2 2 0 1 0 0-.01M12 18a2 2 0 1 0 0-.01" },
      { href: "/operacion", label: "Control operativo", icon: "M4 4h16v5H4V4Zm0 11h16v5H4v-5Zm4-4h8v4H8v-4Z" },
      { href: "/conductores", label: "Pilotos", icon: "M5.5 17H4l2.4-6.5h5.4l1.6 6.5M13 10.5h3.5l2.2 6.5M8 17a2.5 2.5 0 1 1 0-.01M18 17a2.5 2.5 0 1 1 0-.01" },
      { href: "/novedades", label: "Novedades", icon: "M12 3 22 20H2L12 3ZM12 9v5M12 17h.01" },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    items: [
      { href: "/clientes", label: "Clientes", icon: "M4 19h16M6 17V9l6-4 6 4v8" },
      { href: "/pagos", label: "Pagos", icon: "M12 6v12M15.5 8.8c-.8-.7-1.9-1-3.2-1-1.8 0-3 .8-3 2.1 0 3.4 6.5 1.6 6.5 5.1 0 1.4-1.3 2.2-3.3 2.2-1.5 0-2.9-.5-3.8-1.3M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z" },
      { href: "/zonas", label: "Zonas", icon: "M3 10l9-7 9 7v10l-9 4-9-4V10Zm9-7v21M3 10l9 4 9-4" },
    ],
  },
  {
    id: "analisis",
    label: "Análisis",
    items: [
      { href: "/reportes", label: "Reportes", icon: "M4 19V5M4 19h17M8 16v-4M13 16V8M18 16v-6" },
      { href: "/metricas", label: "Métricas", icon: "M4 19V5M4 19h17M7 14h2M11 10h2M15 7h2M19 5h1" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    items: [
      { href: "/usuarios", label: "Usuarios", icon: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M16 3.1a4 4 0 0 1 0 7.8M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" },
      { href: "/auditoria", label: "Auditoría", icon: "M9 11h6M9 15h6M9 7h6M5 3h14a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 0 1 2-2Z" },
      { href: "/papelera", label: "Papelera", icon: "M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13M10 11v5M14 11v5" },
      { href: "/configuracion", label: "Configuración", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a8.2 8.2 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a8.2 8.2 0 0 0 .1 2.1l-2 1.5 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.3 2.6h4l.3-2.6c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.5-2.2-1.6Z" },
      { href: "/ayuda", label: "Ayuda", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.2 9a2.8 2.8 0 0 1 5.5.9c0 1.8-2.7 2.3-2.7 3.6M12 17h.01" },
    ],
  },
];

const allNavItems: NavItem[] = [homeItem, ...navSections.flatMap((section) => section.items)];

/** Rutas del bottom sheet "Más" en móvil: todo lo que no está en las pestañas fijas. */
const mobileMoreItems: BottomNavLink[] = allNavItems.filter(
  (item) => !["/", "/pedidos", "/recogidas"].includes(item.href)
);

/** Preferencias de secciones del menú (QA 2026-09-02): cada sección puede
    plegarse, subir o bajar de posición, y el candado congela su estado
    (abierta/cerrada) Y su posición. Se recuerdan por navegador. */
type NavPrefs = {
  order: string[];
  sections: Record<string, { open: boolean; locked: boolean }>;
};

const NAV_PREFS_KEY = "dhe_nav_sections";

function defaultNavPrefs(): NavPrefs {
  return {
    order: navSections.map((section) => section.id),
    sections: Object.fromEntries(navSections.map((section) => [section.id, { open: true, locked: false }])),
  };
}

function readNavPrefs(): NavPrefs {
  const defaults = defaultNavPrefs();
  try {
    const raw = localStorage.getItem(NAV_PREFS_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as Partial<NavPrefs>;
    // El orden guardado solo vale si contiene exactamente las secciones actuales.
    if (
      Array.isArray(saved.order) &&
      saved.order.length === defaults.order.length &&
      defaults.order.every((id) => saved.order!.includes(id))
    ) {
      defaults.order = saved.order as string[];
    }
    for (const id of Object.keys(defaults.sections)) {
      const entry = saved.sections?.[id];
      if (entry && typeof entry.open === "boolean" && typeof entry.locked === "boolean") {
        defaults.sections[id] = entry;
      }
    }
    return defaults;
  } catch {
    return defaults;
  }
}

/** Títulos adicionales para rutas que no coinciden 1:1 con un ítem del menú. */
const extraTitles: Array<{ prefix: string; title: string }> = [
  { prefix: "/recogidas/nueva", title: "Nuevo ingreso" },
];

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function sectionTitle(pathname: string): string {
  const extra = extraTitles.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`));
  if (extra) return extra.title;
  const allItems = allNavItems;
  // Coincidencia de prefijo más larga para que /pedidos/123 titule "Envíos y guías".
  const match = allItems
    .filter((item) => isActivePath(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? "Panel Admin";
}

function notificationToneClasses(notification: AppNotification): string {
  const severity = typeof notification.metadata?.severity === "string" ? notification.metadata.severity : null;

  if (notification.type === "driver_documents_expired" || severity === "danger") {
    return "border-l-4 border-danger bg-danger/5";
  }

  if (notification.type === "driver_documents_missing" || severity === "warning") {
    return "border-l-4 border-warning bg-warning/10";
  }

  if (notification.type === "driver_documents_warning" || severity === "info") {
    return "border-l-4 border-info bg-info/10";
  }

  return "border-l-4 border-transparent";
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150",
        // QA 2026-09-02: el activo se delimita con borde fucsia, sin relleno rosado.
        active ? "border-brand text-brand" : "border-transparent text-ink hover:bg-app-secondary"
      )}
    >
      <Icon path={item.icon} />
      <span>{item.label}</span>
    </Link>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullScreenFlow = pathname === "/recogidas/nueva";
  const router = useRouter();
  const { isLoading, user, logout } = useAuth();
  const { showToast } = useToast();
  const [notifOpen, setNotifOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  // Se arranca con los valores por defecto (los mismos del servidor) y las
  // preferencias guardadas se cargan tras montar, para no romper la hidratación.
  const [navPrefs, setNavPrefs] = useState<NavPrefs>(() => defaultNavPrefs());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNavPrefs(readNavPrefs());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_PREFS_KEY, JSON.stringify(navPrefs));
    } catch {
      // sin almacenamiento disponible, la preferencia solo vive en la sesión
    }
  }, [navPrefs]);

  const toggleSectionOpen = (id: string) =>
    setNavPrefs((prev) => {
      const entry = prev.sections[id];
      if (!entry || entry.locked) return prev;
      return { ...prev, sections: { ...prev.sections, [id]: { ...entry, open: !entry.open } } };
    });

  const toggleSectionLock = (id: string) =>
    setNavPrefs((prev) => {
      const entry = prev.sections[id];
      if (!entry) return prev;
      return { ...prev, sections: { ...prev.sections, [id]: { ...entry, locked: !entry.locked } } };
    });

  const moveSection = (id: string, direction: -1 | 1) =>
    setNavPrefs((prev) => {
      const entry = prev.sections[id];
      if (!entry || entry.locked) return prev;
      const order = [...prev.order];
      const from = order.indexOf(id);
      if (from === -1) return prev;
      // Salta por encima de las secciones fijadas: el candado congela posición.
      let to = from + direction;
      while (to >= 0 && to < order.length && prev.sections[order[to]]?.locked) to += direction;
      if (to < 0 || to >= order.length) return prev;
      order.splice(from, 1);
      order.splice(to, 0, id);
      return { ...prev, order };
    });

  const orderedSections = navPrefs.order
    .map((id) => navSections.find((section) => section.id === id))
    .filter((section): section is NavSection => Boolean(section));

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const [countRes, listRes] = await Promise.all([
          apiGet<{ count: number }>("/notifications/unread-count"),
          apiGet<PaginatedResponse<AppNotification>>("/notifications?per_page=5"),
        ]);
        setUnreadCount(countRes.count || 0);
        setNotifications(listRes.data || []);
      } catch {
        setUnreadCount(0);
        setNotifications([]);
      }
    };
    if (user) void loadNotifications();
  }, [user, pathname]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotifOpen(false);
    // Auto-expandir la sección que contiene la ruta activa (sin tocar candados).
    const activeSection = navSections.find((section) =>
      section.items.some((item) => isActivePath(pathname, item.href))
    );
    if (activeSection) {
      setNavPrefs((prev) => {
        const entry = prev.sections[activeSection.id];
        if (!entry || entry.open) return prev;
        return { ...prev, sections: { ...prev.sections, [activeSection.id]: { ...entry, open: true } } };
      });
    }
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const totalAlerts = useMemo(() => unreadCount, [unreadCount]);
  const title = useMemo(() => sectionTitle(pathname), [pathname]);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app text-sm text-ink-secondary">
        Validando sesión...
      </div>
    );
  }

  return (
    <div className="admin-shell-min-height bg-app text-ink md:bg-canvas">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* ── Sidebar desktop: panel flotante sobre el lienzo neutro ── */}
      <aside className="admin-sidebar-safe-area fixed left-0 top-0 z-40 hidden w-60 flex-col bg-surface md:left-4 md:top-4 md:flex md:rounded-panel md:border md:border-edge md:shadow-card">
        <div className="border-b border-edge px-5 py-5">
          <div className="relative mx-auto h-12 w-44">
            <Image
              src="/danhei-brand-adaptive.png"
              alt="Danhei Express"
              fill
              sizes="176px"
              className="object-contain drop-shadow-[0_1px_1px_rgba(19,24,38,0.16)]"
              priority
            />
          </div>
          <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-widest text-ink-secondary">
            Panel Admin
          </p>
        </div>

        {/* flex-1 + min-h-0: el alto del menú sale del espacio real que deja la
            cabecera; overscroll-contain evita encadenar el rebote con la página. */}
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          <ul className="space-y-0.5">
            <li>
              <SidebarLink item={homeItem} active={isActivePath(pathname, homeItem.href)} />
            </li>
          </ul>

          {orderedSections.map((section, position) => {
            const prefs = navPrefs.sections[section.id] ?? { open: true, locked: false };
            const isOpen = prefs.open;
            return (
              <div key={section.id} className="mt-3">
                <div className="group flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggleSectionOpen(section.id)}
                    aria-expanded={isOpen}
                    disabled={prefs.locked}
                    className="flex min-w-0 flex-1 items-center justify-between rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-ink-secondary transition-colors duration-150 hover:bg-app-secondary disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span className="truncate">{section.label}</span>
                    {prefs.locked ? null : (
                      <Icon
                        path="m6 9 6 6 6-6"
                        className={cx("h-3.5 w-3.5 shrink-0 transition-transform duration-150", isOpen && "rotate-180")}
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(section.id, -1)}
                    disabled={prefs.locked || position === 0}
                    aria-label={`Subir la sección ${section.label}`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-secondary/50 transition-colors duration-150 hover:bg-app-secondary hover:text-ink-secondary disabled:invisible"
                  >
                    <Icon path="m6 14 6-6 6 6" className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(section.id, 1)}
                    disabled={prefs.locked || position === orderedSections.length - 1}
                    aria-label={`Bajar la sección ${section.label}`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-secondary/50 transition-colors duration-150 hover:bg-app-secondary hover:text-ink-secondary disabled:invisible"
                  >
                    <Icon path="m6 10 6 6 6-6" className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSectionLock(section.id)}
                    aria-pressed={prefs.locked}
                    aria-label={
                      prefs.locked
                        ? `Soltar la sección ${section.label}`
                        : `Fijar la sección ${section.label} en su estado y posición`
                    }
                    className={cx(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors duration-150",
                      prefs.locked
                        ? "text-brand"
                        : "text-ink-secondary/50 hover:bg-app-secondary hover:text-ink-secondary"
                    )}
                  >
                    {prefs.locked ? (
                      <Icon path="M7 11V7a5 5 0 0 1 10 0v4M6 11h12v9H6Z" className="h-3.5 w-3.5" />
                    ) : (
                      <Icon path="M7 11V7a5 5 0 0 1 9.8-1.4M6 11h12v9H6Z" className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                {isOpen ? (
                  <ul className="mt-0.5 space-y-0.5">
                    {section.items.map((item) => (
                      <li key={item.href}>
                        <SidebarLink item={item} active={isActivePath(pathname, item.href)} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </nav>

        {/* Bloque del usuario */}
        <div className="flex items-center gap-3 border-t border-edge px-4 py-3.5">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand"
          >
            {(user.name || "A").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{user.name || "Admin Danhei"}</p>
            <p className="text-xs text-ink-secondary">Administrador</p>
          </div>
        </div>
      </aside>

      {/* En escritorio, la topbar y el contenido viven dentro de un panel
          flotante con scroll propio: el rosado queda contenido en el panel
          y el lienzo neutro se ve alrededor. En móvil nada cambia. */}
      <div className="md:flex md:h-dvh md:flex-col md:py-4 md:pl-[17rem] md:pr-4">
        <div className="md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden md:rounded-panel md:border md:border-edge md:bg-app md:shadow-card">
        {/* ── Topbar ── */}
        <header className="admin-sticky-header-safe-area sticky top-0 z-20 flex items-center justify-between gap-3 bg-brand px-4 text-white md:static md:shrink-0 md:px-6">
          <h1 className="min-w-0 truncate font-display text-lg font-semibold md:text-xl">{title}</h1>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="admin-touch-target hidden items-center justify-center gap-2 rounded-button bg-white/15 px-3 py-2 text-sm text-white transition-colors duration-150 hover:bg-white/25 md:inline-flex"
              aria-label="Búsqueda global"
            >
              <Icon path="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z" />
              <span className="text-xs text-white/80">Ctrl+K</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                className="admin-touch-target relative inline-flex items-center justify-center rounded-button p-2 text-white transition-colors duration-150 hover:bg-white/15"
                aria-label="Notificaciones"
              >
                {totalAlerts > 0 ? (
                  <span className="absolute right-0.5 top-0.5 rounded-full bg-white px-1.5 text-[10px] font-bold text-brand">
                    {totalAlerts}
                  </span>
                ) : null}
                <Icon path="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" className="h-5 w-5" />
              </button>
              {notifOpen ? (
                <div className="absolute right-0 top-12 z-50 w-72 rounded-card border border-edge bg-surface p-2 text-ink shadow-card">
                  {notifications.length === 0 ? (
                    <p className="p-2 text-sm text-ink-secondary">Sin notificaciones</p>
                  ) : (
                    <div className="space-y-1 text-sm">
                      {notifications.slice(0, 5).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            if (item.action_url) router.push(item.action_url);
                          }}
                          className={cx(
                            "block w-full rounded px-2 py-1.5 text-left transition-colors duration-150 hover:bg-app-secondary",
                            notificationToneClasses(item)
                          )}
                        >
                          <p className="font-semibold text-ink">{item.title}</p>
                          <p className="truncate text-xs text-ink-secondary">{item.body || "Sin detalle"}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await apiSend<{ updated: number; message: string }>(
                          "/notifications/read-all",
                          "POST",
                          {}
                        );
                        setNotifications((prev) =>
                          prev.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }))
                        );
                        setUnreadCount(0);
                        showToast("Notificaciones marcadas como leídas", "success");
                      } catch {
                        showToast("No se pudieron actualizar notificaciones", "error");
                      }
                    }}
                    className="mt-2 w-full rounded-button border border-edge px-3 py-1.5 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-app-secondary"
                  >
                    Marcar todas como leídas
                  </button>
                </div>
              ) : null}
            </div>

            <p className="hidden max-w-[160px] truncate text-sm font-medium text-white md:block">
              {user.name || "Admin Danhei"}
            </p>

            <button
              type="button"
              onClick={handleLogout}
              className="admin-touch-target hidden items-center justify-center rounded-button border border-white/40 px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-white/15 md:inline-flex"
            >
              Salir
            </button>
          </div>
        </header>

        <main className={cx("md:min-h-0 md:flex-1 md:overflow-y-auto", fullScreenFlow ? "p-4 pb-4 md:p-6" : "admin-mobile-safe-area p-4 md:p-6")}>{children}</main>
        </div>
      </div>

      {/* ── Bottom navigation móvil ── */}
      {/* El ingreso de paquetes es flujo de pantalla completa en móvil: la barra
          de acciones del formulario ocupa la zona inferior y la navegación
          la taparía (línea gráfica, punto 25). */}
      {fullScreenFlow ? null : <BottomNavigation moreItems={mobileMoreItems} onLogout={handleLogout} />}
    </div>
  );
}
