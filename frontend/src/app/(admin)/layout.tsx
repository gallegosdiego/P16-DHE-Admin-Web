"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { Expense, ReceivableResponse, Shipment } from "@/lib/types";

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
      <path d={path} />
    </svg>
  );
}

const navItems = [
  { href: "/", label: "Dashboard", icon: "M4 13h7V4H4v9Zm9 7h7V4h-7v16ZM4 20h7v-5H4v5Z" },
  { href: "/pedidos", label: "Pedidos", icon: "m3.5 7 8.5-4 8.5 4-8.5 4-8.5-4ZM3.5 7v10l8.5 4 8.5-4V7" },
  { href: "/clientes", label: "Clientes", icon: "M4 19h16M6 17V9l6-4 6 4v8" },
  { href: "/conductores", label: "Conductores", icon: "M5.5 17H4l2.4-6.5h5.4l1.6 6.5M13 10.5h3.5l2.2 6.5M8 17a2.5 2.5 0 1 1 0-.01M18 17a2.5 2.5 0 1 1 0-.01" },
  { href: "/novedades", label: "Novedades", icon: "M12 3 22 20H2L12 3ZM12 9v5M12 17h.01" },
  { href: "/pagos", label: "Pagos", icon: "M12 6v12M15.5 8.8c-.8-.7-1.9-1-3.2-1-1.8 0-3 .8-3 2.1 0 3.4 6.5 1.6 6.5 5.1 0 1.4-1.3 2.2-3.3 2.2-1.5 0-2.9-.5-3.8-1.3M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z" },
  { href: "/reportes", label: "Reportes", icon: "M4 19V5M4 19h17M8 16v-4M13 16V8M18 16v-6" },
  { href: "/configuracion", label: "Configuración", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a8.2 8.2 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a8.2 8.2 0 0 0 .1 2.1l-2 1.5 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.3 2.6h4l.3-2.6c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.5-2.2-1.6Z" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [alerts, setAlerts] = useState({ issues: 0, debts: 0, expenses: 0 });

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const [issuesRes, debtRes, expensesRes] = await Promise.all([
          apiGet<{ data?: Array<Partial<Shipment>> }>("/shipments?status=issue"),
          apiGet<ReceivableResponse>("/clients-receivable"),
          apiGet<{ expenses: Expense[] }>("/expenses"),
        ]);
        const expenses = expensesRes.expenses || [];
        setAlerts({
          issues: (issuesRes.data || []).length,
          debts: debtRes.count || 0,
          expenses: expenses.filter((e) => e.is_overdue || e.is_due_soon).length,
        });
      } catch {
        setAlerts({ issues: 0, debts: 0, expenses: 0 });
      }
    };
    if (user) loadAlerts();
  }, [user, pathname]);

  if (isLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">Validando sesión...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {mobileOpen ? (
        <button
          className="fixed inset-0 z-30 bg-slate-900/35 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
          type="button"
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-64 border-r border-slate-200 bg-white transition-transform md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-slate-200 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Danhei Express</p>
          <p className="mt-1 text-lg font-bold text-primary">Panel Admin</p>
        </div>
        <nav className="p-3">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Icon path={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="rounded-lg border border-slate-200 p-2 md:hidden"
              aria-label="Abrir menú"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Panel Operativo</p>
              <h1 className="text-sm font-semibold text-slate-900 md:text-base">Danhei Admin</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-route/10 px-2 py-1 text-xs font-semibold text-route sm:inline">Administrador</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
                aria-label="Notificaciones"
              >
                {alerts.issues + alerts.debts + alerts.expenses > 0 ? (
                  <span className="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">
                    {alerts.issues + alerts.debts + alerts.expenses}
                  </span>
                ) : null}
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
                <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
              </svg>
              </button>
              {notifOpen ? (
                <div className="absolute right-0 top-11 z-50 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                  {alerts.issues + alerts.debts + alerts.expenses === 0 ? (
                    <p className="p-2 text-sm text-slate-600">Sin alertas 🎉</p>
                  ) : (
                    <div className="space-y-1 text-sm">
                      <Link href="/novedades" className="block rounded px-2 py-1 hover:bg-slate-50">
                        {alerts.issues} envíos con novedad
                      </Link>
                      <Link href="/pagos" className="block rounded px-2 py-1 hover:bg-slate-50">
                        {alerts.debts} clientes con deuda
                      </Link>
                      <Link href="/pagos" className="block rounded px-2 py-1 hover:bg-slate-50">
                        {alerts.expenses} gastos por vencer
                      </Link>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold text-slate-900">{user.name || "Admin Danhei"}</p>
              <p className="max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap text-xs text-slate-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Salir
            </button>
          </div>
        </header>
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
