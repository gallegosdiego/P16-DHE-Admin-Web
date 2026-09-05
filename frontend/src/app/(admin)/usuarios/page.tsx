"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatDate, toTitle } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";
import { usePageTitle } from "@/lib/page-title";
import {
  Badge,
  Button,
  Card,
  FieldWrapper,
  Input,
  HelpTip,
  KpiCard,
  SearchInput,
  Select,
} from "@/components/ui";
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
  plus: "M12 5v14M5 12h14",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  rotate: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5",
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

  const etiquetaRol = useMemo(() => {
    const mapa = new Map(roles.map((r) => [r.name, r.label || toTitle(r.name)]));
    return (nombre: string) => mapa.get(nombre) || toTitle(nombre);
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
      showToast("La contraseña debe tener mínimo 8 caracteres", "error");
      return;
    }

    const isClientRole = form.role === "client";
    const isDriverRole = form.role === "driver";
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
          password: form.password.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          client_id: isClientRole ? form.client_id : null,
          driver_id: isDriverRole ? form.driver_id : null,
        });
        showToast("Usuario creado con éxito", "success");
      }
      closeModal();
      await Promise.all([loadUsers(), loadRoles()]);
    } catch {
      showToast(form.id ? "No se pudo actualizar el usuario" : "No se pudo crear el usuario", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header & Title */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-primary">
            Usuarios del sistema
          </h1>
          <p className="text-xs text-ink-secondary">
            Administración de cuentas, perfiles de acceso y permisos operativos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void loadTrashed();
              setShowTrash(true);
            }}
          >
            <UserIcon path={userIconPaths.trash} className="mr-1.5 h-4 w-4" />
            Papelera
          </Button>
          <Button variant="primary" size="sm" onClick={openCreate}>
            <UserIcon path={userIconPaths.plus} className="mr-1.5 h-4 w-4" />
            Nuevo Usuario
          </Button>
        </div>
      </div>

      {/* Role KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total Usuarios" value={meta.total} tone="brand" />
        {roles.slice(0, 3).map((role) => (
          <KpiCard
            key={role.name}
            label={role.label || toTitle(role.name)}
            value={roleSummary[role.name] || 0}
            tone={role.name === "admin" ? "success" : "default"}
          />
        ))}
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form onSubmit={submitSearch} className="flex-1">
            <SearchInput
              placeholder="Buscar por nombre, correo o teléfono..."
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
          </form>
          <div className="flex items-center gap-2">
            <Select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-48"
            >
              <option value="all">Todos los roles</option>
              {roles.map((role) => (
                <option key={role.name} value={role.name}>
                  {role.label || toTitle(role.name)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* User Listing */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-sm font-medium text-ink-secondary">
            No se encontraron usuarios con los criterios ingresados.
          </p>
        </Card>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden rounded-xl border border-border bg-card shadow-soft md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-subtle text-xs font-bold uppercase tracking-wider text-ink-tertiary">
                <tr>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Teléfono</th>
                  <th className="px-4 py-3">Rol asignado</th>
                  <th className="px-4 py-3">Registro</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium text-ink-primary">
                {rows.map((user) => {
                  const userRoles = normalizeRoles(user.role_names);
                  const mainRole = userRoles[0] || "user";
                  return (
                    <tr key={user.id} className="transition-colors hover:bg-surface-subtle/50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-bold text-ink-primary">{user.name}</p>
                          <p className="text-xs text-ink-secondary">{user.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">
                        {user.phone || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            mainRole === "admin"
                              ? "brand"
                              : mainRole === "driver"
                              ? "success"
                              : mainRole === "client"
                              ? "info"
                              : "neutral"
                          }
                        >
                          {etiquetaRol(mainRole)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-tertiary">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void openEdit(user.id)}
                            title="Editar usuario"
                          >
                            <UserIcon path={userIconPaths.edit} className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger/10 hover:text-danger"
                            onClick={() => setConfirmDeleteId(user.id)}
                            title="Enviar a papelera"
                          >
                            <UserIcon path={userIconPaths.trash} className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View (375px) */}
          <div className="space-y-3 md:hidden">
            {rows.map((user) => {
              const userRoles = normalizeRoles(user.role_names);
              const mainRole = userRoles[0] || "user";
              return (
                <Card key={user.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-ink-primary">{user.name}</p>
                      <p className="text-xs text-ink-secondary">{user.email}</p>
                    </div>
                    <Badge
                      tone={
                        mainRole === "admin"
                          ? "brand"
                          : mainRole === "driver"
                          ? "success"
                          : mainRole === "client"
                          ? "info"
                          : "neutral"
                      }
                    >
                      {etiquetaRol(mainRole)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-ink-tertiary border-t border-border pt-2">
                    <span>{user.phone || "Sin teléfono"}</span>
                    <span>{formatDate(user.created_at)}</span>
                  </div>
                  <div className="flex justify-end gap-2 pt-1 border-t border-border">
                    <Button variant="secondary" size="sm" onClick={() => void openEdit(user.id)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirmDeleteId(user.id)}>
                      Eliminar
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={page}
            lastPage={meta.last_page}
            onPageChange={setPage}
          />
        </>
      )}

      {/* Create / Edit Modal */}
      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-fade-in">
          <Card className="w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-display text-lg font-bold text-ink-primary">
                {modal === "create" ? "Nuevo Usuario" : "Editar Usuario"}
              </h2>
              <button onClick={closeModal} className="text-ink-tertiary hover:text-ink-primary">
                ✕
              </button>
            </div>

            <form onSubmit={saveUser} className="space-y-4">
              <FieldWrapper label="Nombre completo" required>
                {({ id }) => (
                  <Input
                    id={id}
                    required
                    placeholder="Ej: Carlos Mendoza"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                )}
              </FieldWrapper>

              <FieldWrapper label="Correo electrónico" required>
                {({ id }) => (
                  <Input
                    id={id}
                    required
                    type="email"
                    placeholder="usuario@danheiexpress.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                )}
              </FieldWrapper>

              <FieldWrapper label="Teléfono de contacto">
                {({ id }) => (
                  <Input
                    id={id}
                    type="tel"
                    placeholder="+57 311 000 0000"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                )}
              </FieldWrapper>

              <FieldWrapper label={modal === "create" ? "Contraseña" : "Nueva contraseña (opcional)"} required={modal === "create"}>
                {({ id }) => (
                  <div className="relative">
                    <Input
                      id={id}
                      required={modal === "create"}
                      type={showPassword ? "text" : "password"}
                      placeholder={modal === "create" ? "Mínimo 8 caracteres" : "Dejar en blanco para mantener actual"}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink-primary"
                    >
                      <UserIcon path={showPassword ? userIconPaths.eyeOff : userIconPaths.eye} />
                    </button>
                  </div>
                )}
              </FieldWrapper>

              <FieldWrapper label="Rol de usuario" required>
                {({ id }) => (
                  <Select
                    id={id}
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    {roles.map((role) => (
                      <option key={role.name} value={role.name}>
                        {role.label || toTitle(role.name)}
                      </option>
                    ))}
                  </Select>
                )}
              </FieldWrapper>

              {form.role === "client" && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <label htmlFor="user_client_select" className="text-sm font-medium text-ink">Vincular a cliente <span className="ml-0.5 text-brand">*</span></label>
                    <HelpTip topic="Vincular a cliente" text="El usuario tendrá acceso al portal del cliente seleccionado" />
                  </div>
                  <div className="space-y-2">
                    <Input
                      placeholder="Filtrar cliente..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                    />
                    <Select
                      id="user_client_select"
                      value={form.client_id}
                      onChange={(e) => setForm({ ...form, client_id: Number(e.target.value) })}
                    >
                      <option value={0}>Selecciona un cliente</option>
                      {filteredClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.company ? `${c.company} (${c.name})` : c.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              )}

              {form.role === "driver" && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <label htmlFor="user_driver_select" className="text-sm font-medium text-ink">Vincular a conductor/piloto <span className="ml-0.5 text-brand">*</span></label>
                    <HelpTip topic="Vincular a conductor/piloto" text="El usuario tendrá acceso a la App Repartidor" />
                  </div>
                  <Select
                    id="user_driver_select"
                    value={form.driver_id}
                    onChange={(e) => setForm({ ...form, driver_id: Number(e.target.value) })}
                  >
                    <option value={0}>Selecciona un piloto</option>
                    {driversList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.vehicle || "Vehículo N/A"})
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button type="button" variant="secondary" onClick={closeModal}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? "Guardando..." : modal === "create" ? "Crear Usuario" : "Guardar Cambios"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-fade-in">
          <Card className="w-full max-w-md p-6 space-y-4 text-center">
            <h3 className="font-display text-lg font-bold text-ink-primary">
              ¿Mover usuario a la papelera?
            </h3>
            <p className="text-xs text-ink-secondary">
              El usuario perderá acceso inmediato al sistema pero sus datos podrán ser restaurados posteriormente.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                className="bg-danger hover:bg-danger/90"
                disabled={deleting}
                onClick={() => void deleteUser(confirmDeleteId)}
              >
                {deleting ? "Eliminando..." : "Confirmar eliminación"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {/* Trash Modal */}
      {showTrash ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-fade-in">
          <Card className="w-full max-w-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-display text-lg font-bold text-ink-primary">
                Papelera de Usuarios
              </h2>
              <button onClick={() => setShowTrash(false)} className="text-ink-tertiary hover:text-ink-primary">
                ✕
              </button>
            </div>

            {trashedUsers.length === 0 ? (
              <p className="text-center text-sm text-ink-secondary py-8">
                La papelera de usuarios está vacía.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {trashedUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-bold text-sm text-ink-primary">{u.name}</p>
                      <p className="text-xs text-ink-secondary">{u.email}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void restoreUser(u.id)}
                    >
                      <UserIcon path={userIconPaths.rotate} className="mr-1.5 h-3.5 w-3.5" />
                      Restaurar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
