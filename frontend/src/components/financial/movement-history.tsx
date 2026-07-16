"use client";

import type { MovementHistoryItem } from "@/components/financial/ledger-types";
import { formatCOP } from "@/lib/utils";
import { useState } from "react";

type MovementHistoryProps = {
  title: string;
  description: string;
  counterpartyLabel: string;
  counterpartyName: string;
  movements: MovementHistoryItem[];
  onReverse?: (movement: MovementHistoryItem, reason: string) => Promise<void>;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMovementDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function paymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Efectivo",
    bank_transfer: "Transferencia bancaria",
    nequi: "Nequi",
    reversal: "Reverso contable",
  };

  return labels[method] || method;
}

function downloadReceiptCsv(movement: MovementHistoryItem, counterpartyName: string) {
  const rows = [
    ["Referencia", movement.reference],
    ["Fecha", formatMovementDate(movement.date)],
    ["Tercero", counterpartyName],
    ["Tipo", movement.movementType === "reversal" ? "Reverso" : "Movimiento"],
    ["Monto", String(movement.amount)],
    ["Saldo anterior", String(movement.balanceBefore)],
    ["Efecto en saldo", String(movement.movementType === "reversal" ? movement.amount : -movement.amount)],
    ["Saldo posterior", String(movement.balanceAfter)],
    ["Método", paymentMethodLabel(movement.method)],
    ["Referencia externa", movement.externalReference || ""],
    ["Registrado por", movement.actorName || ""],
    ["Aprobado por", movement.approvedByName || ""],
    ["Revierte a", movement.reversalOfReference || ""],
    ["Reversado por", movement.reversalReference || ""],
    ["Notas", movement.notes || ""],
    [],
    ["Guía", "Monto aplicado"],
    ...movement.lines.map((line) => [line.guide, String(line.amount)]),
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${movement.reference}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function printReceipt(
  movement: MovementHistoryItem,
  counterpartyLabel: string,
  counterpartyName: string,
) {
  const lineRows = movement.lines
    .map(
      (line) => `
        <tr>
          <td>${escapeHtml(line.guide)}</td>
          <td class="right">${escapeHtml(formatCOP(line.amount))}</td>
        </tr>`,
    )
    .join("");
  const html = `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Comprobante ${escapeHtml(movement.reference)}</title>
        <style>
          @page { size: A4; margin: 18mm; }
          body { color: #172033; font-family: Arial, sans-serif; font-size: 12px; margin: 0; }
          h1 { color: #e6007e; font-size: 22px; margin: 0; }
          h2 { font-size: 16px; margin: 24px 0 8px; }
          .header { border-bottom: 2px solid #e6007e; padding-bottom: 12px; }
          .grid { display: grid; gap: 8px 24px; grid-template-columns: 1fr 1fr; margin-top: 18px; }
          .label { color: #64748b; display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; }
          .amount { font-size: 20px; font-weight: 700; }
          table { border-collapse: collapse; margin-top: 8px; width: 100%; }
          th, td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: left; }
          th { background: #f8fafc; font-size: 10px; text-transform: uppercase; }
          .right { text-align: right; }
          .footer { border-top: 1px solid #cbd5e1; color: #64748b; margin-top: 28px; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>DANHEI EXPRESS</h1>
          <div>Comprobante financiero ${escapeHtml(movement.reference)}</div>
        </div>
        <div class="grid">
          <div><span class="label">Fecha</span>${escapeHtml(formatMovementDate(movement.date))}</div>
          <div><span class="label">${escapeHtml(counterpartyLabel)}</span>${escapeHtml(counterpartyName)}</div>
          <div><span class="label">Método</span>${escapeHtml(paymentMethodLabel(movement.method))}</div>
          <div><span class="label">Referencia externa</span>${escapeHtml(movement.externalReference || "No registrada")}</div>
          <div><span class="label">Registrado por</span>${escapeHtml(movement.actorName || "No disponible")}</div>
          <div><span class="label">Aprobado por</span>${escapeHtml(movement.approvedByName || "No disponible")}</div>
          <div><span class="label">Monto</span><span class="amount">${escapeHtml(formatCOP(movement.amount))}</span></div>
          <div><span class="label">Tipo</span>${escapeHtml(movement.movementType === "reversal" ? "Reverso contable" : "Movimiento financiero")}</div>
          <div><span class="label">Saldo anterior</span>${escapeHtml(formatCOP(movement.balanceBefore))}</div>
          <div><span class="label">Efecto en saldo</span>${escapeHtml(`${movement.movementType === "reversal" ? "+" : "-"} ${formatCOP(movement.amount)}`)}</div>
          <div><span class="label">Saldo posterior</span>${escapeHtml(formatCOP(movement.balanceAfter))}</div>
          ${movement.reversalOfReference ? `<div><span class="label">Revierte a</span>${escapeHtml(movement.reversalOfReference)}</div>` : ""}
          ${movement.reversalReference ? `<div><span class="label">Reversado por</span>${escapeHtml(movement.reversalReference)}</div>` : ""}
        </div>
        <h2>Aplicación por guía</h2>
        <table>
          <thead><tr><th>Guía</th><th class="right">Monto aplicado</th></tr></thead>
          <tbody>${lineRows}</tbody>
        </table>
        ${movement.notes ? `<h2>Notas</h2><p>${escapeHtml(movement.notes)}</p>` : ""}
        <div class="footer">Documento generado desde el panel administrativo de Danhei. La impresión puede guardarse como PDF.</div>
      </body>
    </html>`;
  const popup = window.open("", "_blank", "width=820,height=900");
  if (!popup) return;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
}

export function MovementHistory({
  title,
  description,
  counterpartyLabel,
  counterpartyName,
  movements,
  onReverse,
}: MovementHistoryProps) {
  const [reversalTarget, setReversalTarget] = useState<MovementHistoryItem | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversing, setReversing] = useState(false);

  async function confirmReversal() {
    if (!reversalTarget || !onReverse || reversalReason.trim().length < 10) return;

    setReversing(true);
    try {
      await onReverse(reversalTarget, reversalReason.trim());
      setReversalTarget(null);
      setReversalReason("");
    } catch {
      // El callback ya presenta el error; se conserva el formulario para corregir o reintentar.
    } finally {
      setReversing(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
      <h3 className="font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>

      {reversalTarget ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Reversar {reversalTarget.reference}
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            Se creará un movimiento inverso; el comprobante original permanecerá en el historial.
          </p>
          <textarea
            autoFocus
            rows={2}
            minLength={10}
            maxLength={1000}
            value={reversalReason}
            onChange={(event) => setReversalReason(event.target.value)}
            className="mt-3 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm dark:border-amber-500/30 dark:bg-[#16162a]"
            placeholder="Motivo obligatorio de al menos 10 caracteres"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              disabled={reversing}
              onClick={() => {
                setReversalTarget(null);
                setReversalReason("");
              }}
              className="min-h-10 rounded-lg border border-amber-400 px-3 text-xs font-semibold disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={reversing || reversalReason.trim().length < 10}
              onClick={() => void confirmReversal()}
              className="min-h-10 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {reversing ? "Reversando..." : "Crear reverso"}
            </button>
          </div>
        </div>
      ) : null}

      {movements.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-[#2a2a3e]">
          No hay movimientos registrados en este período.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {movements.map((movement) => (
            <article key={movement.id} className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{movement.reference}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {movement.movementType === "reversal" ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        Reverso
                      </span>
                    ) : null}
                    {movement.status === "reversed" ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-500/15">
                        Anulado
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatMovementDate(movement.date)} · {paymentMethodLabel(movement.method)}
                    {movement.externalReference ? ` · ${movement.externalReference}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {movement.lines.length} línea{movement.lines.length === 1 ? "" : "s"}
                    {movement.actorName ? ` · registrado por ${movement.actorName}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Saldo {formatCOP(movement.balanceBefore)} → {formatCOP(movement.balanceAfter)}
                    {movement.reversalOfReference ? ` · revierte ${movement.reversalOfReference}` : ""}
                    {movement.reversalReference ? ` · reversado por ${movement.reversalReference}` : ""}
                  </p>
                </div>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatCOP(movement.amount)}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => printReceipt(movement, counterpartyLabel, counterpartyName)}
                  className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold dark:border-[#2a2a3e]"
                >
                  Imprimir / PDF
                </button>
                <button
                  type="button"
                  onClick={() => downloadReceiptCsv(movement, counterpartyName)}
                  className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold dark:border-[#2a2a3e]"
                >
                  Descargar CSV
                </button>
                {onReverse && movement.movementType === "standard" && movement.status !== "reversed" && !movement.reversalReference ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReversalTarget(movement);
                      setReversalReason("");
                    }}
                    className="min-h-10 rounded-lg border border-amber-400 px-3 text-xs font-semibold text-amber-700 dark:text-amber-300"
                  >
                    Reversar
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
