"use client";

import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { apiGet, apiJson } from "@/lib/api";
import type { Client, Driver, Zone } from "@/lib/types";
import { formatCOP } from "@/lib/utils";
import { FormEvent, useEffect, useMemo, useState } from "react";

type ServiceType = "delivery" | "pickup" | "return_to_hub" | "return_to_client";
type ScopeType = "global" | "driver" | "client" | "zone";

type RateRule = {
  id: number;
  rule_key: string;
  version: number;
  name: string;
  service_type: ServiceType;
  scope_type: ScopeType;
  driver_id?: number | null;
  client_id?: number | null;
  zone_id?: number | null;
  amount: number;
  effective_from: string;
  effective_to?: string | null;
  priority: number;
  is_active: boolean;
  change_reason: string;
  driver?: { id: number; name: string } | null;
  client?: { id: number; name: string; company?: string | null } | null;
  zone?: { id: number; name: string } | null;
  approved_by?: { id: number; name: string } | null;
};

type RuleForm = {
  name: string;
  service_type: ServiceType;
  scope_type: ScopeType;
  entity_id: string;
  amount: string;
  effective_from: string;
  effective_to: string;
  priority: string;
  change_reason: string;
};

type ClientResponse = { data: Client[] };
type DriverResponse = Driver[] | { data?: Driver[] };
type RateRulesResponse = { data: RateRule[] };

const serviceLabels: Record<ServiceType, string> = {
  delivery: "Entrega",
  pickup: "Recogida",
  return_to_hub: "Devolución a sede",
  return_to_client: "Devolución al cliente",
};

const scopeLabels: Record<ScopeType, string> = {
  global: "Global",
  driver: "Piloto",
  client: "Cliente",
  zone: "Zona",
};

function today(): string {
  const current = new Date();
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function blankForm(): RuleForm {
  return {
    name: "",
    service_type: "delivery",
    scope_type: "global",
    entity_id: "",
    amount: "",
    effective_from: today(),
    effective_to: "",
    priority: "0",
    change_reason: "",
  };
}

export function FinancialRateRulesPanel() {
  const { showToast } = useToast();
  const [rules, setRules] = useState<RateRule[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [form, setForm] = useState<RuleForm>(blankForm);
  const [editingRule, setEditingRule] = useState<RateRule | null>(null);
  const [toggleTarget, setToggleTarget] = useState<RateRule | null>(null);
  const [toggleReason, setToggleReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function loadRules(): Promise<void> {
    const response = await apiGet<RateRulesResponse>("/financial/rate-rules");
    setRules(response.data || []);
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [ruleResponse, driverResponse, clientResponse, zoneResponse] = await Promise.all([
          apiGet<RateRulesResponse>("/financial/rate-rules"),
          apiGet<DriverResponse>("/drivers?status=active"),
          apiGet<ClientResponse>("/clients?active_only=1&per_page=100"),
          apiGet<Zone[]>("/zones?active=1"),
        ]);
        if (!active) return;

        setRules(ruleResponse.data || []);
        setDrivers(Array.isArray(driverResponse) ? driverResponse : driverResponse.data || []);
        setClients(clientResponse.data || []);
        setZones(Array.isArray(zoneResponse) ? zoneResponse : []);
      } catch (error) {
        if (active) {
          showToast(error instanceof Error ? error.message : "No fue posible cargar las reglas financieras.", "error");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [showToast]);

  const groupedRules = useMemo(
    () =>
      (Object.keys(serviceLabels) as ServiceType[]).map((serviceType) => ({
        serviceType,
        rules: rules.filter((rule) => rule.service_type === serviceType),
      })),
    [rules],
  );
  const latestVersionIds = useMemo(() => {
    const latest = new Map<string, RateRule>();

    for (const rule of rules) {
      const current = latest.get(rule.rule_key);
      if (!current || rule.version > current.version) {
        latest.set(rule.rule_key, rule);
      }
    }

    return new Set(Array.from(latest.values(), (rule) => rule.id));
  }, [rules]);

  function entityOptions(): Array<{ id: number; label: string }> {
    if (form.scope_type === "driver") {
      return drivers.map((driver) => ({ id: driver.id, label: driver.name }));
    }
    if (form.scope_type === "client") {
      return clients.map((client) => ({ id: client.id, label: client.company || client.name }));
    }
    if (form.scope_type === "zone") {
      return zones.map((zone) => ({ id: zone.id, label: zone.name }));
    }

    return [];
  }

  function startVersion(rule: RateRule) {
    const entityId = rule.driver_id || rule.client_id || rule.zone_id || "";
    const currentDate = today();
    const earliestVersionDate = rule.effective_from.slice(0, 10);
    setEditingRule(rule);
    setForm({
      name: rule.name,
      service_type: rule.service_type,
      scope_type: rule.scope_type,
      entity_id: String(entityId),
      amount: String(rule.amount),
      effective_from: earliestVersionDate > currentDate ? earliestVersionDate : currentDate,
      effective_to: "",
      priority: String(rule.priority),
      change_reason: "",
    });
  }

  function resetForm() {
    setEditingRule(null);
    setForm(blankForm());
  }

  async function submitRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.scope_type !== "global" && !form.entity_id) {
      showToast(`Selecciona el ${scopeLabels[form.scope_type].toLowerCase()} de la regla.`, "error");
      return;
    }

    const amount = Number(form.amount);
    if (!Number.isInteger(amount) || amount < 0) {
      showToast("La tarifa debe ser un número entero en pesos.", "error");
      return;
    }

    const entityId = form.entity_id ? Number(form.entity_id) : null;
    const payload = {
      name: form.name.trim(),
      service_type: form.service_type,
      scope_type: form.scope_type,
      driver_id: form.scope_type === "driver" ? entityId : null,
      client_id: form.scope_type === "client" ? entityId : null,
      zone_id: form.scope_type === "zone" ? entityId : null,
      amount,
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      priority: Number(form.priority || 0),
      change_reason: form.change_reason.trim(),
    };

    setSaving(true);
    try {
      const endpoint = editingRule
        ? `/financial/rate-rules/${editingRule.id}/versions`
        : "/financial/rate-rules";
      await apiJson(endpoint, "POST", payload);
      showToast(editingRule ? "Nueva versión de tarifa creada." : "Regla financiera creada.", "success");
      resetForm();
      await loadRules();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No fue posible guardar la regla.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function confirmToggle() {
    if (!toggleTarget || toggleReason.trim().length < 5) {
      showToast("Escribe un motivo de al menos cinco caracteres.", "error");
      return;
    }

    setToggling(true);
    try {
      await apiJson(`/financial/rate-rules/${toggleTarget.id}/toggle`, "POST", {
        is_active: !toggleTarget.is_active,
        change_reason: toggleReason.trim(),
      });
      showToast(toggleTarget.is_active ? "Regla desactivada." : "Regla activada.", "success");
      setToggleTarget(null);
      setToggleReason("");
      await loadRules();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No fue posible actualizar la regla.", "error");
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-40 dark:bg-[#23233b]" />
        <Skeleton className="h-64 dark:bg-[#23233b]" />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">FIN-01</p>
        <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Tarifas de servicios a pilotos</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          La regla más específica gana: piloto, cliente, zona y finalmente global. Cada cambio crea una versión y no modifica causaciones históricas.
        </p>

        <form onSubmit={submitRule} className="mt-4 grid gap-3 lg:grid-cols-4">
          <label className="space-y-1 lg:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Nombre de la regla</span>
            <input
              required
              maxLength={120}
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
              placeholder="Ej. Entrega estándar Bogotá"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Servicio</span>
            <select
              value={form.service_type}
              onChange={(event) => setForm((current) => ({ ...current, service_type: event.target.value as ServiceType }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
            >
              {(Object.keys(serviceLabels) as ServiceType[]).map((serviceType) => (
                <option key={serviceType} value={serviceType}>{serviceLabels[serviceType]}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Alcance</span>
            <select
              value={form.scope_type}
              onChange={(event) => setForm((current) => ({
                ...current,
                scope_type: event.target.value as ScopeType,
                entity_id: "",
              }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
            >
              {(Object.keys(scopeLabels) as ScopeType[]).map((scopeType) => (
                <option key={scopeType} value={scopeType}>{scopeLabels[scopeType]}</option>
              ))}
            </select>
          </label>

          {form.scope_type !== "global" ? (
            <label className="space-y-1 lg:col-span-2">
              <span className="text-xs font-semibold text-slate-500">{scopeLabels[form.scope_type]}</span>
              <select
                required
                value={form.entity_id}
                onChange={(event) => setForm((current) => ({ ...current, entity_id: event.target.value }))}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
              >
                <option value="">Selecciona una opción</option>
                {entityOptions().map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Tarifa COP</span>
            <input
              required
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Prioridad</span>
            <input
              type="number"
              min="0"
              max="1000"
              step="1"
              value={form.priority}
              onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Vigente desde</span>
            <input
              required
              type="date"
              value={form.effective_from}
              onChange={(event) => setForm((current) => ({ ...current, effective_from: event.target.value }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Vigente hasta</span>
            <input
              type="date"
              min={form.effective_from}
              value={form.effective_to}
              onChange={(event) => setForm((current) => ({ ...current, effective_to: event.target.value }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
            />
          </label>
          <label className="space-y-1 lg:col-span-4">
            <span className="text-xs font-semibold text-slate-500">Motivo y aprobación</span>
            <textarea
              required
              minLength={5}
              maxLength={1000}
              rows={2}
              value={form.change_reason}
              onChange={(event) => setForm((current) => ({ ...current, change_reason: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"
              placeholder="Explica por qué se crea o cambia esta tarifa."
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end lg:col-span-4">
            {editingRule ? (
              <button type="button" onClick={resetForm} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold dark:border-[#2a2a3e]">
                Cancelar versión
              </button>
            ) : null}
            <button disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Guardando..." : editingRule ? `Crear versión ${editingRule.version + 1}` : "Crear regla"}
            </button>
          </div>
        </form>
      </div>

      {toggleTarget ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <h3 className="font-semibold text-amber-900 dark:text-amber-200">
            {toggleTarget.is_active ? "Desactivar" : "Activar"} {toggleTarget.name}
          </h3>
          <textarea
            autoFocus
            rows={2}
            value={toggleReason}
            onChange={(event) => setToggleReason(event.target.value)}
            className="mt-3 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm dark:border-amber-500/30 dark:bg-[#16162a]"
            placeholder="Motivo obligatorio"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setToggleTarget(null)} className="min-h-10 rounded-lg border border-amber-400 px-3 text-sm">
              Cancelar
            </button>
            <button type="button" disabled={toggling} onClick={() => void confirmToggle()} className="min-h-10 rounded-lg bg-amber-600 px-3 text-sm font-semibold text-white disabled:opacity-50">
              {toggling ? "Guardando..." : "Confirmar"}
            </button>
          </div>
        </div>
      ) : null}

      {groupedRules.map(({ serviceType, rules: serviceRules }) => (
        <section key={serviceType} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">{serviceLabels[serviceType]}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold dark:bg-slate-500/20">{serviceRules.length} reglas</span>
          </div>
          {serviceRules.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-[#2a2a3e]">
              No hay una tarifa aprobada para este servicio.
            </p>
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {serviceRules.map((rule) => (
                <article key={rule.id} className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{rule.name}</p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold dark:bg-slate-500/20">v{rule.version}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${rule.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-500/20"}`}>
                          {rule.is_active ? "Activa" : "Inactiva"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {scopeLabels[rule.scope_type]}{scopeEntityName(rule) ? ` · ${scopeEntityName(rule)}` : ""} · prioridad {rule.priority}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-primary">{formatCOP(Number(rule.amount))}</p>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Vigencia {rule.effective_from.slice(0, 10)} — {rule.effective_to?.slice(0, 10) || "sin fecha final"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Aprobó {rule.approved_by?.name || "usuario autorizado"} · {rule.change_reason}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {latestVersionIds.has(rule.id) ? (
                      <button type="button" onClick={() => startVersion(rule)} className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold dark:border-[#2a2a3e]">
                        Nueva versión
                      </button>
                    ) : (
                      <span className="inline-flex min-h-10 items-center rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-500 dark:bg-slate-500/15">
                        Versión histórica
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setToggleTarget(rule);
                        setToggleReason("");
                      }}
                      className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold dark:border-[#2a2a3e]"
                    >
                      {rule.is_active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ))}
    </section>
  );
}

function scopeEntityName(rule: RateRule): string {
  if (rule.scope_type === "driver") return rule.driver?.name || "";
  if (rule.scope_type === "client") return rule.client?.company || rule.client?.name || "";
  if (rule.scope_type === "zone") return rule.zone?.name || "";
  return "";
}
