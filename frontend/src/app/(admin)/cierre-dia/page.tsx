"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePageTitle } from "@/lib/page-title";
import { Button, Card, EmptyState, Input, KpiCard, StatusBadge } from "@/components/ui";

type PackageRow = { id: number; display_code: string; status: string };
type DriverSummary = { driver_id: number; driver_name: string; packages?: PackageRow[]; counts: { departed: number; delivered: number; issues: number; on_motorcycle: number; returned_to_warehouse: number }; day_settled: boolean; pending_reason?: string | null };
type Summary = { date: string; drivers: DriverSummary[] };

function currentDate() { return new Date().toISOString().slice(0, 10); }

export default function CierreDiaPage() {
  usePageTitle("Cierre de día | Danhei Express");
  const { showToast } = useToast();
  const [date, setDate] = useState(() => new URLSearchParams(window.location.search).get("date") ?? currentDate());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);

  const loadSummary = useCallback(async () => {
    try { setSummary(await apiGet<Summary>(`/routes/day-close?date=${date}`)); }
    catch { showToast("No se pudo cargar el cierre de día", "error"); }
  }, [date, showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const receive = async (ids: number[]) => {
    if (!ids.length) return;
    if (!window.confirm(`¿Recibir ${ids.length} paquete(s) en bodega?`)) return;
    setBusy(true);
    try {
      await apiPost("/shipments/warehouse-returns", { shipment_ids: ids }, { "Idempotency-Key": `day-close-${date}-${ids.slice().sort().join("-")}` });
      setSelected({}); showToast("Paquetes recibidos en bodega", "success"); await loadSummary();
    } catch { showToast("No se pudo recibir el lote", "error"); }
    finally { setBusy(false); }
  };

  const drivers = summary?.drivers ?? [];
  const settled = drivers.length > 0 && drivers.every((driver) => driver.day_settled);
  const totals = drivers.reduce((result, driver) => ({ departed: result.departed + driver.counts.departed, delivered: result.delivered + driver.counts.delivered, onMotorcycle: result.onMotorcycle + driver.counts.on_motorcycle }), { departed: 0, delivered: 0, onMotorcycle: 0 });

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Operaciones</p><h1 className="font-display text-3xl font-bold text-ink">Cierre de día</h1><p className="mt-1 text-sm text-ink-secondary">Conciliación física de los paquetes que regresan a sede.</p></div>
        <label className="text-sm font-medium text-ink">Fecha<Input className="mt-1" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      </header>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3"><KpiCard label="Salieron" value={totals.departed} support="Paquetes en rutas del día" /><KpiCard label="Entregados" value={totals.delivered} tone="success" support="Entregas completadas" /><KpiCard label="En la moto" value={totals.onMotorcycle} tone="warning" support="Pendientes de recibir" /></section>
      {settled ? <div className="rounded-card border border-success/30 bg-success-soft p-4 font-semibold text-success">Día conciliado</div> : null}
      {drivers.length === 0 ? <EmptyState title="No hay movimiento de pilotos" description="No existen salidas para la fecha seleccionada." /> : <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">{drivers.map((driver) => { const packages = driver.packages ?? []; const selectedPackages = packages.filter((item) => selected[item.id]); return <Card key={driver.driver_id} className="space-y-4 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-display text-xl font-semibold text-ink">{driver.driver_name}</h2><p className="text-sm text-ink-secondary">Salió con {driver.counts.departed} · entregó {driver.counts.delivered} · con novedad {driver.counts.issues} · en la moto {driver.counts.on_motorcycle}</p></div><StatusBadge status={driver.day_settled ? "completed" : "pending"} label={driver.day_settled ? "Conciliado" : "Pendiente"} /></div>{driver.pending_reason ? <p className="rounded-card bg-warning-soft p-3 text-sm text-ink">{driver.pending_reason}</p> : null}{packages.length > 0 ? <div className="space-y-3"><p className="text-sm font-semibold text-ink">Paquetes en la moto</p><div className="grid gap-2 sm:grid-cols-2">{packages.map((item) => <label key={item.id} className="flex min-w-0 items-center gap-2 rounded-card border border-edge p-3 text-sm text-ink"><input type="checkbox" checked={Boolean(selected[item.id])} onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.checked }))} /><span className="truncate">{item.display_code}</span></label>)}</div><Button disabled={busy || selectedPackages.length === 0} onClick={() => void receive(selectedPackages.map((item) => item.id))}>Recibir en bodega ({selectedPackages.length})</Button></div> : null}<p className="text-sm text-ink-secondary">Devueltos hoy: <strong className="text-ink">{driver.counts.returned_to_warehouse}</strong></p></Card>; })}</section>}
    </main>
  );
}
