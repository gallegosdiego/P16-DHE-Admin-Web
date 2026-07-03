"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { auditActionLabel, formatDate } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";
import { usePageTitle } from "@/lib/page-title";
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

export default function AuditoriaPage() {
  usePageTitle("Auditoría | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AuditLog[]>([]);
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
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", "50");
      if (search.trim()) params.set("search", search.trim());
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (userFilter !== "all") params.set("user_id", userFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const response = await apiGet<PaginatedResponse<AuditLog>>(
        `/audit-logs?${params.toString()}`
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
      showToast("No se pudieron cargar logs de auditoría", "error");
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

  const availableActions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.action).filter(Boolean))).sort();
  }, [rows]);

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
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Auditoría</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Historial de acciones sensibles del sistema.
            </p>
          </div>
          <form onSubmit={submitSearch} className="flex w-full flex-col gap-2 lg:w-auto">
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Filtrar por usuario, acción o descripción"
              className="h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <select
                value={actionFilter}
                onChange={(event) => {
                  setPage(1);
                  setActionFilter(event.target.value);
                }}
                className="h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              >
                <option value="all">Todas las acciones</option>
                {availableActions.map((action) => (
                  <option key={action} value={action}>
                    {auditActionLabel(action)}
                  </option>
                ))}
              </select>
              <select
                value={userFilter}
                onChange={(event) => {
                  setPage(1);
                  setUserFilter(event.target.value);
                }}
                className="h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              >
                <option value="all">Todos los usuarios</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => {
                  setPage(1);
                  setDateFrom(event.target.value);
                }}
                className="h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(event) => {
                  setPage(1);
                  setDateTo(event.target.value);
                }}
                className="h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              <div className="flex gap-2">
                <button className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]">
                  Filtrar
                </button>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Registros en pagina</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-[#e0e0e0]">{rows.length}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total registros</p>
          <p className="mt-1 text-xl font-bold text-primary">{meta.total}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Pagina</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-[#e0e0e0]">
            {meta.current_page} / {meta.last_page}
          </p>
        </article>
      </section>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-12 dark:bg-[#23233b]" />
          ))}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-sm text-slate-500 dark:text-slate-400">Sin registros de auditoría para este filtro.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Mostrando {filteredRows.length} de {rows.length} en la página actual.
          </p>

          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#2a2a3e] dark:bg-[#1a1a2e] lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-[#16162a] dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Fecha</th>
                    <th className="px-3 py-3">Usuario</th>
                    <th className="px-3 py-3">Acción</th>
                    <th className="px-3 py-3">Descripción</th>
                    <th className="px-3 py-3">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.flatMap((log) => {
                    const metadata = auditLogMetadata(log);
                    const items = [
                      <tr key={log.id} className="border-t border-slate-100 dark:border-[#2a2a3e]">
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{formatDate(auditLogDate(log))}</td>
                        <td className="px-3 py-3 font-semibold text-slate-900 dark:text-[#e0e0e0]">
                          {log.user?.name || `Usuario #${log.user_id}`}
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                            {auditActionLabel(log.action || "sin_accion")}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{log.description || "-"}</td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                          {metadata ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedMetadata((prev) => ({
                                  ...prev,
                                  [log.id]: !prev[log.id],
                                }))
                              }
                              className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                            >
                              {expandedMetadata[log.id] ? "Ocultar" : "Ver"} ({Object.keys(metadata).length})
                            </button>
                          ) : (
                            "0 campos"
                          )}
                        </td>
                      </tr>,
                    ];
                    if (expandedMetadata[log.id] && metadata) {
                      items.push(
                        <tr key={`${log.id}-meta`} className="border-t border-slate-100 dark:border-[#2a2a3e]">
                          <td className="px-3 py-3" colSpan={5}>
                            <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-[#16162a] dark:text-slate-300">
                              {JSON.stringify(metadata, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      );
                    }
                    return items;
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 lg:hidden">
            {filteredRows.map((log) => {
              const metadata = auditLogMetadata(log);

              return (
                <article
                  key={log.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">
                        {log.user?.name || `Usuario #${log.user_id}`}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(auditLogDate(log))}</p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                      {auditActionLabel(log.action || "sin_accion")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{log.description || "-"}</p>
                  {metadata ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-slate-500 dark:text-slate-400">Ver metadata</summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 text-xs text-slate-700 dark:bg-[#16162a] dark:text-slate-300">
                        {JSON.stringify(metadata, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>

          <Pagination currentPage={meta.current_page} lastPage={meta.last_page} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
