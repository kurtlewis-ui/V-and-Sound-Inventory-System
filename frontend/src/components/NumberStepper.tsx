'use client';

import { Minus, Plus } from 'lucide-react';

/**
 * A number input with tappable ▼ / ▲ stepper buttons on each side — for
 * QUANTITY / STOCK fields (whole numbers). Typing still works exactly like a
 * normal input; the buttons just step the value by `step` and clamp to
 * [min, max]. Used site-wide so quantity fields are easy to adjust on touch
 * devices, where the tiny native number spinners are unusable.
 *
 * Value is a STRING (matching the existing form-state pattern in this app),
 * so an empty field stays empty until the user types or taps.
 */
interface NumberStepperProps {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  /** Extra classes for the middle <input> (e.g. width/padding overrides). */
  inputClassName?: string;
  /** Extra classes for the outer wrapper. */
  className?: string;
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  disabled = false,
  placeholder,
  ariaLabel,
  inputClassName = '',
  className = '',
}: NumberStepperProps) {
  const clamp = (n: number) => {
    let v = n;
    if (typeof min === 'number' && v < min) v = min;
    if (typeof max === 'number' && v > max) v = max;
    return v;
  };

  const bump = (dir: 1 | -1) => {
    // Empty input steps from min so the first tap gives a sensible starting
    // value rather than NaN.
    const current = value === '' || value === null || value === undefined ? min : Number(value);
    const base = Number.isFinite(current) ? current : min;
    const next = clamp(base + dir * step);
    onChange(String(next));
  };

  const numeric = value === '' ? null : Number(value);
  const atMin = numeric !== null && typeof min === 'number' && numeric <= min;
  const atMax = numeric !== null && typeof max === 'number' && numeric >= max;

  const btnBase =
    'flex h-full w-9 shrink-0 items-center justify-center text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-lg border border-input-border bg-input-bg focus-within:ring-2 focus-within:ring-input-focus ${className}`}
    >
      <button
        type="button"
        onClick={() => bump(-1)}
        disabled={disabled || atMin}
        aria-label="Decrease"
        tabIndex={-1}
        className={`${btnBase} border-r border-input-border`}
      >
        <Minus size={16} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={`min-w-0 flex-1 bg-transparent px-2 py-2 text-center text-sm text-text-primary focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${inputClassName}`}
      />
      <button
        type="button"
        onClick={() => bump(1)}
        disabled={disabled || atMax}
        aria-label="Increase"
        tabIndex={-1}
        className={`${btnBase} border-l border-input-border`}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
