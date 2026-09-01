"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePageTitle } from "@/lib/page-title";
import { formatDate } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MobileListCard,
} from "@/components/ui";
import type { Client, Driver, UserListItem } from "@/lib/types";

type TrashSection = "clientes" | "pilotos" | "usuarios";
type TrashKind = "client" | "driver" | "user";

function TrashIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-none stroke-current stroke-2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

const iconPaths = {
  chevron: "m6 9 6 6 6-6",
  restore: "M4 12a8 8 0 1 0 2.3-5.7M4 5v5h5",
  trash: "M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13M10 11v5M14 11v5",
};

function SectionHeader({
  title,
  count,
  open,
  onToggle,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="md"
      onClick={onToggle}
      aria-expanded={open}
      className="!h-auto !justify-between min-h-14 w-full rounded-none px-4 text-left hover:bg-app-secondary"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className={`shrink-0 text-ink-secondary transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <TrashIcon path={iconPaths.chevron} />
        </span>
        <span className="truncate font-display text-sm font-semibold text-ink">{title}</span>
      </span>
      <Badge tone={count > 0 ? "brand" : "neutral"}>{count}</Badge>
    </Button>
  );
}

function RowActions({
  kind,
  id,
  label,
  busy,
  onRestore,
  onPurge,
}: {
  kind: TrashKind;
  id: number;
  label: string;
  busy: boolean;
  onRestore: (kind: TrashKind, id: number) => void;
  onPurge: (kind: TrashKind, id: number, label: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="md"
        disabled={busy}
        onClick={() => onRestore(kind, id)}
        aria-label={`Restaurar ${label}`}
        title="Restaurar"
        className="border border-teal/30 px-3 text-teal hover:bg-teal/10"
      >
        <TrashIcon path={iconPaths.restore} />
        <span className="sr-only">Restaurar</span>
      </Button>
      <Button
        type="button"
        variant="danger"
        size="md"
        disabled={busy}
        onClick={() => onPurge(kind, id, label)}
        aria-label={`Eliminar definitivamente ${label}`}
        title="Eliminar definitivamente"
        className="px-3"
      >
        <TrashIcon path={iconPaths.trash} />
        <span className="sr-only">Eliminar definitivamente</span>
      </Button>
    </div>
  );
}

function TrashItem({
  title,
  subtitle,
  meta,
  kind,
  id,
  label,
  busy,
  onRestore,
  onPurge,
}: {
  title: string;
  subtitle: string;
  meta: string;
  kind: TrashKind;
  id: number;
  label: string;
  busy: boolean;
  onRestore: (kind: TrashKind, id: number) => void;
  onPurge: (kind: TrashKind, id: number, label: string) => void;
}) {
  const actions = (
    <RowActions
      kind={kind}
      id={id}
      label={label}
      busy={busy}
      onRestore={onRestore}
      onPurge={onPurge}
    />
  );

  return (
    <>
      <div className="hidden items-center justify-between gap-4 rounded-input border border-edge bg-surface p-4 md:flex">
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold text-ink">{title}</p>
          <p className="mt-1 truncate text-sm text-ink-secondary">{subtitle}</p>
          <p className="mt-1 text-xs text-ink-secondary">{meta}</p>
        </div>
        {actions}
      </div>
      <MobileListCard
        className="md:hidden"
        title={title}
        subtitle={subtitle}
        meta={meta}
        action={actions}
      />
    </>
  );
}

function SectionError({ title }: { title: string }) {
  return (
    <div role="alert" className="rounded-input border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
      <p className="font-semibold">No se pudo cargar {title.toLowerCase()}.</p>
      <p className="mt-1 text-danger/80">La respuesta de la API no se reemplaza por una lista vacía.</p>
    </div>
  );
}

function SectionEmpty({ title }: { title: string }) {
  return (
    <EmptyState
      title={`No hay ${title.toLowerCase()} en la papelera`}
      description="Los registros eliminados aparecerán aquí y conservarán su historial."
      className="border-0 px-2 py-8 shadow-none"
    />
  );
}

export default function PapeleraPage() {
  usePageTitle("Papelera | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [sectionErrors, setSectionErrors] = useState<Record<TrashSection, boolean>>({
    clientes: false,
    pilotos: false,
    usuarios: false,
  });
  const [open, setOpen] = useState<Record<TrashSection, boolean>>({
    clientes: true,
    pilotos: true,
    usuarios: false,
  });
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadTrash = async () => {
    setLoading(true);
    const [clientResult, driverResult, userResult] = await Promise.allSettled([
      apiGet<Client[]>("/clients-trashed"),
      apiGet<Driver[]>("/drivers-trashed"),
      apiGet<UserListItem[]>("/users-trashed"),
    ]);

    setSectionErrors({
      clientes: clientResult.status === "rejected",
      pilotos: driverResult.status === "rejected",
      usuarios: userResult.status === "rejected",
    });
    setClients(clientResult.status === "fulfilled" && Array.isArray(clientResult.value) ? clientResult.value : []);
    setDrivers(driverResult.status === "fulfilled" && Array.isArray(driverResult.value) ? driverResult.value : []);
    setUsers(userResult.status === "fulfilled" && Array.isArray(userResult.value) ? userResult.value : []);
    setLoading(false);

    if ([clientResult, driverResult, userResult].every((result) => result.status === "rejected")) {
      showToast("No se pudo cargar la papelera", "error");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTrash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restore = async (kind: TrashKind, id: number) => {
    const endpoint = kind === "client" ? "clients" : kind === "driver" ? "drivers" : "users";
    const key = `${kind}-${id}`;
    setBusyKey(key);
    try {
      await apiSend(`/${endpoint}/${id}/restore`, "POST", {});
      showToast("Registro restaurado", "success");
      await loadTrash();
    } catch {
      showToast("No se pudo restaurar el registro", "error");
    } finally {
      setBusyKey(null);
    }
  };

  const purge = async (kind: TrashKind, id: number, label: string) => {
    const confirmed = window.confirm(
      `¿Eliminar definitivamente ${label}? Ya no aparecerá en la papelera. Las guías, paquetes y auditoría histórica se conservarán sin cambios.`,
    );
    if (!confirmed) return;

    const endpoint = kind === "client" ? "clients" : kind === "driver" ? "drivers" : "users";
    const key = `${kind}-${id}`;
    setBusyKey(key);
    try {
      await apiSend(`/${endpoint}/${id}/purge`, "POST", {});
      showToast("Registro eliminado de la operación; el historial se conserva", "success");
      await loadTrash();
    } catch {
      showToast("No se pudo eliminar definitivamente el registro", "error");
    } finally {
      setBusyKey(null);
    }
  };

  const actions = { restore, purge };

  return (
    <div className="min-w-0 animate-fade-in space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Administración</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">Papelera</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-secondary">
          Recupera registros enviados a la papelera o retíralos de la operación conservando su historial.
        </p>
      </header>

      {loading ? (
        <div className="space-y-3" aria-label="Cargando papelera">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-card bg-app-secondary" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Card flush className="overflow-hidden">
            <SectionHeader title="Papelera de clientes" count={clients.length} open={open.clientes} onToggle={() => setOpen((current) => ({ ...current, clientes: !current.clientes }))} />
            {open.clientes ? (
              <div className="space-y-3 border-t border-edge p-4 md:p-6">
                {sectionErrors.clientes ? <SectionError title="la papelera de clientes" /> : clients.length === 0 ? <SectionEmpty title="clientes" /> : clients.map((client) => (
                  <TrashItem
                    key={client.id}
                    title={client.name}
                    subtitle={client.company || "Sin empresa"}
                    meta={`${client.phone || "Sin teléfono"} · Eliminado ${client.deleted_at ? formatDate(client.deleted_at) : "fecha no disponible"}`}
                    kind="client"
                    id={client.id}
                    label={`cliente ${client.name}`}
                    busy={busyKey === `client-${client.id}`}
                    onRestore={actions.restore}
                    onPurge={actions.purge}
                  />
                ))}
              </div>
            ) : null}
          </Card>

          <Card flush className="overflow-hidden">
            <SectionHeader title="Papelera de pilotos" count={drivers.length} open={open.pilotos} onToggle={() => setOpen((current) => ({ ...current, pilotos: !current.pilotos }))} />
            {open.pilotos ? (
              <div className="space-y-3 border-t border-edge p-4 md:p-6">
                {sectionErrors.pilotos ? <SectionError title="la papelera de pilotos" /> : drivers.length === 0 ? <SectionEmpty title="pilotos" /> : drivers.map((driver) => (
                  <TrashItem
                    key={driver.id}
                    title={driver.name}
                    subtitle={driver.vehicle || "Sin vehículo"}
                    meta={`${driver.phone || "Sin teléfono"} · ${driver.zone || "Sin zona"}`}
                    kind="driver"
                    id={driver.id}
                    label={`piloto ${driver.name}`}
                    busy={busyKey === `driver-${driver.id}`}
                    onRestore={actions.restore}
                    onPurge={actions.purge}
                  />
                ))}
              </div>
            ) : null}
          </Card>

          <Card flush className="overflow-hidden">
            <SectionHeader title="Papelera de usuarios" count={users.length} open={open.usuarios} onToggle={() => setOpen((current) => ({ ...current, usuarios: !current.usuarios }))} />
            {open.usuarios ? (
              <div className="space-y-3 border-t border-edge p-4 md:p-6">
                {sectionErrors.usuarios ? <SectionError title="la papelera de usuarios" /> : users.length === 0 ? <SectionEmpty title="usuarios" /> : users.map((user) => (
                  <TrashItem
                    key={user.id}
                    title={user.name}
                    subtitle={user.email}
                    meta={(user.role_names || []).join(", ") || "Sin rol"}
                    kind="user"
                    id={user.id}
                    label={`usuario ${user.name}`}
                    busy={busyKey === `user-${user.id}`}
                    onRestore={actions.restore}
                    onPurge={actions.purge}
                  />
                ))}
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}
