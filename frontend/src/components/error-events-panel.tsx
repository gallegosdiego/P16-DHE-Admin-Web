"use client";

import { Skeleton } from "@/components/skeleton";
import { apiGet, describeApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { FormEvent, useEffect, useMemo, useState } from "react";

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

  useEffect(() => {
    if (!esSuperadmin) return;
    let vigente = true;

    const cargar = async () => {
      try {
        const [lista, resumenApi] = await Promise.all([
          apiGet<{ data?: ErrorEvent[] }>(
            `/error-events${consulta ? `?search=${encodeURIComponent(consulta)}` : ""}`
          ),
          apiGet<Partial<Summary>>("/error-events/summary"),
        ]);
        if (!vigente) return;
        // Este es un panel de diagnóstico: si la respuesta no tiene la forma
        // esperada no puede tumbar la pantalla de Configuración entera. Se
        // degrada a «sin incidentes» en vez de romper.
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
  }, [esSuperadmin, consulta]);

  // Diagnóstico: solo tiene sentido para quien puede actuar sobre él.
  if (!esSuperadmin) return null;

  /**
   * Texto plano del incidente, pensado para pegarlo en un chat o un ticket.
   * Incluye la referencia porque es lo que enlaza «me salió un error» con
   * esta entrada, y la traza completa aunque el panel la muestre recortada.
   */
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
      // El portapapeles puede estar bloqueado (contexto no seguro, permiso
      // denegado). Se avisa en el propio botón en vez de fallar en silencio.
      setCopiado(-1);
      window.setTimeout(() => setCopiado((actual) => (actual === -1 ? null : actual)), 2500);
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
            { etiqueta: "Total guardado", valor: resumen.total, alerta: false },
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

      <form onSubmit={buscar} className="mt-3 flex gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por referencia, ruta o mensaje"
          className="h-11 flex-1 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
        />
        <button
          type="submit"
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold dark:border-[#2a2a3e] dark:text-slate-200"
        >
          Buscar
        </button>
      </form>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      {eventos === null ? (
        <Skeleton className="mt-3 h-32 w-full" />
      ) : eventos.length === 0 ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          Sin incidentes registrados. Es la respuesta que quieres ver aquí.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {eventos.map((evento) => (
            <div
              key={evento.id}
              className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]"
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => setAbierto(abierto === evento.id ? null : evento.id)}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left"
                >
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                    {evento.exception}
                  </span>
                  {/* `min-w-0` + `break-all`: una ruta larga debe cortarse dentro
                      de la tarjeta en vez de estirarla y desbordar el panel. */}
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

                <button
                  type="button"
                  onClick={() => copiar(evento)}
                  title="Copiar el incidente completo como texto"
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:text-slate-200"
                >
                  {copiado === evento.id ? "Copiado" : copiado === -1 ? "No se pudo" : "Copiar"}
                </button>
              </div>

              {/* `break-words` evita que un mensaje sin espacios rompa el ancho. */}
              <p className="mt-1 break-words text-sm text-slate-800 dark:text-slate-200">{evento.message}</p>
              <p className="mt-1 break-all font-mono text-[11px] text-slate-400">ref: {evento.error_id}</p>

              {abierto === evento.id && (
                <div className="mt-2 space-y-2">
                  {evento.file && (
                    <p className="break-all font-mono text-xs text-slate-600 dark:text-slate-400">
                      {evento.file}:{evento.line}
                    </p>
                  )}
                  {/* La traza conserva su formato, pero se desplaza dentro de
                      su propio recuadro: nunca ensancha la página. */}
                  {evento.trace && (
                    <pre className="max-h-64 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-200">
                      {evento.trace}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
