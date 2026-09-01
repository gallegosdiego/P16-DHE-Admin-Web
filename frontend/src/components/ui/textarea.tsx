import type { ComponentProps } from "react";
import { cx } from "./cx";
import { FieldWrapper, fieldControlClasses } from "./field";

export type TextareaProps = ComponentProps<"textarea"> & {
  label?: string;
  hint?: string;
  error?: string;
  /** Clase para el contenedor (label + control). `className` va al textarea. */
  wrapperClassName?: string;
};

export function Textarea({ label, hint, error, wrapperClassName, className, id, required, rows = 4, ...props }: TextareaProps) {
  return (
    <FieldWrapper id={id} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {(controlProps) => (
        <textarea
          {...controlProps}
          required={required}
          rows={rows}
          className={cx(fieldControlClasses, "min-h-11 py-2.5", error && "border-danger", className)}
          {...props}
        />
      )}
    </FieldWrapper>
  );
}
