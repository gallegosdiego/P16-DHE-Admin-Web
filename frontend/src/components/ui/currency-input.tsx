"use client";

import { useId, useState, useRef, type ComponentProps, type ChangeEvent } from "react";
import { cx } from "./cx";
import { FieldWrapper, fieldControlClasses } from "./field";

export type CurrencyInputProps = Omit<ComponentProps<"input">, "value" | "onChange"> & {
  value?: number | null;
  onValueChange?: (value: number) => void;
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
};

function formatDigits(digits: string): string {
  if (!digits) return "";
  const cleanDigits = digits.replace(/^0+(?=\d)/, "");
  return cleanDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function valueToFormatted(val: number | null | undefined): string {
  if (val === undefined || val === null || isNaN(val)) return "";
  if (val === 0) return "0";
  const absVal = Math.abs(Math.round(val));
  const digits = absVal.toString();
  const formatted = formatDigits(digits);
  return val < 0 ? `-${formatted}` : formatted;
}

export function CurrencyInput({
  value,
  onValueChange,
  label,
  hint,
  error,
  wrapperClassName,
  className,
  id,
  required,
  disabled,
  placeholder,
  ...props
}: CurrencyInputProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);

  const [prevValue, setPrevValue] = useState<number | null | undefined>(value);
  const [displayValue, setDisplayValue] = useState<string>(() => valueToFormatted(value));

  // Sync state during render when `value` prop changes from outside
  if (value !== prevValue) {
    setPrevValue(value);
    setDisplayValue(valueToFormatted(value));
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const inputElement = e.target;
    const rawVal = inputElement.value;
    const rawCursorPos = inputElement.selectionStart ?? rawVal.length;

    // Calculate how many digits were before the cursor in raw typed string
    const digitsBeforeCursor = rawVal.slice(0, rawCursorPos).replace(/\D/g, "").length;

    // Extract digits and parse numeric value
    const digitsOnly = rawVal.replace(/\D/g, "");
    const cleanDigits = digitsOnly.replace(/^0+(?=\d)/, "");
    const numericValue = cleanDigits ? parseInt(cleanDigits, 10) : 0;

    // Format new display value
    const newFormatted = cleanDigits ? formatDigits(cleanDigits) : "";
    setDisplayValue(newFormatted);

    // Calculate target cursor position in new formatted string
    let newCursorPos = 0;
    let digitCount = 0;
    for (let i = 0; i < newFormatted.length; i++) {
      if (/\d/.test(newFormatted[i])) {
        digitCount++;
      }
      if (digitCount === digitsBeforeCursor) {
        newCursorPos = i + 1;
        break;
      }
    }
    if (digitsBeforeCursor === 0) {
      newCursorPos = 0;
    } else if (digitCount < digitsBeforeCursor) {
      newCursorPos = newFormatted.length;
    }

    // Set cursor position on next tick after render
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    });

    onValueChange?.(numericValue);
  };

  return (
    <FieldWrapper id={controlId} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {(controlProps) => (
        <div className="relative flex items-center w-full">
          <span className="pointer-events-none absolute left-3 text-sm text-ink-secondary select-none">$</span>
          <input
            {...controlProps}
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={displayValue}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            className={cx(fieldControlClasses, "h-11 pl-7 text-ink", error && "border-danger", className)}
            {...props}
          />
        </div>
      )}
    </FieldWrapper>
  );
}
