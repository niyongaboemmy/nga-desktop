// Time display and input for the timers.

/** 65_000 → "1:05"; 3_725_000 → "1:02:05". Counting down rounds up, so 0:00 shows only at zero. */
export function clock(ms: number, roundUp = false, tenths = false): string {
  const safe = Math.max(0, ms);
  const totalTenths = roundUp ? Math.ceil(safe / 100) : Math.floor(safe / 100);
  const total = roundUp && !tenths ? Math.ceil(safe / 1000) : Math.floor(totalTenths / 10);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const base = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return tenths ? `${base}.${totalTenths % 10}` : base;
}

/** "5" (minutes), "4:30", "1:00:00", "90s", "1h 30m" → ms; null if not understood. */
export function parseLength(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 60_000);
  const colon = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(t);
  if (colon) {
    const [a, b, c] = [colon[1], colon[2], colon[3]].map((x) => (x === undefined ? undefined : +x));
    if (c === undefined) return b! < 60 ? (a! * 60 + b!) * 1000 : null;
    return b! < 60 && c < 60 ? (a! * 3600 + b! * 60 + c) * 1000 : null;
  }
  const parts = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hours?|m|min|minutes?|s|sec|seconds?)\b/g)];
  if (parts.length && parts.map((p) => p[0]).join("").replace(/\s/g, "") === t.replace(/\s/g, "")) {
    return Math.round(
      parts.reduce((sum, p) => sum + parseFloat(p[1]) * (p[2].startsWith("h") ? 3_600_000 : p[2].startsWith("m") ? 60_000 : 1000), 0),
    );
  }
  return null;
}

export const PRESETS_MIN = [1, 3, 5, 10, 15, 25, 30, 45];

export interface TimerLike {
  durationMs: number;
  elapsedMs: number;
  runningSince: number | null;
}

export const elapsed = (t: TimerLike, now: number) => t.elapsedMs + (t.runningSince === null ? 0 : Math.max(0, now - t.runningSince));
export const remaining = (t: TimerLike, now: number) => Math.max(0, t.durationMs - elapsed(t, now));
export const progress = (t: TimerLike, now: number) => (t.durationMs > 0 ? Math.min(1, elapsed(t, now) / t.durationMs) : 0);
