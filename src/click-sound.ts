/**
 * A tiny synthesized wooden click, so no audio files are needed.
 * The context must be created or resumed from a user gesture.
 */
let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;

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

/** Plays a click; `pitch` around 1 (upper bead a little lower). */
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
