import type { ComponentProps } from "react";
import { cx } from "./cx";
import { FieldWrapper, fieldControlClasses } from "./field";

export type SelectProps = ComponentProps<"select"> & {
  label?: string;
  hint?: string;
  error?: string;
  /** Clase para el contenedor (label + control). `className` va al select. */
  wrapperClassName?: string;
};

export function Select({ label, hint, error, wrapperClassName, className, id, required, children, ...props }: SelectProps) {
  return (
    <FieldWrapper id={id} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {(controlProps) => (
        <div className="relative">
          <select
            {...controlProps}
            required={required}
            className={cx(fieldControlClasses, "h-11 appearance-none pr-9", error && "border-danger", className)}
            {...props}
          >
            {children}
          </select>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-none stroke-ink-secondary stroke-2"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      )}
    </FieldWrapper>
  );
}
