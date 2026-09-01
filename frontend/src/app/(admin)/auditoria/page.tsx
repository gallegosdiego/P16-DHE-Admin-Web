"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiGet } from "@/lib/api";
import { auditActionLabel, formatDate } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { usePageTitle } from "@/lib/page-title";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  KpiCard,
  MobileListCard,
  SearchInput,
  Select,
  type BadgeTone,
} from "@/components/ui";
import type { AuditLog, PaginatedResponse } from "@/lib/types";

const auditLogDate = (log: AuditLog) => log.occurred_at || log.created_at;

const auditLogMetadata = (log: AuditLog): Record<string, unknown> | null => {
  if (log.metadata && Object.keys(log.metadata).length > 0) return log.metadata;

  const metadata: Record<string, unknown> = {};
  if (log.old_values && Object.keys(log.old_values).length > 0) {
    metadata.old_values = log.old_values;
  }
  if (log.new_values && Object.keys(log.new_values).length > 0) {
    metadata.new_values = log.new_values;
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
};

function auditTone(action: string): BadgeTone {
  const normalized = action.toLowerCase();
  if (/(delete|purge|destroy|fail|revoke)/.test(normalized)) return "danger";
  if (/(restore|update|edit|change)/.test(normalized)) return "warning";
  if (/(login|auth|access)/.test(normalized)) return "info";
  return "brand";
}

function MetadataContent({ metadata }: { metadata: Record<string, unknown> }) {
  return (
    <pre className="max-w-full overflow-x-auto rounded-input bg-app-secondary p-3 text-xs leading-5 text-ink">
      {JSON.stringify(metadata, null, 2)}
    </pre>
  );
}

export default function AuditoriaPage() {
  usePageTitle("Auditoría | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [loadError, setLoadError] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [expandedMetadata, setExpandedMetadata] = useState<Record<number, boolean>>({});

  const loadLogs = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", "50");
      if (search.trim()) params.set("search", search.trim());
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (userFilter !== "all") params.set("user_id", userFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const response = await apiGet<PaginatedResponse<AuditLog>>(`/audit-logs?${params.toString()}`);
      setRows(response.data || []);
      setMeta({
        current_page: response.current_page || 1,
        last_page: response.last_page || 1,
        total: response.total || 0,
      });
    } catch (error) {
      setRows([]);
      setMeta({ current_page: 1, last_page: 1, total: 0 });
      const message = error instanceof Error ? error.message : "No se pudieron cargar logs de auditoría.";
      setLoadError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter, dateFrom, dateTo, page, search, userFilter]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((log) => {
      const createdAtDate = auditLogDate(log) ? new Date(auditLogDate(log)) : null;
      const user = log.user?.name || "";
      const description = log.description || "";
      const action = log.action || "";
      const matchesQuery = !query || (
        user.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query) ||
        action.toLowerCase().includes(query)
      );
      const matchesAction = actionFilter === "all" || action === actionFilter;
      const matchesUser = userFilter === "all" || String(log.user?.id || 0) === userFilter;
      const fromOk = !dateFrom || (createdAtDate ? createdAtDate >= new Date(`${dateFrom}T00:00:00`) : false);
      const toOk = !dateTo || (createdAtDate ? createdAtDate <= new Date(`${dateTo}T23:59:59`) : false);
      return matchesQuery && matchesAction && matchesUser && fromOk && toOk;
    });
  }, [actionFilter, dateFrom, dateTo, rows, search, userFilter]);

  const availableActions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.action).filter(Boolean))).sort(),
    [rows],
  );

  const availableUsers = useMemo(() => {
    const entries = rows
      .filter((row) => row.user?.id && row.user?.name)
      .map((row) => ({ id: row.user!.id, name: row.user!.name }));
    const unique = new Map<number, string>();
    entries.forEach((entry) => unique.set(entry.id, entry.name));
    return Array.from(unique.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft);
  };

  const clearFilters = () => {
    setPage(1);
    setSearchDraft("");
    setSearch("");
    setActionFilter("all");
    setUserFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="min-w-0 animate-fade-in space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Seguridad y trazabilidad</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">Auditoría</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-secondary">Historial de acciones sensibles del sistema.</p>
      </header>

      <Card title="Filtros de auditoría">
        <form onSubmit={submitSearch} className="space-y-3">
          <SearchInput
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Filtrar por usuario, acción o descripción"
            aria-label="Filtrar por usuario, acción o descripción"
            className="w-full"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Select
              aria-label="Filtrar por acción"
              value={actionFilter}
              onChange={(event) => {
                setPage(1);
                setActionFilter(event.target.value);
              }}
            >
              <option value="all">Todas las acciones</option>
              {availableActions.map((action) => <option key={action} value={action}>{auditActionLabel(action)}</option>)}
            </Select>
            <Select
              aria-label="Filtrar por usuario"
              value={userFilter}
              onChange={(event) => {
                setPage(1);
                setUserFilter(event.target.value);
              }}
            >
              <option value="all">Todos los usuarios</option>
              {availableUsers.map((user) => <option key={user.id} value={String(user.id)}>{user.name}</option>)}
            </Select>
            <Input
              type="date"
              aria-label="Fecha desde"
              value={dateFrom}
              onChange={(event) => {
                setPage(1);
                setDateFrom(event.target.value);
              }}
            />
            <Input
              type="date"
              aria-label="Fecha hasta"
              value={dateTo}
              onChange={(event) => {
                setPage(1);
                setDateTo(event.target.value);
              }}
            />
            <div className="flex gap-2">
              <Button type="submit" size="md" className="flex-1">Filtrar</Button>
              <Button type="button" variant="ghost" size="md" className="flex-1 border border-edge" onClick={clearFilters}>Limpiar</Button>
            </div>
          </div>
        </form>
      </Card>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Resumen de auditoría">
        <KpiCard label="Registros en página" value={rows.length} />
        <KpiCard label="Total de registros" value={meta.total} tone="brand" />
        <KpiCard label="Página" value={`${meta.current_page} / ${meta.last_page}`} tone="info" />
      </section>

      {loading ? (
        <div className="space-y-3" aria-label="Cargando auditoría">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-card bg-app-secondary" />
          ))}
        </div>
      ) : loadError ? (
        <Card title="Registros de auditoría">
          <div role="alert" className="rounded-input border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
            <p className="font-semibold">No se pudieron cargar los registros de auditoría.</p>
            <p className="mt-1 text-danger/80">{loadError}</p>
            <Button variant="secondary" size="md" className="mt-3" onClick={() => void loadLogs()}>Reintentar</Button>
          </div>
        </Card>
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title="Sin registros para este filtro"
          description="Cuando existan acciones auditables aparecerán aquí con su usuario y detalle."
        />
      ) : (
        <>
          <p className="text-sm text-ink-secondary">Mostrando {filteredRows.length} de {rows.length} en la página actual.</p>

          <Card flush className="hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-app-secondary text-left text-xs uppercase tracking-wide text-ink-secondary">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Usuario</th>
                    <th className="px-4 py-3">Acción</th>
                    <th className="px-4 py-3">Descripción</th>
                    <th className="px-4 py-3">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.flatMap((log) => {
                    const metadata = auditLogMetadata(log);
                    const items = [
                      <tr key={log.id} className="border-t border-edge">
                        <td className="px-4 py-3 text-ink-secondary">{formatDate(auditLogDate(log))}</td>
                        <td className="px-4 py-3 font-semibold text-ink">{log.user?.name || `Usuario #${log.user_id}`}</td>
                        <td className="px-4 py-3"><Badge tone={auditTone(log.action || "")}>{auditActionLabel(log.action || "sin_accion")}</Badge></td>
                        <td className="px-4 py-3 text-ink-secondary">{log.description || "Sin descripción"}</td>
                        <td className="px-4 py-3">
                          {metadata ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="border border-edge px-2"
                              onClick={() => setExpandedMetadata((prev) => ({ ...prev, [log.id]: !prev[log.id] }))}
                            >
                              {expandedMetadata[log.id] ? "Ocultar" : "Ver"} ({Object.keys(metadata).length})
                            </Button>
                          ) : <span className="text-xs text-ink-secondary">0 campos</span>}
                        </td>
                      </tr>,
                    ];
                    if (expandedMetadata[log.id] && metadata) {
                      items.push(
                        <tr key={`${log.id}-meta`} className="border-t border-edge">
                          <td className="px-4 py-3" colSpan={5}><MetadataContent metadata={metadata} /></td>
                        </tr>,
                      );
                    }
                    return items;
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="space-y-3 lg:hidden">
            {filteredRows.map((log) => {
              const metadata = auditLogMetadata(log);
              return (
                <MobileListCard
                  key={log.id}
                  title={log.user?.name || `Usuario #${log.user_id}`}
                  subtitle={log.description || "Sin descripción"}
                  meta={formatDate(auditLogDate(log))}
                  status={<Badge tone={auditTone(log.action || "")}>{auditActionLabel(log.action || "sin_accion")}</Badge>}
                  action={metadata ? (
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-teal">Ver metadata ({Object.keys(metadata).length})</summary>
                      <div className="mt-3"><MetadataContent metadata={metadata} /></div>
                    </details>
                  ) : undefined}
                />
              );
            })}
          </div>

          {meta.last_page > 1 ? (
            <div className="flex flex-col gap-3 border-t border-edge pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-secondary">Página {meta.current_page} de {meta.last_page}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={meta.current_page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={meta.current_page >= meta.last_page}
                  onClick={() => setPage((current) => Math.min(meta.last_page, current + 1))}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
