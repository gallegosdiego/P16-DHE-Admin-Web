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
  city: "Bogotá",
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

const zoneTypeTone: Record<ZoneType, string> = {
  urban: "bg-blue-50 text-route dark:bg-blue-400/20 dark:text-blue-300",
  suburban: "bg-amber-50 text-pending dark:bg-amber-400/20 dark:text-amber-300",
  extended: "bg-violet-50 text-violet-700 dark:bg-violet-400/20 dark:text-violet-300",
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
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [zoneForm, setZoneForm] = useState<ZoneForm>(zoneDefault);
  const [ruleForm, setRuleForm] = useState<RuleForm>(ruleDefault);
  const [calc, setCalc] = useState({ zoneId: 0, weight_kg: 1, distance_km: 3 });
  const [calcResult, setCalcResult] = useState<PriceCalculationResponse | null>(null);
  const [calculating, setCalculating] = useState(false);

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
    setIsZoneModalOpen(true);
    if (!zone) {
      setModalZone(null);
      setZoneForm(zoneDefault);
      return;
    }
    setModalZone(zone);
    setZoneForm({
      name: zone.name,
      city: zone.city || "Bogotá",
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
      setIsZoneModalOpen(false);
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
    setCalculating(true);
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
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Zonas de cobertura</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Gestión de zonas y tarifas por regla</p>
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
        <form onSubmit={calculatePrice} className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,1fr))_auto]">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-600 dark:text-slate-300">Zona</span>
            <select
              value={calc.zoneId}
              onChange={(event) => setCalc((prev) => ({ ...prev, zoneId: Number(event.target.value) }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            >
              <option value={0}>Selecciona zona</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-600 dark:text-slate-300">Peso estimado (kg)</span>
            <input
              type="number"
              min={0}
              step="0.1"
              value={calc.weight_kg}
              onChange={(event) => setCalc((prev) => ({ ...prev, weight_kg: Number(event.target.value) }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-600 dark:text-slate-300">Distancia estimada (km)</span>
            <input
              type="number"
              min={0}
              step="0.1"
              value={calc.distance_km}
              onChange={(event) => setCalc((prev) => ({ ...prev, distance_km: Number(event.target.value) }))}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
          </label>
          <button
            disabled={calculating}
            className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-95 disabled:opacity-60 xl:self-end dark:border-[#2a2a3e] dark:text-slate-200"
          >
            {calculating ? "Calculando..." : "Calcular"}
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
              <article key={zone.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow duration-150 hover:shadow-md dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">{zone.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{zone.city || "Bogotá"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${zoneTypeTone[zone.type]}`}>
                        {toTitle(zone.type)}
                      </span>
                      <span>Base {formatCOP(Number(zone.base_price || 0))}</span>
                      <span>Orden {zone.sort_order || 0}</span>
                    </div>
                    {zone.description ? (
                      <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-[#16162a] dark:text-slate-300">
                        {zone.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${zone.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {zone.is_active ? "Activa" : "Inactiva"}
                    </span>
                    <button
                      type="button"
                      onClick={() => openZoneModal(zone)}
                      className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:text-slate-200"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleRules(zone.id)}
                      className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:text-slate-200"
                    >
                      {expandedZone === zone.id ? "Ocultar reglas" : "Ver reglas"}
                    </button>
                  </div>
                </div>

                {expandedZone === zone.id ? (
                  <div className="border-t border-slate-200 p-4 dark:border-[#2a2a3e]">
                    <div className="space-y-2">
                      {rules.map((rule) => (
                        <div key={rule.id} className="rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-[#2a2a3e]">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-semibold dark:text-[#e0e0e0]">{rule.name}</p>
                              <p className="text-slate-500 dark:text-slate-400">
                                {toTitle(rule.type)} - Base {formatCOP(Number(rule.base_price || 0))}
                              </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400 sm:text-right">
                              <span>Min: {formatCOP(Number(rule.min_price || 0))}</span>
                              <span>Prioridad: {rule.priority}</span>
                              <span>Kg máx: {rule.max_weight_kg || 0}</span>
                              <span>{rule.is_active ? "Activa" : "Inactiva"}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {rules.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">Sin reglas activas.</p> : null}
                    </div>

                    <form onSubmit={(event) => void createRule(zone.id, event)} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <label className="space-y-1 text-sm">
                        <span className="font-medium text-slate-600 dark:text-slate-300">Nombre de regla</span>
                        <input
                          required
                          value={ruleForm.name}
                          onChange={(event) => setRuleForm((prev) => ({ ...prev, name: event.target.value }))}
                          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium text-slate-600 dark:text-slate-300">Tipo de tarifa</span>
                        <select
                          value={ruleForm.type}
                          onChange={(event) => setRuleForm((prev) => ({ ...prev, type: event.target.value as RuleForm["type"] }))}
                          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                        >
                          <option value="flat">Tarifa fija</option>
                          <option value="per_kg">Por kg</option>
                          <option value="per_km">Por km</option>
                          <option value="surge">Recargo</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium text-slate-600 dark:text-slate-300">Precio base</span>
                        <input
                          type="number"
                          min={0}
                          value={ruleForm.base_price}
                          onChange={(event) => setRuleForm((prev) => ({ ...prev, base_price: Number(event.target.value) }))}
                          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                        />
                      </label>
                      <button className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95">Agregar regla</button>
                    </form>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {isZoneModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <form onSubmit={saveZone} className="w-full rounded-t-xl bg-white p-5 dark:bg-[#1a1a2e] sm:max-w-lg sm:rounded-xl">
            <h2 className="text-lg font-bold dark:text-[#e0e0e0]">{modalZone ? "Editar zona" : "Crear zona"}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-600 dark:text-slate-300">Nombre</span>
                <input required value={zoneForm.name} onChange={(event) => setZoneForm((prev) => ({ ...prev, name: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-600 dark:text-slate-300">Ciudad</span>
                <input value={zoneForm.city} onChange={(event) => setZoneForm((prev) => ({ ...prev, city: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-600 dark:text-slate-300">Tipo de zona</span>
                <select value={zoneForm.type} onChange={(event) => setZoneForm((prev) => ({ ...prev, type: event.target.value as ZoneType }))} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]">
                  <option value="urban">Urbana</option>
                  <option value="suburban">Suburbana</option>
                  <option value="extended">Extendida</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-600 dark:text-slate-300">Orden</span>
                <input type="number" min={0} value={zoneForm.sort_order} onChange={(event) => setZoneForm((prev) => ({ ...prev, sort_order: Number(event.target.value) }))} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="font-medium text-slate-600 dark:text-slate-300">Descripción</span>
                <textarea value={zoneForm.description} onChange={(event) => setZoneForm((prev) => ({ ...prev, description: event.target.value }))} className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]" />
              </label>
            </div>
            <label className="mt-2 inline-flex items-center gap-2 text-sm dark:text-slate-300">
              <input type="checkbox" checked={zoneForm.is_active} onChange={(event) => setZoneForm((prev) => ({ ...prev, is_active: event.target.checked }))} />
              Zona activa
            </label>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setModalZone(null); setIsZoneModalOpen(false); setZoneForm(zoneDefault); }} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:text-slate-200">Cancelar</button>
              <button disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60">{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
