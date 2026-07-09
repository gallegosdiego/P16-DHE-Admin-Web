"use client";

import type { ReactNode } from "react";
import {
  ADDRESS_ROAD_TYPE_OPTIONS,
  assessStructuredAddress,
  buildStructuredAddressMeta,
  composeStructuredAddressPreview,
  type StructuredAddressForm,
} from "@/lib/address-builder";

type Props = {
  value: StructuredAddressForm;
  onChange: (next: StructuredAddressForm) => void;
  inputClassName: string;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

export function AddressBuilder({ value, onChange, inputClassName }: Props) {
  const preview = composeStructuredAddressPreview(buildStructuredAddressMeta(value));
  const assessment = assessStructuredAddress(value);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-[#2a2a3e] dark:bg-[#141428]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Constructor guiado de dirección</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Captura la dirección por partes para reducir errores y mejorar geolocalización.
          </p>
        </div>
        <span className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
          Modo recomendado
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Tipo de vía">
          <select
            value={value.roadType}
            onChange={(event) => onChange({ ...value, roadType: event.target.value as StructuredAddressForm["roadType"] })}
            className={inputClassName}
          >
            {ADDRESS_ROAD_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Número vía">
          <input
            value={value.roadNumber}
            onChange={(event) => onChange({ ...value, roadNumber: event.target.value })}
            placeholder="22"
            className={inputClassName}
          />
        </Field>
        <Field label="Complemento vía">
          <input
            value={value.roadSuffix}
            onChange={(event) => onChange({ ...value, roadSuffix: event.target.value })}
            placeholder="A / Bis / Sur"
            className={inputClassName}
          />
        </Field>
        <Field label="Cruce (#)">
          <input
            value={value.crossNumber}
            onChange={(event) => onChange({ ...value, crossNumber: event.target.value })}
            placeholder="10 o 103F"
            className={inputClassName}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Complemento cruce">
          <input
            value={value.crossSuffix}
            onChange={(event) => onChange({ ...value, crossSuffix: event.target.value })}
            placeholder="A / Bis / Sur"
            className={inputClassName}
          />
        </Field>
        <Field label="Número predio">
          <input
            value={value.propertyNumber}
            onChange={(event) => onChange({ ...value, propertyNumber: event.target.value })}
            placeholder="54"
            className={inputClassName}
          />
        </Field>
        <Field label="Complemento predio">
          <input
            value={value.propertySuffix}
            onChange={(event) => onChange({ ...value, propertySuffix: event.target.value })}
            placeholder="A / Interior"
            className={inputClassName}
          />
        </Field>
        <Field label="Barrio">
          <input
            value={value.neighborhood}
            onChange={(event) => onChange({ ...value, neighborhood: event.target.value })}
            placeholder="Ej: Chapinero Central"
            className={inputClassName}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Complemento de entrega">
          <input
            value={value.unitDetails}
            onChange={(event) => onChange({ ...value, unitDetails: event.target.value })}
            placeholder="Torre 2, apto 301, casa 4..."
            className={inputClassName}
          />
        </Field>
        <Field label="Referencia">
          <input
            value={value.reference}
            onChange={(event) => onChange({ ...value, reference: event.target.value })}
            placeholder="Frente al parque, portón gris..."
            className={inputClassName}
          />
        </Field>
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3 dark:border-[#363651] dark:bg-[#111124]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Dirección final
        </p>
        <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
          {preview || "Aún no hay una dirección completa para guardar."}
        </p>
        <p
          className={`mt-2 text-xs ${
            assessment.tone === "danger"
              ? "text-rose-600 dark:text-rose-300"
              : assessment.tone === "success"
                ? "text-emerald-600 dark:text-emerald-300"
                : assessment.tone === "warning"
                  ? "text-amber-600 dark:text-amber-300"
                  : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {assessment.message}
        </p>
      </div>
    </div>
  );
}
