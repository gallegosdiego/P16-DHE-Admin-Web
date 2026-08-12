"use client";

import { Skeleton } from "@/components/skeleton";
import { apiGet, apiSend, describeApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type ErrorEvent = {
  id: number;
  error_id: string;
  status: number | null;
  method: string;
  path: string;
  exception: string;
  exception_class: string;
  message: string;
  file: string | null;
  line: number | null;
  trace: string | null;
  user: string | null;
  occurred_at: string | null;
  resolved_at: string | null;
  resolved_by: number | null;
};

type Summary = { last_hour: number; last_24h: number; total: number };

export function ErrorEventsPanel() {
  const { user } = useAuth();
  const esSuperadmin = useMemo(
    () => (user?.roles ?? []).some((rol) => String(rol) === "superadmin"),
    [user]
  );

  const [eventos, setEventos] = useState<ErrorEvent[] | null>(null);
  const [resumen, setResumen] = useState<Summary | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [consulta, setConsulta] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);
  const [copiado, setCopiado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verArchivados, setVerArchivados] = useState(false);
  const [accionando, setAccionando] = useState<number | null>(null);
  const [recarga, setRecarga] = useState(0);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    if (!esSuperadmin) return;
    let vigente = true;

    const params = new URLSearchParams();
    if (consulta) params.set("search", consulta);
    if (verArchivados) params.set("archived", "1");
    const qs = params.toString();

    const cargar = async () => {
      try {
        const [lista, resumenApi] = await Promise.all([
          apiGet<{ data?: ErrorEvent[] }>(`/error-events${qs ? `?${qs}` : ""}`),
          apiGet<Partial<Summary>>("/error-events/summary"),
        ]);
        if (!vigente) return;
        setEventos(Array.isArray(lista?.data) ? lista.data : []);
        setResumen(
          resumenApi && typeof resumenApi.total === "number"
            ? {
                last_hour: resumenApi.last_hour ?? 0,
                last_24h: resumenApi.last_24h ?? 0,
                total: resumenApi.total,
              }
            : null
        );
        setError(null);
      } catch (e) {
        if (!vigente) return;
        setError(describeApiError(e, "No se pudieron cargar los incidentes").message);
        setEventos([]);
      }
    };

    cargar();
    return () => {
      vigente = false;
    };
  }, [esSuperadmin, consulta, verArchivados, recarga]);

  if (!esSuperadmin) return null;

  const comoTexto = (evento: ErrorEvent) =>
    [
      `Incidente ${evento.error_id}`,
      `Cuándo:    ${evento.occurred_at ?? "sin fecha"}`,
      `Petición:  ${evento.method} /${evento.path}${evento.status ? ` → HTTP ${evento.status}` : ""}`,
      evento.user ? `Usuario:   ${evento.user}` : null,
      `Excepción: ${evento.exception_class}`,
      `Mensaje:   ${evento.message}`,
      evento.file ? `Origen:    ${evento.file}:${evento.line}` : null,
      evento.trace ? `\nTraza:\n${evento.trace}` : null,
    ]
      .filter(Boolean)
      .join("\n");

  const copiar = async (evento: ErrorEvent) => {
    try {
      await navigator.clipboard.writeText(comoTexto(evento));
      setCopiado(evento.id);
      window.setTimeout(() => setCopiado((actual) => (actual === evento.id ? null : actual)), 2000);
    } catch {
      setCopiado(-1);
      window.setTimeout(() => setCopiado((actual) => (actual === -1 ? null : actual)), 2500);
    }
  };

  const resolver = async (id: number) => {
    setAccionando(id);
    try {
      await apiSend(`/error-events/${id}/resolve`, "PATCH", {});
      recargar();
    } catch (e) {
      setError(describeApiError(e, "No se pudo archivar el incidente").message);
    } finally {
      setAccionando(null);
    }
  };

  const deshacer = async (id: number) => {
    setAccionando(id);
    try {
      await apiSend(`/error-events/${id}/unresolve`, "PATCH", {});
      recargar();
    } catch (e) {
      setError(describeApiError(e, "No se pudo restaurar el incidente").message);
    } finally {
      setAccionando(null);
    }
  };

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    setConsulta(busqueda.trim());
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
      <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">
        Incidentes de la API
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Errores registrados por el servidor. Cuando alguien reporte un fallo, busca aquí por la
        referencia que vio en pantalla. Se conservan 30 días.
      </p>

      {resumen && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            { etiqueta: "Última hora", valor: resumen.last_hour, alerta: resumen.last_hour > 0 },
            { etiqueta: "Últimas 24 h", valor: resumen.last_24h, alerta: false },
            { etiqueta: "Total sin resolver", valor: resumen.total, alerta: false },
          ].map((tarjeta) => (
            <div
              key={tarjeta.etiqueta}
              className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]"
            >
              <p className="text-xs text-slate-500 dark:text-slate-400">{tarjeta.etiqueta}</p>
              <p
                className={`mt-1 text-xl font-bold ${
                  tarjeta.alerta ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-[#e0e0e0]"
                }`}
              >
                {tarjeta.valor}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form onSubmit={buscar} className="flex min-w-0 flex-1 gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por referencia, ruta o mensaje"
            className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
          />
          <button
            type="submit"
            className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold dark:border-[#2a2a3e] dark:text-slate-200"
          >
            Buscar
          </button>
        </form>
        <button
          type="button"
          onClick={() => setVerArchivados((v) => !v)}
          className={`min-h-11 rounded-lg border px-4 text-sm font-semibold transition-colors ${
            verArchivados
              ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-300"
              : "border-slate-300 text-slate-600 dark:border-[#2a2a3e] dark:text-slate-200"
          }`}
        >
          {verArchivados ? "Ocultar archivados" : "Ver archivados"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      {eventos === null ? (
        <Skeleton className="mt-3 h-32 w-full" />
      ) : eventos.length === 0 ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          {verArchivados
            ? "No hay incidentes que coincidan con la búsqueda."
            : "Sin incidentes pendientes. Es la respuesta que quieres ver aquí."}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {eventos.map((evento) => {
            const resuelto = !!evento.resolved_at;
            return (
              <div
                key={evento.id}
                className={`rounded-lg border p-3 transition-opacity ${
                  resuelto
                    ? "border-emerald-200 bg-emerald-50/50 opacity-70 dark:border-emerald-800 dark:bg-emerald-500/5"
                    : "border-slate-200 dark:border-[#2a2a3e]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => setAbierto(abierto === evento.id ? null : evento.id)}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left"
                  >
                    {resuelto ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                        Resuelto
                      </span>
                    ) : (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                        {evento.exception}
                      </span>
                    )}
                    <span className="min-w-0 break-all font-mono text-xs text-slate-600 dark:text-slate-400">
                      {evento.method} /{evento.path}
                    </span>
                    {evento.user && (
                      <span className="truncate text-xs text-slate-500 dark:text-slate-400">· {evento.user}</span>
                    )}
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {evento.occurred_at ? formatDate(evento.occurred_at) : ""}
                    </span>
                  </button>

                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => copiar(evento)}
                      title="Copiar el incidente completo como texto"
                      className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:text-slate-200"
                    >
                      {copiado === evento.id ? "Copiado" : copiado === -1 ? "No se pudo" : "Copiar"}
                    </button>

                    {resuelto ? (
                      <button
                        type="button"
                        title="Restaurar"
                        disabled={accionando === evento.id}
                        onClick={() => deshacer(evento.id)}
                        className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-600 transition-all duration-150 hover:bg-amber-50 active:scale-95 disabled:opacity-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-500/10"
                      >
                        Restaurar
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Marcar como resuelto"
                        disabled={accionando === evento.id}
                        onClick={() => resolver(evento.id)}
                        className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-all duration-150 hover:bg-emerald-50 active:scale-95 disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                      >
                        Resuelto
                      </button>
                    )}
                  </div>
                </div>

                <p className="mt-1 break-words text-sm text-slate-800 dark:text-slate-200">{evento.message}</p>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-400">ref: {evento.error_id}</p>
                {resuelto && evento.resolved_at && (
                  <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                    Archivado {formatDate(evento.resolved_at)}
                  </p>
                )}

                {abierto === evento.id && (
                  <div className="mt-2 space-y-2">
                    {evento.file && (
                      <p className="break-all font-mono text-xs text-slate-600 dark:text-slate-400">
                        {evento.file}:{evento.line}
                      </p>
                    )}
                    {evento.trace && (
                      <pre className="max-h-64 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-200">
                        {evento.trace}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
