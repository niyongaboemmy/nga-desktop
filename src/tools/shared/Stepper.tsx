import { Minus, Plus } from "lucide-react";

/** A number field with − / + buttons (the native spinners are tiny and look dated). */
export function Stepper({ value, min, max, step = 1, onChange, label }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label={`${label} −`}><Minus size={14} /></button>
      <input
        inputMode="numeric"
        value={value}
        aria-label={label}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^\d-]/g, ""));
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") { e.preventDefault(); onChange(clamp(value + step)); }
          if (e.key === "ArrowDown") { e.preventDefault(); onChange(clamp(value - step)); }
        }}
      />
      <button type="button" onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label={`${label} +`}><Plus size={14} /></button>
    </div>
  );
}
