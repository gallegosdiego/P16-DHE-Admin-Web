"use client";

import { apiJson } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import type { MovementLine } from "@/components/financial/ledger-types";

type AllocationMode = "selection" | "fifo";
type PaymentMethod = "cash" | "bank_transfer" | "nequi";

type MovementPanelProps = {
  title: string;
  description: string;
  endpoint: string;
  actionLabel: string;
  pendingAmount: number;
  lines: MovementLine[];
  defaultMethod: PaymentMethod;
  onCompleted: () => Promise<void>;
};

export function MovementPanel({
  title,
  description,
  endpoint,
  actionLabel,
  pendingAmount,
  lines,
  defaultMethod,
  onCompleted,
}: MovementPanelProps) {
  const { showToast } = useToast();
  const [allocationMode, setAllocationMode] = useState<AllocationMode>("selection");
  const [selectedAmounts, setSelectedAmounts] = useState<Record<number, string>>({});
  const [fifoAmount, setFifoAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod);
  const [externalReference, setExternalReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pendingLines = useMemo(
    () => lines.filter((line) => line.outstandingAmount > 0),
    [lines],
  );

  const selectedAllocations = useMemo(
    () =>
      pendingLines.flatMap((line) => {
        const amount = Number(selectedAmounts[line.id] || 0);
        return amount > 0 ? [{ id: line.id, amount }] : [];
      }),
    [pendingLines, selectedAmounts],
  );

  const selectedTotal = useMemo(
    () => selectedAllocations.reduce((sum, allocation) => sum + allocation.amount, 0),
    [selectedAllocations],
  );

  const effectiveAmount = allocationMode === "selection" ? selectedTotal : Number(fifoAmount || 0);
  const amountIsValid = effectiveAmount > 0 && effectiveAmount <= pendingAmount;

  function toggleLine(line: MovementLine, checked: boolean) {
    setSelectedAmounts((current) => {
      const next = { ...current };
      if (checked) {
        next[line.id] = String(line.outstandingAmount);
      } else {
        delete next[line.id];
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedAmounts(
      Object.fromEntries(pendingLines.map((line) => [line.id, String(line.outstandingAmount)])),
    );
  }

  async function submitMovement() {
    if (!amountIsValid) {
      showToast("El monto debe ser mayor a cero y no puede superar el saldo pendiente.", "error");
      return;
    }

    if (allocationMode === "selection") {
      const invalidAllocation = selectedAllocations.some((allocation) => {
        const line = pendingLines.find((item) => item.id === allocation.id);
        return !line || allocation.amount > line.outstandingAmount;
      });
      if (invalidAllocation) {
        showToast("Una asignación supera el saldo disponible de la guía.", "error");
        return;
      }
    }

    setSubmitting(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      await apiJson(
        endpoint,
        "POST",
        {
          amount: effectiveAmount,
          method,
          external_reference: externalReference.trim() || null,
          notes: notes.trim() || null,
          allocations: allocationMode === "selection" ? selectedAllocations : undefined,
        },
        { "Idempotency-Key": idempotencyKey },
        { retries: 1, idempotent: true },
      );
      showToast("Movimiento registrado correctamente.", "success");
      setSelectedAmounts({});
      setFifoAmount("");
      setExternalReference("");
      setNotes("");
      await onCompleted();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No fue posible registrar el movimiento.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-right dark:bg-amber-400/10">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Saldo pendiente</p>
          <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{formatCOP(pendingAmount)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Modo de asignación">
        <button
          type="button"
          aria-pressed={allocationMode === "selection"}
          onClick={() => setAllocationMode("selection")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
            allocationMode === "selection"
              ? "border-primary bg-primary/10 text-primary"
              : "border-slate-300 text-slate-600 dark:border-[#2a2a3e] dark:text-slate-300"
          }`}
        >
          Por guías seleccionadas
        </button>
        <button
          type="button"
          aria-pressed={allocationMode === "fifo"}
          onClick={() => setAllocationMode("fifo")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
            allocationMode === "fifo"
              ? "border-primary bg-primary/10 text-primary"
              : "border-slate-300 text-slate-600 dark:border-[#2a2a3e] dark:text-slate-300"
          }`}
        >
          Por monto FIFO
        </button>
      </div>

      {allocationMode === "selection" ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{pendingLines.length} líneas con saldo</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSelectedAmounts({})} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                Limpiar
              </button>
              <button type="button" onClick={selectAll} className="text-xs font-semibold text-primary">
                Seleccionar todas
              </button>
            </div>
          </div>

          {pendingLines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-[#2a2a3e]">
              No hay líneas pendientes para este período.
            </p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {pendingLines.map((line) => {
                const selected = selectedAmounts[line.id] !== undefined;
                return (
                  <label key={line.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[auto_1fr_150px] sm:items-center dark:border-[#2a2a3e]">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => toggleLine(line, event.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm text-slate-900 dark:text-slate-100">{line.guide}</strong>
                        <span className="text-xs text-slate-500">{line.date}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{line.description}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        Original {formatCOP(line.originalAmount)} · aplicado {formatCOP(line.appliedAmount)}
                      </span>
                    </span>
                    <span>
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Aplicar</span>
                      <input
                        type="number"
                        min="1"
                        max={line.outstandingAmount}
                        step="1"
                        disabled={!selected}
                        value={selectedAmounts[line.id] ?? ""}
                        onChange={(event) => setSelectedAmounts((current) => ({ ...current, [line.id]: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-slate-300 px-3 text-right text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
                      />
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-[#16162a]">
            <span>Total seleccionado</span>
            <strong>{formatCOP(selectedTotal)}</strong>
          </div>
        </div>
      ) : (
        <label className="mt-4 block space-y-1">
          <span className="text-xs font-semibold text-slate-500">Monto a distribuir por antigüedad</span>
          <input
            type="number"
            min="1"
            max={pendingAmount}
            step="1"
            value={fifoAmount}
            onChange={(event) => setFifoAmount(event.target.value)}
            placeholder={`Máximo ${formatCOP(pendingAmount)}`}
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
          />
        </label>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-slate-500">Método</span>
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
          >
            <option value="cash">Efectivo</option>
            <option value="bank_transfer">Transferencia bancaria</option>
            <option value="nequi">Nequi</option>
          </select>
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-semibold text-slate-500">Referencia externa</span>
          <input
            value={externalReference}
            onChange={(event) => setExternalReference(event.target.value)}
            maxLength={120}
            placeholder="Número de transferencia, recibo o soporte"
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
          />
        </label>
        <label className="space-y-1 md:col-span-3">
          <span className="text-xs font-semibold text-slate-500">Notas</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={1000}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          El movimiento quedará trazado por guía y no compensará automáticamente otras cuentas.
        </p>
        <button
          type="button"
          disabled={submitting || !amountIsValid}
          onClick={() => void submitMovement()}
          className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Registrando..." : `${actionLabel} · ${formatCOP(effectiveAmount)}`}
        </button>
      </div>
    </article>
  );
}
