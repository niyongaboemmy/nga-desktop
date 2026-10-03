import { useState } from "react";
import { BellRing, X } from "lucide-react";
import { native } from "../lib/native";

/** First run: ask to turn on notifications (macOS shows its own permission prompt). */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="strip" role="region" aria-label="Turn on notifications">
      <BellRing size={17} className="strip-icon" />
      <span>
        <strong>Never miss a message, reminder or deadline.</strong>{" "}
        <span className="muted">Turn on notifications for Tupo, NGA MIS, Task Mentor and Tendo.</span>
      </span>
      <button
        className="btn primary sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const p = await native.osPermissionRequest();
          if (p !== "denied") await native.osTestBanner();
          else await native.osOpenSettings();
          onDone();
        }}
      >
        Turn on
      </button>
      <button className="icon-btn" onClick={onDone} title="Not now"><X size={15} /></button>
    </div>
  );
}
