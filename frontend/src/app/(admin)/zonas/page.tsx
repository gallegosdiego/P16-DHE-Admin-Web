"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend, describeApiError } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import type {
  PriceCalculationResponse,
  PricingRule,
  Zone,
  ZoneDetailResponse,
  ZoneType,
} from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  CurrencyInput,
  KpiCard,
  MobileListCard,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";

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

const zoneTypeLabel: Record<ZoneType, string> = {
  urban: "Urbana",
  suburban: "Suburbana",
  extended: "Extendida",
};

const zoneTypeTone: Record<ZoneType, "info" | "warning" | "teal"> = {
  urban: "info",
  suburban: "warning",
  extended: "teal",
};

const ruleTypeLabel: Record<RuleForm["type"], string> = {
  flat: "Tarifa fija",
  per_kg: "Por kg",
  per_km: "Por km",
  surge: "Recargo",
};

export default function ZonasPage() {
  usePageTitle("Zonas | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedZone, setExpandedZone] = useState<number | null>(null);
  const [zoneRules, setZoneRules] = useState<Record<number, PricingRule[]>>({});
  const [rulesErrors, setRulesErrors] = useState<Record<number, string>>({});
  const [modalZone, setModalZone] = useState<Zone | null>(null);
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [zoneForm, setZoneForm] = useState<ZoneForm>(zoneDefault);
  const [zoneFormError, setZoneFormError] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleForm>(ruleDefault);
  const [ruleFormError, setRuleFormError] = useState<string | null>(null);
  const [calc, setCalc] = useState({ zoneId: 0, weight_kg: 1, distance_km: 3 });
  const [calcResult, setCalcResult] = useState<PriceCalculationResponse | null>(
    null,
  );
  const [calcError, setCalcError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  const loadZones = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await apiGet<Zone[]>("/zones");
      setZones(response || []);
    } catch (error) {
      const description = describeApiError(
        error,
        "No se pudieron cargar las zonas.",
      );
      setZones([]);
      setLoadError(description.message);
      showToast(description.message, "error");
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
    setZoneFormError(null);
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

  const closeZoneModal = () => {
    setModalZone(null);
    setIsZoneModalOpen(false);
    setZoneForm(zoneDefault);
    setZoneFormError(null);
  };

  const saveZone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setZoneFormError(null);
    try {
      // apiSend serializes scalar values as multipart strings; the API's
      // boolean validator accepts the numeric form of this existing contract.
      const zonePayload = {
        ...zoneForm,
        is_active: zoneForm.is_active ? 1 : 0,
      };
      if (modalZone) {
        await apiSend(
          `/zones/${modalZone.id}`,
          "PUT",
          zonePayload as unknown as Record<string, unknown>,
        );
        showToast("Zona actualizada", "success");
      } else {
        await apiSend(
          "/zones",
          "POST",
          zonePayload as unknown as Record<string, unknown>,
        );
        showToast("Zona creada", "success");
      }
      closeZoneModal();
      await loadZones();
    } catch (error) {
      const description = describeApiError(
        error,
        "No se pudo guardar la zona.",
      );
      setZoneFormError(description.message);
      showToast(description.message, "error");
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
    setRuleFormError(null);
    if (zoneRules[zoneId]) return;
    try {
      const detail = await apiGet<ZoneDetailResponse>(`/zones/${zoneId}`);
      setZoneRules((previous) => ({
        ...previous,
        [zoneId]: detail.pricing_rules || [],
      }));
    } catch (error) {
      const description = describeApiError(
        error,
        "No se pudieron cargar las reglas de tarifa.",
      );
      setRulesErrors((previous) => ({
        ...previous,
        [zoneId]: description.message,
      }));
      showToast(description.message, "error");
    }
  };

  const createRule = async (
    zoneId: number,
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setRuleFormError(null);
    try {
      const created = await apiSend<PricingRule>(
        `/zones/${zoneId}/pricing-rules`,
        "POST",
        {
          ...ruleForm,
          is_active: ruleForm.is_active ? 1 : 0,
        } as unknown as Record<string, unknown>,
      );
      setZoneRules((previous) => ({
        ...previous,
        [zoneId]: [...(previous[zoneId] || []), created],
      }));
      setRuleForm(ruleDefault);
      showToast("Regla agregada", "success");
      await loadZones();
    } catch (error) {
      const description = describeApiError(error, "No se pudo crear la regla.");
      setRuleFormError(description.message);
      showToast(description.message, "error");
    }
  };

  const calculatePrice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCalcError(null);
    setCalcResult(null);
    if (!calc.zoneId) {
      setCalcError("Selecciona una zona para calcular la tarifa.");
      return;
    }
    setCalculating(true);
    try {
      const result = await apiSend<PriceCalculationResponse>(
        `/zones/${calc.zoneId}/calculate`,
        "POST",
        {
          weight_kg: Number(calc.weight_kg),
          distance_km: Number(calc.distance_km),
        },
      );
      setCalcResult(result);
    } catch (error) {
      const description = describeApiError(
        error,
        "No se pudo calcular la tarifa.",
      );
      setCalcError(description.message);
      showToast(description.message, "error");
    } finally {
      setCalculating(false);
    }
  };

  const activeZones = useMemo(
    () => zones.filter((zone) => zone.is_active).length,
    [zones],
  );
  const zonesWithRules = useMemo(
    () => zones.filter((zone) => (zone.active_rules_count || 0) > 0).length,
    [zones],
  );

  return (
    <div className="animate-fade-in space-y-6 pb-24 lg:pb-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            Cobertura y tarifas
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">
            Zonas de cobertura
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Gestiona cobertura, reglas de precio y simulaciones para la
            operación.
          </p>
        </div>
        <Button onClick={() => openZoneModal()}>Nueva zona</Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Zonas totales"
          value={zones.length}
          support="Catálogo configurado"
        />
        <KpiCard
          label="Zonas activas"
          value={activeZones}
          support="Disponibles para operar"
          tone="success"
        />
        <KpiCard
          label="Con reglas"
          value={zonesWithRules}
          support="Con tarifa activa"
          tone="info"
        />
      </div>

      <Card
        title="Calculadora de precio en vivo"
        headerAction={<Badge tone="info">API de tarifas</Badge>}
      >
        <p className="mb-4 text-sm text-ink-secondary">
          Simula el precio que aplicaría una regla para un envío según peso y
          distancia.
        </p>
        <form
          onSubmit={calculatePrice}
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,1fr))_auto]"
        >
          <Select
            label="Zona"
            value={calc.zoneId}
            onChange={(event) =>
              setCalc((previous) => ({
                ...previous,
                zoneId: Number(event.target.value),
              }))
            }
          >
            <option value={0}>Selecciona zona</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </Select>
          <Input
            label="Peso estimado (kg)"
            type="number"
            min={0}
            step="0.1"
            value={calc.weight_kg}
            onChange={(event) =>
              setCalc((previous) => ({
                ...previous,
                weight_kg: Number(event.target.value),
              }))
            }
          />
          <Input
            label="Distancia estimada (km)"
            type="number"
            min={0}
            step="0.1"
            value={calc.distance_km}
            onChange={(event) =>
              setCalc((previous) => ({
                ...previous,
                distance_km: Number(event.target.value),
              }))
            }
          />
          <Button type="submit" disabled={calculating} className="self-end">
            {calculating ? "Calculando…" : "Calcular"}
          </Button>
        </form>
        {calcError ? (
          <p className="mt-3 text-sm font-medium text-danger" role="alert">
            {calcError}
          </p>
        ) : null}
        {calcResult ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-card border border-success/30 bg-success/10 p-3">
            <StatusBadge
              status="ready"
              label="Tarifa calculada"
              tone="success"
            />
            <p className="text-sm text-ink">
              Precio:{" "}
              <strong className="font-display text-lg">
                {calcResult.formatted || formatCOP(calcResult.calculated_price)}
              </strong>
              {calcResult.rule_applied?.name ? (
                <span className="text-ink-secondary">
                  {" "}
                  · {calcResult.rule_applied.name}
                </span>
              ) : null}
            </p>
          </div>
        ) : null}
      </Card>

      {loadError ? (
        <Card
          className="border-danger/30 bg-danger/10"
          title="No se pudo cargar el catálogo"
        >
          <p className="text-sm text-danger" role="alert">
            {loadError}
          </p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => void loadZones()}
          >
            Reintentar
          </Button>
        </Card>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : zones.length === 0 ? (
        <EmptyState
          title="Sin zonas configuradas"
          description="Crea la primera zona para habilitar reglas de cobertura y precio."
          action={<Button onClick={() => openZoneModal()}>Crear zona</Button>}
        />
      ) : (
        <section aria-labelledby="zones-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="zones-heading"
              className="font-display text-lg font-semibold text-ink"
            >
              Catálogo de cobertura
            </h2>
            <span className="text-sm text-ink-secondary">
              {zones.length} zonas
            </span>
          </div>

          <div className="hidden space-y-3 lg:block">
            {zones.map((zone) => {
              const rules = zoneRules[zone.id] || [];
              const rulesPanel =
                expandedZone === zone.id ? (
                  <div className="border-t border-edge bg-app-secondary/60 p-4 md:p-5">
                    {rulesErrors[zone.id] ? (
                      <p className="mb-3 text-sm text-danger" role="alert">
                        {rulesErrors[zone.id]}
                      </p>
                    ) : null}
                    {rules.length === 0 ? (
                      <EmptyState
                        title="Sin reglas de tarifa"
                        description="Agrega la primera regla para esta zona."
                      />
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {rules.map((rule) => (
                          <div
                            key={rule.id}
                            className="rounded-card border border-edge bg-surface p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-ink">
                                  {rule.name}
                                </p>
                                <p className="mt-0.5 text-sm text-ink-secondary">
                                  {ruleTypeLabel[rule.type]}
                                </p>
                              </div>
                              <StatusBadge
                                status={rule.is_active ? "active" : "inactive"}
                                label={rule.is_active ? "Activa" : "Inactiva"}
                                tone={rule.is_active ? "success" : "neutral"}
                              />
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-secondary">
                              <span>
                                Base:{" "}
                                <strong className="text-ink">
                                  {formatCOP(Number(rule.base_price || 0))}
                                </strong>
                              </span>
                              <span>
                                Mínimo:{" "}
                                <strong className="text-ink">
                                  {formatCOP(Number(rule.min_price || 0))}
                                </strong>
                              </span>
                              <span>
                                Máx. peso:{" "}
                                <strong className="text-ink">
                                  {rule.max_weight_kg || 0} kg
                                </strong>
                              </span>
                              <span>
                                Prioridad:{" "}
                                <strong className="text-ink">
                                  {rule.priority}
                                </strong>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <form
                      onSubmit={(event) => void createRule(zone.id, event)}
                      className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
                    >
                      <Input
                        label="Nombre de regla"
                        required
                        value={ruleForm.name}
                        onChange={(event) =>
                          setRuleForm((previous) => ({
                            ...previous,
                            name: event.target.value,
                          }))
                        }
                      />
                      <Select
                        label="Tipo de tarifa"
                        value={ruleForm.type}
                        onChange={(event) =>
                          setRuleForm((previous) => ({
                            ...previous,
                            type: event.target.value as RuleForm["type"],
                          }))
                        }
                      >
                        {Object.entries(ruleTypeLabel).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                      <CurrencyInput
                        label="Precio base"
                        min={0}
                        value={ruleForm.base_price}
                        onValueChange={(val) =>
                          setRuleForm((previous) => ({
                            ...previous,
                            base_price: val,
                          }))
                        }
                      />
                      <CurrencyInput
                        label="Precio por kg"
                        min={0}
                        value={ruleForm.per_kg_price}
                        onValueChange={(val) =>
                          setRuleForm((previous) => ({
                            ...previous,
                            per_kg_price: val,
                          }))
                        }
                      />
                      <CurrencyInput
                        label="Precio por km"
                        min={0}
                        value={ruleForm.per_km_price}
                        onValueChange={(val) =>
                          setRuleForm((previous) => ({
                            ...previous,
                            per_km_price: val,
                          }))
                        }
                      />
                      <CurrencyInput
                        label="Precio mínimo"
                        min={0}
                        value={ruleForm.min_price}
                        onValueChange={(val) =>
                          setRuleForm((previous) => ({
                            ...previous,
                            min_price: val,
                          }))
                        }
                      />
                      <Input
                        label="Peso máximo (kg)"
                        type="number"
                        min={0}
                        value={ruleForm.max_weight_kg}
                        onChange={(event) =>
                          setRuleForm((previous) => ({
                            ...previous,
                            max_weight_kg: Number(event.target.value),
                          }))
                        }
                      />
                      <Input
                        label="Prioridad"
                        type="number"
                        min={0}
                        value={ruleForm.priority}
                        onChange={(event) =>
                          setRuleForm((previous) => ({
                            ...previous,
                            priority: Number(event.target.value),
                          }))
                        }
                      />
                      <label className="flex min-h-11 items-center gap-2 text-sm text-ink sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={ruleForm.is_active}
                          onChange={(event) =>
                            setRuleForm((previous) => ({
                              ...previous,
                              is_active: event.target.checked,
                            }))
                          }
                          className="h-4 w-4 accent-brand"
                        />
                        Regla activa
                      </label>
                      <div className="flex items-end justify-end sm:col-span-2 xl:col-span-2">
                        <Button type="submit">Agregar regla</Button>
                      </div>
                    </form>
                    {ruleFormError ? (
                      <p className="mt-2 text-sm text-danger" role="alert">
                        {ruleFormError}
                      </p>
                    ) : null}
                  </div>
                ) : null;
              return (
                <Card key={zone.id} flush className="overflow-hidden">
                  <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-lg font-semibold text-ink">
                          {zone.name}
                        </h3>
                        <Badge tone={zoneTypeTone[zone.type]}>
                          {zoneTypeLabel[zone.type]}
                        </Badge>
                        <StatusBadge
                          status={zone.is_active ? "active" : "inactive"}
                          label={zone.is_active ? "Activa" : "Inactiva"}
                          tone={zone.is_active ? "success" : "neutral"}
                        />
                      </div>
                      <p className="mt-1 text-sm text-ink-secondary">
                        {zone.city || "Bogotá"} · Base{" "}
                        {formatCOP(Number(zone.base_price || 0))} · Orden{" "}
                        {zone.sort_order || 0}
                      </p>
                      {zone.description ? (
                        <p className="mt-2 max-w-3xl text-sm text-ink-secondary">
                          {zone.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openZoneModal(zone)}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void toggleRules(zone.id)}
                      >
                        {expandedZone === zone.id
                          ? "Ocultar reglas"
                          : "Ver reglas"}
                      </Button>
                    </div>
                  </div>
                  {rulesPanel}
                </Card>
              );
            })}
          </div>

          <div className="space-y-3 lg:hidden">
            {zones.map((zone) => {
              const rules = zoneRules[zone.id] || [];
              const rulesPanel =
                expandedZone === zone.id ? (
                  <Card className="border-brand/20 bg-app-secondary/60">
                    {rulesErrors[zone.id] ? (
                      <p className="mb-3 text-sm text-danger" role="alert">
                        {rulesErrors[zone.id]}
                      </p>
                    ) : null}
                    {rules.length === 0 ? (
                      <EmptyState
                        title="Sin reglas de tarifa"
                        description="Agrega la primera regla para esta zona."
                      />
                    ) : (
                      <div className="space-y-3">
                        {rules.map((rule) => (
                          <div
                            key={rule.id}
                            className="rounded-card border border-edge bg-surface p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-ink">
                                  {rule.name}
                                </p>
                                <p className="text-xs text-ink-secondary">
                                  {ruleTypeLabel[rule.type]} · Base{" "}
                                  {formatCOP(Number(rule.base_price || 0))}
                                </p>
                              </div>
                              <StatusBadge
                                status={rule.is_active ? "active" : "inactive"}
                                label={rule.is_active ? "Activa" : "Inactiva"}
                                tone={rule.is_active ? "success" : "neutral"}
                              />
                            </div>
                            <p className="mt-2 text-xs text-ink-secondary">
                              Mínimo {formatCOP(Number(rule.min_price || 0))} ·{" "}
                              {rule.max_weight_kg || 0} kg máx. · Prioridad{" "}
                              {rule.priority}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    <form
                      onSubmit={(event) => void createRule(zone.id, event)}
                      className="mt-4 space-y-3"
                    >
                      <Input
                        label="Nombre de regla"
                        required
                        value={ruleForm.name}
                        onChange={(event) =>
                          setRuleForm((previous) => ({
                            ...previous,
                            name: event.target.value,
                          }))
                        }
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <Select
                          label="Tipo"
                          value={ruleForm.type}
                          onChange={(event) =>
                            setRuleForm((previous) => ({
                              ...previous,
                              type: event.target.value as RuleForm["type"],
                            }))
                          }
                        >
                          {Object.entries(ruleTypeLabel).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </Select>
                        <CurrencyInput
                          label="Base"
                          min={0}
                          value={ruleForm.base_price}
                          onValueChange={(val) =>
                            setRuleForm((previous) => ({
                              ...previous,
                              base_price: val,
                            }))
                          }
                        />
                      </div>
                      <Button type="submit" className="w-full">
                        Agregar regla
                      </Button>
                    </form>
                    {ruleFormError ? (
                      <p className="mt-2 text-sm text-danger" role="alert">
                        {ruleFormError}
                      </p>
                    ) : null}
                  </Card>
                ) : null;
              return (
                <div key={zone.id}>
                  <MobileListCard
                    title={zone.name}
                    subtitle={zone.city || "Bogotá"}
                    meta={`${zone.description ? `${zone.description} · ` : ""}Base ${formatCOP(Number(zone.base_price || 0))} · ${zone.active_rules_count || 0} reglas · Orden ${zone.sort_order || 0}`}
                    status={
                      <>
                        <Badge tone={zoneTypeTone[zone.type]}>
                          {zoneTypeLabel[zone.type]}
                        </Badge>
                        <span className="mt-1 block">
                          <StatusBadge
                            status={zone.is_active ? "active" : "inactive"}
                            label={zone.is_active ? "Activa" : "Inactiva"}
                            tone={zone.is_active ? "success" : "neutral"}
                          />
                        </span>
                      </>
                    }
                    action={
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openZoneModal(zone)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void toggleRules(zone.id)}
                        >
                          {expandedZone === zone.id
                            ? "Ocultar reglas"
                            : "Ver reglas"}
                        </Button>
                      </div>
                    }
                  />
                  {rulesPanel ? <div className="mt-3">{rulesPanel}</div> : null}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {isZoneModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
          role="presentation"
        >
          <form
            onSubmit={saveZone}
            className="max-h-[100dvh] w-full overflow-y-auto rounded-t-card bg-surface p-5 shadow-soft sm:max-h-[90vh] sm:max-w-lg sm:rounded-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="zone-dialog-title"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              Catálogo operativo
            </p>
            <h2
              id="zone-dialog-title"
              className="mt-1 font-display text-xl font-bold text-ink"
            >
              {modalZone ? "Editar zona" : "Crear zona"}
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Input
                label="Nombre"
                required
                value={zoneForm.name}
                onChange={(event) =>
                  setZoneForm((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
                wrapperClassName="sm:col-span-2"
              />
              <Input
                label="Ciudad"
                value={zoneForm.city}
                onChange={(event) =>
                  setZoneForm((previous) => ({
                    ...previous,
                    city: event.target.value,
                  }))
                }
              />
              <Select
                label="Tipo de zona"
                value={zoneForm.type}
                onChange={(event) =>
                  setZoneForm((previous) => ({
                    ...previous,
                    type: event.target.value as ZoneType,
                  }))
                }
              >
                {Object.entries(zoneTypeLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <Input
                label="Orden"
                type="number"
                min={0}
                value={zoneForm.sort_order}
                onChange={(event) =>
                  setZoneForm((previous) => ({
                    ...previous,
                    sort_order: Number(event.target.value),
                  }))
                }
              />
              <Textarea
                label="Descripción"
                value={zoneForm.description}
                onChange={(event) =>
                  setZoneForm((previous) => ({
                    ...previous,
                    description: event.target.value,
                  }))
                }
                wrapperClassName="sm:col-span-2"
              />
            </div>
            <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={zoneForm.is_active}
                onChange={(event) =>
                  setZoneForm((previous) => ({
                    ...previous,
                    is_active: event.target.checked,
                  }))
                }
                className="h-4 w-4 accent-brand"
              />
              Zona activa
            </label>
            {zoneFormError ? (
              <p className="mt-3 text-sm text-danger" role="alert">
                {zoneFormError}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={closeZoneModal}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar zona"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
