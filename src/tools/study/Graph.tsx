import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Download, Home, Plus, Trash2 } from "lucide-react";
import { compileFunction, fmtNum, intersections, niceStep, parametersOf, sample, zeros, type Fn } from "./graphMath";
import { usePersonal } from "../shared/store";
import { toolsNative } from "../shared/native";
import type { ToolProps } from "../types";

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7", "#0ea5e9"];
interface View { x0: number; x1: number; y0: number; y1: number }
const HOME: View = { x0: -10, x1: 10, y0: -7, y1: 7 };

export default function Graph({ ctx }: ToolProps) {
  const { t, identity, present } = ctx;
  const [exprs, setExprs] = usePersonal<string[]>(identity, "graph.exprs", ["y = x^2 - 4", "y = a*x + b"]);
  const [params, setParams] = usePersonal<Record<string, number>>(identity, "graph.params", { a: 1, b: 1 });
  const [view, setView] = useState<View>(HOME);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; v: View } | null>(null);

  const names = useMemo(() => [...new Set(exprs.flatMap(parametersOf))], [exprs]);
  const compiled = exprs.map((e) => compileFunction(e, params));
  const fns: Array<Fn | null> = compiled.map((c) => ("fn" in c ? c.fn : null));

  // Zeros and intersections of the first two functions in view (the useful points).
  const points = useMemo(() => {
    const out: Array<{ x: number; y: number; label: string; color: string }> = [];
    fns.forEach((f, i) => f && zeros(f, view.x0, view.x1).slice(0, 6).forEach((x) => out.push({ x, y: 0, label: `(${fmtNum(x)}, 0)`, color: COLORS[i % COLORS.length] })));
    if (fns[0] && fns[1]) intersections(fns[0], fns[1], view.x0, view.x1).slice(0, 6).forEach((x) => out.push({ x, y: fns[0]!(x), label: `(${fmtNum(x)}, ${fmtNum(fns[0]!(x))})`, color: "var(--text)" }));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exprs, params, view]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    const W = r.width, H = r.height;
    const X = (x: number) => ((x - view.x0) / (view.x1 - view.x0)) * W;
    const Y = (y: number) => H - ((y - view.y0) / (view.y1 - view.y0)) * H;
    const css = getComputedStyle(c);
    const line = css.getPropertyValue("--line").trim() || "#ddd";
    const muted = css.getPropertyValue("--muted").trim() || "#888";
    const text = css.getPropertyValue("--text").trim() || "#111";
    g.clearRect(0, 0, W, H);
    g.font = "11px Inter, system-ui, sans-serif";
    const sx = niceStep(view.x1 - view.x0, W / 70), sy = niceStep(view.y1 - view.y0, H / 60);
    g.strokeStyle = line;
    g.lineWidth = 1;
    g.fillStyle = muted;
    for (let x = Math.ceil(view.x0 / sx) * sx; x <= view.x1; x += sx) {
      g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke();
      if (Math.abs(x) > sx / 2) g.fillText(fmtNum(x), X(x) + 3, Math.min(H - 4, Math.max(12, Y(0) + 13)));
    }
    for (let y = Math.ceil(view.y0 / sy) * sy; y <= view.y1; y += sy) {
      g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(W, Y(y)); g.stroke();
      if (Math.abs(y) > sy / 2) g.fillText(fmtNum(y), Math.min(W - 30, Math.max(3, X(0) + 4)), Y(y) - 3);
    }
    g.strokeStyle = text;
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(X(0), 0); g.lineTo(X(0), H); g.moveTo(0, Y(0)); g.lineTo(W, Y(0)); g.stroke();
    fns.forEach((f, i) => {
      if (!f) return;
      g.strokeStyle = COLORS[i % COLORS.length];
      g.lineWidth = 2.4;
      for (const seg of sample(f, view.x0, view.x1, Math.round(W * 1.5), (view.y1 - view.y0) * 3)) {
        g.beginPath();
        seg.forEach(([x, y], k) => (k ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
        g.stroke();
      }
    });
    for (const p of points) {
      g.fillStyle = p.color === "var(--text)" ? text : p.color;
      g.beginPath(); g.arc(X(p.x), Y(p.y), 4, 0, Math.PI * 2); g.fill();
    }
    if (hover && fns[0]) {
      const y = fns[0](hover.x);
      if (Number.isFinite(y)) {
        g.fillStyle = COLORS[0];
        g.beginPath(); g.arc(X(hover.x), Y(y), 5, 0, Math.PI * 2); g.fill();
        g.fillStyle = text;
        g.fillText(`(${fmtNum(hover.x)}, ${fmtNum(y)})`, X(hover.x) + 8, Y(y) - 8);
      }
    }
  });

  const toWorld = (e: React.PointerEvent | React.WheelEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: view.x0 + ((e.clientX - r.left) / r.width) * (view.x1 - view.x0), y: view.y1 - ((e.clientY - r.top) / r.height) * (view.y1 - view.y0), r };
  };
  const onWheel = (e: React.WheelEvent) => {
    const { x, y } = toWorld(e);
    const k = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    setView((v) => ({ x0: x + (v.x0 - x) * k, x1: x + (v.x1 - x) * k, y0: y + (v.y0 - y) * k, y1: y + (v.y1 - y) * k }));
  };
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, v: view };
  };
  const onMove = (e: React.PointerEvent) => {
    const w = toWorld(e);
    setHover({ x: w.x, y: w.y });
    const d = drag.current;
    if (!d) return;
    const dx = ((e.clientX - d.x) / w.r.width) * (d.v.x1 - d.v.x0);
    const dy = ((e.clientY - d.y) / w.r.height) * (d.v.y1 - d.v.y0);
    setView({ x0: d.v.x0 - dx, x1: d.v.x1 - dx, y0: d.v.y0 + dy, y1: d.v.y1 + dy });
  };
  const save = async () => {
    const b64 = canvas.current!.toDataURL("image/png").split(",")[1];
    try {
      const p = await toolsNative.saveFile(`graph-${new Date().toISOString().slice(0, 10)}.png`, b64);
      setMsg(t("common.savedTo", { name: p.split(/[\\/]/).pop() ?? "" }));
    } catch (e) { setMsg(String(e)); }
    window.setTimeout(() => setMsg(null), 3000);
  };

  return (
    <div className={`graph${present ? " big" : ""}`}>
      <div className="graph-side">
        {exprs.map((e, i) => (
          <div key={i} className="fx-row" style={{ ["--c" as string]: COLORS[i % COLORS.length] }}>
            <span className="fx-dot" />
            <input value={e} onChange={(ev) => setExprs((l) => l.map((x, j) => (j === i ? ev.target.value : x)))} spellCheck={false} aria-label={t("graph.function", { n: i + 1 })} className={"error" in compiled[i] && e.trim() ? "bad" : ""} />
            <button className="icon-btn" onClick={() => setExprs((l) => l.filter((_, j) => j !== i))} aria-label={t("notes.delete")}><Trash2 size={13} /></button>
          </div>
        ))}
        {exprs.length < 6 && <button className="btn sm" onClick={() => setExprs((l) => [...l, ""])}><Plus size={13} /> {t("graph.add")}</button>}
        {names.map((n) => (
          <label key={n} className="param">
            <span><strong>{n}</strong> = {fmtNum(params[n] ?? 1)}</span>
            <input type="range" min={-10} max={10} step={0.1} value={params[n] ?? 1} onChange={(e) => setParams((p) => ({ ...p, [n]: Number(e.target.value) }))} />
          </label>
        ))}
        {points.length > 0 && (
          <div className="graph-points">
            <strong><Crosshair size={12} /> {t("graph.points")}</strong>
            <ul>{points.map((p, i) => <li key={i} style={{ color: `color-mix(in srgb, ${p.color} 62%, var(--text))` }}>{p.label}</li>)}</ul>
          </div>
        )}
        <div className="row">
          <button className="btn sm" onClick={() => setView(HOME)}><Home size={13} /> {t("graph.reset")}</button>
          <button className="btn sm" onClick={() => void save()}><Download size={13} /> PNG</button>
        </div>
        {msg && <p className="muted small">{msg}</p>}
        <p className="muted small">{t("graph.hint")}</p>
      </div>
      <canvas ref={canvas} className="graph-canvas" onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onPointerLeave={() => setHover(null)} aria-label={t("tool.graph")} />
    </div>
  );
}
