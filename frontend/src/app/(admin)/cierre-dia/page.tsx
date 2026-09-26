"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiJson, apiPost, describeApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePageTitle } from "@/lib/page-title";
import { formatCOP } from "@/lib/utils";
import { Button, Card, CurrencyInput, EmptyState, Input, KpiCard, StatusBadge } from "@/components/ui";

type PackageRow = { id: number; display_code: string; status: string };
type DriverSummary = {
  driver_id: number;
  driver_name: string;
  packages?: PackageRow[];
  counts: { departed: number; delivered: number; issues: number; on_motorcycle: number; returned_to_warehouse: number };
  cod?: { expected?: number | null; registered?: number | null } | null;
  /**
   * Saldos del libro de Conciliación. `cash_to_remit` es el efectivo que el
   * piloto debe entregar (todas las fechas); los pagos digitales van aparte.
   */
  ledger?: { cash_to_remit?: number | null; digital_pending?: number | null; digital_pending_count?: number | null } | null;
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

type CashHandover = { driverId: number; driverName: string; owed: number };

function CodBlock({
  driver,
  onRegisterCash,
}: {
  driver: DriverSummary;
  onRegisterCash: (handover: CashHandover) => void;
}) {
  const cod = driver.cod ?? {};
  const expected = Number(cod.expected ?? 0);
  const registered = Number(cod.registered ?? 0);
  const ledger = driver.ledger ?? null;
  // El libro manda: si el API ya trae el saldo, ese es el efectivo por entregar.
  const cashToRemit = ledger ? Number(ledger.cash_to_remit ?? 0) : registered;
  const digitalPending = Number(ledger?.digital_pending ?? 0);
  const digitalCount = Number(ledger?.digital_pending_count ?? 0);
  if (expected === 0 && registered === 0 && cashToRemit === 0 && digitalPending === 0) return null;
  const difference = expected - registered;
  return (
    <div className="space-y-2 rounded-card border border-edge bg-app-secondary/40 p-3 text-sm" data-testid="cod-block">
      <p className="font-semibold text-ink">
        Debe entregar <span className="font-display text-lg">{formatCOP(cashToRemit)}</span> en efectivo
      </p>
      {expected !== 0 || registered !== 0 ? (
        <p className="text-ink-secondary">
          Contra entrega del día: se esperaban {formatCOP(expected)} y el piloto registró {formatCOP(registered)}.
        </p>
      ) : null}
      {expected !== 0 || registered !== 0 ? (
        difference !== 0 ? (
          <p className={`rounded-button px-2 py-1 font-semibold ${difference > 0 ? "bg-warning/25 text-ink" : "bg-info/15 text-teal"}`}>
            {difference > 0
              ? `Diferencia: faltan ${formatCOP(difference)} (paquetes sin entregar o cobros sin registrar)`
              : `Diferencia: registró ${formatCOP(-difference)} de más`}
          </p>
        ) : (
          <p className="font-semibold text-success">Cuadra con lo esperado</p>
        )
      ) : null}
      {digitalPending > 0 ? (
        <p className="rounded-button bg-info/15 px-2 py-1 text-ink" data-testid="digital-pending">
          Pago digital por verificar: <strong>{formatCOP(digitalPending)}</strong>
          {digitalCount > 0 ? ` (${digitalCount} ${digitalCount === 1 ? "cobro" : "cobros"})` : ""} — llegó por
          Transferencia, Nequi o Daviplata; no es efectivo.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {cashToRemit > 0 ? (
          <Button size="sm" onClick={() => onRegisterCash({ driverId: driver.driver_id, driverName: driver.driver_name, owed: cashToRemit })}>
            Registrar entrega de efectivo
          </Button>
        ) : null}
        <Link href={`/pagos?tab=conciliacion&driver=${driver.driver_id}`} className="font-semibold text-brand hover:underline">
          Ver en Conciliación
        </Link>
      </div>
    </div>
  );
}

function CashHandoverDialog({
  handover,
  date,
  onClose,
  onDone,
}: {
  handover: CashHandover;
  date: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [amount, setAmount] = useState(handover.owed);
  const [saving, setSaving] = useState(false);
  // Una llave por diálogo abierto: un doble clic no registra dos entregas.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const tooMuch = amount > handover.owed;

  const save = async () => {
    setSaving(true);
    try {
      await apiJson(
        `/financial/driver-reconciliations/${handover.driverId}/remittances`,
        "POST",
        { amount, method: "cash", notes: `Entrega de efectivo en el cierre del día ${date}` },
        { "Idempotency-Key": idempotencyKey },
        { retries: 1, idempotent: true },
      );
      showToast(`Entrega de ${formatCOP(amount)} registrada para ${handover.driverName}`, "success");
      onClose();
      await onDone();
    } catch (error) {
      showToast(describeApiError(error, "No se pudo registrar la entrega de efectivo").message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
      <Card
        role="dialog"
        aria-modal="true"
        aria-label="Registrar entrega de efectivo"
        className="mobile-modal-safe-area w-full max-w-sm rounded-b-none sm:rounded-card"
      >
        <h2 className="font-display text-lg font-bold text-ink">Registrar entrega de efectivo</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          {handover.driverName} debe entregar {formatCOP(handover.owed)}. Escribe cuánto recibiste en la mano.
        </p>
        <CurrencyInput
          autoFocus
          label="Efectivo recibido"
          min={0}
          value={amount}
          onValueChange={setAmount}
          wrapperClassName="mt-4"
          error={tooMuch ? `No puede ser más de ${formatCOP(handover.owed)}.` : undefined}
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving || !(amount > 0) || tooMuch} onClick={() => void save()}>
            {saving ? "Guardando..." : "Registrar entrega"}
          </Button>
        </div>
      </Card>
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
  const [handover, setHandover] = useState<CashHandover | null>(null);

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
                {driver.cod || driver.ledger ? <CodBlock driver={driver} onRegisterCash={setHandover} /> : null}
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
      {handover ? (
        <CashHandoverDialog handover={handover} date={date} onClose={() => setHandover(null)} onDone={loadSummary} />
      ) : null}
    </main>
  );
}
