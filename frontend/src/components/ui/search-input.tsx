import type { ComponentProps } from "react";
import { cx } from "./cx";
import { fieldControlClasses } from "./field";

export type SearchInputProps = Omit<ComponentProps<"input">, "type"> & {
  "aria-label"?: string;
};

/** Campo de búsqueda con icono de lupa, listo para filtrar listados. */
export function SearchInput({ className, placeholder = "Buscar...", ...props }: SearchInputProps) {
  return (
    <div className={cx("relative", className)}>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-none stroke-ink-secondary stroke-2"
      >
        <path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z" />
      </svg>
      <input
        type="search"
        placeholder={placeholder}
        aria-label={props["aria-label"] ?? placeholder}
        className={cx(fieldControlClasses, "h-11 pl-9")}
        {...props}
      />
    </div>
  );
}
