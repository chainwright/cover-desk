/**
 * Tester log: what a tester's headset saw, in a small JSON file we can
 * re-analyse offline. Grown from the desk prototype's touch log; same
 * recorder design (30 Hz per hand, events, sessions), new columns.
 *
 * Format "cover-tester-log" v1:
 * {
 *   format, version, createdAt, userAgent, build, labels, settings,
 *   sessions: [{
 *     index, startedAt, placement, calibration,
 *     columns: ["t","hand","wx","wy","wz","tipY","pose","normalY","label"],
 *     samples: [[...], ...],
 *     events: [{ t, type, ... }, ...]
 *   }]
 * }
 * - t: seconds since the session started (3 decimals)
 * - hand: 0 left, 1 right
 * - wx, wy, wz: wrist in the board frame, mm (y up from the desk)
 * - tipY: index fingertip height above the desk, mm
 * - pose: 0 lost, 1 flat, 2 edge, 3 stop, 4 other (hand-proxy.ts)
 * - normalY: palm normal's vertical component × 1000
 * - label: index into `labels` (what the tester was asked to do then)
 * Lost hands are logged too (pose 0, zeros), so tracking loss shows up.
 *
 * Events: placement, calibrated, line (a sight line to the creature became
 * blocked or clear, and by what), spotted, dash, home, pause/resume (hand
 * lost/found), register / register-rejected, fps (once a second), label.
 */
import { POSE_EDGE, POSE_FLAT, POSE_LOST, POSE_NAMES, POSE_STOP } from './hand-proxy.ts';

export const LOG_FORMAT = 'cover-tester-log';
export const LOG_VERSION = 1;
export const COLUMNS = ['t', 'hand', 'wx', 'wy', 'wz', 'tipY', 'pose', 'normalY', 'label'] as const;

/** Labels for the guided tester steps. 'free' is unguided play; 'prep' is a gap between steps. */
export const LABELS = ['free', 'prep', 'flat', 'edge', 'stop', 'register'] as const;
export type Label = (typeof LABELS)[number];

/** Which pose each guided label asks for (null: nothing to score). */
export const EXPECT_POSE: Record<string, number | null> = {
  free: null,
  prep: null,
  flat: POSE_FLAT,
  edge: POSE_EDGE,
  stop: POSE_STOP,
  register: null,
};

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

export interface TesterLog {
  format: typeof LOG_FORMAT;
  version: number;
  createdAt: string;
  userAgent: string;
  build: string;
  labels: readonly string[];
  settings: Record<string, unknown>;
  sessions: LogSession[];
}

const MAX_SAMPLES = 60_000; // ≈ 16 min of both hands at 30 Hz: ~3 MB of JSON

export class TesterLogger {
  readonly log: TesterLog;
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

  /** Records one hand sample (board-frame metres); rate-limited to 30 Hz per hand. */
  sample(
    time: number, hand: number,
    wx: number, wy: number, wz: number, tipY: number,
    pose: number, normalY: number,
  ): void {
    const s = this.session;
    if (!s || this.total >= MAX_SAMPLES) return;
    if (time < this.nextSample[hand]) return;
    this.nextSample[hand] += 1 / 30;
    if (this.nextSample[hand] < time - 0.05) this.nextSample[hand] = time + 1 / 30;
    this.total++;
    s.samples.push([
      round3(time - this.t0),
      hand,
      mm(wx), mm(wy), mm(wz), mm(tipY),
      pose,
      Math.round(normalY * 1000),
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
function mm(v: number): number {
  return Math.round(v * 10000) / 10;
}

// ------------------------------------------------------------------ analysis

export interface LabelStats {
  label: string;
  /** 0 left, 1 right: each hand is scored on its own (the other may be resting elsewhere). */
  hand: number;
  /** Samples per hand that was tracked at some point in this step. */
  samples: number;
  /** Share of samples with the hand tracked. */
  tracked: number;
  /** Share of tracked samples classified as the pose the step asked for (null: no pose asked). */
  poseMatch: number | null;
  /** Pose class changes per minute of tracked time (stability). */
  poseFlipsPerMin: number;
  /** Wrist: median frame-to-frame movement and SD of position over the step, mm. */
  wristStepMm: number;
  wristSdMm: number;
}

export interface LogSummary {
  format: string;
  version: number;
  sessions: number;
  samples: number;
  placement: unknown[];
  labels: LabelStats[];
  lines: { blocked: number; cleared: number; byOwner: Record<string, number> };
  creature: { dashes: number; spotted: number; home: number; pauses: number };
  registrations: { ok: number; rejected: Record<string, number> };
  fps: { seconds: number; p5: number; median: number; worstFrameMs: number } | null;
}

/** Scores a tester log: pose stability per guided step, line events, fps. */
export function analyseLog(log: TesterLog): LogSummary {
  const per = new Map<string, { n: number; tracked: number; match: number; flips: number; trackedT: number; steps: number[]; wx: number[]; wy: number[]; wz: number[] }>();
  let samples = 0;
  const lines = { blocked: 0, cleared: 0, byOwner: {} as Record<string, number> };
  const creature = { dashes: 0, spotted: 0, home: 0, pauses: 0 };
  const registrations = { ok: 0, rejected: {} as Record<string, number> };
  const fpsVals: number[] = [];
  let worst = 0;

  for (const s of log.sessions) {
    samples += s.samples.length;
    for (const e of s.events) {
      if (e.type === 'line') {
        if (e.blocked) {
          lines.blocked++;
          const k = String(e.by);
          lines.byOwner[k] = (lines.byOwner[k] ?? 0) + 1;
        } else lines.cleared++;
      } else if (e.type === 'dash') creature.dashes++;
      else if (e.type === 'spotted') creature.spotted++;
      else if (e.type === 'home') creature.home++;
      else if (e.type === 'pause') creature.pauses++;
      else if (e.type === 'register') registrations.ok++;
      else if (e.type === 'register-rejected') {
        const k = String(e.reason);
        registrations.rejected[k] = (registrations.rejected[k] ?? 0) + 1;
      } else if (e.type === 'fps') {
        fpsVals.push(Number(e.fps));
        worst = Math.max(worst, Number(e.worstMs) || 0);
      }
    }
    const prev = [
      { pose: -1, t: -1, x: 0, y: 0, z: 0 },
      { pose: -1, t: -1, x: 0, y: 0, z: 0 },
    ];
    for (const row of s.samples) {
      const [t, hand, wx, wy, wz, , pose, , li] = row;
      const name = log.labels[li] ?? 'free';
      const key = `${name}/${hand}`;
      let e = per.get(key);
      if (!e) per.set(key, (e = { n: 0, tracked: 0, match: 0, flips: 0, trackedT: 0, steps: [], wx: [], wy: [], wz: [] }));
      e.n++;
      const p = prev[hand];
      if (pose !== POSE_LOST) {
        e.tracked++;
        const want = EXPECT_POSE[name];
        if (want != null && pose === want) e.match++;
        if (p.pose > 0 && p.t >= 0 && t - p.t < 0.1) {
          e.trackedT += t - p.t;
          if (p.pose !== pose) e.flips++;
          e.steps.push(Math.hypot(wx - p.x, wy - p.y, wz - p.z));
        }
        e.wx.push(wx);
        e.wy.push(wy);
        e.wz.push(wz);
      }
      p.pose = pose;
      p.t = t;
      p.x = wx;
      p.y = wy;
      p.z = wz;
    }
  }

  const labels: LabelStats[] = [];
  for (const [key, e] of per) {
    const [label, hand] = key.split('/');
    const want = EXPECT_POSE[label];
    labels.push({
      label,
      hand: Number(hand),
      samples: e.n,
      tracked: e.n ? r3(e.tracked / e.n) : 0,
      poseMatch: want == null ? null : e.tracked ? r3(e.match / e.tracked) : 0,
      poseFlipsPerMin: e.trackedT > 0 ? Math.round((e.flips / e.trackedT) * 60 * 10) / 10 : 0,
      wristStepMm: r1(median(e.steps)),
      wristSdMm: r1(Math.hypot(sd(e.wx), sd(e.wy), sd(e.wz))),
    });
  }
  labels.sort((a, b) => LABELS.indexOf(a.label as Label) - LABELS.indexOf(b.label as Label) || a.hand - b.hand);
  fpsVals.sort((a, b) => a - b);
  return {
    format: log.format,
    version: log.version,
    sessions: log.sessions.length,
    samples,
    placement: log.sessions.map((s) => s.placement),
    labels,
    lines,
    creature,
    registrations,
    fps: fpsVals.length
      ? { seconds: fpsVals.length, p5: fpsVals[Math.floor(fpsVals.length * 0.05)], median: fpsVals[Math.floor(fpsVals.length / 2)], worstFrameMs: r1(worst) }
      : null,
  };
}

function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function sd(v: number[]): number {
  if (v.length < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length);
}
function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Settings block written into each log. */
export function logSettings(extra: Record<string, unknown>): Record<string, unknown> {
  return { poses: POSE_NAMES, ...extra };
}
