"use client";

import { apiJson } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import type { DriverCodLine } from "@/components/financial/ledger-types";

type DigitalPaymentsPanelProps = {
  driverId: number;
  pendingAmount: number;
  lines: DriverCodLine[];
  onCompleted: () => Promise<void>;
};

function methodLabel(method?: string | null): string {
  const normalized = (method || "").trim().toLowerCase();
  if (normalized === "nequi") return "Nequi";
  if (normalized === "daviplata") return "Daviplata";
  return "Transferencia";
}

/**
 * Cobros que el piloto recibió por Transferencia, Nequi o Daviplata. Ese
 * dinero no lo tiene él: llega directo a la cuenta de Danhei. Por eso no se
 * suma al efectivo por entregar; la oficina solo confirma que sí llegó.
 */
export function DigitalPaymentsPanel({ driverId, pendingAmount, lines, onCompleted }: DigitalPaymentsPanelProps) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pendingLines = useMemo(
    () => lines.filter((line) => Number(line.collected_amount) - Number(line.remitted_amount) > 0),
    [lines],
  );
  const selectedLines = pendingLines.filter((line) => selected[line.id]);
  const selectedTotal = selectedLines.reduce(
    (sum, line) => sum + Number(line.collected_amount) - Number(line.remitted_amount),
    0,
  );

  async function confirmArrived() {
    if (selectedLines.length === 0) {
      showToast("Marca los pagos que ya viste en la cuenta.", "info");
      return;
    }
    setSubmitting(true);
    try {
      await apiJson(
        `/financial/driver-reconciliations/${driverId}/digital-verifications`,
        "POST",
        {
          obligation_ids: selectedLines.map((line) => line.id),
          external_reference: reference.trim() || null,
        },
        { "Idempotency-Key": crypto.randomUUID() },
        { retries: 1, idempotent: true },
      );
      showToast(
        selectedLines.length === 1 ? "Pago digital confirmado." : `${selectedLines.length} pagos digitales confirmados.`,
        "success",
      );
      setSelected({});
      setReference("");
      await onCompleted();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No fue posible confirmar el pago digital.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article
      data-testid="digital-payments-panel"
      className="rounded-xl border border-sky-200 bg-white p-4 dark:border-sky-500/30 dark:bg-[#1a1a2e]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-slate-100">Pago digital — verificar</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Cobros por Transferencia, Nequi o Daviplata. Ese dinero no lo trae el piloto: revisa que haya
            llegado a la cuenta de Danhei y confírmalo. No se suma al efectivo por entregar.
          </p>
        </div>
        <div className="rounded-lg bg-sky-50 px-3 py-2 text-right dark:bg-sky-400/10">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Por verificar</p>
          <p className="text-lg font-bold text-sky-700 dark:text-sky-300">{formatCOP(pendingAmount)}</p>
        </div>
      </div>

      {pendingLines.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-[#2a2a3e]">
          No hay pagos digitales pendientes de verificar en este período.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {pendingLines.map((line) => {
              const outstanding = Number(line.collected_amount) - Number(line.remitted_amount);
              return (
                <label
                  key={line.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-[#2a2a3e]"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(selected[line.id])}
                    onChange={(event) => setSelected((current) => ({ ...current, [line.id]: event.target.checked }))}
                  />
                  <span className="min-w-0 flex-1">
                    <strong className="text-slate-900 dark:text-slate-100">
                      {line.shipment?.display_code || line.opening_entry?.reference || `Línea #${line.id}`}
                    </strong>
                    <span className="ml-2 text-xs text-slate-500">{line.collection_date.slice(0, 10)}</span>
                    <span className="block text-xs text-slate-500">{methodLabel(line.payment_method)}</span>
                  </span>
                  <strong className="text-slate-900 dark:text-slate-100">{formatCOP(outstanding)}</strong>
                </label>
              );
            })}
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-500">Referencia del banco o de la app (opcional)</span>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={120}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm">
              Seleccionado: <strong>{formatCOP(selectedTotal)}</strong>
            </span>
            <button
              type="button"
              disabled={submitting || selectedLines.length === 0}
              onClick={() => void confirmArrived()}
              className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Confirmando..." : "Confirmar que llegó"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
