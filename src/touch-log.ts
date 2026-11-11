/**
 * Touch/hover log: what a tester's headset saw, in a small JSON file we can
 * re-analyse offline with different thresholds.
 *
 * Format "fade-touch-log" v1:
 * {
 *   format: "fade-touch-log", version: 1,
 *   createdAt: ISO time, userAgent, build,
 *   settings: { readMode, occlusion, contact: ContactParams, surface, tipPad },
 *   sessions: [{
 *     index, startedAt,
 *     placement: { method, eyeDistance, deskY, ... } | null,
 *     calibration: { spread, samples, planeDelta } | null,
 *     columns: ["t","hand","x","y","z","rod","state","label"],
 *     samples: [[t, hand, x, y, z, rod, state, label], ...],
 *     events: [{ t, type, ... }, ...]
 *   }]
 * }
 * - t: seconds since the session started (3 decimals)
 * - hand: 0 left, 1 right
 * - x, y, z: fingertip in the abacus frame, millimetres (y up from the desk,
 *   z along the rods toward the user, beam at 0, x across, middle rod at 0)
 * - rod: rod in contact (-1 none); state: 0 away, 1 hover, 2 contact, 3 bead
 * - label: index into `labels` (what the tester was asked to do at that moment)
 * Samples are kept at up to 30 Hz per hand, only while the fingertip is within
 * 25 cm of the abacus.
 */
import { CONTACT, SURFACE, TIP_PAD, contactRod, type ContactParams } from './contact.ts';

export const LOG_FORMAT = 'fade-touch-log';
export const LOG_VERSION = 1;
export const COLUMNS = ['t', 'hand', 'x', 'y', 'z', 'rod', 'state', 'label'] as const;

/** Labels for the guided tester steps. 'free' is unguided play; 'prep' is a gap between steps. */
export const LABELS = ['free', 'prep', 'slide-desk', 'hover-2cm', 'hover-5cm', 'touch-top'] as const;
export type Label = (typeof LABELS)[number];

export type LogEvent = { t: number; type: string } & Record<string, unknown>;

export interface LogSession {
  index: number;
  startedAt: string;
  placement: Record<string, unknown> | null;
  calibration: Record<string, unknown> | null;
  columns: readonly string[];
  samples: number[][];
  events: LogEvent[];
}

export interface TouchLog {
  format: typeof LOG_FORMAT;
  version: number;
  createdAt: string;
  userAgent: string;
  build: string;
  labels: readonly string[];
  settings: Record<string, unknown>;
  sessions: LogSession[];
}

const MAX_SAMPLES = 60_000; // ≈ 16 min of both hands at 30 Hz: ~2.5 MB of JSON

export class TouchLogger {
  readonly log: TouchLog;
  private session: LogSession | null = null;
  private t0 = 0;
  private nextSample = [0, 0];
  private total = 0;
  label = 0;

  constructor(settings: Record<string, unknown>, userAgent: string, build: string) {
    this.log = {
      format: LOG_FORMAT,
      version: LOG_VERSION,
      createdAt: new Date().toISOString(),
      userAgent,
      build,
      labels: LABELS,
      settings,
      sessions: [],
    };
  }

  get active(): boolean {
    return this.session !== null;
  }

  get sampleCount(): number {
    return this.total;
  }

  startSession(time: number): void {
    this.session = {
      index: this.log.sessions.length,
      startedAt: new Date().toISOString(),
      placement: null,
      calibration: null,
      columns: COLUMNS,
      samples: [],
      events: [],
    };
    this.log.sessions.push(this.session);
    this.t0 = time;
    this.nextSample[0] = this.nextSample[1] = time;
  }

  endSession(): void {
    this.session = null;
  }

  setLabel(label: Label | number, time: number): void {
    const i = typeof label === 'number' ? label : LABELS.indexOf(label);
    if (i < 0 || i === this.label) return;
    this.label = i;
    this.event(time, 'label', { label: LABELS[i] });
  }

  setPlacement(info: Record<string, unknown>): void {
    if (this.session) this.session.placement = info;
  }

  setCalibration(info: Record<string, unknown>): void {
    if (this.session) this.session.calibration = info;
  }

  event(time: number, type: string, data: Record<string, unknown> = {}): void {
    if (!this.session) return;
    this.session.events.push({ t: round3(time - this.t0), type, ...data });
  }

  /** Records one fingertip sample (local metres); rate-limited to 30 Hz per hand. */
  sample(time: number, hand: number, x: number, y: number, z: number, rod: number, state: number): void {
    const s = this.session;
    if (!s || this.total >= MAX_SAMPLES) return;
    if (time < this.nextSample[hand]) return;
    // 30 Hz on average whatever the frame rate; resync after a gap
    this.nextSample[hand] += 1 / 30;
    if (this.nextSample[hand] < time - 0.05) this.nextSample[hand] = time + 1 / 30;
    this.total++;
    s.samples.push([
      round3(time - this.t0),
      hand,
      Math.round(x * 10000) / 10,
      Math.round(y * 10000) / 10,
      Math.round(z * 10000) / 10,
      rod,
      state,
      this.label,
    ]);
  }

  toJSON(): string {
    return JSON.stringify(this.log);
  }
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ------------------------------------------------------------------ analysis

/** What each guided label expects: contact (true), no contact (false), or nothing to score (null). */
export const EXPECT: Record<string, boolean | null> = {
  free: null,
  prep: null,
  'slide-desk': true,
  'hover-2cm': false,
  'hover-5cm': false,
  'touch-top': true,
};

export interface LabelStats {
  label: string;
  /** Scored samples (on-rod, after the first 0.6 s of each step). */
  samples: number;
  /** Share of samples whose contact result disagrees with the label. */
  errorRate: number;
  /** Contact starts that should not have happened (hover labels) or drop-outs (touch labels). */
  badEvents: number;
  /** Fingertip height above the desk, mm: 10th, 50th and 90th percentile. */
  heightMm: [number, number, number];
}

export interface LogSummary {
  format: string;
  version: number;
  sessions: number;
  samples: number;
  placement: unknown[];
  contact: ContactParams;
  labels: LabelStats[];
  valueChanges: number;
}

/**
 * Re-runs the contact rule over a log's samples (optionally with other
 * thresholds) and scores it against the guided labels.
 */
export function analyseLog(log: TouchLog, p: ContactParams = CONTACT): LogSummary {
  const per = new Map<string, { n: number; err: number; bad: number; h: number[] }>();
  let samples = 0;
  let valueChanges = 0;
  for (const s of log.sessions) {
    samples += s.samples.length;
    valueChanges += s.events.filter((e) => e.type === 'value').length;
    const prevRod = [-1, -1];
    const stepStart = new Map<number, number>();
    let lastLabel = -1;
    for (const row of s.samples) {
      const [t, hand, x, y, z, , , li] = row;
      if (li !== lastLabel) {
        stepStart.set(li, t);
        lastLabel = li;
      }
      const name = log.labels[li] ?? 'free';
      const rod = contactRod(x / 1000, y / 1000, prevRod[hand], p);
      const startedContact = rod >= 0 && prevRod[hand] < 0;
      const lostContact = rod < 0 && prevRod[hand] >= 0;
      prevRod[hand] = rod;
      const expect = EXPECT[name];
      if (expect == null) continue;
      if (t - (stepStart.get(li) ?? t) < 0.6) continue;
      // Only score samples over the abacus footprint (along the rods).
      if (z < -100 || z > 170 || Math.abs(x) > 160) continue;
      let e = per.get(name);
      if (!e) per.set(name, (e = { n: 0, err: 0, bad: 0, h: [] }));
      e.n++;
      e.h.push(y);
      if ((rod >= 0) !== expect) e.err++;
      if (!expect && startedContact) e.bad++;
      if (expect && lostContact) e.bad++;
    }
  }
  const labels: LabelStats[] = [];
  for (const [label, e] of per) {
    e.h.sort((a, b) => a - b);
    const q = (f: number) => (e.h.length ? e.h[Math.min(e.h.length - 1, Math.floor(f * e.h.length))] : NaN);
    labels.push({
      label,
      samples: e.n,
      errorRate: e.n ? Math.round((e.err / e.n) * 1000) / 1000 : 0,
      badEvents: e.bad,
      heightMm: [q(0.1), q(0.5), q(0.9)],
    });
  }
  return {
    format: log.format,
    version: log.version,
    sessions: log.sessions.length,
    samples,
    placement: log.sessions.map((s) => s.placement),
    contact: p,
    labels,
    valueChanges,
  };
}

/** Settings block written into each log. */
export function logSettings(readMode: string, occlusion: string): Record<string, unknown> {
  return { readMode, occlusion, contact: CONTACT, surfaceMm: SURFACE * 1000, tipPadMm: TIP_PAD * 1000 };
}

