import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download } from "lucide-react";
import { fileName, payload, type QrInput, type QrKind } from "./qr";
import { textToBase64, toolsNative } from "../shared/native";
import type { ToolProps } from "../types";

const KINDS: QrKind[] = ["link", "text", "wifi", "contact"];

export default function QrTool({ ctx }: ToolProps) {
  const { t, present } = ctx;
  const [input, setInput] = useState<QrInput>({ kind: "link", text: "", security: "WPA" });
  const [svg, setSvg] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const data = payload(input);
  const set = (patch: Partial<QrInput>) => { setMsg(null); setInput((i) => ({ ...i, ...patch })); };

  useEffect(() => {
    let alive = true;
    if (!data) { setSvg(""); return; }
    void QRCode.toString(data, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(""));
    return () => { alive = false; };
  }, [data]);

  const save = async (ext: "png" | "svg") => {
    try {
      const b64 = ext === "svg"
        ? textToBase64(svg)
        : (await QRCode.toDataURL(data, { errorCorrectionLevel: "M", margin: 2, width: 1024 })).split(",")[1];
      const path = await toolsNative.saveFile(fileName(input, ext), b64);
      setMsg(t("common.savedTo", { name: path.split(/[\\/]/).pop() ?? "" }));
    } catch (e) {
      setMsg(String(e));
    }
  };

  if (present) {
    return <div className="qr-present">{svg ? <div className="qr-img" dangerouslySetInnerHTML={{ __html: svg }} /> : <p>{t("qr.empty")}</p>}</div>;
  }

  return (
    <div className="qr">
      <div className="segmented-sm" role="tablist">
        {KINDS.map((k) => (
          <button key={k} role="tab" aria-selected={input.kind === k} className={input.kind === k ? "on" : ""} onClick={() => set({ kind: k })}>{t(`qr.kind.${k}` as never)}</button>
        ))}
      </div>
      {(input.kind === "link" || input.kind === "text") && (
        <label className="field">
          <span>{input.kind === "link" ? t("qr.link") : t("qr.text")}</span>
          {input.kind === "link"
            ? <input value={input.text} onChange={(e) => set({ text: e.target.value })} placeholder="mis.amashuri.com" spellCheck={false} />
            : <textarea value={input.text} onChange={(e) => set({ text: e.target.value })} rows={3} maxLength={1500} />}
        </label>
      )}
      {input.kind === "wifi" && (
        <>
          <label className="field"><span>{t("qr.ssid")}</span><input value={input.ssid ?? ""} onChange={(e) => set({ ssid: e.target.value })} spellCheck={false} /></label>
          <div className="dates-row">
            <label className="field"><span>{t("qr.security")}</span>
              <select value={input.security} onChange={(e) => set({ security: e.target.value as QrInput["security"] })}>
                <option value="WPA">WPA/WPA2/WPA3</option><option value="WEP">WEP</option><option value="nopass">{t("qr.open")}</option>
              </select>
            </label>
            {input.security !== "nopass" && <label className="field"><span>{t("qr.password")}</span><input value={input.password ?? ""} onChange={(e) => set({ password: e.target.value })} spellCheck={false} /></label>}
          </div>
        </>
      )}
      {input.kind === "contact" && (
        <>
          <label className="field"><span>{t("qr.name")}</span><input value={input.name ?? ""} onChange={(e) => set({ name: e.target.value })} /></label>
          <label className="field"><span>{t("qr.phone")}</span><input value={input.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" /></label>
          <label className="field"><span>{t("qr.email")}</span><input value={input.email ?? ""} onChange={(e) => set({ email: e.target.value })} inputMode="email" /></label>
        </>
      )}
      <div className="qr-preview">
        {svg ? <div className="qr-img" dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label={t("qr.preview")} /> : <p className="muted small">{t("qr.empty")}</p>}
      </div>
      <div className="row">
        <button className="btn sm primary" disabled={!svg} onClick={() => void save("png")}><Download size={14} /> PNG</button>
        <button className="btn sm" disabled={!svg} onClick={() => void save("svg")}><Download size={14} /> SVG</button>
      </div>
      {msg && <p className="muted small" role="status">{msg}</p>}
      {input.kind === "wifi" && <p className="muted small">{t("qr.wifiNote")}</p>}
    </div>
  );
}
