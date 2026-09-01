import type { ComponentProps } from "react";
import { cx } from "./cx";
import { FieldWrapper, fieldControlClasses } from "./field";

export type InputProps = ComponentProps<"input"> & {
  label?: string;
  hint?: string;
  error?: string;
  /** Clase para el contenedor (label + control). `className` va al input. */
  wrapperClassName?: string;
};

export function Input({ label, hint, error, wrapperClassName, className, id, required, ...props }: InputProps) {
  return (
    <FieldWrapper id={id} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {(controlProps) => (
        <input
          {...controlProps}
          required={required}
          className={cx(fieldControlClasses, "h-11", error && "border-danger", className)}
          {...props}
        />
      )}
    </FieldWrapper>
  );
}
