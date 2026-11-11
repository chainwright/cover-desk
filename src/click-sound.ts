/**
 * Synthesized sound, no audio files: the wooden click from the desk prototype,
 * reused for footsteps and the trinket's lock, plus the keeper's hum.
 * The context must be created or resumed from a user gesture.
 *
 * Palette: hum (muffles while your hand shades the creature), footsteps
 * (soft clicks while it dashes), lock (a low double click at home), and since
 * day 4 a rising three-note chime for a win and the keeper's falling "hm?"
 * when it wakes and spots the creature.
 */
let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let humGain: GainNode | null = null;
let humFilter: BiquadFilterNode | null = null;

/** How often each event sound was asked for (also when audio is locked): read back by the emulator checks. */
export const soundCounts = { chime: 0, hm: 0, lock: 0 };

export function unlockAudio(): void {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      const len = Math.floor(ctx.sampleRate * 0.03);
      buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const env = Math.exp(-i / (len * 0.12));
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Plays a click; `pitch` around 1. */
export function click(pitch = 1, gain = 0.5): void {
  if (!ctx || !buffer || ctx.state !== 'running') return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = pitch;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2400 * pitch;
  filter.Q.value = 3;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start();
}

/** Footstep: a very soft, high click. */
export function step(): void {
  click(1.7 + Math.random() * 0.2, 0.08);
}

/** The trinket's lock: a low double click. */
export function lock(): void {
  soundCounts.lock++;
  click(0.55, 0.6);
  setTimeout(() => click(0.75, 0.5), 110);
}

/** One soft tone: `type` oscillator at `freq` Hz, starting `delay` s from now, decaying over `decay` s. */
function tone(freq: number, delay: number, decay: number, gain: number, type: OscillatorType): void {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + decay + 0.05);
}

/** A win: three rising notes (C5, E5, G5), 120 ms apart. */
export function chime(): void {
  soundCounts.chime++;
  tone(523.25, 0, 0.35, 0.12, 'triangle');
  tone(659.25, 0.12, 0.35, 0.12, 'triangle');
  tone(783.99, 0.24, 0.6, 0.14, 'triangle');
}

/** The keeper wakes: a low "hm?", two falling notes. */
export function hm(): void {
  soundCounts.hm++;
  tone(220, 0, 0.18, 0.1, 'sine');
  tone(165, 0.16, 0.3, 0.1, 'sine');
}

function ensureHum(): boolean {
  if (!ctx || ctx.state !== 'running') return false;
  if (humGain) return true;
  humGain = ctx.createGain();
  humGain.gain.value = 0;
  humFilter = ctx.createBiquadFilter();
  humFilter.type = 'lowpass';
  humFilter.frequency.value = 1400;
  humFilter.connect(humGain).connect(ctx.destination);
  for (const [f, type, amp] of [
    [98, 'triangle', 0.7],
    [147, 'sine', 0.35],
    [196.5, 'sine', 0.15],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = amp;
    o.connect(g).connect(humFilter);
    o.start();
  }
  return true;
}

/**
 * The keeper's hum. `level` 0..1 (0 silences it); `muffled` while a hand or an
 * object stands between the keeper and the creature.
 */
export function setHum(level: number, muffled: boolean): void {
  if (!ensureHum() || !ctx || !humGain || !humFilter) return;
  const t = ctx.currentTime;
  humGain.gain.setTargetAtTime(0.06 * level, t, 0.15);
  humFilter.frequency.setTargetAtTime(muffled ? 260 : 1400, t, 0.08);
}
