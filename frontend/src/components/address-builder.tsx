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
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`space-y-1 ${className}`}>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function InlineDivider({ value }: { value: string }) {
  return (
    <div className="hidden h-11 items-center justify-center px-1 text-sm font-bold text-slate-400 sm:flex dark:text-slate-500">
      {value}
    </div>
  );
}

export function AddressBuilder({ value, onChange, inputClassName }: Props) {
  const preview = composeStructuredAddressPreview(buildStructuredAddressMeta(value));
  const assessment = assessStructuredAddress(value);
  const controlClassName = `${inputClassName} min-w-0`;
  const compactControlClassName = `${controlClassName} h-10 px-2.5`;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-[#2a2a3e] dark:bg-[#141428]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Constructor guiado de dirección</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            En móvil se organiza por bloques compactos; en escritorio se mantiene la línea rápida de captura.
          </p>
        </div>
        <span className="w-fit rounded-full bg-fuchsia-100 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
          Modo recomendado
        </span>
      </div>

      <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-3 dark:border-[#2f2f46] dark:bg-[#111124]/60">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Dirección base
        </p>

        <div className="grid gap-3 sm:hidden">
          <div className="grid grid-cols-[minmax(0,1.3fr)_5.5rem_6.5rem] gap-2">
            <Field label="Vía">
              <select
                value={value.roadType}
                onChange={(event) => onChange({ ...value, roadType: event.target.value as StructuredAddressForm["roadType"] })}
                className={compactControlClassName}
              >
                {ADDRESS_ROAD_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Núm.">
              <input
                value={value.roadNumber}
                onChange={(event) => onChange({ ...value, roadNumber: event.target.value })}
                placeholder="22"
                maxLength={20}
                className={compactControlClassName}
              />
            </Field>
            <Field label="Letra/Bis">
              <input
                value={value.roadSuffix}
                onChange={(event) => onChange({ ...value, roadSuffix: event.target.value })}
                placeholder="Bis"
                maxLength={20}
                className={compactControlClassName}
              />
            </Field>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] gap-2">
            <Field label="Cruce (#)">
              <input
                value={value.crossNumber}
                onChange={(event) => onChange({ ...value, crossNumber: event.target.value })}
                placeholder="103F"
                maxLength={20}
                className={compactControlClassName}
              />
            </Field>
            <Field label="Comp.">
              <input
                value={value.crossSuffix}
                onChange={(event) => onChange({ ...value, crossSuffix: event.target.value })}
                placeholder="A"
                maxLength={20}
                className={compactControlClassName}
              />
            </Field>
            <Field label="Predio">
              <input
                value={value.propertyNumber}
                onChange={(event) => onChange({ ...value, propertyNumber: event.target.value })}
                placeholder="64"
                maxLength={20}
                className={compactControlClassName}
              />
            </Field>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2">
            <Field label="Comp. predio">
              <input
                value={value.propertySuffix}
                onChange={(event) => onChange({ ...value, propertySuffix: event.target.value })}
                placeholder="Int"
                maxLength={20}
                className={compactControlClassName}
              />
            </Field>
            <div className="flex items-end rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-[#31314a] dark:bg-[#17172b] dark:text-slate-400">
              Formato: Calle 22 # 103F-64
            </div>
          </div>
        </div>

        <div className="hidden overflow-x-auto pb-1 sm:block">
          <div className="flex min-w-[46rem] items-end gap-2">
            <Field label="Vía" className="min-w-[9rem] flex-[1.2_1_10rem]">
              <select
                value={value.roadType}
                onChange={(event) => onChange({ ...value, roadType: event.target.value as StructuredAddressForm["roadType"] })}
                className={compactControlClassName}
              >
                {ADDRESS_ROAD_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <InlineDivider value="|" />

            <Field label="Núm." className="w-[5.5rem]">
              <input
                value={value.roadNumber}
                onChange={(event) => onChange({ ...value, roadNumber: event.target.value })}
                placeholder="22"
                maxLength={20}
                className={compactControlClassName}
              />
            </Field>

            <InlineDivider value="|" />

            <Field label="Letra/Bis" className="w-[6.5rem]">
              <input
                value={value.roadSuffix}
                onChange={(event) => onChange({ ...value, roadSuffix: event.target.value })}
                placeholder="Bis"
                maxLength={20}
                className={compactControlClassName}
              />
            </Field>

            <InlineDivider value="#" />

            <Field label="Cruce" className="w-[6.75rem]">
              <input
                value={value.crossNumber}
                onChange={(event) => onChange({ ...value, crossNumber: event.target.value })}
                placeholder="103F"
                maxLength={20}
                className={compactControlClassName}
              />
            </Field>

            <Field label="Comp." className="w-[6rem]">
              <input
                value={value.crossSuffix}
                onChange={(event) => onChange({ ...value, crossSuffix: event.target.value })}
                placeholder="A"
                maxLength={20}
                className={compactControlClassName}
              />
            </Field>

            <InlineDivider value="-" />

            <Field label="Predio" className="w-[5.75rem]">
              <input
                value={value.propertyNumber}
                onChange={(event) => onChange({ ...value, propertyNumber: event.target.value })}
                placeholder="64"
                maxLength={20}
                className={compactControlClassName}
              />
            </Field>

            <Field label="Comp." className="w-[6.5rem]">
              <input
                value={value.propertySuffix}
                onChange={(event) => onChange({ ...value, propertySuffix: event.target.value })}
                placeholder="Int"
                maxLength={20}
                className={compactControlClassName}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.15fr)_minmax(0,1fr)]">
        <Field label="Barrio">
          <input
            value={value.neighborhood}
            onChange={(event) => onChange({ ...value, neighborhood: event.target.value })}
            placeholder="Ej: Chapinero Central"
            maxLength={80}
            className={controlClassName}
          />
        </Field>
        <Field label="Complemento de entrega">
          <input
            value={value.unitDetails}
            onChange={(event) => onChange({ ...value, unitDetails: event.target.value })}
            placeholder="Torre 2, apto 301, casa 4..."
            maxLength={80}
            className={controlClassName}
          />
        </Field>
        <Field label="Referencia">
          <input
            value={value.reference}
            onChange={(event) => onChange({ ...value, reference: event.target.value })}
            placeholder="Frente al parque, portón gris..."
            maxLength={160}
            className={controlClassName}
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
