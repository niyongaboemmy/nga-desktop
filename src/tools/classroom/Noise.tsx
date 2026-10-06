import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { levelFromSamples, smooth, zoneFor, type NoiseZone } from "./logic";
import { usePersonal } from "../shared/store";
import { chime } from "../shared/sound";
import type { ToolProps } from "../types";

const FACE: Record<NoiseZone, string> = { quiet: "🙂", ok: "😐", loud: "😣" };

/** Noise meter: the microphone's level only. Nothing is recorded or sent. */
export default function Noise({ ctx }: ToolProps) {
  const { t, identity, present } = ctx;
  const [okAt, setOkAt] = usePersonal<number>(identity, "noise.ok", 45);
  const [loudAt, setLoudAt] = usePersonal<number>(identity, "noise.loud", 70);
  const [sound, setSound] = usePersonal<boolean>(identity, "noise.sound", false);
  const [state, setState] = useState<"off" | "starting" | "on" | "denied" | "unsupported">("off");
  const [level, setLevel] = useState(0);
  const stop = useRef<() => void>(() => {});
  const loudSince = useRef<number | null>(null);
  const lastChime = useRef(0);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setState("unsupported");
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctxA = new AudioContext();
      // Created after an await, so autoplay rules may leave it suspended (silence).
      if (ctxA.state === "suspended") await ctxA.resume().catch(() => undefined);
      const src = ctxA.createMediaStreamSource(stream);
      const an = ctxA.createAnalyser();
      an.fftSize = 2048;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      let raf = 0, cur = 0;
      const loop = () => {
        an.getFloatTimeDomainData(buf);
        cur = smooth(cur, levelFromSamples(buf), 0.15);
        setLevel(cur);
        raf = requestAnimationFrame(loop);
      };
      loop();
      stop.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((tr) => tr.stop());
        void ctxA.close();
      };
      setState("on");
    } catch {
      setState("denied");
    }
  };
  useEffect(() => () => stop.current(), []);

  const zone = zoneFor(level, okAt, loudAt);
  // Too loud for 2 s: one gentle chime (at most every 10 s), if switched on.
  useEffect(() => {
    if (state !== "on") return;
    const now = Date.now();
    if (zone === "loud") {
      loudSince.current ??= now;
      if (sound && now - loudSince.current > 2000 && now - lastChime.current > 10_000) {
        chime(1);
        lastChime.current = now;
      }
    } else loudSince.current = null;
  }, [zone, state, sound]);

  if (state !== "on")
    return (
      <div className="noise-start">
        <div className="noise-face">{state === "denied" || state === "unsupported" ? <MicOff size={40} /> : <Mic size={40} />}</div>
        <p className="muted small">{state === "denied" ? t("noise.denied") : state === "unsupported" ? t("noise.unsupported") : t("noise.privacy")}</p>
        {state !== "unsupported" && <button className="btn primary" onClick={() => void start()} disabled={state === "starting"}><Mic size={15} /> {t("noise.start")}</button>}
      </div>
    );
  return (
    <div className={`noise zone-${zone}${present ? " big" : ""}`}>
      <div className="noise-face" aria-hidden>{FACE[zone]}</div>
      <div className="noise-label" aria-live="polite">{t(`noise.${zone}` as never)}</div>
      <div className="noise-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level)} aria-label={t("noise.level")}>
        <span className="noise-fill" style={{ width: `${level}%` }} />
        <span className="noise-mark" style={{ left: `${okAt}%` }} />
        <span className="noise-mark loud" style={{ left: `${loudAt}%` }} />
      </div>
      {!present && (
        <div className="noise-settings">
          <label className="field"><span>{t("noise.okAt", { n: okAt })}</span><input type="range" min={5} max={95} value={okAt} onChange={(e) => setOkAt(Math.min(Number(e.target.value), loudAt - 5))} /></label>
          <label className="field"><span>{t("noise.loudAt", { n: loudAt })}</span><input type="range" min={10} max={100} value={loudAt} onChange={(e) => setLoudAt(Math.max(Number(e.target.value), okAt + 5))} /></label>
          <label className="switch-row compact"><input type="checkbox" className="switch" checked={sound} onChange={(e) => setSound(e.target.checked)} /><span><Volume2 size={13} /> {t("noise.chime")}</span></label>
          <button className="btn sm" onClick={() => { stop.current(); setState("off"); setLevel(0); }}><MicOff size={13} /> {t("noise.stop")}</button>
        </div>
      )}
    </div>
  );
}
