import { useId, type ReactNode } from "react";
import { cx } from "./cx";

/** Clases compartidas por Input, Textarea y Select. */
export const fieldControlClasses = cx(
  "w-full rounded-input border border-edge bg-surface px-3 text-sm text-ink",
  "placeholder:text-ink-secondary",
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15",
  "disabled:cursor-not-allowed disabled:bg-app-secondary disabled:text-ink-secondary"
);

type FieldWrapperProps = {
  id?: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (controlProps: { id: string; "aria-invalid"?: boolean }) => ReactNode;
};

/** Envoltura con label encima, texto de apoyo y error, común a los campos de formulario. */
export function FieldWrapper({ id, label, hint, error, required, className, children }: FieldWrapperProps) {
  const autoId = useId();
  const controlId = id ?? autoId;

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={controlId} className="text-sm font-medium text-ink">
          {label}
          {required ? <span className="ml-0.5 text-brand">*</span> : null}
        </label>
      ) : null}
      {children({ id: controlId, ...(error ? { "aria-invalid": true } : {}) })}
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-secondary">{hint}</p>
      ) : null}
    </div>
  );
}
