import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Delete, History, Trash2 } from "lucide-react";
import { addValues, evaluate, formatValue, zero, type AngleMode } from "./engine";
import { usePersonal } from "../shared/store";
import type { ToolProps } from "../types";
import type { Key } from "../i18n";

interface Entry {
  expr: string;
  result: string;
}

const ERR: Record<string, Key> = {
  syntax: "calc.errSyntax",
  unknown: "calc.errUnknown",
  infinite: "calc.errInfinite",
  other: "calc.errOther",
};

const BASIC: string[][] = [
  ["C", "⌫", "(", ")", "÷"],
  ["7", "8", "9", "×", "%"],
  ["4", "5", "6", "−", "^"],
  ["1", "2", "3", "+", "√"],
  ["±", "0", ".", "Ans", "="],
];
const SCI: string[][] = [
  ["sin", "cos", "tan", "π", "e"],
  ["asin", "acos", "atan", "ln", "log"],
  ["x²", "!", "nCr", "mod", "EXP"],
];

export default function Calculator({ ctx }: ToolProps) {
  const { t, identity, present } = ctx;
  const [expr, setExpr] = useState("");
  const [mode, setMode] = usePersonal<AngleMode>(identity, "calc.mode", "deg");
  const [sci, setSci] = usePersonal<boolean>(identity, "calc.sci", true);
  const [history, setHistory] = usePersonal<Entry[]>(identity, "calc.history", []);
  const [shown, setShown] = useState<{ text: string; fraction: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const ans = useRef<unknown>(undefined);
  const mem = useRef<unknown>(zero());
  const [memSet, setMemSet] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  const preview = useMemo(() => {
    if (!expr.trim()) return null;
    const r = evaluate(expr, mode, ans.current);
    return r.ok ? r.text : null;
  }, [expr, mode]);

  const commit = () => {
    const r = evaluate(expr, mode, ans.current);
    if (!r.ok) {
      if (r.error !== "empty") setError(t(ERR[r.error] ?? "calc.errOther", { name: r.detail ?? "" }));
      return;
    }
    ans.current = r.value;
    setShown({ text: r.text, fraction: r.fraction });
    setError(null);
    setHistory((h) => [{ expr: expr.trim(), result: r.text }, ...h].slice(0, 50));
    setExpr("");
  };

  const insert = (s: string) => {
    setError(null);
    setExpr((cur) => {
      // After "=", an operator continues from the answer.
      if (!cur && shown && /^[+\-−×÷^%*/!]/.test(s)) return `Ans${s}`;
      return cur + s;
    });
    input.current?.focus();
  };

  const key = (k: string) => {
    switch (k) {
      case "C": setExpr(""); setShown(null); setError(null); break;
      case "⌫": setExpr((e) => e.slice(0, -1)); break;
      case "=": commit(); break;
      case "±": setExpr((e) => (e.startsWith("-(") && e.endsWith(")") ? e.slice(2, -1) : e ? `-(${e})` : "-")); break;
      case "√": insert("√("); break;
      case "x²": insert("^2"); break;
      case "EXP": insert("e"); break;
      case "mod": insert(" mod "); break;
      case "nCr": insert(" nCr "); break;
      case "sin": case "cos": case "tan": case "asin": case "acos": case "atan": case "ln": case "log": insert(`${k}(`); break;
      default: insert(k);
    }
    input.current?.focus();
  };

  const memory = (op: "MC" | "MR" | "M+" | "M-") => {
    if (op === "MC") { mem.current = zero(); setMemSet(false); return; }
    if (op === "MR") { insert(formatValue(mem.current)); return; }
    const cur = expr.trim() ? evaluate(expr, mode, ans.current) : null;
    const v = cur?.ok ? cur.value : ans.current;
    if (v === undefined) return;
    mem.current = addValues(mem.current, v, op === "M+" ? 1 : -1);
    setMemSet(true);
  };

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className={`calc${present ? " big" : ""}`}>
      <div className="calc-display" aria-live="polite">
        <div className="calc-flags">
          <button className={`chip${mode === "deg" ? " on" : ""}`} onClick={() => setMode("deg")} aria-pressed={mode === "deg"}>DEG</button>
          <button className={`chip${mode === "rad" ? " on" : ""}`} onClick={() => setMode("rad")} aria-pressed={mode === "rad"}>RAD</button>
          {memSet && <span className="calc-m" title={t("calc.memory")}>M</span>}
          <span className="flex" />
          <button className={`icon-btn${showHistory ? " on" : ""}`} onClick={() => setShowHistory((s) => !s)} title={t("calc.history")} aria-label={t("calc.history")} aria-pressed={showHistory}><History size={15} /></button>
        </div>
        <input
          ref={input}
          className="calc-input"
          value={expr}
          onChange={(e) => { setExpr(e.target.value); setError(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || (e.key === "=" && !e.shiftKey)) { e.preventDefault(); commit(); }
            else if (e.key === "Escape") { setExpr(""); setShown(null); setError(null); }
            else if (!expr && shown && /^[+\-*/^%!]$/.test(e.key)) { e.preventDefault(); insert(e.key); }
          }}
          placeholder={shown ? "" : t("calc.placeholder")}
          spellCheck={false}
          aria-label={t("calc.expression")}
        />
        <div className="calc-result">
          {error ? (
            <span className="calc-error" role="alert">{error}</span>
          ) : expr ? (
            <span className="muted">{preview !== null ? `= ${preview}` : ""}</span>
          ) : shown ? (
            <>
              <button className="calc-answer" onClick={() => copy(shown.text)} title={t("calc.copy")}>
                {shown.text} <Copy size={14} className="muted" />
              </button>
              {shown.fraction && <span className="calc-fraction muted">{shown.fraction}</span>}
            </>
          ) : null}
          {copied && <span className="calc-copied">{t("calc.copied")}</span>}
        </div>
      </div>

      {showHistory ? (
        <div className="calc-history">
          {history.length === 0 ? <p className="muted small">{t("calc.noHistory")}</p> : (
            <>
              <ul>
                {history.map((h, i) => (
                  <li key={i}>
                    <button onClick={() => { setExpr(h.expr); setShowHistory(false); input.current?.focus(); }}>
                      <span className="muted">{h.expr}</span>
                      <strong>= {h.result}</strong>
                    </button>
                  </li>
                ))}
              </ul>
              <button className="btn sm" onClick={() => setHistory([])}><Trash2 size={13} /> {t("calc.clearHistory")}</button>
            </>
          )}
        </div>
      ) : (
        <div className="calc-keys">
          <div className="calc-row mem">
            {(["MC", "MR", "M+", "M-"] as const).map((m) => (
              <button key={m} className="key fn" onClick={() => memory(m)}>{m === "M-" ? "M−" : m}</button>
            ))}
            <button className={`key fn${sci ? " on" : ""}`} onClick={() => setSci(!sci)} aria-pressed={sci}>{t("calc.sci")}</button>
          </div>
          {sci && SCI.map((row, i) => (
            <div className="calc-row" key={`s${i}`}>
              {row.map((k) => <button key={k} className="key fn" onClick={() => key(k)}>{k}</button>)}
            </div>
          ))}
          {BASIC.map((row, i) => (
            <div className="calc-row" key={`b${i}`}>
              {row.map((k) => (
                <button
                  key={k}
                  className={`key${/^[\d.]$/.test(k) ? " num" : k === "=" ? " eq" : /^[÷×−+^%]$/.test(k) ? " op" : " fn"}`}
                  onClick={() => key(k)}
                  aria-label={k === "⌫" ? t("calc.backspace") : k === "C" ? t("calc.clear") : k}
                >
                  {k === "⌫" ? <Delete size={16} /> : k}
                </button>
              ))}
            </div>
          ))}
          <p className="muted small calc-hint">{t("calc.hint")}</p>
        </div>
      )}
    </div>
  );
}
