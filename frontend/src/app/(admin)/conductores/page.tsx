"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend, describeApiError } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import type { Driver, DriverDetail, PaginatedResponse } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  CurrencyInput,
  KpiCard,
  MobileListCard,
  Select,
  StatusBadge,
} from "@/components/ui";

function PilotIcon({
  path,
  className = "h-4 w-4",
}: {
  path: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`${className} fill-none stroke-current stroke-2`}
    >
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const iconPaths = {
  trash: "M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13M10 11v5M14 11v5",
  phone:
    "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM11 18h2",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff:
    "M3 3l18 18M10.6 10.6A3 3 0 0 0 14 14M7.5 7.8C4 9.5 2 12 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8M12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.4",
};

type DriverForm = {
  id: number;
  name: string;
  phone: string;
  email: string;
  password: string;
  has_user_access: boolean;
  vehicle: string;
  plate: string;
  zone: string;
  per_package_rate: number;
};

const formDefault: DriverForm = {
  id: 0,
  name: "",
  phone: "",
  email: "",
  password: "",
  has_user_access: false,
  vehicle: "",
  plate: "",
  zone: "",
  per_package_rate: 3000,
};

const driverDocumentStatusLabel: Record<string, string> = {
  ok: "Completo",
  complete: "Completo",
  missing: "Faltantes",
  warning: "Por vencer",
  expired: "Vencido",
  critical: "Crítico",
};
const driverDocumentStatusTone: Record<
  string,
  "success" | "warning" | "danger" | "neutral"
> = {
  ok: "success",
  complete: "success",
  missing: "neutral",
  warning: "warning",
  expired: "danger",
  critical: "danger",
};

function driverDocumentAttentionScore(driver: Driver): number {
  const documents = driver.documents;
  if (!documents) return 0;
  return (
    documents.count_expired * 100 +
    documents.count_missing * 70 +
    documents.count_warning * 35 +
    documents.needs_attention_count * 5
  );
}

function driverStatusLabel(status: Driver["status"]): string {
  return status === "inactive"
    ? "Inactivo"
    : status === "route"
      ? "En ruta"
      : "Activo";
}

export default function ConductoresPage() {
  usePageTitle("Pilotos Repartidores | Danhei Express");
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggleLoadingId, setToggleLoadingId] = useState<number | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trashedDrivers, setTrashedDrivers] = useState<Driver[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [documentFilter, setDocumentFilter] = useState<
    "all" | "critical" | "missing" | "warning" | "expired" | "complete"
  >("all");
  const [modal, setModal] = useState<"create" | "edit" | "detail" | null>(null);
  const [form, setForm] = useState<DriverForm>(formDefault);
  const [selected, setSelected] = useState<DriverDetail | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const loadDrivers = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (documentFilter !== "all")
        params.set("document_status", documentFilter);
      const response = await apiGet<PaginatedResponse<Driver> | Driver[]>(
        `/drivers${params.toString() ? `?${params.toString()}` : ""}`,
      );
      setDrivers(Array.isArray(response) ? response : response.data || []);
    } catch (error) {
      const presentation = describeApiError(
        error,
        "No fue posible cargar los pilotos.",
      );
      setDrivers([]);
      setLoadError(presentation.message);
      showToast(presentation.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, documentFilter]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const queryDocument = params.get("document");
    let timer: number | null = null;
    if (
      queryDocument &&
      ["critical", "missing", "warning", "expired", "complete"].includes(
        queryDocument,
      ) &&
      documentFilter === "all"
    ) {
      timer = window.setTimeout(
        () =>
          setDocumentFilter(
            queryDocument as
              "critical" | "missing" | "warning" | "expired" | "complete",
          ),
        0,
      );
    }
    if (params.get("quickAction") === "new") {
      window.setTimeout(() => setModal("create"), 0);
      params.delete("quickAction");
      const next = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${next ? `?${next}` : ""}`,
      );
    }
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [documentFilter, searchParams]);

  const summary = useMemo(
    () => ({
      active: drivers.filter((driver) => driver.status !== "inactive").length,
      assigned: drivers.reduce(
        (sum, driver) => sum + Number(driver.active_shipments_count || 0),
        0,
      ),
      delivered: drivers.reduce(
        (sum, driver) => sum + Number(driver.delivered_today_count || 0),
        0,
      ),
      criticalDocuments: drivers.filter(
        (driver) => driver.document_status && driver.document_status !== "ok",
      ).length,
    }),
    [drivers],
  );

  const documentAttentionDrivers = useMemo(
    () =>
      drivers
        .filter((driver) => (driver.documents?.needs_attention_count || 0) > 0)
        .sort(
          (left, right) =>
            driverDocumentAttentionScore(right) -
            driverDocumentAttentionScore(left),
        )
        .slice(0, 5),
    [drivers],
  );

  const closeModal = () => {
    setModal(null);
    setForm(formDefault);
    setShowPassword(false);
  };
  const loadTrashed = async () => {
    try {
      const data = await apiGet<Driver[]>("/drivers-trashed");
      setTrashedDrivers(Array.isArray(data) ? data : []);
    } catch {
      setTrashedDrivers([]);
    }
  };

  const deleteDriver = async (id: number) => {
    setDeleting(true);
    try {
      await apiSend(`/drivers/${id}/delete`, "POST", {});
      showToast("Piloto enviado a la papelera", "success");
      setConfirmDeleteId(null);
      closeModal();
      await loadDrivers();
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el piloto",
        "error",
      );
    } finally {
      setDeleting(false);
    }
  };

  const restoreDriver = async (id: number) => {
    try {
      await apiSend(`/drivers/${id}/restore`, "POST", {});
      showToast("Piloto restaurado", "success");
      await loadTrashed();
      await loadDrivers();
    } catch {
      showToast("No se pudo restaurar", "error");
    }
  };

  const submitDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: Partial<DriverForm> = { ...form };
      if (!payload.password) delete payload.password;
      delete payload.has_user_access;
      if (form.id) {
        await apiSend(`/drivers/${form.id}`, "PUT", payload);
        showToast("Piloto actualizado", "success");
      } else {
        await apiSend("/drivers", "POST", payload);
        showToast("Piloto creado con acceso a la app", "success");
      }
      closeModal();
      await loadDrivers();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "No se pudo guardar piloto",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (id: number) => {
    try {
      setToggleLoadingId(id);
      await apiSend(`/drivers/${id}/toggle-status`, "POST", {});
      showToast("Estado del piloto actualizado", "success");
      await loadDrivers();
    } catch {
      showToast("No se pudo cambiar estado del piloto", "error");
    } finally {
      setToggleLoadingId(null);
    }
  };

  const openDetail = async (id: number) => {
    try {
      const detail = await apiGet<DriverDetail>(`/drivers/${id}`);
      setSelected(detail);
      setModal("detail");
    } catch {
      showToast("No se pudo cargar detalle", "error");
    }
  };

  const openEdit = (driver: Driver) => {
    setForm({
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      email: driver.user?.email || "",
      password: "",
      has_user_access: Boolean(driver.user?.email),
      vehicle: driver.vehicle || "",
      plate: driver.plate || "",
      zone: driver.zone || "",
      per_package_rate: driver.per_package_rate || 3000,
    });
    setModal("edit");
  };

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex flex-col gap-4 rounded-card border border-edge bg-surface p-5 shadow-soft md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            Operación de última milla
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">
            Pilotos repartidores
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Quién está disponible y con papeles al día.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:flex">
          <Select
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as "all" | "active" | "inactive",
              )
            }
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </Select>
          <Select
            aria-label="Filtrar por expediente"
            value={documentFilter}
            onChange={(event) =>
              setDocumentFilter(
                event.target.value as
                  | "all"
                  | "critical"
                  | "missing"
                  | "warning"
                  | "expired"
                  | "complete",
              )
            }
          >
            <option value="all">Todos los expedientes</option>
            <option value="critical">Críticos</option>
            <option value="missing">Con faltantes</option>
            <option value="warning">Por vencer</option>
            <option value="expired">Vencidos</option>
            <option value="complete">Completos</option>
          </Select>
          <Button
            onClick={() => {
              setForm(formDefault);
              setModal("create");
            }}
          >
            Nuevo piloto
          </Button>
          <Button
            variant={showTrash ? "secondary" : "ghost"}
            onClick={() => {
              setShowTrash(!showTrash);
              if (!showTrash) void loadTrashed();
            }}
          >
            <PilotIcon path={iconPaths.trash} />
            Papelera
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Activos"
          value={summary.active}
          support="Disponibles o en ruta"
          tone="success"
        />
        <KpiCard
          label="Envíos asignados"
          value={summary.assigned}
          support="Operación actual"
          tone="info"
        />
        <KpiCard
          label="Entregas hoy"
          value={summary.delivered}
          support="Confirmadas por API"
          tone="brand"
        />
        <KpiCard
          label="Expedientes con alerta"
          value={summary.criticalDocuments}
          support="Requieren revisión"
          tone="danger"
        />
      </section>

      {documentAttentionDrivers.length > 0 ? (
        <Card
          title="Alertas documentales proactivas"
          headerAction={
            <Badge tone="warning">
              {documentAttentionDrivers.length} priorizados
            </Badge>
          }
        >
          <p className="-mt-2 text-sm text-ink-secondary">
            Pilotos con documentos vencidos, faltantes o próximos a vencer.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {documentAttentionDrivers.map((driver) => (
              <Link
                key={`doc-alert-${driver.id}`}
                href={`/conductores/${driver.id}`}
                className="rounded-card border border-warning/30 bg-app-secondary p-4 transition hover:border-warning"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{driver.name}</p>
                    <p className="mt-1 text-xs text-ink-secondary">
                      {driver.zone || "Sin zona"} ·{" "}
                      {driver.phone || "Sin teléfono"}
                    </p>
                  </div>
                  {driver.document_status ? (
                    <StatusBadge
                      status={driver.document_status}
                      label={
                        driverDocumentStatusLabel[driver.document_status] ||
                        driver.document_status
                      }
                      tone={driverDocumentStatusTone[driver.document_status]}
                    />
                  ) : null}
                </div>
                {driver.documents ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-button bg-surface p-2">
                      <p className="text-ink-secondary">Vencidos</p>
                      <p className="mt-1 font-semibold text-danger">
                        {driver.documents.count_expired}
                      </p>
                    </div>
                    <div className="rounded-button bg-surface p-2">
                      <p className="text-ink-secondary">Faltantes</p>
                      <p className="mt-1 font-semibold text-ink">
                        {driver.documents.count_missing}
                      </p>
                    </div>
                    <div className="rounded-button bg-surface p-2">
                      <p className="text-ink-secondary">Por vencer</p>
                      <p className="mt-1 font-semibold text-ink">
                        {driver.documents.count_warning}
                      </p>
                    </div>
                  </div>
                ) : null}
                <p className="mt-3 text-xs font-semibold text-brand">
                  Abrir expediente →
                </p>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {loadError ? (
        <Card
          className="border-danger/30"
          title="No se pudo cargar la operación"
        >
          <p className="text-sm text-danger" role="alert">
            {loadError}
          </p>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => void loadDrivers()}
          >
            Reintentar
          </Button>
        </Card>
      ) : null}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-52" />
          ))}
        </div>
      ) : !loadError && drivers.length === 0 ? (
        <EmptyState
          title="No hay pilotos para este filtro"
          description="Prueba con otro estado o expediente."
        />
      ) : !loadError ? (
        <Card
          title="Equipo operativo"
          headerAction={
            <Badge tone="neutral">{drivers.length} registros</Badge>
          }
          flush
        >
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink-secondary">
                <tr>
                  <th className="px-6 py-3">Piloto</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3">Vehículo</th>
                  <th className="px-3 py-3">Actividad</th>
                  <th className="px-3 py-3">Expediente</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => (
                  <tr key={driver.id} className="border-t border-edge">
                    <td className="px-6 py-4">
                      <p className="font-display font-semibold text-ink">
                        {driver.name}
                      </p>
                      <p className="text-xs text-ink-secondary">
                        {driver.phone || "Sin teléfono"}
                      </p>
                    </td>
                    <td className="px-3 py-4">
                      <StatusBadge
                        status={driver.status}
                        label={driverStatusLabel(driver.status)}
                        tone={
                          driver.status === "inactive"
                            ? "neutral"
                            : driver.status === "route"
                              ? "info"
                              : "success"
                        }
                      />
                    </td>
                    <td className="px-3 py-4 text-ink">
                      <p>{driver.vehicle || "Sin vehículo"}</p>
                      <p className="text-xs text-ink-secondary">
                        {driver.plate || "Sin placa"} ·{" "}
                        {driver.zone || "Sin zona"}
                      </p>
                    </td>
                    <td className="px-3 py-4 text-ink">
                      <p>{driver.active_shipments_count || 0} asignados</p>
                      <p className="text-xs text-ink-secondary">
                        {driver.delivered_today_count || 0} entregados hoy
                      </p>
                    </td>
                    <td className="px-3 py-4">
                      {driver.document_status ? (
                        <StatusBadge
                          status={driver.document_status}
                          label={
                            driverDocumentStatusLabel[driver.document_status] ||
                            driver.document_status
                          }
                          tone={
                            driverDocumentStatusTone[driver.document_status]
                          }
                        />
                      ) : (
                        <Badge tone="neutral">Sin dato</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Ver detalle de ${driver.name}`}
                          onClick={() => void openDetail(driver.id)}
                        >
                          <PilotIcon path={iconPaths.eye} />
                        </Button>
                        <Link
                          href={`/conductores/${driver.id}`}
                          className="inline-flex h-10 items-center rounded-button px-3 text-sm font-semibold text-brand hover:bg-brand-soft"
                        >
                          Abrir ficha
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Editar ${driver.name}`}
                          onClick={() => openEdit(driver)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void toggleStatus(driver.id)}
                          disabled={toggleLoadingId === driver.id}
                        >
                          {toggleLoadingId === driver.id
                            ? "Guardando"
                            : driver.status === "inactive"
                              ? "Activar"
                              : "Inactivar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-4 lg:hidden">
            {drivers.map((driver) => (
              <MobileListCard
                key={driver.id}
                title={driver.name}
                subtitle={`${driver.phone || "Sin teléfono"} · ${driver.vehicle || "Sin vehículo"}`}
                meta={`${driver.active_shipments_count || 0} asignados · ${driver.delivered_today_count || 0} entregados hoy · ${driver.plate || "Sin placa"}`}
                status={
                  <StatusBadge
                    status={driver.status}
                    label={driverStatusLabel(driver.status)}
                    tone={
                      driver.status === "inactive"
                        ? "neutral"
                        : driver.status === "route"
                          ? "info"
                          : "success"
                    }
                  />
                }
                action={
                  <div className="flex flex-wrap gap-2">
                    {driver.document_status ? (
                      <StatusBadge
                        status={driver.document_status}
                        label={`Expediente: ${driverDocumentStatusLabel[driver.document_status] || driver.document_status}`}
                        tone={driverDocumentStatusTone[driver.document_status]}
                      />
                    ) : null}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void openDetail(driver.id)}
                    >
                      Detalle
                    </Button>
                    <Link
                      href={`/conductores/${driver.id}`}
                      className="inline-flex h-10 items-center rounded-button px-3 text-sm font-semibold text-brand hover:bg-brand-soft"
                    >
                      Abrir ficha
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(driver)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void toggleStatus(driver.id)}
                      disabled={toggleLoadingId === driver.id}
                    >
                      {driver.status === "inactive" ? "Activar" : "Inactivar"}
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        </Card>
      ) : null}

      {showTrash ? (
        <Card
          className="border-danger/20"
          title="Papelera de pilotos"
          headerAction={<Badge tone="neutral">{trashedDrivers.length}</Badge>}
        >
          {trashedDrivers.length === 0 ? (
            <EmptyState
              title="La papelera está vacía"
              description="Los pilotos eliminados aparecerán aquí para restaurarlos."
            />
          ) : (
            <div className="space-y-3">
              {trashedDrivers.map((driver) => (
                <div
                  key={driver.id}
                  className="flex flex-col gap-3 rounded-card border border-edge p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-ink">{driver.name}</p>
                    <p className="text-xs text-ink-secondary">
                      {driver.phone} · {driver.vehicle || "-"} ·{" "}
                      {driver.zone || "-"}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => void restoreDriver(driver.id)}
                  >
                    Restaurar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {modal === "create" || modal === "edit" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
          <form
            onSubmit={submitDriver}
            className="max-h-[100dvh] w-full overflow-y-auto rounded-t-card bg-surface p-5 shadow-soft sm:max-h-[90vh] sm:max-w-xl sm:rounded-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                  Ficha operativa
                </p>
                <h2 className="mt-1 font-display text-xl font-bold text-ink">
                  {modal === "create"
                    ? "Nuevo piloto repartidor"
                    : "Editar piloto"}
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                aria-label="Cerrar"
                onClick={closeModal}
              >
                ×
              </Button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Input
                label="Nombre completo"
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="Ej: Juan Pérez"
                wrapperClassName="sm:col-span-2"
              />
              <Input
                label="Teléfono"
                required
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
                placeholder="Ej: 320 111 2222"
              />
              <Input
                label="Vehículo"
                value={form.vehicle}
                onChange={(event) =>
                  setForm({ ...form, vehicle: event.target.value })
                }
                placeholder="Ej: Moto, Furgón"
              />
              <Input
                label="Placa"
                value={form.plate}
                onChange={(event) =>
                  setForm({ ...form, plate: event.target.value })
                }
                placeholder="Ej: ABC123"
              />
              <Input
                label="Zona base"
                value={form.zone}
                onChange={(event) =>
                  setForm({ ...form, zone: event.target.value })
                }
                placeholder="Ej: Chapinero"
              />
              <CurrencyInput
                label="Tarifa por paquete"
                value={form.per_package_rate}
                onValueChange={(val) =>
                  setForm({
                    ...form,
                    per_package_rate: val,
                  })
                }
              />
              <div className="border-t border-edge pt-4 sm:col-span-2">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand">
                  <PilotIcon path={iconPaths.phone} />
                  Acceso App Piloto
                </p>
                <p className="mt-2 text-xs text-ink-secondary">
                  {modal === "create"
                    ? "El piloto usará este correo y contraseña para iniciar sesión en la app móvil."
                    : "Puedes cambiar el correo o contraseña del piloto."}
                </p>
              </div>
              {modal === "edit" && !form.has_user_access ? (
                <p className="text-xs font-medium text-ink sm:col-span-2">
                  Este piloto todavía no tiene acceso a la app. Define correo y
                  contraseña para crearlo.
                </p>
              ) : null}
              <Input
                label="Correo electrónico"
                required
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                placeholder="piloto@ejemplo.com"
              />
              <div className="relative">
                <Input
                  label={
                    modal === "create" || !form.has_user_access
                      ? "Contraseña"
                      : "Nueva contraseña (opcional)"
                  }
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) =>
                    setForm({ ...form, password: event.target.value })
                  }
                  required={
                    modal === "create" ||
                    (modal === "edit" && !form.has_user_access)
                  }
                  minLength={6}
                  placeholder={
                    modal === "create" || !form.has_user_access
                      ? "Mínimo 6 caracteres"
                      : "Dejar vacío para no cambiar"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  className="absolute right-3 top-8 rounded-button p-2 text-ink-secondary"
                >
                  <PilotIcon
                    path={showPassword ? iconPaths.eyeOff : iconPaths.eye}
                    className="h-5 w-5"
                  />
                </button>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {modal === "edit" && form.id ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmDeleteId(form.id)}
                  >
                    <PilotIcon path={iconPaths.trash} />
                    Eliminar piloto
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={closeModal}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar piloto"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {modal === "detail" && selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[100dvh] w-full overflow-y-auto rounded-t-card bg-surface p-5 shadow-soft sm:max-h-[90vh] sm:max-w-xl sm:rounded-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                  Detalle del piloto
                </p>
                <h2 className="mt-1 font-display text-xl font-bold text-ink">
                  {selected.name}
                </h2>
              </div>
              <Button
                variant="ghost"
                aria-label="Cerrar"
                onClick={() => setModal(null)}
              >
                ×
              </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-ink-secondary">Teléfono</p>
                <p className="font-medium text-ink">{selected.phone || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-ink-secondary">Estado</p>
                <StatusBadge
                  status={selected.status}
                  label={driverStatusLabel(selected.status)}
                  tone={
                    selected.status === "inactive"
                      ? "neutral"
                      : selected.status === "route"
                        ? "info"
                        : "success"
                  }
                />
              </div>
              <div>
                <p className="text-xs text-ink-secondary">Vehículo</p>
                <p className="font-medium text-ink">
                  {selected.vehicle || "-"} · {selected.plate || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-secondary">Zona base</p>
                <p className="font-medium text-ink">{selected.zone || "-"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-ink-secondary">Correo de la app</p>
                <p className="break-all font-medium text-ink">
                  {selected.user?.email || "Sin acceso configurado"}
                </p>
              </div>
            </div>
            {selected.today_summary ? (
              <Card className="mt-5" title="Resumen del día">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-ink-secondary">Asignados</p>
                    <p className="font-display text-xl font-bold text-ink">
                      {selected.today_summary.assigned}
                    </p>
                  </div>
                  <div>
                    <p className="text-ink-secondary">Entregados</p>
                    <p className="font-display text-xl font-bold text-success">
                      {selected.today_summary.delivered}
                    </p>
                  </div>
                  <div>
                    <p className="text-ink-secondary">Recaudado</p>
                    <p className="font-semibold text-ink">
                      {formatCOP(selected.today_summary.cash_collected)}
                    </p>
                  </div>
                  <div>
                    <p className="text-ink-secondary">Pendiente</p>
                    <p className="font-semibold text-danger">
                      {formatCOP(selected.today_summary.pending_cash)}
                    </p>
                  </div>
                </div>
              </Card>
            ) : null}
            <div className="mt-5 flex justify-end">
              <Button variant="secondary" onClick={() => setModal(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeleteId !== null ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
          <Card className="w-full max-w-sm" title="¿Eliminar piloto?">
            <p className="text-sm text-ink-secondary">
              El piloto será enviado a la papelera y su acceso a la app se
              desactivará. Puedes restaurarlo después.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={deleting}
                onClick={() => void deleteDriver(confirmDeleteId)}
              >
                {deleting ? "Eliminando…" : "Sí, eliminar"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
