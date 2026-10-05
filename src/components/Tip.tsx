import { cloneElement, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type ReactElement } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { restoreTheme } from "../lib/theme";

// Tooltips for the title bar, shown in a native window (tooltip.rs) because the
// app pages draw above the shell. Timing like macOS: a short wait on the first
// hover, then instant while you move along the bar.
const DELAY = 450;
const WARM_FOR = 700;
let timer = 0;
let warmUntil = 0;

const hide = () => {
  window.clearTimeout(timer);
  void invoke("tooltip_hide").catch(() => undefined);
};

const show = (el: Element, text: string, hint?: string, keys?: string) => {
  const r = el.getBoundingClientRect();
  void invoke("tooltip_show", { text, hint: hint ?? null, keys: keys ?? null, x: r.left + r.width / 2, y: r.bottom }).catch(() => undefined);
};

/** Wraps one element (a button) with a tooltip: label, optional hint and shortcut. */
export function Tip({ label, hint, keys, children }: { label: string; hint?: string; keys?: string; children: ReactElement<Record<string, unknown>> }) {
  const p = children.props as Record<string, ((e: never) => void) | undefined>;
  const enter = (e: MouseEvent | FocusEvent) => {
    const el = e.currentTarget;
    window.clearTimeout(timer);
    const now = Date.now();
    if (now < warmUntil) show(el, label, hint, keys);
    else timer = window.setTimeout(() => show(el, label, hint, keys), DELAY);
  };
  const leave = () => {
    warmUntil = Date.now() + WARM_FOR;
    hide();
  };
  return cloneElement(children, {
    "aria-label": (children.props as { "aria-label"?: string })["aria-label"] ?? label,
    onMouseEnter: (e: MouseEvent) => { enter(e); p.onMouseEnter?.(e as never); },
    onMouseLeave: (e: MouseEvent) => { leave(); p.onMouseLeave?.(e as never); },
    onMouseDown: (e: MouseEvent) => { warmUntil = 0; hide(); p.onMouseDown?.(e as never); },
    onFocus: (e: FocusEvent) => { if ((e.target as HTMLElement).matches(":focus-visible")) enter(e); p.onFocus?.(e as never); },
    onBlur: (e: FocusEvent) => { hide(); p.onBlur?.(e as never); },
  });
}

interface Payload {
  text: string;
  hint: string | null;
  keys: string | null;
  arrow: number;
}

/** Bubble left edge inside the tooltip window, and the arrow's offset inside the bubble. Pure. */
export function bubbleLayout(arrow: number, bubbleWidth: number, windowWidth: number): { left: number; arrowLeft: number } {
  const left = Math.max(4, Math.min(arrow - bubbleWidth / 2, windowWidth - 4 - bubbleWidth));
  const arrowLeft = Math.max(8, Math.min(arrow - left, bubbleWidth - 8)) - 5;
  return { left, arrowLeft };
}

/** The tooltip window's page (index.html?tooltip=1). */
export function TooltipApp() {
  const [tip, setTip] = useState<Payload | null>(null);
  const [n, setN] = useState(0);
  const bubble = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ left: number; arrowLeft: number } | null>(null);
  useLayoutEffect(() => {
    if (tip && bubble.current) setLayout(bubbleLayout(tip.arrow, bubble.current.offsetWidth, window.innerWidth));
  }, [tip, n]);
  useEffect(() => {
    const sub = listen<Payload>("nga://tooltip", (e) => {
      restoreTheme();
      setTip(e.payload);
      setN((x) => x + 1);
    });
    return () => void sub.then((off) => off());
  }, []);
  if (!tip) return null;
  return (
    <div className="tip-root">
      <div key={n} ref={bubble} className="tip" style={{ left: layout?.left ?? 4, visibility: layout ? "visible" : "hidden" }}>
        <span className="tip-arrow" style={{ left: layout?.arrowLeft ?? 0 }} />
        <span className="tip-main">
          <strong>{tip.text}</strong>
          {tip.keys && <kbd>{tip.keys}</kbd>}
        </span>
        {tip.hint && <span className="tip-hint">{tip.hint}</span>}
      </div>
    </div>
  );
}
