"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { formatDate, toTitle } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";
import { usePageTitle } from "@/lib/page-title";
import type { AuditLog, PaginatedResponse } from "@/lib/types";

export default function AuditoriaPage() {
  usePageTitle("Auditoria | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", "50");
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
      showToast("No se pudieron cargar logs de auditoria", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((log) => {
      const user = log.user?.name || "";
      const description = log.description || "";
      const action = log.action || "";
      return (
        user.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query) ||
        action.toLowerCase().includes(query)
      );
    });
  }, [rows, search]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchDraft);
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Auditoria</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Historial de acciones sensibles del sistema.
            </p>
          </div>
          <form onSubmit={submitSearch} className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Filtrar por usuario, accion o descripcion"
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
            <button className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]">
              Filtrar
            </button>
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
          <p className="text-sm text-slate-500 dark:text-slate-400">Sin registros de auditoria para este filtro.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Mostrando {filteredRows.length} de {rows.length} en la pagina actual.
          </p>

          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#2a2a3e] dark:bg-[#1a1a2e] lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-[#16162a] dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Fecha</th>
                    <th className="px-3 py-3">Usuario</th>
                    <th className="px-3 py-3">Accion</th>
                    <th className="px-3 py-3">Descripcion</th>
                    <th className="px-3 py-3">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((log) => (
                    <tr key={log.id} className="border-t border-slate-100 dark:border-[#2a2a3e]">
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{formatDate(log.created_at)}</td>
                      <td className="px-3 py-3 font-semibold text-slate-900 dark:text-[#e0e0e0]">
                        {log.user?.name || `Usuario #${log.user_id}`}
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                          {toTitle(log.action || "sin_accion")}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{log.description || "-"}</td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                        {log.metadata ? Object.keys(log.metadata).length : 0} campos
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 lg:hidden">
            {filteredRows.map((log) => (
              <article
                key={log.id}
                className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">
                      {log.user?.name || `Usuario #${log.user_id}`}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(log.created_at)}</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                    {toTitle(log.action || "sin_accion")}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{log.description || "-"}</p>
              </article>
            ))}
          </div>

          <Pagination currentPage={meta.current_page} lastPage={meta.last_page} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
