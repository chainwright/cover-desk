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
// Chief 12.11 (judges: spatial audio): the keeper's sounds come from the lantern's place on the desk, the
// creature's from the creature (HRTF panners, positions set every frame by the system).
let lanternOut: PannerNode | null = null;
let creatureOut: PannerNode | null = null;
function panner(c: AudioContext): PannerNode {
  const p = c.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 0.4;
  p.rolloffFactor = 0.6;
  p.connect(c.destination);
  return p;
}
const outL = (): AudioNode => lanternOut ?? ctx!.destination;
const outC = (): AudioNode => creatureOut ?? ctx!.destination;
/** World positions (metres): head with its forward/up, the lantern, the creature. */
export function setSpatial(head: ArrayLike<number>, fwd: ArrayLike<number>, up: ArrayLike<number>, lantern: ArrayLike<number>, creature: ArrayLike<number>): void {
  if (!ctx || !lanternOut || !creatureOut) return;
  const L = ctx.listener;
  const t = ctx.currentTime;
  if (L.positionX) {
    L.positionX.setValueAtTime(head[0], t); L.positionY.setValueAtTime(head[1], t); L.positionZ.setValueAtTime(head[2], t);
    L.forwardX.setValueAtTime(fwd[0], t); L.forwardY.setValueAtTime(fwd[1], t); L.forwardZ.setValueAtTime(fwd[2], t);
    L.upX.setValueAtTime(up[0], t); L.upY.setValueAtTime(up[1], t); L.upZ.setValueAtTime(up[2], t);
  }
  lanternOut.positionX.setValueAtTime(lantern[0], t); lanternOut.positionY.setValueAtTime(lantern[1], t); lanternOut.positionZ.setValueAtTime(lantern[2], t);
  creatureOut.positionX.setValueAtTime(creature[0], t); creatureOut.positionY.setValueAtTime(creature[1], t); creatureOut.positionZ.setValueAtTime(creature[2], t);
}

/** How often each event sound was asked for (also when audio is locked): read back by the emulator checks. */
export const soundCounts = { chime: 0, hm: 0, lock: 0, lullaby: 0, stir: 0 };

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
      lanternOut = panner(ctx);
      creatureOut = panner(ctx);
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
  src.connect(filter).connect(g).connect(outC());
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
  o.connect(g).connect(outL());
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

/** A glide: one sine from `f0` to `f1` Hz over `dur` s, starting `delay` s from now. */
function glide(f0: number, f1: number, delay: number, dur: number, gain: number): void {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(outL());
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** One breath of the keeper's snore: low, filtered noise swelling and fading over `dur` s. */
function snore(delay: number, dur: number, gain: number): void {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; // brown-ish: a soft rumble, not hiss
    d[i] = last * 6;
  }
  const src = ctx.createBufferSource();
  src.buffer = b;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 380;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.45);
  g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(f).connect(g).connect(outL());
  src.start(t);
}

/**
 * Day 8: level 2's win has its own sound (it used the tutorial's chime): the keeper drifts off, a soft
 * falling "lulla-by" (D5 to B4, then A4 to F#4, sine) and two breaths of its snore.
 */
export function lullaby(): void {
  soundCounts.lullaby++;
  tone(587.33, 0, 0.5, 0.07, 'sine');
  tone(493.88, 0.32, 0.7, 0.07, 'sine');
  tone(440, 0.9, 0.5, 0.06, 'sine');
  tone(369.99, 1.22, 0.9, 0.06, 'sine');
  snore(1.6, 1.1, 0.5);
  snore(3.0, 1.2, 0.4);
}

/** Day 8: the keeper stirs before the first lesson: a sleepy, rising "hm?" (it wonders, it doesn't see yet). */
export function stir(): void {
  soundCounts.stir++;
  glide(150, 205, 0.25, 0.55, 0.09);
  click(0.4, 0.25); // the lantern's creak
}

function ensureHum(): boolean {
  if (!ctx || ctx.state !== 'running') return false;
  if (humGain) return true;
  humGain = ctx.createGain();
  humGain.gain.value = 0;
  humFilter = ctx.createBiquadFilter();
  humFilter.type = 'lowpass';
  humFilter.frequency.value = 1400;
  humFilter.connect(humGain).connect(outL());
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
