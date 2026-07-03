"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatDate, toTitle } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";
import { usePageTitle } from "@/lib/page-title";
import type { Client, Driver, PaginatedResponse, RoleDTO, UserDetailDTO, UserListItem } from "@/lib/types";

type UserForm = {
  id: number;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  client_id: number;
  driver_id: number;
};

const formDefault: UserForm = {
  id: 0,
  name: "",
  email: "",
  phone: "",
  password: "",
  role: "",
  client_id: 0,
  driver_id: 0,
};

function normalizeRoles(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is string => typeof item === "string");
}

function UserIcon({ path, className = "h-4 w-4" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} fill-none stroke-current stroke-2`}>
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const userIconPaths = {
  trash: "M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13M10 11v5M14 11v5",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff: "M3 3l18 18M10.6 10.6A3 3 0 0 0 14 14M7.5 7.8C4 9.5 2 12 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8M12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.4",
};

export default function UsuariosPage() {
  usePageTitle("Usuarios | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rows, setRows] = useState<UserListItem[]>([]);
  const [trashedUsers, setTrashedUsers] = useState<UserListItem[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [roles, setRoles] = useState<RoleDTO[]>([]);
  const [clientsList, setClientsList] = useState<Client[]>([]);
  const [driversList, setDriversList] = useState<Driver[]>([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<UserForm>(formDefault);
  const [clientSearch, setClientSearch] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const loadRoles = async () => {
    try {
      const response = await apiGet<RoleDTO[]>("/roles");
      setRoles(response || []);
      setForm((prev) => {
        if (prev.role) return prev;
        return { ...prev, role: response?.[0]?.name || "" };
      });
    } catch {
      setRoles([]);
      showToast("No se pudieron cargar roles", "error");
    }
  };

  const loadClientsList = async () => {
    try {
      const response = await apiGet<PaginatedResponse<Client>>("/clients?per_page=100");
      setClientsList(response.data || []);
    } catch {
      setClientsList([]);
    }
  };

  const loadDriversList = async () => {
    try {
      const response = await apiGet<Driver[]>("/drivers");
      setDriversList(Array.isArray(response) ? response : []);
    } catch {
      setDriversList([]);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", "25");
      if (search.trim()) params.set("search", search.trim());
      if (roleFilter !== "all") params.set("role", roleFilter);
      const response = await apiGet<PaginatedResponse<UserListItem>>(
        `/users?${params.toString()}`
      );
      setRows(response.data || []);
      setMeta({
        current_page: response.current_page || 1,
        last_page: response.last_page || 1,
        total: response.total || 0,
      });
    } catch {
      setRows([]);
      setMeta({ current_page: 1, last_page: 1, total: 0 });
      showToast("No se pudieron cargar usuarios", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRoles();
    void loadClientsList();
    void loadDriversList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, roleFilter]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("quickAction") === "new") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm((prev) => ({ ...formDefault, role: prev.role }));
      setModal("create");
      params.delete("quickAction");
      const next = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
    }
  }, []);

  const roleSummary = useMemo(() => {
    return roles.reduce<Record<string, number>>((acc, role) => {
      acc[role.name] = role.users_count || 0;
      return acc;
    }, {});
  }, [roles]);

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clientsList;
    const term = clientSearch.toLowerCase();
    return clientsList.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.company && c.company.toLowerCase().includes(term))
    );
  }, [clientsList, clientSearch]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchDraft.trim());
    setPage(1);
    void loadUsers();
  };

  const closeModal = () => {
    setModal(null);
    setForm((prev) => ({ ...formDefault, role: prev.role || roles[0]?.name || "" }));
    setClientSearch("");
  };

  const loadTrashed = async () => {
    try {
      const data = await apiGet<UserListItem[]>("/users-trashed");
      setTrashedUsers(Array.isArray(data) ? data : []);
    } catch {
      setTrashedUsers([]);
    }
  };

  const deleteUser = async (id: number) => {
    setDeleting(true);
    try {
      await apiSend(`/users/${id}`, "DELETE", {});
      showToast("Usuario enviado a la papelera", "success");
      setConfirmDeleteId(null);
      closeModal();
      await Promise.all([loadUsers(), loadRoles()]);
    } catch {
      showToast("No se pudo eliminar el usuario", "error");
    } finally {
      setDeleting(false);
    }
  };

  const restoreUser = async (id: number) => {
    try {
      await apiSend(`/users/${id}/restore`, "POST", {});
      showToast("Usuario restaurado", "success");
      await loadTrashed();
      await Promise.all([loadUsers(), loadRoles()]);
    } catch {
      showToast("No se pudo restaurar", "error");
    }
  };

  const openCreate = () => {
    setForm({ ...formDefault, role: roles[0]?.name || "" });
    setModal("create");
  };

  const openEdit = async (id: number) => {
    try {
      const response = await apiGet<UserDetailDTO>(`/users/${id}`);
      const userRoles = normalizeRoles(response.roles);
      setForm({
        id: response.id,
        name: response.name || "",
        email: response.email || "",
        phone: response.phone || "",
        password: "",
        role: userRoles[0] || roles[0]?.name || "",
        client_id: response.client_id || 0,
        driver_id: response.driver_id || 0,
      });
      setModal("edit");
    } catch {
      showToast("No se pudo cargar el detalle del usuario", "error");
    }
  };

  const saveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.role) {
      showToast("Selecciona un rol", "error");
      return;
    }
    if (!form.id && form.password.trim().length < 8) {
      showToast("La contrasena debe tener minimo 8 caracteres", "error");
      return;
    }

    const isClientRole = form.role === "cliente" || form.role === "client";
    const isDriverRole = form.role === "driver" || form.role === "conductor";
    if (isClientRole && !form.client_id) {
      showToast("Debes asociar el usuario a un cliente", "error");
      return;
    }
    if (isDriverRole && !form.driver_id) {
      showToast("Debes asociar el usuario a un piloto", "error");
      return;
    }

    setSaving(true);
    try {
      if (form.id) {
        const payload: Record<string, unknown> = {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          client_id: isClientRole ? form.client_id : null,
          driver_id: isDriverRole ? form.driver_id : null,
        };
        if (form.password.trim()) payload.password = form.password.trim();
        await apiSend(`/users/${form.id}`, "PUT", payload);
        showToast("Usuario actualizado", "success");
      } else {
        await apiSend("/users", "POST", {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          password: form.password.trim(),
          role: form.role,
          client_id: isClientRole ? form.client_id : null,
          driver_id: isDriverRole ? form.driver_id : null,
        });
        showToast("Usuario creado", "success");
      }
      closeModal();
      await Promise.all([loadUsers(), loadRoles()]);
    } catch {
      showToast("No se pudo guardar usuario", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Usuarios</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Administra cuentas, roles y permisos del panel.
            </p>
          </div>
          <form onSubmit={submitSearch} className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Buscar por nombre o email"
              className="h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
            <select
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value);
                setPage(1);
              }}
              className="h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            >
              <option value="all">Todos los roles</option>
              {roles.map((role) => (
                <option key={role.name} value={role.name}>
                  {toTitle(role.name)}
                </option>
              ))}
            </select>
            <button className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]">
              Buscar
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
            >
              Nuevo usuario
            </button>
            <button
              type="button"
              onClick={() => { setShowTrash(!showTrash); if (!showTrash) void loadTrashed(); }}
              className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-all duration-150 active:scale-95 ${
                showTrash
                  ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                  : "border-slate-300 text-slate-600 dark:border-[#2a2a3e] dark:text-slate-300"
              }`}
            >
              <UserIcon path={userIconPaths.trash} />
              Papelera
            </button>
          </form>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total usuarios</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-[#e0e0e0]">{meta.total}</p>
        </article>
        {roles.slice(0, 3).map((role) => (
          <article key={role.name} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <p className="text-xs text-slate-500 dark:text-slate-400">{toTitle(role.name)}</p>
            <p className="mt-1 text-xl font-bold text-primary">{roleSummary[role.name] || 0}</p>
          </article>
        ))}
      </section>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 dark:bg-[#23233b]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-sm text-slate-500 dark:text-slate-400">No hay usuarios para este filtro.</p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-3 min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
          >
            Crear primer usuario
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Mostrando {rows.length} de {meta.total} resultados
          </p>

          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#2a2a3e] dark:bg-[#1a1a2e] lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-[#16162a] dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Nombre</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Telefono</th>
                    <th className="px-3 py-3">Rol</th>
                    <th className="px-3 py-3">Permisos</th>
                    <th className="px-3 py-3">Creado</th>
                    <th className="px-3 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((user) => {
                    const role = normalizeRoles(user.role_names)[0] || "sin_rol";
                    return (
                      <tr key={user.id} className="border-t border-slate-100 dark:border-[#2a2a3e]">
                        <td className="px-3 py-3 font-semibold text-slate-900 dark:text-[#e0e0e0]">{user.name}</td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{user.email}</td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{user.phone || "-"}</td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                            {toTitle(role)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{user.permissions_count}</td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{formatDate(user.created_at)}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(user.id)}
                              className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(user.id)}
                              className="min-h-11 rounded border border-rose-300 px-2 py-1 text-xs text-rose-600 transition-all duration-150 active:scale-95 dark:border-rose-500/30 dark:text-rose-400"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 lg:hidden">
            {rows.map((user) => {
              const role = normalizeRoles(user.role_names)[0] || "sin_rol";
              return (
                <article
                  key={user.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">{user.name}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{user.phone || "-"}</p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                      {toTitle(role)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 dark:bg-[#16162a]">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Permisos</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-[#e0e0e0]">{user.permissions_count}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Creado</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-[#e0e0e0]">{formatDate(user.created_at)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(user.id)}
                      className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(user.id)}
                      className="min-h-11 rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-600 transition-all duration-150 active:scale-95 dark:border-rose-500/30 dark:text-rose-400"
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <Pagination currentPage={meta.current_page} lastPage={meta.last_page} onPageChange={setPage} />
        </>
      )}

      {modal === "create" || modal === "edit" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <form
            onSubmit={saveUser}
            className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl"
          >
            <h2 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">
              {modal === "create" ? "Nuevo usuario" : "Editar usuario"}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Nombre completo</label>
                <input
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Ej: Juan Pérez"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Teléfono</label>
                <input
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="Ej: 320 111 2222"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Rol</label>
                <select
                  required
                  value={form.role}
                  onChange={(event) => {
                    const nextRole = event.target.value;
                    setForm({
                      ...form,
                      role: nextRole,
                      client_id: nextRole === "client" || nextRole === "cliente" ? form.client_id : 0,
                      driver_id: nextRole === "driver" || nextRole === "conductor" ? form.driver_id : 0,
                    });
                  }}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                >
                  <option value="" disabled>
                    Selecciona un rol
                  </option>
                  {roles.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.label || toTitle(r.name)}
                    </option>
                  ))}
                </select>
              </div>
              {(form.role === "cliente" || form.role === "client") && (
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Asociar a un Cliente Comercial / Empresa
                  </label>
                  <input
                    value={clientSearch}
                    onChange={(event) => setClientSearch(event.target.value)}
                    placeholder="Escribe para buscar cliente por nombre o empresa..."
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                  />
                  <select
                    required
                    value={form.client_id || ""}
                    onChange={(event) => setForm({ ...form, client_id: Number(event.target.value) })}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                  >
                    <option value="" disabled>
                      {filteredClients.length > 0
                        ? "Selecciona un cliente de la lista..."
                        : "No se encontraron clientes coincidentes"}
                    </option>
                    {filteredClients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name} {client.company ? `(${client.company})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(form.role === "driver" || form.role === "conductor") && (
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Asociar a un piloto operativo
                  </label>
                  <select
                    required
                    value={form.driver_id || ""}
                    onChange={(event) => setForm({ ...form, driver_id: Number(event.target.value) })}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                  >
                    <option value="" disabled>
                      Selecciona el piloto que usara esta cuenta
                    </option>
                    {driversList.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name} {driver.plate ? `(${driver.plate})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Sin esta asociacion la app repartidor no puede cargar rutas ni pedidos.
                  </p>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Email</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="usuario@ejemplo.com"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {form.id ? "Nueva contraseña (opcional)" : "Contraseña"}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder={form.id ? "Dejar vacío para no cambiar" : "Mín. 8 caracteres"}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <UserIcon path={showPassword ? userIconPaths.eyeOff : userIconPaths.eye} className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {modal === "edit" && form.id ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(form.id)}
                    className="flex items-center gap-2 rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-600 transition-all duration-150 hover:bg-rose-50 active:scale-95 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    <UserIcon path={userIconPaths.trash} />
                    Eliminar usuario
                  </button>
                ) : null}
              </div>
              <div className="grid gap-2 sm:flex">
                <button
                  type="button"
                  onClick={closeModal}
                  className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                >
                  Cancelar
                </button>
                <button
                  disabled={saving}
                  className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {/* Papelera */}
      {showTrash && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-500/20 dark:bg-rose-500/5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-rose-700 dark:text-rose-300">
            <UserIcon path={userIconPaths.trash} />
            Papelera - Usuarios eliminados
          </h3>
          {trashedUsers.length === 0 ? (
            <p className="text-sm text-slate-500">La papelera está vacía.</p>
          ) : (
            <div className="space-y-2">
              {trashedUsers.map((u) => (
                <div key={u.id} className="flex flex-col gap-3 rounded-lg border border-rose-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between dark:border-rose-500/20 dark:bg-[#1a1a2e]">
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email} · {normalizeRoles(u.role_names)[0] || "sin rol"}</p>
                  </div>
                  <button
                    onClick={() => restoreUser(u.id)}
                    className="min-h-11 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition-all duration-150 active:scale-95 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  >
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmación eliminar */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl animate-fade-in dark:bg-[#1a1a2e]">
            <h3 className="text-base font-bold text-slate-900 dark:text-[#e0e0e0]">¿Eliminar usuario?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              El usuario será enviado a la papelera y se cerrarán todas sus sesiones activas.
              Puedes restaurarlo después.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e]"
              >
                Cancelar
              </button>
              <button
                disabled={deleting}
                onClick={() => deleteUser(confirmDeleteId)}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
              >
                {deleting ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
