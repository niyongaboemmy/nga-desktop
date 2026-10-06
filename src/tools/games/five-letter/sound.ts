// Gentle tones made on the spot with WebAudio oscillators: no sound files, nothing to download.
let ctx: AudioContext | null = null;

/** Plays one soft tone; silently does nothing where audio is unavailable. */
export function tone(freq: number, ms = 220, type: OscillatorType = "sine", vol = 0.07): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + ms / 1000 + 0.05);
  } catch {
    /* no audio: play on in silence */
  }
}
