import { Hand, Hourglass, Maximize2, Volume2 } from "lucide-react";
import Timers from "../timer/Timers";
import Signs from "./Signs";
import Noise from "./Noise";
import { toolsNative } from "../shared/native";
import type { ToolProps } from "../types";

/** One projector screen: the running timer, the work-mode sign and the noise meter. */
export default function ClassroomScreen({ ctx }: ToolProps) {
  const { t } = ctx;
  const big = { ...ctx, present: true };
  if (!ctx.present)
    return (
      <div className="cscreen-intro">
        <p className="muted">{t("cscreen.intro")}</p>
        <div className="cscreen-map" aria-hidden>
          <div className="cs-timer"><Hourglass size={26} /><span>{t("tool.timer")}</span></div>
          <div className="cs-sign"><Hand size={22} /><span>{t("tool.signs")}</span></div>
          <div className="cs-noise"><Volume2 size={22} /><span>{t("tool.noise")}</span></div>
        </div>
        <button className="btn primary cs-present" onClick={() => void toolsNative.openWindow("classroom-screen", t("tool.cscreen"), true)}><Maximize2 size={15} /> {t("cscreen.present")}</button>
        <p className="muted small">{t("cscreen.tip")}</p>
      </div>
    );
  return (
    <div className="cscreen">
      <div className="cs-timer"><Timers ctx={big} /></div>
      <div className="cs-sign"><Signs ctx={big} /></div>
      <div className="cs-noise"><Noise ctx={big} /></div>
    </div>
  );
}
