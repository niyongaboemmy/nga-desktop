import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Download, Eraser, Minus, MoveUpRight, Pen, Redo2, Square, Trash2, Type, Undo2 } from "lucide-react";
import { toolsNative } from "../shared/native";
import { usePersonal } from "../shared/store";
import type { ToolProps } from "../types";

type ToolKind = "pen" | "marker" | "eraser" | "line" | "arrow" | "rect" | "ellipse" | "text";
type Pt = [number, number];
interface Stroke {
  kind: ToolKind;
  color: string;
  size: number;
  pts: Pt[];
  text?: string;
}

const COLORS = ["#111827", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ffffff"];

/** Draw one stroke on a 2D context (coordinates are 0..1 of the board, so it scales). */
function draw(g: CanvasRenderingContext2D, s: Stroke, w: number, h: number) {
  const P = (p: Pt): Pt => [p[0] * w, p[1] * h];
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = s.color;
  g.fillStyle = s.color;
  g.lineWidth = s.size * (w / 1000);
  if (s.kind === "marker") g.globalAlpha = 0.35;
  if (s.kind === "eraser") g.globalCompositeOperation = "destination-out";
  const [a, b] = [P(s.pts[0]), P(s.pts[s.pts.length - 1])];
  if (s.kind === "pen" || s.kind === "marker" || s.kind === "eraser") {
    g.beginPath();
    g.moveTo(...a);
    for (let i = 1; i < s.pts.length; i++) {
      const [x0, y0] = P(s.pts[i - 1]);
      const [x1, y1] = P(s.pts[i]);
      g.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    if (s.pts.length === 1) g.lineTo(a[0] + 0.1, a[1]);
    g.stroke();
  } else if (s.kind === "line" || s.kind === "arrow") {
    g.beginPath();
    g.moveTo(...a);
    g.lineTo(...b);
    g.stroke();
    if (s.kind === "arrow") {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const len = Math.max(10, g.lineWidth * 4);
      g.beginPath();
      g.moveTo(...b);
      g.lineTo(b[0] - len * Math.cos(ang - 0.45), b[1] - len * Math.sin(ang - 0.45));
      g.moveTo(...b);
      g.lineTo(b[0] - len * Math.cos(ang + 0.45), b[1] - len * Math.sin(ang + 0.45));
      g.stroke();
    }
  } else if (s.kind === "rect") {
    g.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
  } else if (s.kind === "ellipse") {
    g.beginPath();
    g.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
    g.stroke();
  } else if (s.kind === "text" && s.text) {
    g.font = `600 ${Math.round(s.size * 4 * (w / 1000))}px Inter, system-ui, sans-serif`;
    g.textBaseline = "top";
    s.text.split("\n").forEach((line, i) => g.fillText(line, a[0], a[1] + i * s.size * 4.6 * (w / 1000)));
  }
  g.restore();
}

/** A simple, offline whiteboard: pen, marker, shapes, text, undo, PNG export. Saved per person. */
export default function Board({ ctx }: ToolProps) {
  const { t, identity, present } = ctx;
  const [strokes, setStrokes] = usePersonal<Stroke[]>(identity, "board.strokes", []);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<ToolKind>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(4);
  const [bg, setBg] = usePersonal<"white" | "dark" | "grid">(identity, "board.bg", "white");
  const [msg, setMsg] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<Stroke | null>(null);

  const repaint = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    for (const s of strokes) draw(g, s, c.width, c.height);
    if (live.current) draw(g, live.current, c.width, c.height);
  }, [strokes]);

  useEffect(() => {
    repaint();
    const ro = new ResizeObserver(repaint);
    if (canvas.current) ro.observe(canvas.current);
    return () => ro.disconnect();
  }, [repaint]);

  const at = (e: React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const down = (e: React.PointerEvent) => {
    if (tool === "text") {
      const text = window.prompt(t("board.textPrompt"));
      if (text?.trim()) {
        setStrokes((s) => [...s, { kind: "text", color, size, pts: [at(e)], text: text.slice(0, 300) }]);
        setRedo([]);
      }
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    live.current = { kind: tool, color, size: tool === "marker" ? size * 4 : tool === "eraser" ? size * 6 : size, pts: [at(e)] };
    repaint();
  };
  const move = (e: React.PointerEvent) => {
    if (!live.current) return;
    const p = at(e);
    if (["pen", "marker", "eraser"].includes(live.current.kind)) live.current.pts.push(p);
    else live.current.pts = [live.current.pts[0], p];
    repaint();
  };
  const up = () => {
    if (!live.current) return;
    const s = live.current;
    live.current = null;
    setStrokes((list) => [...list, s].slice(-2000));
    setRedo([]);
  };
  const undo = () => setStrokes((s) => {
    if (!s.length) return s;
    setRedo((r) => [...r, s[s.length - 1]]);
    return s.slice(0, -1);
  });
  const redoOne = () => setRedo((r) => {
    if (!r.length) return r;
    setStrokes((s) => [...s, r[r.length - 1]]);
    return r.slice(0, -1);
  });

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redoOne(); else undo(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const exportPng = async () => {
    const c = canvas.current!;
    const out = document.createElement("canvas");
    out.width = c.width;
    out.height = c.height;
    const g = out.getContext("2d")!;
    g.fillStyle = bg === "dark" ? "#14171c" : "#ffffff";
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(c, 0, 0);
    const b64 = out.toDataURL("image/png").split(",")[1];
    try {
      const path = await toolsNative.saveFile(`whiteboard-${new Date().toISOString().slice(0, 10)}.png`, b64);
      setMsg(t("common.savedTo", { name: path.split(/[\\/]/).pop() ?? "" }));
    } catch (e) {
      setMsg(String(e));
    }
    window.setTimeout(() => setMsg(null), 3000);
  };

  const tools: Array<[ToolKind, React.ReactNode, string]> = [
    ["pen", <Pen size={16} />, t("board.pen")],
    ["marker", <span className="marker-ico" />, t("board.marker")],
    ["eraser", <Eraser size={16} />, t("board.eraser")],
    ["line", <Minus size={16} />, t("board.line")],
    ["arrow", <MoveUpRight size={16} />, t("board.arrow")],
    ["rect", <Square size={15} />, t("board.rect")],
    ["ellipse", <Circle size={15} />, t("board.ellipse")],
    ["text", <Type size={16} />, t("board.text")],
  ];
  return (
    <div className={`board${present ? " big" : ""}`}>
      <div className="board-bar" role="toolbar" aria-label={t("tool.board")}>
        {tools.map(([k, icon, label]) => (
          <button key={k} className={tool === k ? "on" : ""} onClick={() => setTool(k)} title={label} aria-label={label} aria-pressed={tool === k}>{icon}</button>
        ))}
        <span className="sep" />
        {COLORS.map((c) => (
          <button key={c} className={`swatch${color === c ? " on" : ""}`} style={{ ["--sw" as string]: c }} onClick={() => setColor(c)} aria-label={c} aria-pressed={color === c} />
        ))}
        <input type="range" min={1} max={14} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label={t("board.size")} />
        <span className="sep" />
        <button onClick={undo} disabled={!strokes.length} title={t("board.undo")} aria-label={t("board.undo")}><Undo2 size={16} /></button>
        <button onClick={redoOne} disabled={!redo.length} title={t("board.redo")} aria-label={t("board.redo")}><Redo2 size={16} /></button>
        <select value={bg} onChange={(e) => setBg(e.target.value as typeof bg)} aria-label={t("board.background")}>
          <option value="white">{t("board.white")}</option>
          <option value="grid">{t("board.grid")}</option>
          <option value="dark">{t("board.dark")}</option>
        </select>
        <button onClick={() => void exportPng()} title={t("board.export")} aria-label={t("board.export")}><Download size={16} /></button>
        <button onClick={() => { setRedo([]); setStrokes([]); }} disabled={!strokes.length} title={t("board.clear")} aria-label={t("board.clear")}><Trash2 size={15} /></button>
      </div>
      {msg && <p className="muted small" role="status">{msg}</p>}
      <canvas
        ref={canvas}
        className={`board-canvas bg-${bg} tool-${tool}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label={t("tool.board")}
      />
    </div>
  );
}
