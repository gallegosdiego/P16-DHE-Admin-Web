"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePageTitle } from "@/lib/page-title";
import { formatDate } from "@/lib/utils";
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
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-[#202035]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={`text-slate-500 transition-transform duration-200 dark:text-slate-300 ${open ? "rotate-180" : ""}`}
        >
          <TrashIcon path={iconPaths.chevron} />
        </span>
        <span className="truncate text-sm font-bold text-slate-900 dark:text-[#e0e0e0]">{title}</span>
      </span>
      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
        {count}
      </span>
    </button>
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
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => onRestore(kind, id)}
        aria-label={`Restaurar ${label}`}
        title="Restaurar"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-300 text-emerald-700 transition-all duration-150 active:scale-95 disabled:opacity-50 dark:border-emerald-500/30 dark:text-emerald-300"
      >
        <TrashIcon path={iconPaths.restore} />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onPurge(kind, id, label)}
        aria-label={`Eliminar definitivamente ${label}`}
        title="Eliminar definitivamente"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-300 text-rose-700 transition-all duration-150 active:scale-95 disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-300"
      >
        <TrashIcon path={iconPaths.trash} />
      </button>
    </div>
  );
}

export default function PapeleraPage() {
  usePageTitle("Papelera | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
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

  return (
    <div className="animate-fade-in space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Papelera</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Recupera registros enviados a la papelera o retíralos de la operación conservando su historial.
        </p>
      </header>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-slate-400">
          Cargando papelera...
        </div>
      ) : (
        <div className="space-y-3">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <SectionHeader title="Papelera clientes" count={clients.length} open={open.clientes} onToggle={() => setOpen((current) => ({ ...current, clientes: !current.clientes }))} />
            {open.clientes ? (
              <div className="border-t border-slate-200 p-4 dark:border-[#2a2a3e]">
                {clients.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">No hay clientes en la papelera.</p> : (
                  <div className="space-y-2">
                    {clients.map((client) => (
                      <div key={client.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-[#2a2a3e]">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{client.name}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {client.phone || "Sin teléfono"}{client.company ? ` · ${client.company}` : ""} · Eliminado {client.deleted_at ? formatDate(client.deleted_at) : ""}
                          </p>
                        </div>
                        <RowActions kind="client" id={client.id} label={`cliente ${client.name}`} busy={busyKey === `client-${client.id}`} onRestore={restore} onPurge={purge} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <SectionHeader title="Papelera pilotos" count={drivers.length} open={open.pilotos} onToggle={() => setOpen((current) => ({ ...current, pilotos: !current.pilotos }))} />
            {open.pilotos ? (
              <div className="border-t border-slate-200 p-4 dark:border-[#2a2a3e]">
                {drivers.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">No hay pilotos en la papelera.</p> : (
                  <div className="space-y-2">
                    {drivers.map((driver) => (
                      <div key={driver.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-[#2a2a3e]">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{driver.name}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{driver.phone} · {driver.vehicle || "Sin vehículo"} · {driver.zone || "Sin zona"}</p>
                        </div>
                        <RowActions kind="driver" id={driver.id} label={`piloto ${driver.name}`} busy={busyKey === `driver-${driver.id}`} onRestore={restore} onPurge={purge} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <SectionHeader title="Papelera usuarios" count={users.length} open={open.usuarios} onToggle={() => setOpen((current) => ({ ...current, usuarios: !current.usuarios }))} />
            {open.usuarios ? (
              <div className="border-t border-slate-200 p-4 dark:border-[#2a2a3e]">
                {users.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">No hay usuarios en la papelera.</p> : (
                  <div className="space-y-2">
                    {users.map((user) => (
                      <div key={user.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-[#2a2a3e]">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{user.name}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{user.email} · {(user.role_names || []).join(", ") || "Sin rol"}</p>
                        </div>
                        <RowActions kind="user" id={user.id} label={`usuario ${user.name}`} busy={busyKey === `user-${user.id}`} onRestore={restore} onPurge={purge} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
