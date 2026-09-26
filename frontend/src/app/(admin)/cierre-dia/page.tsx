"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, describeApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePageTitle } from "@/lib/page-title";
import { formatCOP } from "@/lib/utils";
import { Button, Card, EmptyState, Input, KpiCard, StatusBadge } from "@/components/ui";

type PackageRow = { id: number; display_code: string; status: string };
type DriverSummary = {
  driver_id: number;
  driver_name: string;
  packages?: PackageRow[];
  counts: { departed: number; delivered: number; issues: number; on_motorcycle: number; returned_to_warehouse: number };
  cod?: { expected?: number | null; registered?: number | null } | null;
  day_settled: boolean;
  pending_reason?: string | null;
};
type Summary = { date: string; drivers: DriverSummary[] };

/**
 * Respuesta de `POST /shipments/warehouse-returns`. El contrato nuevo usa
 * `received` y `rejected[{id, reason, message}]`; la API actual responde
 * `accepted` y `rejected[{shipment_id, reason}]`. Se aceptan ambas.
 */
type RawReturnItem = { id?: number; shipment_id?: number; display_code?: string; reason?: string | null; message?: string | null };
type WarehouseReturnsResponse = { received?: RawReturnItem[]; accepted?: RawReturnItem[]; rejected?: RawReturnItem[] };
type ReturnResult = {
  received: Array<{ id: number; code: string }>;
  rejected: Array<{ id: number; code: string; reason: string }>;
};

function currentDate() { return new Date().toISOString().slice(0, 10); }

function CodBlock({ cod }: { cod: NonNullable<DriverSummary["cod"]> }) {
  const expected = Number(cod.expected ?? 0);
  const registered = Number(cod.registered ?? 0);
  if (expected === 0 && registered === 0) return null;
  const difference = expected - registered;
  return (
    <div className="rounded-card border border-edge bg-app-secondary/40 p-3 text-sm" data-testid="cod-block">
      <p className="font-semibold text-ink">
        Debe entregar <span className="font-display text-lg">{formatCOP(registered)}</span> en efectivo
      </p>
      <p className="mt-1 text-ink-secondary">
        Contra entrega del día: se esperaban {formatCOP(expected)} y el piloto registró {formatCOP(registered)}.
      </p>
      {difference !== 0 ? (
        <p className={`mt-2 rounded-button px-2 py-1 font-semibold ${difference > 0 ? "bg-warning/25 text-ink" : "bg-info/15 text-teal"}`}>
          {difference > 0
            ? `Diferencia: faltan ${formatCOP(difference)} (paquetes sin entregar o cobros sin registrar)`
            : `Diferencia: registró ${formatCOP(-difference)} de más`}
        </p>
      ) : (
        <p className="mt-2 font-semibold text-success">Cuadra con lo esperado</p>
      )}
    </div>
  );
}

export default function CierreDiaPage() {
  usePageTitle("Cierre de día | Danhei Express");
  const { showToast } = useToast();
  const [date, setDate] = useState(() => new URLSearchParams(window.location.search).get("date") ?? currentDate());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReturnResult | null>(null);

  const loadSummary = useCallback(async () => {
    try { setSummary(await apiGet<Summary>(`/routes/day-close?date=${date}`)); }
    catch { showToast("No se pudo cargar el cierre de día", "error"); }
  }, [date, showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const drivers = summary?.drivers ?? [];

  const receive = async (ids: number[]) => {
    if (!ids.length) return;
    if (!window.confirm(`¿Recibir ${ids.length} paquete(s) en bodega?`)) return;
    const codeOf = (id: number) =>
      drivers.flatMap((driver) => driver.packages ?? []).find((item) => item.id === id)?.display_code ?? `#${id}`;
    setBusy(true);
    try {
      const response = await apiPost<WarehouseReturnsResponse>(
        "/shipments/warehouse-returns",
        { shipment_ids: ids },
        { "Idempotency-Key": `day-close-${date}-${ids.slice().sort().join("-")}` }
      );
      const rejected = (response?.rejected ?? []).map((item) => {
        const id = Number(item.id ?? item.shipment_id);
        return { id, code: item.display_code || codeOf(id), reason: item.message || item.reason || "No se pudo recibir" };
      });
      const rejectedIds = new Set(rejected.map((item) => item.id));
      const receivedRaw = response?.received ?? response?.accepted;
      const received = (receivedRaw
        ? receivedRaw.map((item) => Number(item.id ?? item.shipment_id))
        : ids.filter((id) => !rejectedIds.has(id))
      ).map((id) => ({ id, code: codeOf(id) }));

      setResult({ received, rejected });
      setSelected({});
      if (rejected.length === 0) {
        showToast(received.length === 1 ? "Paquete recibido en bodega" : `${received.length} paquetes recibidos en bodega`, "success");
      } else if (received.length === 0) {
        showToast("Ningún paquete se pudo recibir. Mira el motivo de cada uno.", "error");
      } else {
        showToast(`Se recibieron ${received.length}; ${rejected.length} no se pudieron recibir.`, "info");
      }
      await loadSummary();
    } catch (error) {
      showToast(describeApiError(error, "No se pudo recibir el lote").message, "error");
    } finally {
      setBusy(false);
    }
  };

  const settled = drivers.length > 0 && drivers.every((driver) => driver.day_settled);
  const totals = drivers.reduce((sum, driver) => ({ departed: sum.departed + driver.counts.departed, delivered: sum.delivered + driver.counts.delivered, onMotorcycle: sum.onMotorcycle + driver.counts.on_motorcycle }), { departed: 0, delivered: 0, onMotorcycle: 0 });

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Operaciones</p><h1 className="font-display text-3xl font-bold text-ink">Cierre de día</h1><p className="mt-1 text-sm text-ink-secondary">Recibe lo que el piloto trae de vuelta y cuadra el efectivo.</p></div>
        <label className="text-sm font-medium text-ink">Fecha<Input className="mt-1" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      </header>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3"><KpiCard label="Salieron" value={totals.departed} support="Paquetes en rutas del día" /><KpiCard label="Entregados" value={totals.delivered} tone="success" support="Entregas completadas" /><KpiCard label="En la moto" value={totals.onMotorcycle} tone="warning" support="Pendientes de recibir" /></section>
      {settled ? <div className="rounded-card border border-success/30 bg-success-soft p-4 font-semibold text-success">Día conciliado</div> : null}

      {result ? (
        <Card
          title="Resultado de la recepción"
          headerAction={<Button variant="ghost" size="sm" onClick={() => setResult(null)}>Cerrar</Button>}
          data-testid="return-result"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-success">Recibidos en bodega ({result.received.length})</p>
              {result.received.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-ink">
                  {result.received.map((item) => <li key={item.id}><Link href={`/pedidos/${item.id}`} className="hover:text-brand hover:underline">{item.code}</Link></li>)}
                </ul>
              ) : <p className="mt-2 text-sm text-ink-secondary">Ninguno.</p>}
            </div>
            <div>
              <p className={`text-sm font-semibold ${result.rejected.length > 0 ? "text-danger" : "text-ink-secondary"}`}>No se pudieron recibir ({result.rejected.length})</p>
              {result.rejected.length > 0 ? (
                <ul className="mt-2 space-y-2 text-sm">
                  {result.rejected.map((item) => (
                    <li key={item.id} className="rounded-card border border-danger/20 bg-danger/5 p-2">
                      <Link href={`/pedidos/${item.id}`} className="font-semibold text-ink hover:text-brand hover:underline">{item.code}</Link>
                      <p className="text-ink-secondary">{item.reason}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-ink-secondary">Todos entraron bien.</p>}
            </div>
          </div>
        </Card>
      ) : null}

      {drivers.length === 0 ? <EmptyState title="No hay movimiento de pilotos" description="No existen salidas para la fecha seleccionada." /> : (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {drivers.map((driver) => {
            const packages = driver.packages ?? [];
            const selectedPackages = packages.filter((item) => selected[item.id]);
            return (
              <Card key={driver.driver_id} className="space-y-4 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-ink">{driver.driver_name}</h2>
                    <p className="text-sm text-ink-secondary">Salió con {driver.counts.departed} · entregó {driver.counts.delivered} · con novedad {driver.counts.issues} · en la moto {driver.counts.on_motorcycle}</p>
                  </div>
                  <StatusBadge status={driver.day_settled ? "completed" : "pending"} label={driver.day_settled ? "Conciliado" : "Pendiente"} />
                </div>
                {driver.cod ? <CodBlock cod={driver.cod} /> : null}
                {driver.pending_reason ? <p className="rounded-card bg-warning-soft p-3 text-sm text-ink">{driver.pending_reason}</p> : null}
                {packages.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-ink">Paquetes en la moto</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {packages.map((item) => (
                        <label key={item.id} className="flex min-h-11 min-w-0 items-center gap-2 rounded-card border border-edge p-3 text-sm text-ink">
                          <input type="checkbox" checked={Boolean(selected[item.id])} onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.checked }))} />
                          <span className="truncate">{item.display_code}</span>
                        </label>
                      ))}
                    </div>
                    <Button disabled={busy || selectedPackages.length === 0} onClick={() => void receive(selectedPackages.map((item) => item.id))}>Recibir en bodega ({selectedPackages.length})</Button>
                  </div>
                ) : null}
                <p className="text-sm text-ink-secondary">Devueltos hoy: <strong className="text-ink">{driver.counts.returned_to_warehouse}</strong></p>
              </Card>
            );
          })}
        </section>
      )}
    </main>
  );
}
