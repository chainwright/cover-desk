/**
 * Tester log: what a tester's headset saw, in a small JSON file we can
 * re-analyse offline. Grown from the desk prototype's touch log; same
 * recorder design (30 Hz per hand, events, sessions), new columns.
 *
 * Format "cover-tester-log" v2 (v1 had no ix/iy/iz columns and no `emulator`):
 * {
 *   format, version, createdAt, userAgent, build, emulator, labels, settings,
 *   sessions: [{
 *     index, startedAt, emulator, placement, calibration,
 *     columns: ["t","hand","wx","wy","wz","tipY","pose","normalY","label","ix","iy","iz"],
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
 * - ix, iy, iz: index fingertip joint in the board frame, mm (fingertip jitter)
 * - emulator: true when the Immersive Web Emulator replaced WebXR in this
 *   page (window.IWER_DEVICE); on a Quest it must be false
 * Lost hands are logged too (pose 0, zeros), so tracking loss shows up.
 * Each session also carries the `build` it ran (a log kept across reloads,
 * see log-store.ts, can span builds) and `guided` (the tester asked for the
 * guided poses in this session).
 *
 * Events: session (frameRate, supportedFrameRates, emulator), placement
 * (method, planeLabel, localiseMs for an anchor), calibrated, line (a sight
 * line to the creature became blocked or clear, and by what), spotted (since
 * day 5 with keeperAwake and wristMmS per hand), keeper-woke (a hand at the
 * lantern: hand, distMm), dash,
 * home, pause/resume, cover-hand-lost, hand-lost / hand-found (with the joint
 * path that ran and the mean joint radius), register / register-rejected,
 * anchor-restore (ok, status, ms), fps (once a second: inView and viewDeg since day 5, fps, worstMs, updP95Ms
 * = 95th percentile of the app's own update() time, drops = frames longer than
 * 1.5 display frames, frameRate, redraws = tester panel redraws), label.
 */
import { POSE_EDGE, POSE_FLAT, POSE_LOST, POSE_NAMES, POSE_STOP } from './hand-proxy.ts';

export const LOG_FORMAT = 'cover-tester-log';
export const LOG_VERSION = 2;
export const COLUMNS = ['t', 'hand', 'wx', 'wy', 'wz', 'tipY', 'pose', 'normalY', 'label', 'ix', 'iy', 'iz'] as const;

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
  emulator: boolean;
  build?: string;
  guided?: boolean;
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
  emulator: boolean;
  labels: readonly string[];
  settings: Record<string, unknown>;
  sessions: LogSession[];
}

/** ≈ 33 min of both hands at 30 Hz, ~6 MB of JSON; the log is kept across reloads, so this caps the whole log. */
export const MAX_SAMPLES = 120_000;

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
      emulator: false,
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

  /** True once MAX_SAMPLES is reached: events are still logged, hand samples are not. */
  get full(): boolean {
    return this.total >= MAX_SAMPLES;
  }

  /**
   * Takes over a log restored from storage: its sessions come first, any
   * session already started here follows, renumbered.
   */
  adopt(restored: TesterLog): void {
    const current = this.log.sessions;
    this.log.sessions = [...restored.sessions, ...current];
    this.log.sessions.forEach((s, i) => (s.index = i));
    this.log.createdAt = restored.createdAt;
    if (restored.emulator) this.log.emulator = true;
    this.total = 0;
    for (const s of this.log.sessions) this.total += s.samples.length;
  }

  /** Starts a new, empty log (keeps the header). */
  clear(): void {
    this.log.sessions = this.session ? [this.session] : [];
    if (this.session) {
      this.session.index = 0;
      this.session.samples.length = 0;
      this.session.events.length = 0;
    }
    this.log.createdAt = new Date().toISOString();
    this.log.emulator = this.session?.emulator ?? false;
    this.total = 0;
  }

  startSession(time: number, emulator = false, guided = false): void {
    if (emulator) this.log.emulator = true;
    this.session = {
      index: this.log.sessions.length,
      startedAt: new Date().toISOString(),
      emulator,
      build: this.log.build,
      guided,
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
    ix = 0, iy = 0, iz = 0,
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
      mm(ix), mm(iy), mm(iz),
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

/** Sight-line changes per guided step: how often the cover flickers while the tester holds a pose. */
export interface LineFlipStats {
  label: string;
  seconds: number;
  flips: number;
  perMin: number;
}

export interface LogSummary {
  format: string;
  version: number;
  emulator: boolean;
  sessions: number;
  samples: number;
  placement: unknown[];
  labels: LabelStats[];
  lines: { blocked: number; cleared: number; byOwner: Record<string, number> };
  lineFlips: LineFlipStats[];
  creature: { dashes: number; spotted: number; home: number; pauses: number; coverHandLost: number };
  registrations: { ok: number; rejected: Record<string, number> };
  fps: {
    seconds: number;
    p5: number;
    median: number;
    worstFrameMs: number;
    /** Median and worst of the per-second 95th percentile of update() time (null in v1 logs). */
    updP95MedianMs: number | null;
    updP95WorstMs: number | null;
    /** Frames longer than 1.5 display frames, in total and per minute. */
    drops: number | null;
    dropsPerMin: number | null;
    frameRate: number | null;
    /** Day 5: seconds with the board in view (within 35° of the gaze), and their median and 5th-percentile fps; null in older logs. */
    inViewSeconds: number | null;
    inViewMedian: number | null;
    inViewP5: number | null;
  } | null;
  /** Joint path and mean radius per hand, from hand-found events. */
  jointPaths: Record<string, unknown>[];
}

/** Scores a tester log: pose stability per guided step, line events, fps. */
export function analyseLog(log: TesterLog): LogSummary {
  const per = new Map<string, { n: number; tracked: number; match: number; flips: number; trackedT: number; steps: number[]; wx: number[]; wy: number[]; wz: number[] }>();
  let samples = 0;
  const lines = { blocked: 0, cleared: 0, byOwner: {} as Record<string, number> };
  const creature = { dashes: 0, spotted: 0, home: 0, pauses: 0, coverHandLost: 0 };
  const flipCount = new Map<string, number>();
  const labelTime = new Map<string, number>();
  const updP95: number[] = [];
  let drops = 0;
  let dropSeconds = 0;
  let frameRate: number | null = null;
  const jointPaths: Record<string, unknown>[] = [];
  const seenPaths = new Set<string>();
  const registrations = { ok: 0, rejected: {} as Record<string, number> };
  const fpsVals: number[] = [];
  const inView: number[] = [];
  let viewTagged = false;
  let worst = 0;

  for (const s of log.sessions) {
    samples += s.samples.length;
    // Walk the events in time order, tracking the current guided label.
    let label = 'free';
    let labelAt = 0;
    const end = Math.max(s.samples.length ? s.samples[s.samples.length - 1][0] : 0, s.events.length ? s.events[s.events.length - 1].t : 0);
    for (const e of s.events) {
      if (e.type === 'label') {
        labelTime.set(label, (labelTime.get(label) ?? 0) + (e.t - labelAt));
        label = String(e.label);
        labelAt = e.t;
        continue;
      }
      if (e.type === 'line') flipCount.set(label, (flipCount.get(label) ?? 0) + 1);
      if (e.type === 'session' && typeof e.frameRate === 'number') frameRate = e.frameRate;
      if (e.type === 'hand-found' && e.path) {
        const k = `${e.hand}/${e.path}/${e.radii}`;
        if (!seenPaths.has(k)) {
          seenPaths.add(k);
          jointPaths.push({ hand: e.hand, path: e.path, radii: e.radii, meanRadiusMm: e.meanRadiusMm });
        }
      }
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
      else if (e.type === 'cover-hand-lost') creature.coverHandLost++;
      else if (e.type === 'register') registrations.ok++;
      else if (e.type === 'register-rejected') {
        const k = String(e.reason);
        registrations.rejected[k] = (registrations.rejected[k] ?? 0) + 1;
      } else if (e.type === 'fps') {
        fpsVals.push(Number(e.fps));
        if (typeof e.inView === 'boolean') {
          viewTagged = true;
          if (e.inView) inView.push(Number(e.fps));
        }
        worst = Math.max(worst, Number(e.worstMs) || 0);
        if (typeof e.updP95Ms === 'number') updP95.push(e.updP95Ms);
        if (typeof e.drops === 'number') {
          drops += e.drops;
          dropSeconds++;
        }
        if (typeof e.frameRate === 'number') frameRate = e.frameRate;
      }
    }
    labelTime.set(label, (labelTime.get(label) ?? 0) + Math.max(0, end - labelAt));
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
  inView.sort((a, b) => a - b);
  updP95.sort((a, b) => a - b);
  const lineFlips: LineFlipStats[] = [];
  for (const [label, seconds] of labelTime) {
    if (seconds <= 0 && !flipCount.has(label)) continue;
    const flips = flipCount.get(label) ?? 0;
    lineFlips.push({ label, seconds: r1(seconds), flips, perMin: seconds > 0 ? r1((flips / seconds) * 60) : 0 });
  }
  lineFlips.sort((a, b) => LABELS.indexOf(a.label as Label) - LABELS.indexOf(b.label as Label));
  return {
    format: log.format,
    version: log.version,
    emulator: log.emulator === true,
    sessions: log.sessions.length,
    samples,
    placement: log.sessions.map((s) => s.placement),
    labels,
    lines,
    lineFlips,
    creature,
    registrations,
    fps: fpsVals.length
      ? {
          seconds: fpsVals.length,
          p5: fpsVals[Math.floor(fpsVals.length * 0.05)],
          median: fpsVals[Math.floor(fpsVals.length / 2)],
          worstFrameMs: r1(worst),
          updP95MedianMs: updP95.length ? updP95[Math.floor(updP95.length / 2)] : null,
          updP95WorstMs: updP95.length ? updP95[updP95.length - 1] : null,
          drops: dropSeconds ? drops : null,
          dropsPerMin: dropSeconds ? r1((drops / dropSeconds) * 60) : null,
          frameRate,
          inViewSeconds: viewTagged ? inView.length : null,
          inViewMedian: inView.length ? inView[Math.floor(inView.length / 2)] : null,
          inViewP5: inView.length ? inView[Math.floor(inView.length * 0.05)] : null,
        }
      : null,
    jointPaths,
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
