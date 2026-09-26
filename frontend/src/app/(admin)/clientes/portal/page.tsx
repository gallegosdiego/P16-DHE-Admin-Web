"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePageTitle } from "@/lib/page-title";
import { formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/skeleton";
import { Button, Card, EmptyState, FilterChip, FilterChipGroup, KpiCard, MobileListCard, SearchInput } from "@/components/ui";
import {
  PortalAccessButton,
  PortalStatusBadge,
  usePortalAccessList,
  type PortalAccessRow,
  type PortalAccessStatus,
} from "@/components/portal-access-panel";

type Filter = "todos" | "activo" | "desactivado" | "sin_acceso" | "sin_ingreso";

const filterLabels: Record<Filter, string> = {
  todos: "Todos",
  activo: "Con acceso",
  sin_ingreso: "Aún no han entrado",
  desactivado: "Desactivados",
  sin_acceso: "Sin acceso",
};

function matches(row: PortalAccessRow, filter: Filter): boolean {
  if (filter === "todos") return true;
  if (filter === "sin_ingreso") return row.status === "activo" && !row.user?.last_login_at;
  return row.status === filter;
}

function lastLogin(row: PortalAccessRow): string {
  if (!row.user) return "—";
  return row.user.last_login_at ? formatDate(row.user.last_login_at) : "Aún no entra";
}

/** Estado del portal de clientes por empresa: quién tiene acceso y si ya entró. */
export default function PortalAccessPage() {
  usePageTitle("Accesos al portal | Danhei Express");
  const router = useRouter();
  const { canManage, rows, loading, error, reload } = usePortalAccessList();
  const [filter, setFilter] = useState<Filter>("todos");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { todos: rows.length, activo: 0, desactivado: 0, sin_acceso: 0, sin_ingreso: 0 };
    rows.forEach((row) => {
      (["activo", "desactivado", "sin_acceso", "sin_ingreso"] as Filter[]).forEach((key) => { if (matches(row, key)) result[key] += 1; });
    });
    return result;
  }, [rows]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => matches(row, filter) && (!term || [row.client.name, row.client.company, row.client.email, row.user?.email]
      .some((value) => String(value || "").toLowerCase().includes(term))));
  }, [rows, filter, search]);

  // Tras dar, renovar o desactivar un acceso se recarga la lista (contadores incluidos).
  const onChanged = () => { void reload(); };

  if (!canManage) {
    return <Card><EmptyState title="Solo para administración" description="Los accesos al portal de clientes los gestionan el superadmin y los administradores." action={<Button variant="secondary" onClick={() => router.push("/clientes")}>Volver a clientes</Button>} /></Card>;
  }

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary"><Button variant="ghost" size="sm" onClick={() => router.push("/clientes")}>← Clientes</Button><span aria-hidden="true">/</span><span className="text-ink">Accesos al portal</span></div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Portal de clientes</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">Accesos al portal</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">Solo el equipo de Danhei da acceso. Cada cliente tiene un usuario; desde aquí se crea, se le genera una contraseña nueva o se desactiva.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Con acceso" value={counts.activo} tone="success" support="Pueden entrar hoy" />
        <KpiCard label="Aún no han entrado" value={counts.sin_ingreso} tone="warning" support="Tienen acceso, sin primer ingreso" />
        <KpiCard label="Desactivados" value={counts.desactivado} />
        <KpiCard label="Sin acceso" value={counts.sin_acceso} support={`De ${counts.todos} clientes`} />
      </div>

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterChipGroup label="Filtrar por estado del portal">
            {(Object.keys(filterLabels) as Filter[]).map((key) => (
              <FilterChip key={key} selected={filter === key} onClick={() => setFilter(key)}>{filterLabels[key]} ({counts[key]})</FilterChip>
            ))}
          </FilterChipGroup>
          <SearchInput className="lg:w-72" placeholder="Buscar cliente o correo" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </Card>

      {loading ? <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div> : error ? (
        <Card className="border-danger/30 bg-danger/10" role="alert"><p className="text-sm text-danger">{error}</p><Button variant="secondary" size="sm" className="mt-3" onClick={() => void reload()}>Reintentar</Button></Card>
      ) : visible.length === 0 ? (
        <EmptyState title="No hay clientes en este filtro" description="Cambia el filtro o la búsqueda." />
      ) : (
        <Card className="p-0">
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-app-secondary text-left text-xs uppercase tracking-wide text-ink-secondary">
                <tr><th className="px-6 py-3">Cliente</th><th className="px-3 py-3">Usuario del portal</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Último ingreso</th><th className="px-3 py-3">Datos enviados</th><th className="px-6 py-3">Acción</th></tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.client.id} className="border-t border-edge align-top">
                    <td className="px-6 py-4"><button type="button" className="text-left font-display font-semibold text-ink hover:text-brand" onClick={() => router.push(`/clientes/${row.client.id}`)}>{row.client.name}</button>{row.client.company ? <p className="mt-1 text-xs text-ink-secondary">{row.client.company}</p> : null}</td>
                    <td className="px-3 py-4">{row.user ? <><p className="text-ink">{row.user.name}</p><p className="mt-1 break-all text-xs text-ink-secondary">{row.user.email}</p></> : <span className="text-ink-secondary">—</span>}</td>
                    <td className="px-3 py-4"><PortalStatusBadge status={row.status} /></td>
                    <td className="px-3 py-4 text-ink-secondary">{lastLogin(row)}</td>
                    <td className="px-3 py-4 text-ink-secondary">{row.last_credentials_at ? <>{row.last_credentials_kind}<br /><span className="text-xs">{formatDate(row.last_credentials_at)}</span></> : "—"}</td>
                    <td className="px-6 py-4"><PortalAccessButton size="sm" clientId={row.client.id} clientName={row.client.name} status={row.status} label={row.status === "sin_acceso" ? "Dar acceso" : "Gestionar"} onChanged={onChanged} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-4 lg:hidden">
            {visible.map((row) => (
              <MobileListCard
                key={row.client.id}
                title={row.client.name}
                subtitle={row.user?.email || row.client.company || "Sin usuario del portal"}
                meta={row.user ? `Último ingreso: ${lastLogin(row)}` : "Sin acceso al portal"}
                status={<PortalStatusBadge status={row.status as PortalAccessStatus} />}
                action={<PortalAccessButton size="sm" clientId={row.client.id} clientName={row.client.name} status={row.status} label={row.status === "sin_acceso" ? "Dar acceso" : "Gestionar"} onChanged={onChanged} />}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
