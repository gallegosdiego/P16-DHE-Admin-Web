"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP, toTitle } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import type { PriceCalculationResponse, PricingRule, Zone, ZoneDetailResponse, ZoneType } from "@/lib/types";

type ZoneForm = {
  name: string;
  city: string;
  type: ZoneType;
  is_active: boolean;
  sort_order: number;
  description: string;
};

type RuleForm = {
  name: string;
  type: "flat" | "per_kg" | "per_km" | "surge";
  base_price: number;
  per_kg_price: number;
  per_km_price: number;
  min_price: number;
  max_weight_kg: number;
  priority: number;
  is_active: boolean;
};

const zoneDefault: ZoneForm = {
  name: "",
  city: "Bogota",
  type: "urban",
  is_active: true,
  sort_order: 0,
  description: "",
};

const ruleDefault: RuleForm = {
  name: "",
  type: "flat",
  base_price: 10000,
  per_kg_price: 0,
  per_km_price: 0,
  min_price: 0,
  max_weight_kg: 0,
  priority: 0,
  is_active: true,
};

export default function ZonasPage() {
  usePageTitle("Zonas | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [expandedZone, setExpandedZone] = useState<number | null>(null);
  const [zoneRules, setZoneRules] = useState<Record<number, PricingRule[]>>({});
  const [modalZone, setModalZone] = useState<Zone | null>(null);
  const [zoneForm, setZoneForm] = useState<ZoneForm>(zoneDefault);
  const [ruleForm, setRuleForm] = useState<RuleForm>(ruleDefault);
  const [calc, setCalc] = useState({ zoneId: 0, weight_kg: 1, distance_km: 3 });
  const [calcResult, setCalcResult] = useState<PriceCalculationResponse | null>(null);

  const loadZones = async () => {
    setLoading(true);
    try {
      const response = await apiGet<Zone[]>("/zones");
      setZones(response || []);
    } catch {
      setZones([]);
      showToast("No se pudieron cargar zonas", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadZones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openZoneModal = (zone?: Zone) => {
    if (!zone) {
      setModalZone(null);
      setZoneForm(zoneDefault);
      return;
    }
    setModalZone(zone);
    setZoneForm({
      name: zone.name,
      city: zone.city || "Bogota",
      type: zone.type,
      is_active: zone.is_active,
      sort_order: zone.sort_order || 0,
      description: zone.description || "",
    });
  };

  const saveZone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (modalZone) {
        await apiSend(`/zones/${modalZone.id}`, "PUT", zoneForm as unknown as Record<string, unknown>);
        showToast("Zona actualizada", "success");
      } else {
        await apiSend("/zones", "POST", zoneForm as unknown as Record<string, unknown>);
        showToast("Zona creada", "success");
      }
      setModalZone(null);
      setZoneForm(zoneDefault);
      await loadZones();
    } catch {
      showToast("No se pudo guardar la zona", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleRules = async (zoneId: number) => {
    if (expandedZone === zoneId) {
      setExpandedZone(null);
      return;
    }
    setExpandedZone(zoneId);
    if (zoneRules[zoneId]) return;
    try {
      const detail = await apiGet<ZoneDetailResponse>(`/zones/${zoneId}`);
      setZoneRules((prev) => ({ ...prev, [zoneId]: detail.pricing_rules || [] }));
    } catch {
      showToast("No se pudieron cargar reglas de tarifa", "error");
    }
  };

  const createRule = async (zoneId: number, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const created = await apiSend<PricingRule>(
        `/zones/${zoneId}/pricing-rules`,
        "POST",
        ruleForm as unknown as Record<string, unknown>
      );
      setZoneRules((prev) => ({ ...prev, [zoneId]: [...(prev[zoneId] || []), created] }));
      setRuleForm(ruleDefault);
      showToast("Regla agregada", "success");
      await loadZones();
    } catch {
      showToast("No se pudo crear la regla", "error");
    }
  };

  const calculatePrice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!calc.zoneId) return;
    try {
      const result = await apiSend<PriceCalculationResponse>(
        `/zones/${calc.zoneId}/calculate`,
        "POST",
        {
          weight_kg: Number(calc.weight_kg),
          distance_km: Number(calc.distance_km),
        }
      );
      setCalcResult(result);
    } catch {
      showToast("No se pudo calcular la tarifa", "error");
    }
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Zonas de cobertura</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">CRUD de zonas y tarifas por regla</p>
          </div>
          <button
            type="button"
            onClick={() => openZoneModal()}
            className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Nueva zona
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h2 className="text-base font-semibold dark:text-[#e0e0e0]">Calculadora de precio en vivo</h2>
        <form onSubmit={calculatePrice} className="mt-3 grid gap-2 sm:grid-cols-4">
          <select
            value={calc.zoneId}
            onChange={(event) => setCalc((prev) => ({ ...prev, zoneId: Number(event.target.value) }))}
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
          >
            <option value={0}>Selecciona zona</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            step="0.1"
            value={calc.weight_kg}
            onChange={(event) => setCalc((prev) => ({ ...prev, weight_kg: Number(event.target.value) }))}
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            placeholder="Peso kg"
          />
          <input
            type="number"
            min={0}
            step="0.1"
            value={calc.distance_km}
            onChange={(event) => setCalc((prev) => ({ ...prev, distance_km: Number(event.target.value) }))}
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            placeholder="Distancia km"
          />
          <button className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:text-slate-200">
            Calcular
          </button>
        </form>
        {calcResult ? (
          <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
            Precio: <strong>{calcResult.formatted}</strong> ({calcResult.rule_applied?.name || "sin regla"})
          </p>
        ) : null}
      </section>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div>
      ) : zones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-slate-400">
          Sin zonas configuradas.
        </div>
      ) : (
        <div className="space-y-2">
          {zones.map((zone) => {
            const rules = zoneRules[zone.id] || [];
            return (
              <article key={zone.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
                <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">{zone.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {toTitle(zone.type)} - Base {formatCOP(Number(zone.base_price || 0))}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${zone.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {zone.is_active ? "Activa" : "Inactiva"}
                    </span>
                    <button
                      type="button"
                      onClick={() => openZoneModal(zone)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e] dark:text-slate-200"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleRules(zone.id)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e] dark:text-slate-200"
                    >
                      {expandedZone === zone.id ? "Ocultar reglas" : "Ver reglas"}
                    </button>
                  </div>
                </div>

                {expandedZone === zone.id ? (
                  <div className="border-t border-slate-200 p-4 dark:border-[#2a2a3e]">
                    <div className="space-y-2">
                      {rules.map((rule) => (
                        <div key={rule.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#2a2a3e]">
                          <p className="font-semibold dark:text-[#e0e0e0]">{rule.name}</p>
                          <p className="text-slate-500 dark:text-slate-400">
                            {toTitle(rule.type)} - Base {formatCOP(Number(rule.base_price || 0))}
                          </p>
                        </div>
                      ))}
                      {rules.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">Sin reglas activas.</p> : null}
                    </div>

                    <form onSubmit={(event) => void createRule(zone.id, event)} className="mt-3 grid gap-2 sm:grid-cols-4">
                      <input
                        required
                        value={ruleForm.name}
                        onChange={(event) => setRuleForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Nombre regla"
                        className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                      />
                      <select
                        value={ruleForm.type}
                        onChange={(event) => setRuleForm((prev) => ({ ...prev, type: event.target.value as RuleForm["type"] }))}
                        className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                      >
                        <option value="flat">Flat</option>
                        <option value="per_kg">Per kg</option>
                        <option value="per_km">Per km</option>
                        <option value="surge">Surge</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        value={ruleForm.base_price}
                        onChange={(event) => setRuleForm((prev) => ({ ...prev, base_price: Number(event.target.value) }))}
                        placeholder="Precio base"
                        className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                      />
                      <button className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">Agregar regla</button>
                    </form>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {(modalZone !== null || zoneForm.name !== "") && (modalZone || zoneForm.name || zoneForm.city) ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <form onSubmit={saveZone} className="w-full rounded-t-xl bg-white p-5 dark:bg-[#1a1a2e] sm:max-w-lg sm:rounded-xl">
            <h2 className="text-lg font-bold dark:text-[#e0e0e0]">{modalZone ? "Editar zona" : "Crear zona"}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input required value={zoneForm.name} onChange={(event) => setZoneForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nombre" className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" />
              <input value={zoneForm.city} onChange={(event) => setZoneForm((prev) => ({ ...prev, city: event.target.value }))} placeholder="Ciudad" className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" />
              <select value={zoneForm.type} onChange={(event) => setZoneForm((prev) => ({ ...prev, type: event.target.value as ZoneType }))} className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]">
                <option value="urban">Urban</option>
                <option value="suburban">Suburban</option>
                <option value="extended">Extended</option>
              </select>
              <input type="number" min={0} value={zoneForm.sort_order} onChange={(event) => setZoneForm((prev) => ({ ...prev, sort_order: Number(event.target.value) }))} placeholder="Orden" className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" />
              <textarea value={zoneForm.description} onChange={(event) => setZoneForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Descripcion" className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0] sm:col-span-2" />
            </div>
            <label className="mt-2 inline-flex items-center gap-2 text-sm dark:text-slate-300">
              <input type="checkbox" checked={zoneForm.is_active} onChange={(event) => setZoneForm((prev) => ({ ...prev, is_active: event.target.checked }))} />
              Zona activa
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => { setModalZone(null); setZoneForm(zoneDefault); }} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:text-slate-200">Cancelar</button>
              <button disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
