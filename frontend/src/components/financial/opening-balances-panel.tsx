"use client";

import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { apiGet, apiJson } from "@/lib/api";
import type { Client, Driver } from "@/lib/types";
import { formatCOP } from "@/lib/utils";
import { FormEvent, useEffect, useMemo, useState } from "react";

type AccountType = "driver_cod_due" | "driver_service_payable" | "client_cod_available";

type OpeningEntry = {
  id: number;
  reference: string;
  account_type: AccountType;
  amount: number;
  effective_date: string;
  support_reference: string;
  notes?: string | null;
  driver?: { id: number; name: string } | null;
  client?: { id: number; name: string; company?: string | null } | null;
  approved_by?: { id: number; name: string } | null;
};

type OpeningResponse = { data: OpeningEntry[] };
type OpeningBalancesPanelProps = {
  drivers: Driver[];
  clients: Client[];
};

const accountLabels: Record<AccountType, string> = {
  driver_cod_due: "COD que el piloto debe a Danhei",
  driver_service_payable: "Servicios que Danhei debe al piloto",
  client_cod_available: "COD disponible para el cliente",
};

function localToday(): string {
  const current = new Date();
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
}

export function OpeningBalancesPanel({ drivers, clients }: OpeningBalancesPanelProps) {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<OpeningEntry[]>([]);
  const [accountType, setAccountType] = useState<AccountType>("driver_cod_due");
  const [entityId, setEntityId] = useState("");
  const [amount, setAmount] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(localToday);
  const [supportReference, setSupportReference] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadEntries() {
    const response = await apiGet<OpeningResponse>("/financial/opening-entries");
    setEntries(response.data || []);
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const entryResponse = await apiGet<OpeningResponse>("/financial/opening-entries");
        if (!active) return;

        setEntries(entryResponse.data || []);
      } catch (error) {
        if (active) {
          showToast(error instanceof Error ? error.message : "No fue posible cargar los saldos de apertura.", "error");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [showToast]);

  const entities = useMemo(
    () =>
      accountType === "client_cod_available"
        ? clients.map((client) => ({ id: client.id, label: client.company || client.name }))
        : drivers.map((driver) => ({ id: driver.id, label: driver.name })),
    [accountType, clients, drivers],
  );

  async function submitOpening(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!entityId || !Number.isInteger(parsedAmount) || parsedAmount < 1) {
      showToast("Selecciona el tercero e ingresa un saldo válido en pesos.", "error");
      return;
    }

    setSaving(true);
    try {
      await apiJson(
        "/financial/opening-entries",
        "POST",
        {
          account_type: accountType,
          driver_id: accountType === "client_cod_available" ? null : Number(entityId),
          client_id: accountType === "client_cod_available" ? Number(entityId) : null,
          amount: parsedAmount,
          effective_date: effectiveDate,
          support_reference: supportReference.trim(),
          notes: notes.trim() || null,
        },
        { "Idempotency-Key": crypto.randomUUID() },
        { retries: 1, idempotent: true },
      );
      showToast("Saldo de apertura registrado con soporte y aprobación.", "success");
      setAmount("");
      setSupportReference("");
      setNotes("");
      await loadEntries();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No fue posible registrar el saldo de apertura.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Skeleton className="h-48 dark:bg-[#23233b]" />;
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
      <summary className="cursor-pointer list-none">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Día cero</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-slate-900 dark:text-slate-100">Apertura histórica de saldos</h2>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-500/15">
            {entries.length} asientos
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Registra el saldo confirmado al iniciar el sistema sin crear entregas o guías ficticias.
        </p>
      </summary>

      <form onSubmit={submitOpening} className="mt-4 grid gap-3 lg:grid-cols-4">
        <label className="space-y-1 lg:col-span-2">
          <span className="text-xs font-semibold text-slate-500">Cuenta de apertura</span>
          <select
            value={accountType}
            onChange={(event) => {
              setAccountType(event.target.value as AccountType);
              setEntityId("");
            }}
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
          >
            {(Object.keys(accountLabels) as AccountType[]).map((key) => (
              <option key={key} value={key}>{accountLabels[key]}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 lg:col-span-2">
          <span className="text-xs font-semibold text-slate-500">
            {accountType === "client_cod_available" ? "Cliente" : "Piloto"}
          </span>
          <select
            required
            value={entityId}
            onChange={(event) => setEntityId(event.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
          >
            <option value="">Selecciona una opción</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>{entity.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-slate-500">Saldo COP</span>
          <input
            required
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-slate-500">Fecha de corte</span>
          <input
            required
            type="date"
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
          />
        </label>
        <label className="space-y-1 lg:col-span-2">
          <span className="text-xs font-semibold text-slate-500">Soporte o acta de corte</span>
          <input
            required
            minLength={3}
            maxLength={191}
            value={supportReference}
            onChange={(event) => setSupportReference(event.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
            placeholder="Ej. ACTA-CORTE-2026-001"
          />
        </label>
        <label className="space-y-1 lg:col-span-4">
          <span className="text-xs font-semibold text-slate-500">Notas</span>
          <textarea
            rows={2}
            maxLength={1000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
          />
        </label>
        <div className="flex justify-end lg:col-span-4">
          <button disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Registrando..." : "Registrar apertura"}
          </button>
        </div>
      </form>

      {entries.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Asiento</th>
                <th className="px-2 py-2">Cuenta</th>
                <th className="px-2 py-2">Tercero</th>
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2">Soporte</th>
                <th className="px-2 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100 dark:border-[#2a2a3e]">
                  <td className="px-2 py-3 font-semibold">{entry.reference}</td>
                  <td className="px-2 py-3">{accountLabels[entry.account_type]}</td>
                  <td className="px-2 py-3">{entry.driver?.name || entry.client?.company || entry.client?.name || "—"}</td>
                  <td className="px-2 py-3">{entry.effective_date.slice(0, 10)}</td>
                  <td className="px-2 py-3">{entry.support_reference}</td>
                  <td className="px-2 py-3 text-right font-bold">{formatCOP(Number(entry.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </details>
  );
}
