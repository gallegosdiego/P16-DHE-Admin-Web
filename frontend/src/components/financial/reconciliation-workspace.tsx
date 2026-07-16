"use client";

import { MovementPanel } from "@/components/financial/movement-panel";
import { MovementHistory } from "@/components/financial/movement-history";
import { OpeningBalancesPanel } from "@/components/financial/opening-balances-panel";
import type {
  ClientLedger,
  DriverReconciliation,
  LedgerMovement,
  MovementHistoryItem,
  MovementLine,
} from "@/components/financial/ledger-types";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { apiGet, apiJson } from "@/lib/api";
import type { Client, Driver } from "@/lib/types";
import { formatCOP } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

type WorkspaceMode = "driver" | "client";
type DriverCollection = Driver[] | { data?: Driver[] };
type PaginatedClients = { data: Client[] };

function today(): string {
  const current = new Date();
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
}

function startOfMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function normalizeMovement(movement: LedgerMovement): MovementHistoryItem {
  return {
    id: movement.id,
    reference: movement.reference,
    date: movement.received_at || movement.paid_at || "",
    amount: Number(movement.amount),
    balanceBefore: Number(movement.balance_before || 0),
    balanceAfter: Number(movement.balance_after || 0),
    movementType: movement.movement_type || "standard",
    status: movement.status,
    method: movement.method,
    externalReference: movement.external_reference,
    notes: movement.notes,
    actorName: movement.received_by?.name || movement.paid_by?.name || null,
    approvedByName: movement.approved_by?.name || null,
    reversalOfReference: movement.reversal_of?.reference || null,
    reversalReference: movement.reversal?.reference || null,
    lines: (movement.allocations || []).map((allocation) => {
      const shipment =
        allocation.obligation?.shipment ||
        allocation.earning?.shipment ||
        allocation.entitlement?.shipment;
      const openingEntry =
        allocation.obligation?.opening_entry ||
        allocation.earning?.opening_entry ||
        allocation.entitlement?.opening_entry;

      return {
        id: allocation.id,
        guide: shipment?.display_code || openingEntry?.reference || `Línea #${allocation.id}`,
        amount: Number(allocation.amount),
      };
    }),
  };
}

export function ReconciliationWorkspace() {
  const { showToast } = useToast();
  const [mode, setMode] = useState<WorkspaceMode>("driver");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [driverId, setDriverId] = useState(0);
  const [clientId, setClientId] = useState(0);
  const [from, setFrom] = useState(startOfMonth);
  const [to, setTo] = useState(today);
  const [driverSummary, setDriverSummary] = useState<DriverReconciliation | null>(null);
  const [clientLedger, setClientLedger] = useState<ClientLedger | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const ledgerRequestRef = useRef(0);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [driverResponse, clientRows] = await Promise.all([
          apiGet<DriverCollection>("/drivers?status=active"),
          apiGet<PaginatedClients>("/clients?active_only=1&per_page=100"),
        ]);
        if (!active) return;

        const driverRows = Array.isArray(driverResponse)
          ? driverResponse
          : driverResponse.data || [];
        setDrivers(driverRows);
        setClients(clientRows.data || []);

        const firstDriverId = driverRows[0]?.id ?? 0;
        const firstClientId = clientRows.data?.[0]?.id ?? 0;
        setDriverId(firstDriverId);
        setClientId(firstClientId);

        const [initialDriver, initialClient] = await Promise.all([
          firstDriverId
            ? apiGet<DriverReconciliation>(`/financial/driver-reconciliations/${firstDriverId}?from=${startOfMonth()}&to=${today()}`)
            : Promise.resolve(null),
          firstClientId
            ? apiGet<ClientLedger>(`/financial/client-ledger/${firstClientId}`)
            : Promise.resolve(null),
        ]);
        if (!active) return;
        setDriverSummary(initialDriver);
        setClientLedger(initialClient);
      } catch {
        if (active) {
          showToast("No fue posible cargar los libros de conciliación.", "error");
        }
      } finally {
        if (active) {
          setCatalogLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [showToast]);

  async function loadDriverSummary(nextDriverId = driverId) {
    if (!nextDriverId) return;
    const requestId = ++ledgerRequestRef.current;
    setLedgerLoading(true);
    try {
      const result = await apiGet<DriverReconciliation>(
        `/financial/driver-reconciliations/${nextDriverId}?from=${from}&to=${to}`,
      );
      if (requestId === ledgerRequestRef.current) {
        setDriverSummary(result);
      }
    } catch {
      if (requestId === ledgerRequestRef.current) {
        showToast("No fue posible cargar la conciliación del piloto.", "error");
      }
    } finally {
      if (requestId === ledgerRequestRef.current) {
        setLedgerLoading(false);
      }
    }
  }

  async function loadClientLedger(nextClientId = clientId) {
    if (!nextClientId) return;
    const requestId = ++ledgerRequestRef.current;
    setLedgerLoading(true);
    try {
      const result = await apiGet<ClientLedger>(`/financial/client-ledger/${nextClientId}`);
      if (requestId === ledgerRequestRef.current) {
        setClientLedger(result);
      }
    } catch {
      if (requestId === ledgerRequestRef.current) {
        showToast("No fue posible cargar el libro del cliente.", "error");
      }
    } finally {
      if (requestId === ledgerRequestRef.current) {
        setLedgerLoading(false);
      }
    }
  }

  const codLines = useMemo<MovementLine[]>(
    () =>
      (driverSummary?.cod.lines || []).map((line) => ({
        id: line.id,
        date: line.collection_date.slice(0, 10),
        guide: line.shipment?.display_code || line.opening_entry?.reference || `Línea #${line.id}`,
        description: `COD ${line.payment_method || "reportado"}`,
        originalAmount: Number(line.collected_amount),
        appliedAmount: Number(line.remitted_amount),
        outstandingAmount: Math.max(0, Number(line.collected_amount) - Number(line.remitted_amount)),
      })),
    [driverSummary],
  );

  const serviceLines = useMemo<MovementLine[]>(
    () =>
      (driverSummary?.services.lines || []).map((line) => ({
        id: line.id,
        date: line.earned_date.slice(0, 10),
        guide: line.shipment?.display_code || line.operational_task?.task_code || line.opening_entry?.reference || `Servicio #${line.id}`,
        description: [
          serviceTypeLabel(line.service_type),
          line.rate_rule ? `${line.rate_rule.name} v${line.rate_rule.version}` : "Tarifa histórica/manual",
        ].join(" · "),
        originalAmount: Number(line.amount),
        appliedAmount: Number(line.paid_amount),
        outstandingAmount: Math.max(0, Number(line.amount) - Number(line.paid_amount)),
      })),
    [driverSummary],
  );

  const clientLines = useMemo<MovementLine[]>(
    () =>
      (clientLedger?.lines || []).map((line) => ({
        id: line.id,
        date: line.available_at?.slice(0, 10) || "Pendiente",
        guide: line.shipment?.display_code || line.opening_entry?.reference || `Línea #${line.id}`,
        description: `COD reportado ${formatCOP(Number(line.reported_amount))}`,
        originalAmount: Number(line.available_amount),
        appliedAmount: Number(line.transferred_amount),
        outstandingAmount: Math.max(0, Number(line.available_amount) - Number(line.transferred_amount)),
      })),
    [clientLedger],
  );
  const remittanceHistory = useMemo(
    () => (driverSummary?.remittances || []).map(normalizeMovement),
    [driverSummary],
  );
  const servicePaymentHistory = useMemo(
    () => (driverSummary?.service_payments || []).map(normalizeMovement),
    [driverSummary],
  );
  const clientPayoutHistory = useMemo(
    () => (clientLedger?.payouts || []).map(normalizeMovement),
    [clientLedger],
  );
  const periodIsInvalid = from > to;

  async function reverseMovement(
    endpoint: string,
    reason: string,
    reload: () => Promise<void>,
  ) {
    try {
      await apiJson(
        endpoint,
        "POST",
        { reason },
        { "Idempotency-Key": crypto.randomUUID() },
        { retries: 1, idempotent: true },
      );
      showToast("Reverso registrado sin borrar el movimiento original.", "success");
      await reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No fue posible reversar el movimiento.", "error");
      throw error;
    }
  }

  if (catalogLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 dark:bg-[#23233b]" />
        <Skeleton className="h-64 dark:bg-[#23233b]" />
        <Skeleton className="h-64 dark:bg-[#23233b]" />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Libros por guía</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">Conciliación operativa</h2>
            <p className="mt-1 text-sm text-slate-500">
              COD del piloto, servicios del piloto y dinero disponible para el cliente se administran por separado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de conciliación">
            <button
              type="button"
              aria-pressed={mode === "driver"}
              onClick={() => {
                ledgerRequestRef.current += 1;
                setLedgerLoading(false);
                setMode("driver");
              }}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${
                mode === "driver" ? "bg-primary text-white" : "border border-slate-300 dark:border-[#2a2a3e]"
              }`}
            >
              Cuenta del piloto
            </button>
            <button
              type="button"
              aria-pressed={mode === "client"}
              onClick={() => {
                ledgerRequestRef.current += 1;
                setLedgerLoading(false);
                setMode("client");
              }}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${
                mode === "client" ? "bg-primary text-white" : "border border-slate-300 dark:border-[#2a2a3e]"
              }`}
            >
              Cuenta del cliente
            </button>
          </div>
        </div>
      </div>

      <OpeningBalancesPanel drivers={drivers} clients={clients} />

      {mode === "driver" ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <div className="grid gap-3 md:grid-cols-[1fr_160px_160px_auto] md:items-end">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Piloto</span>
                <select
                  value={driverId}
                  onChange={(event) => {
                    const nextId = Number(event.target.value);
                    setDriverId(nextId);
                    if (nextId) {
                      void loadDriverSummary(nextId);
                    } else {
                      ledgerRequestRef.current += 1;
                      setLedgerLoading(false);
                      setDriverSummary(null);
                    }
                  }}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
                >
                  <option value={0}>Selecciona un piloto</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Desde</span>
                <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Hasta</span>
                <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]" />
              </label>
              <button type="button" disabled={ledgerLoading || !driverId || periodIsInvalid} onClick={() => void loadDriverSummary()} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold disabled:opacity-50 dark:border-[#2a2a3e]">
                {ledgerLoading ? "Cargando..." : "Aplicar período"}
              </button>
            </div>
            {periodIsInvalid ? (
              <p className="mt-2 text-xs font-medium text-rose-600" role="alert">
                La fecha inicial no puede ser posterior a la fecha final.
              </p>
            ) : null}
            {drivers.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-[#2a2a3e]">
                No hay pilotos activos disponibles para conciliar.
              </p>
            ) : null}
          </div>

          {ledgerLoading ? <Skeleton className="h-72 dark:bg-[#23233b]" /> : null}

          {!ledgerLoading && driverSummary ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="COD cobrado" value={driverSummary.cod.collected} />
                <SummaryCard label="COD remitido" value={driverSummary.cod.remitted} tone="text-emerald-600" />
                <SummaryCard label="COD por entregar" value={driverSummary.cod.pending} tone="text-amber-600" />
                <SummaryCard label="Servicios por pagar" value={driverSummary.services.pending} tone="text-rose-600" />
              </div>

              <MovementPanel
                key={`cod-${driverSummary.driver.id}-${driverSummary.cod.remitted}`}
                title="Dinero COD que el piloto entrega a Danhei"
                description="Este movimiento reduce únicamente la obligación COD del piloto y habilita el mismo valor para el cliente."
                endpoint={`/financial/driver-reconciliations/${driverSummary.driver.id}/remittances`}
                actionLabel="Registrar remesa"
                pendingAmount={Number(driverSummary.cod.pending)}
                lines={codLines}
                defaultMethod="cash"
                onCompleted={() => loadDriverSummary(driverSummary.driver.id)}
              />

              <MovementHistory
                title="Historial de remesas COD"
                description="Comprobantes del dinero que el piloto ha entregado a Danhei dentro del período consultado."
                counterpartyLabel="Piloto"
                counterpartyName={driverSummary.driver.name}
                movements={remittanceHistory}
                onReverse={(movement, reason) =>
                  reverseMovement(
                    `/financial/driver-remittances/${movement.id}/reverse`,
                    reason,
                    () => loadDriverSummary(driverSummary.driver.id),
                  )
                }
              />

              <MovementPanel
                key={`services-${driverSummary.driver.id}-${driverSummary.services.paid}`}
                title="Servicios que Danhei paga al piloto"
                description="El pago se aplica a las causaciones de entrega y nunca descuenta automáticamente el COD."
                endpoint={`/financial/driver-reconciliations/${driverSummary.driver.id}/service-payments`}
                actionLabel="Registrar pago"
                pendingAmount={Number(driverSummary.services.pending)}
                lines={serviceLines}
                defaultMethod="bank_transfer"
                onCompleted={() => loadDriverSummary(driverSummary.driver.id)}
              />

              <MovementHistory
                title="Historial de pagos al piloto"
                description="Comprobantes de los servicios que Danhei ha pagado al piloto dentro del período consultado."
                counterpartyLabel="Piloto"
                counterpartyName={driverSummary.driver.name}
                movements={servicePaymentHistory}
                onReverse={(movement, reason) =>
                  reverseMovement(
                    `/financial/driver-service-payments/${movement.id}/reverse`,
                    reason,
                    () => loadDriverSummary(driverSummary.driver.id),
                  )
                }
              />
            </>
          ) : null}
        </>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Cliente</span>
                <select
                  value={clientId}
                  onChange={(event) => {
                    const nextId = Number(event.target.value);
                    setClientId(nextId);
                    if (nextId) {
                      void loadClientLedger(nextId);
                    } else {
                      ledgerRequestRef.current += 1;
                      setLedgerLoading(false);
                      setClientLedger(null);
                    }
                  }}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
                >
                  <option value={0}>Selecciona un cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.company || client.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={ledgerLoading || !clientId} onClick={() => void loadClientLedger()} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold disabled:opacity-50 dark:border-[#2a2a3e]">
                {ledgerLoading ? "Cargando..." : "Actualizar libro"}
              </button>
            </div>
            {clients.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-[#2a2a3e]">
                No hay clientes activos disponibles para liquidar.
              </p>
            ) : null}
          </div>

          {ledgerLoading ? <Skeleton className="h-72 dark:bg-[#23233b]" /> : null}

          {!ledgerLoading && clientLedger ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="COD reportado" value={clientLedger.reported} />
                <SummaryCard label="COD disponible" value={clientLedger.available} tone="text-blue-600" />
                <SummaryCard label="Transferido" value={clientLedger.transferred} tone="text-emerald-600" />
                <SummaryCard label="Pendiente por transferir" value={clientLedger.pending_transfer} tone="text-amber-600" />
              </div>

              <MovementPanel
                key={`client-${clientLedger.client.id}-${clientLedger.transferred}`}
                title="COD que Danhei transfiere al cliente"
                description="Solo se pueden transferir fondos previamente recibidos o verificados y disponibles en el libro del cliente."
                endpoint={`/financial/client-ledger/${clientLedger.client.id}/payouts`}
                actionLabel="Registrar transferencia"
                pendingAmount={Number(clientLedger.pending_transfer)}
                lines={clientLines}
                defaultMethod="bank_transfer"
                onCompleted={() => loadClientLedger(clientLedger.client.id)}
              />

              <MovementHistory
                title="Historial de transferencias al cliente"
                description="Comprobantes del COD disponible que Danhei ha transferido al cliente."
                counterpartyLabel="Cliente"
                counterpartyName={clientLedger.client.company || clientLedger.client.name}
                movements={clientPayoutHistory}
                onReverse={(movement, reason) =>
                  reverseMovement(
                    `/financial/client-payouts/${movement.id}/reverse`,
                    reason,
                    () => loadClientLedger(clientLedger.client.id),
                  )
                }
              />
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

function SummaryCard({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{formatCOP(Number(value || 0))}</p>
    </article>
  );
}

function serviceTypeLabel(serviceType: string): string {
  const labels: Record<string, string> = {
    delivery: "Entrega",
    pickup: "Recogida",
    return_to_hub: "Devolución a sede",
    return_to_client: "Devolución al cliente",
    opening_balance: "Saldo de apertura",
  };

  return labels[serviceType] || serviceType;
}
