import { useEffect, useState } from "react";
import { onTool, toolsNative, type Timer } from "./native";

/** All timers (live from Rust) and a clock that ticks while any is running. */
export function useTimers(): { timers: Timer[]; now: number } {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    void toolsNative.timers().then(setTimers).catch(() => undefined);
    const sub = onTool("nga://timers", setTimers);
    return () => void sub.then((off) => off());
  }, []);
  const running = timers.some((t) => t.runningSince !== null);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running]);
  return { timers, now };
}
