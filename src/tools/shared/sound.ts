// A short, friendly chime for timers (Web Audio, no files to ship).
let ctx: AudioContext | null = null;

export function chime(times = 3) {
  try {
    ctx ??= new AudioContext();
    const c = ctx;
    void c.resume();
    const now = c.currentTime;
    for (let i = 0; i < times; i++) {
      for (const [freq, delay] of [[880, 0], [1320, 0.12]] as const) {
        const t0 = now + i * 0.55 + delay;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
        osc.connect(gain).connect(c.destination);
        osc.start(t0);
        osc.stop(t0 + 0.5);
      }
    }
  } catch {
    /* no audio device (CI) */
  }
}
