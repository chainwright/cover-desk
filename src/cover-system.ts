/**
 * Cover, level 1: the board on the desk, the keeper's light, your hand as
 * cover, the creature crossing through your shadow.
 *
 * Placement of the board (carried over from the desk prototype), in order of
 * preference:
 *   1. anchor   — the spot saved last session (persistent WebXR anchor);
 *   2. touch    — one-touch calibration: point at the desk with one fingertip,
 *                 tap and hold still; the board goes on the desk near that
 *                 spot, pulled within comfortable reach;
 *   3. desk     — a detected horizontal plane at desk height (automatic);
 *   4. fallback — a comfortable spot in the air when there is no desk.
 * Hold a fingertip on the small knob at the near-left corner to move it.
 *
 * Every frame: read both hands' 25 joints → capsules in the board frame →
 * with the registered real objects, they are the occluders → the light map
 * (what the keeper sees on the desk, drawn as the light pool with your
 * shadow in it) and the creature's own sight test.
 */
import {
  Color,
  DepthOccludable,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
  VisibilityState,
  XRPlane as XRPlaneComponent,
  createSystem,
  type Object3D,
} from '@iwsdk/core';
import { PLACE, TapCalibrator, spotFromTouch, type CalibResult, type PlaceParams } from './calibration.ts';
import { chime, click, hm, lock, setHum, step } from './click-sound.ts';
import { REGISTER, REGISTER_HOLD, TIP_PAD, distanceToPolyline, judgeRegistration } from './contact.ts';
import { KNOB, MAX_OBJECT_MARKERS, PATH_DOTS, WIN_BEADS, buildCover, setInstance, type CoverModel } from './cover-model.ts';
import {
  CREATURE,
  CoverWatch,
  EV_BACK_IN_NOOK,
  EV_DASH_START,
  EV_HOME,
  EV_PAUSE,
  EV_RESUME,
  EV_SPOTTED,
  MODE_DASH,
  MODE_HOME,
  MODE_NAMES,
  MODE_PAUSED,
  MODE_RETREAT,
  MODE_SPOTTED,
  MODE_WAIT,
  newCreature,
  stepCreature,
  type CreatureState,
  type CreatureWorld,
} from './creature.ts';
import { DeskAnchor } from './desk-anchor.ts';
import { flags } from './flags.ts';
import { HandJoints } from './hand-joints.ts';
import { HAND_SIDES, HandMask } from './hand-mask.ts';
import {
  INDEX_TIP,
  JOINTS,
  POSE_LOST,
  POSE_NAMES,
  WRIST,
  addHandCapsules,
  classifyPose,
  isPointingDown,
  type PoseInfo,
} from './hand-proxy.ts';
import { BOARD, CREATURE_Y, LEVEL_1, Route } from './level.ts';
import { LightMap } from './light-map.ts';
import { FlushTimer, LogCursor, LogFlusher, LogStore, type StoreStatus } from './log-store.ts';
import { KNOB_LINES, PROMPT_LINES, firstRunCues, newCues, type CueInput } from './onboarding.ts';
import { placementStep, type PlacementClock, type PlacementState, type PlacementWorld } from './placement.ts';
import { BY_NONE, DARK, Occluders, SEEN, SHADOW, look, type Lantern, type SightResult } from './sightline.ts';
import { TextCard } from './text-card.ts';
import { LABELS, TesterLogger, analyseLog, logSettings, type Label } from './touch-log.ts';

/** Inset from desk edges so the whole board stays on the desk, whichever way it is turned. */
const DESK_INSET = Math.max(BOARD.halfX, (BOARD.zMax - BOARD.zMin) / 2) + 0.01;
/** A hold this far above a detected desk is a pause in the air, not a tap. */
const AIR_TAP = 0.03;
/** Board placement: centre a little further than the soroban's (the board is bigger). */
const BOARD_PLACE: PlaceParams = { ...PLACE, maxEyeDistance: 0.5, minReach: 0.28 };
const KNOB_HOLD_S = 0.8;
/** Owner tags for cover: hands 0/1, objects 10 + n. */
const OBJECT_OWNER = 10;
/** After a win, the next round starts this much later. */
const NEXT_ROUND_S = 3.5;
/** Tester panel: redraw at most this often (a canvas upload can cost a frame). */
const PANEL_REDRAW_S = 0.5;
/** Per-frame update() timings kept for the once-a-second p95 (more than any refresh rate). */
const UPD_BUF = 256;

export type Placement = PlacementState;

// The game's pose comes first, so the first thing a tester is told is how to play.
// The flat hand is a measurement step (it casts only a short shadow near the lantern).
const GUIDE: { label: Label; seconds: number; text: [string, string] }[] = [
  { label: 'stop', seconds: 20, text: ["Stand your hand like 'stop' between", 'the lantern and the path. Keep it there.'] },
  { label: 'edge', seconds: 20, text: ['Stand your hand on its little-finger', 'side, like a wall. Keep it there.'] },
  { label: 'flat', seconds: 20, text: ['Measurement only, not how to play:', 'lay one hand flat on the desk.'] },
  { label: 'register', seconds: 15, text: ['Point down onto the top of a mug', '(3-30 cm tall) beside the path. Hold still.'] },
];
const GUIDE_PREP_S = 3;
const GUIDE_DELAY_S = 3;

/** Read-only state for tests, the emulator scripts and tester mode. */
export interface CoverDebug {
  placement: Placement;
  listening: boolean;
  creature: { s: number; mode: string; spotted: number; dashes: number; wins: number; length: number };
  line: { state: string; by: number };
  hands: { tracked: boolean; pose: string; normalY: number; pointing: boolean }[];
  objects: { x: number; z: number; top: number }[];
  litFraction: number;
  fps: number;
  anchorStatus: string;
  placementInfo: Record<string, unknown> | null;
  /** First-run cues this frame (ghost, prompt, knob label, registration allowed). */
  cues: { ghost: boolean; prompt: string; knobLabel: boolean; canRegister: boolean; ghostVisible: boolean; promptVisible: boolean; promptText: string };
  /** The hand play is waiting for after a cover-hand loss (-1 none). */
  coverWaitingFor: number;
  /** Win and spotted feedback: keeper eye opening (1 closed), stare line, trinket on the creature's back, win beads shown. */
  payoff: { eyes: number; stare: boolean; trinketCarried: boolean; beads: number };
  /** True when the Immersive Web Emulator replaced WebXR in this page. */
  emulator: boolean;
  /** Tester mode: the log's storage ('off' outside tester mode) and how many sessions the log holds. */
  logStore: { status: StoreStatus; error: string; sessions: number; full: boolean };
  /** Tester mode: writes the log's new part to storage now. */
  flushLog(): Promise<boolean>;
  /** Tester mode: forgets the stored log and starts a new one. */
  resetLog(): Promise<void>;
  /** Tester mode: the next session runs the guided poses (they never start by themselves). */
  armGuide(): void;
  /** World position of a board-frame point. */
  boardPoint(x: number, z: number, y: number): [number, number, number];
  /** Board-frame position of a world point. */
  toBoard(x: number, y: number, z: number): [number, number, number];
  /** World positions of a hand's 25 joints (null if not tracked). */
  joints(hand: number): number[] | null;
  lantern: Lantern;
  route: number[];
  logSamples(): number;
  exportLog(): string | null;
  summary(): unknown;
  setLabel(label: string): void;
  requestMove(): void;
  /** Starts a fresh round (creature back in its nook). */
  restart(): void;
  /** What the keeper makes of a creature standing at board point (x, z): 'seen' | 'shadow:<by>' | 'dark'. */
  sightAt(x: number, z: number): string;
  /** Forgets every registered object. */
  clearObjects(): void;
}

export class CoverSystem extends createSystem({
  planes: { required: [XRPlaneComponent] },
}) {
  private model!: CoverModel;
  private level = LEVEL_1;
  private lantern: Lantern = LEVEL_1.lanterns[0];
  private route = new Route(LEVEL_1.route);
  private occ = new Occluders();
  private lightMap = new LightMap();
  private sight: SightResult = { state: DARK, by: BY_NONE };
  private lineState = DARK;
  private lineBy = BY_NONE;
  private creature: CreatureState = newCreature();
  private cw!: CreatureWorld;
  private wins = 0;
  private homeAt = -1;
  private everDashed = false;
  private leadSeen = false;
  private coverWatch = new CoverWatch();
  private moveRequested = false;
  private cues = newCues();
  private cueIn: CueInput = { placement: 'preview', placed: false, listening: false, moveRequested: false, everDashed: false, paused: false, leading: false };
  private promptKey = '';
  private knobCard!: TextCard;
  private stepAt = 0;

  private joints = new HandJoints();
  private local = [new Float32Array(JOINTS * 3), new Float32Array(JOINTS * 3)];
  private pose: PoseInfo[] = [
    { pose: POSE_LOST, normalY: 0, fingerY: 0 },
    { pose: POSE_LOST, normalY: 0, fingerY: 0 },
  ];
  private pointing = [false, false];
  private objects = new Float32Array(MAX_OBJECT_MARKERS * 3); // x, z, top
  private objectCount = 0;
  private handMask = new HandMask(flags.hands);
  private handsExplicit = typeof location !== 'undefined' && new URLSearchParams(location.search).has('hands');

  private prompt!: TextCard;
  private panel: TextCard | null = null;
  private logger: TesterLogger | null = null;
  private ring!: Mesh;
  private ringMat!: MeshBasicMaterial;

  private placement: Placement = 'preview';
  private placementInfo: Record<string, unknown> | null = null;
  private listening = false;
  private followAnchor = false;
  private searchStart = 0;
  private restoreStart = 0;
  private placedAt = 0;
  private resetDone = false;
  private planeLabel = '';
  private deskAnchor = new DeskAnchor();
  private calibrators = [new TapCalibrator(), new TapCalibrator()];
  private registrars = [new TapCalibrator(REGISTER_HOLD), new TapCalibrator(REGISTER_HOLD)];
  private holdProgress = new Float32Array(2);
  private knobSince = new Float32Array(2).fill(-1);
  private knobArmed = [true, true];
  private guideStart = -1;
  /** The tester asked for the guided poses for the next session (a separate Enter button). */
  private guideArmed = false;
  private guideActive = false;
  private logStore: LogStore | null = null;
  private logCursor = new LogCursor();
  private logFlusher = new LogFlusher(this.logCursor, (meta, chunks) => this.logStore?.write(meta, chunks) ?? Promise.resolve(false));
  private storeReady = false;
  private flushTimer = new FlushTimer();
  private placeClock: PlacementClock = { placement: 'preview', time: 0, restoreStart: 0, searchStart: 0, placedAt: 0 };
  private placeWorld!: PlacementWorld;
  private panelAt = 0;
  private lastTime = 0;

  // fps and the app's own cost
  private fpsFrames = 0;
  private fpsStart = -1;
  private fpsWorst = 0;
  private fps = 0;
  private fpsDrops = 0;
  private frameRate = 0;
  private updMs = new Float32Array(UPD_BUF);
  private updSorted = new Float32Array(UPD_BUF);
  private updN = 0;
  private panelRedraws = 0;
  private emulator = false;

  private head = new Vector3();
  private forward = new Vector3();
  private target = new Vector3();
  private best = new Vector3();
  private tmp = new Vector3();
  private up = new Vector3();
  private quat = new Quaternion();
  private tilt = new Quaternion();
  private xAxis = new Vector3(1, 0, 0);
  private yAxis = new Vector3(0, 1, 0);
  private inv = new Matrix4();
  private mtx = new Matrix4();
  private at3 = new Float32Array(3);
  private colLit = new Color(0xffd27a);
  private colShadow = new Color(0x7d93d8);
  private colDark = new Color(0xe9dfcc);
  private toWorld!: (p: Float32Array, i: number) => void;

  init(): void {
    this.model = buildCover(this.level, this.lightMap.data);
    this.trinketHome.copy(this.model.trinket.position);
    const entity = this.world.createTransformEntity(this.model.root, { persistent: true });
    if (flags.depth) entity.addComponent(DepthOccludable);

    this.cw = {
      routeLength: this.route.length,
      handPresent: false,
      seen: (s: number) => this.seenAt(s),
    };
    this.toWorld = (p: Float32Array, i: number) => {
      this.tmp.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).applyMatrix4(this.player.matrixWorld);
      p[i * 3] = this.tmp.x;
      p[i * 3 + 1] = this.tmp.y;
      p[i * 3 + 2] = this.tmp.z;
    };

    // path dots along the route
    for (let i = 0; i < PATH_DOTS; i++) {
      this.route.at((i / (PATH_DOTS - 1)) * this.route.length, this.at3);
      setInstance(this.model.pathDots, i, this.at3[0], 0, this.at3[1], 1, this.mtx);
      this.model.pathDots.setColorAt(i, this.colDark);
    }
    this.model.pathDots.instanceMatrix.needsUpdate = true;

    // Progress ring for a calibration, registration or knob hold.
    this.ringMat = new MeshBasicMaterial({ color: 0xffd08a, depthTest: false, transparent: true, opacity: 0 });
    this.ring = new Mesh(new RingGeometry(0.011, 0.015, 32), this.ringMat);
    this.ring.name = 'hold-ring';
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 11;
    this.ring.visible = false;
    this.world.createTransformEntity(this.ring, { persistent: true });

    // 0.34 m (was 0.3) so the day-3 teaching line fits at the same letter size.
    this.prompt = new TextCard('prompt', {
      widthM: 0.34,
      heightM: 0.07,
      px: 1020,
      font: 52,
      background: 'rgba(23,17,12,0.82)',
      color: '#f4ead8',
      accent: '#ffc27a',
    });
    this.prompt.mesh.visible = false;
    this.world.createTransformEntity(this.prompt.mesh, { persistent: true });

    // "tap & hold to move" lives on the knob only, not in the main prompt.
    this.knobCard = new TextCard('knob-label', {
      widthM: 0.06,
      heightM: 0.026,
      px: 240,
      font: 38,
      background: 'rgba(23,17,12,0.78)',
      color: '#f4ead8',
      accent: '#ffc27a',
    });
    this.knobCard.set(KNOB_LINES);
    this.knobCard.mesh.visible = false;
    this.world.createTransformEntity(this.knobCard.mesh, { persistent: true });

    if (flags.test) {
      // 512 px wide and redrawn at most twice a second, so the panel itself
      // doesn't bias the frame-rate numbers it shows (day 1: 1140 px, ~7 Hz).
      this.panel = new TextCard('tester-panel', {
        widthM: 0.38,
        heightM: 0.2,
        px: 512,
        font: 21,
        background: 'rgba(12,16,20,0.88)',
        color: '#e8eef2',
        accent: '#ffc27a',
      });
      this.panel.mesh.visible = false;
      this.world.createTransformEntity(this.panel.mesh, { persistent: true });
      const build = typeof __COVER_BUILD__ === 'string' ? __COVER_BUILD__ : 'dev';
      this.logger = new TesterLogger(
        logSettings({ hands: flags.depth ? `${flags.hands}+depth` : flags.hands, level: this.level.id, creature: CREATURE, register: REGISTER }),
        navigator.userAgent,
        build,
      );
      void this.openLogStore();
    }

    this.placeWorld = {
      headY: 0,
      anchorFailed: false,
      anchorPose: () => !!this.deskAnchor.anchor && this.applyAnchorPose(),
      findDesk: () => this.findDesk(),
    };

    this.placePreview();
    this.exposeDebug();
  }

  update(delta: number, time: number): void {
    const t0 = performance.now();
    this.tick(delta, time);
    if (this.placement !== 'preview' && this.updN < UPD_BUF) this.updMs[this.updN++] = performance.now() - t0;
  }

  private tick(delta: number, time: number): void {
    this.lastTime = time;
    const vis = this.world.visibilityState.peek();
    if (vis === VisibilityState.NonImmersive) {
      if (this.placement !== 'preview') this.endSession();
      return;
    }
    if (this.placement === 'preview') this.startSession(time);
    this.countFrame(delta, time);
    if (this.logger && this.flushTimer.due(time)) void this.flushLog();

    this.player.head.getWorldPosition(this.head);
    this.updateForward();
    this.updatePlacement(time);
    if (this.followAnchor && this.deskAnchor.anchor) this.applyAnchorPose();

    // The default mask makes the hand invisible so the real one shows through
    // passthrough. The emulator has no real hand behind it, so there the SDK's
    // hand outline stays, unless ?hands= asks otherwise.
    if (!this.emulator || this.handsExplicit) this.handMask.apply(this.input.xr as never);
    const root = this.model.root;
    root.updateWorldMatrix(true, false);
    this.inv.copy(root.matrixWorld).invert();
    this.updateCues();
    this.readHands(time);

    const placed = this.isPlaced();
    if (placed) {
      this.buildOccluders();
      this.lightMap.update(this.lantern, this.occ, CREATURE_Y);
      this.model.shadowTex.needsUpdate = true;
      this.runGame(Math.min(delta, 0.05), time);
    } else {
      setHum(0, false);
    }
    this.updateCues();
    this.updateRing();
    this.updatePrompt();
    if (this.panel) this.updateTester(time);
  }

  private updateCues(): void {
    const i = this.cueIn;
    i.placement = this.placement;
    i.placed = this.isPlaced();
    i.listening = this.listening;
    i.moveRequested = this.moveRequested;
    i.everDashed = this.everDashed;
    i.paused = this.creature.mode === MODE_PAUSED;
    // The slide card: from the first time the creature waits in a hand's
    // shadow out on the path until its first win (latched, so it doesn't blink
    // on and off while the creature follows the lane).
    if (this.creature.mode === MODE_WAIT && this.lineState === SHADOW && this.lineBy < OBJECT_OWNER) this.leadSeen = true;
    i.leading = this.wins === 0 && this.leadSeen;
    firstRunCues(i, this.cues);
  }

  // ------------------------------------------------------------- sessions

  private startSession(time: number): void {
    const session = this.xrManager.getSession();
    if (flags.reset && !this.resetDone) {
      this.deskAnchor.forget(session);
      this.resetDone = true;
    }
    this.model.root.visible = false;
    this.listening = true;
    this.followAnchor = false;
    this.placementInfo = null;
    this.guideStart = -1;
    this.fpsStart = -1;
    for (const c of this.calibrators) c.reset();
    for (const c of this.registrars) c.reset();
    this.emulator = typeof window !== 'undefined' && 'IWER_DEVICE' in window;
    this.moveRequested = false;
    this.coverWatch.reset();
    this.updN = 0;
    this.guideActive = this.guideArmed && flags.guide;
    this.guideArmed = false;
    this.logger?.startSession(time, this.emulator, this.guideActive);
    this.logger?.setLabel('free', time);
    const s = session as (XRSession & { frameRate?: number; supportedFrameRates?: Float32Array }) | null;
    this.frameRate = s?.frameRate ?? 0;
    this.logger?.event(time, 'session', {
      emulator: this.emulator,
      guided: this.guideActive,
      frameRate: this.frameRate || null,
      supportedFrameRates: s?.supportedFrameRates ? Array.from(s.supportedFrameRates) : null,
    });
    console.info(`[cover] session start, emulator: ${this.emulator}`);
    window.dispatchEvent(new CustomEvent('cover:session-start'));
    if (session && this.deskAnchor.hasSaved()) {
      this.placement = 'restoring';
      this.restoreStart = time;
      void this.deskAnchor.restore(session);
    } else {
      this.placement = 'searching';
      this.searchStart = time;
    }
  }

  private endSession(): void {
    this.deskAnchor.endSession();
    this.logger?.endSession();
    void this.flushLog();
    setHum(0, false);
    this.placePreview();
    window.dispatchEvent(new CustomEvent('cover:session-end'));
  }

  private isPlaced(): boolean {
    return this.model.root.visible && this.placement !== 'preview' && this.placement !== 'restoring' && this.placement !== 'searching';
  }

  // ---------------------------------------------------------------- placement

  private updatePlacement(time: number): void {
    const c = this.placeClock;
    c.placement = this.placement;
    c.time = time;
    c.restoreStart = this.restoreStart;
    c.searchStart = this.searchStart;
    c.placedAt = this.placedAt;
    this.placeWorld.headY = this.head.y;
    this.placeWorld.anchorFailed = this.deskAnchor.status === 'restore-failed' || this.deskAnchor.status === 'unsupported';
    switch (placementStep(c, this.placeWorld)) {
      case 'anchor':
        this.model.root.visible = true;
        this.placement = 'anchor';
        this.placedAt = time;
        this.followAnchor = true;
        this.listening = false;
        this.placementInfo = {
          method: 'anchor',
          savedBy: this.deskAnchor.savedMethod(),
          localiseMs: Math.round((time - this.restoreStart) * 1000),
          ...this.distanceInfo(),
        };
        this.logger?.setPlacement(this.placementInfo);
        this.logger?.event(time, 'placement', this.placementInfo);
        break;
      case 'restore-gave-up':
        this.logger?.event(time, 'anchor-restore', { ok: false, status: this.deskAnchor.status, ms: Math.round((time - this.restoreStart) * 1000) });
        this.placement = 'searching';
        this.searchStart = time;
        break;
      case 'desk':
        this.placeAt(this.best, 'desk', time);
        break;
      case 'fallback':
        this.placeFallback(time);
        break;
    }
  }

  private updateForward(): void {
    this.player.head.getWorldDirection(this.forward);
    this.forward.negate();
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
  }

  /** The horizontal plane at desk height in front of the viewer, within reach (writes `best`). */
  private findDesk(): boolean {
    let bestScore = Number.POSITIVE_INFINITY;
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(XRPlaneComponent, '_plane') as XRPlane | undefined;
      const obj = entity.object3D;
      if (!plane || !obj || plane.orientation !== 'horizontal') continue;
      const label = ((plane as unknown as { semanticLabel?: string }).semanticLabel ?? '').toLowerCase();
      if (label === 'floor' || label === 'ceiling') continue;
      obj.updateWorldMatrix(true, false);
      this.up.set(0, 1, 0).transformDirection(obj.matrixWorld);
      if (this.up.y < 0.9) continue;
      obj.getWorldPosition(this.tmp);
      const height = this.tmp.y;
      const drop = this.head.y - height;
      if (height < 0.4 || drop < 0.2 || drop > 1.2) continue;
      const reach = Math.min(0.55, Math.max(0.38, drop));
      this.target.copy(this.head).addScaledVector(this.forward, reach);
      this.target.y = height;
      this.tmp.copy(this.target);
      obj.worldToLocal(this.tmp);
      const b = polygonBounds(plane.polygon);
      const cx = b.maxX - b.minX > 2 * DESK_INSET
        ? Math.min(b.maxX - DESK_INSET, Math.max(b.minX + DESK_INSET, this.tmp.x))
        : (b.minX + b.maxX) / 2;
      const cz = b.maxZ - b.minZ > 2 * DESK_INSET
        ? Math.min(b.maxZ - DESK_INSET, Math.max(b.minZ + DESK_INSET, this.tmp.z))
        : (b.minZ + b.maxZ) / 2;
      const miss = Math.hypot(this.tmp.x - cx, this.tmp.z - cz);
      if (miss > 0.6) continue;
      const isDesk = label === 'table' || label === 'desk';
      const score = miss - (isDesk ? 0.3 : 0);
      if (score < bestScore) {
        bestScore = score;
        this.planeLabel = label || 'unlabelled';
        this.best.set(cx, 0, cz);
        obj.localToWorld(this.best);
      }
    }
    return bestScore < Number.POSITIVE_INFINITY;
  }

  /** The detected horizontal surface under a world point, nearest in height to y; null if none. */
  private deskPlaneAt(x: number, y: number, z: number): { obj: Object3D; y: number; label: string; minX: number; maxX: number; minZ: number; maxZ: number } | null {
    let best: { obj: Object3D; y: number; label: string; minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(XRPlaneComponent, '_plane') as XRPlane | undefined;
      const obj = entity.object3D;
      if (!plane || !obj || plane.orientation !== 'horizontal') continue;
      const label = ((plane as unknown as { semanticLabel?: string }).semanticLabel ?? '').toLowerCase();
      if (label === 'floor' || label === 'ceiling') continue;
      obj.updateWorldMatrix(true, false);
      obj.getWorldPosition(this.up);
      const py = this.up.y;
      if (py < y - 0.35 || py > y + 0.08 || (best && Math.abs(py - y) >= Math.abs(best.y - y))) continue;
      this.tmp.set(x, py, z);
      obj.worldToLocal(this.tmp);
      const b = polygonBounds(plane.polygon);
      if (this.tmp.x < b.minX || this.tmp.x > b.maxX || this.tmp.z < b.minZ || this.tmp.z > b.maxZ) continue;
      best = { obj, y: py, label: label || 'unlabelled', ...b };
    }
    return best;
  }

  private placeAt(point: Vector3, how: Placement, time: number): void {
    const yaw = Math.atan2(this.head.x - point.x, this.head.z - point.z);
    this.place(point.x, point.y, point.z, yaw, how, time);
  }

  private place(x: number, y: number, z: number, yaw: number, how: Placement, time: number, extra: Record<string, unknown> = {}): void {
    const root = this.model.root;
    root.position.set(x, y + 0.001, z);
    root.quaternion.setFromAxisAngle(this.yAxis, yaw);
    root.visible = true;
    root.updateWorldMatrix(true, false);
    this.inv.copy(root.matrixWorld).invert();
    this.placement = how;
    this.placedAt = time;
    this.followAnchor = false;
    this.moveRequested = false;
    if (how === 'touch') this.listening = false;
    this.placementInfo = { method: how, ...(how === 'desk' ? { planeLabel: this.planeLabel } : {}), ...this.distanceInfo(), ...extra };
    this.logger?.setPlacement(this.placementInfo);
    this.logger?.event(time, 'placement', this.placementInfo);
    // Real objects were registered against the old spot: forget them.
    this.clearObjects(time);
    if (how === 'desk' || how === 'touch') {
      const session = this.xrManager.getSession();
      const space = this.xrManager.getReferenceSpace();
      if (session && space && this.xrFrame) {
        this.deskAnchor.save(session, this.xrFrame, space, x, y + 0.001, z, yaw, how);
        this.followAnchor = true;
      }
    }
  }

  private distanceInfo(): Record<string, unknown> {
    const p = this.model.root.position;
    return {
      eyeDistance: +Math.hypot(p.x - this.head.x, p.y - this.head.y, p.z - this.head.z).toFixed(3),
      eyeDrop: +(this.head.y - p.y).toFixed(3),
      deskY: +p.y.toFixed(3),
    };
  }

  private placeFallback(time: number): void {
    this.target.copy(this.head).addScaledVector(this.forward, 0.36);
    this.target.y = this.head.y - 0.36;
    this.placeAt(this.target, 'fallback', time);
  }

  private placePreview(): void {
    const root = this.model.root;
    root.position.set(0, 0.74, -0.45);
    root.rotation.set(0, 0, 0);
    root.visible = true;
    this.placement = 'preview';
    this.followAnchor = false;
    this.listening = false;
    this.moveRequested = false;
    this.ring.visible = false;
    this.prompt.mesh.visible = false;
    this.knobCard.mesh.visible = false;
    if (this.panel) this.panel.mesh.visible = false;
  }

  private applyAnchorPose(): boolean {
    const frame = this.xrFrame;
    const space = this.xrManager.getReferenceSpace();
    if (!frame || !space) return false;
    return this.deskAnchor.pose(frame, space, this.model.root.position, this.model.root.quaternion);
  }

  /** A finished desk tap-and-hold: put the board under that hand. False when it was a pause in the air. */
  private calibrateFrom(res: CalibResult, hand: number, time: number): boolean {
    const deskY = res.y - TIP_PAD;
    const plane = this.deskPlaneAt(res.x, deskY, res.z);
    if (plane && deskY - plane.y > AIR_TAP) {
      this.logger?.event(time, 'calibration-rejected', { hand: HAND_SIDES[hand], aboveDeskMm: Math.round((deskY - plane.y) * 1000) });
      return false;
    }
    const spot = spotFromTouch(res.x, deskY, res.z, this.head.x, this.head.y, this.head.z,
      plane ? { ...BOARD_PLACE, maxPull: Number.POSITIVE_INFINITY } : BOARD_PLACE);
    let keptOnDesk = false;
    if (plane) {
      this.tmp.set(spot.x, plane.y, spot.z);
      plane.obj.worldToLocal(this.tmp);
      const cx = plane.maxX - plane.minX > 2 * DESK_INSET
        ? Math.min(plane.maxX - DESK_INSET, Math.max(plane.minX + DESK_INSET, this.tmp.x))
        : (plane.minX + plane.maxX) / 2;
      const cz = plane.maxZ - plane.minZ > 2 * DESK_INSET
        ? Math.min(plane.maxZ - DESK_INSET, Math.max(plane.minZ + DESK_INSET, this.tmp.z))
        : (plane.minZ + plane.maxZ) / 2;
      if (Math.abs(cx - this.tmp.x) > 1e-4 || Math.abs(cz - this.tmp.z) > 1e-4) {
        this.tmp.set(cx, 0, cz);
        plane.obj.localToWorld(this.tmp);
        spot.x = this.tmp.x;
        spot.z = this.tmp.z;
        spot.yaw = Math.atan2(this.head.x - spot.x, this.head.z - spot.z);
        keptOnDesk = true;
      }
    }
    const calib = {
      hand: HAND_SIDES[hand],
      deskY: +deskY.toFixed(4),
      spreadMm: +(res.spread * 1000).toFixed(1),
      samples: res.samples,
      planeDeltaMm: plane ? +((plane.y - deskY) * 1000).toFixed(1) : null,
      planeLabel: plane ? plane.label : null,
      pulledIn: spot.moved,
      keptOnDesk,
    };
    this.logger?.setCalibration(calib);
    this.logger?.event(time, 'calibrated', calib);
    for (const c of this.calibrators) c.reset();
    this.place(spot.x, spot.y, spot.z, spot.yaw, 'touch', time, { touch: calib });
    this.restart();
    click(0.7, 0.6);
    return true;
  }

  /** A world point over the board (plus a margin)? */
  private overBoard(lx: number, lz: number, margin: number): boolean {
    return Math.abs(lx) < BOARD.halfX + margin && lz > BOARD.zMin - margin && lz < BOARD.zMax + margin;
  }

  // -------------------------------------------------------------- hands

  private readHands(time: number): void {
    const frame = this.xrFrame;
    const ref = this.xrManager.getReferenceSpace();
    for (let h = 0; h < 2; h++) {
      this.holdProgress[h] = 0;
      const source = this.input.xr.getPrimaryInputSource(HAND_SIDES[h]) as XRInputSource | undefined;
      const was = this.joints.tracked[h];
      const ok = this.joints.read(h, frame, ref, source, this.toWorld);
      if (!ok) {
        if (was) this.logger?.event(time, 'hand-lost', { hand: h });
        this.pose[h].pose = POSE_LOST;
        this.pointing[h] = false;
        this.calibrators[h].reset();
        this.registrars[h].reset();
        this.knobSince[h] = -1;
        this.knobArmed[h] = true;
        this.logger?.sample(time, h, 0, 0, 0, 0, POSE_LOST, 0);
        continue;
      }
      if (!was) {
        this.logger?.event(time, 'hand-found', {
          hand: h,
          path: this.joints.posePath[h],
          radii: this.joints.radiusPath[h],
          meanRadiusMm: this.joints.meanRadiusMm(h),
        });
      }
      const w = this.joints.world[h];
      const l = this.local[h];
      for (let i = 0; i < JOINTS; i++) {
        this.tmp.set(w[i * 3], w[i * 3 + 1], w[i * 3 + 2]).applyMatrix4(this.inv);
        l[i * 3] = this.tmp.x;
        l[i * 3 + 1] = this.tmp.y;
        l[i * 3 + 2] = this.tmp.z;
      }
      classifyPose(l, this.pose[h]);
      this.pointing[h] = isPointingDown(l);
      const tx = w[INDEX_TIP * 3], ty = w[INDEX_TIP * 3 + 1], tz = w[INDEX_TIP * 3 + 2];
      const lx = l[INDEX_TIP * 3], ly = l[INDEX_TIP * 3 + 1], lz = l[INDEX_TIP * 3 + 2];
      const placed = this.isPlaced();

      // Desk tap (calibration): a pointing fingertip, outside the board once it is placed.
      if (this.listening) {
        const res = this.calibrators[h].push(time, tx, ty, tz, this.head.x, this.head.y, this.head.z);
        const blocked = !this.pointing[h] || (placed && this.placement !== 'fallback' && this.overBoard(lx, lz, 0.03));
        this.holdProgress[h] = blocked ? 0 : this.calibrators[h].progress;
        if (res && !blocked) {
          if (this.calibrateFrom(res, h, time)) {
            this.inv.copy(this.model.root.matrixWorld).invert();
            continue;
          }
          this.calibrators[h].reset();
        } else if (res) {
          this.calibrators[h].reset();
        }
      }

      if (!placed) continue;

      this.updateKnob(h, lx, ly, lz, time);

      // Registration of a real object: a pointing fingertip held on top of something.
      // Allowed after a plane placement too (day 1 needed a desk tap first).
      if (this.cues.canRegister) {
        const res = this.registrars[h].push(time, tx, ty, tz, this.head.x, this.head.y, this.head.z);
        const top = ly - TIP_PAD;
        const plausible = this.pointing[h] && top >= REGISTER.minHeight && top <= REGISTER.maxHeight;
        if (plausible) this.holdProgress[h] = Math.max(this.holdProgress[h], this.registrars[h].progress);
        if (res) {
          this.registrars[h].reset();
          this.tryRegister(h, time);
        }
      }

      if (this.logger) {
        this.logger.sample(time, h, l[WRIST * 3], l[WRIST * 3 + 1], l[WRIST * 3 + 2], ly - TIP_PAD, this.pose[h].pose, this.pose[h].normalY, lx, ly, lz);
      }
    }
  }

  private tryRegister(h: number, time: number): void {
    const l = this.local[h];
    const x = l[INDEX_TIP * 3], y = l[INDEX_TIP * 3 + 1], z = l[INDEX_TIP * 3 + 2];
    let keeperDistance = Infinity;
    for (const k of this.level.keepers) keeperDistance = Math.min(keeperDistance, Math.hypot(x - k.x, z - k.z));
    keeperDistance = Math.min(keeperDistance, Math.hypot(x - this.lantern.x, z - this.lantern.z));
    const verdict = judgeRegistration({
      x, y, z,
      pointing: this.pointing[h],
      board: BOARD,
      routeDistance: distanceToPolyline(x, z, this.level.route),
      keeperDistance,
    });
    const info = { hand: h, xMm: Math.round(x * 1000), zMm: Math.round(z * 1000), topMm: Math.round((y - TIP_PAD) * 1000) };
    if (verdict !== 'ok') {
      // Holds at desk height or by a hand that isn't pointing are ordinary play: don't log them.
      if (verdict !== 'too-low' && verdict !== 'not-pointing') {
        this.logger?.event(time, 'register-rejected', { reason: verdict, ...info });
        click(1.3, 0.2);
      }
      return;
    }
    // Replace an object touched again (or the oldest when full).
    let slot = -1;
    for (let i = 0; i < this.objectCount; i++) {
      if (Math.hypot(this.objects[i * 3] - x, this.objects[i * 3 + 1] - z) < REGISTER.replace) slot = i;
    }
    if (slot < 0) {
      if (this.objectCount < MAX_OBJECT_MARKERS) slot = this.objectCount++;
      else {
        this.objects.copyWithin(0, 3);
        slot = MAX_OBJECT_MARKERS - 1;
      }
    }
    this.objects[slot * 3] = x;
    this.objects[slot * 3 + 1] = z;
    this.objects[slot * 3 + 2] = y - TIP_PAD;
    this.syncObjectMarkers();
    this.logger?.event(time, 'register', { slot, ...info });
    click(0.9, 0.5);
  }

  private clearObjects(time: number): void {
    if (this.objectCount) this.logger?.event(time, 'objects-cleared', { count: this.objectCount });
    this.objectCount = 0;
    this.syncObjectMarkers();
  }

  private syncObjectMarkers(): void {
    for (let i = 0; i < MAX_OBJECT_MARKERS; i++) {
      const g = this.model.objectMarkers[i];
      g.visible = i < this.objectCount;
      if (!g.visible) continue;
      g.position.set(this.objects[i * 3], 0, this.objects[i * 3 + 1]);
      g.getObjectByName('top')!.position.y = this.objects[i * 3 + 2] + 0.002;
    }
  }

  private buildOccluders(): void {
    this.occ.clear();
    for (let h = 0; h < 2; h++) {
      if (this.joints.tracked[h]) addHandCapsules(this.local[h], this.joints.radii[h], h, this.occ);
    }
    for (let i = 0; i < this.objectCount; i++) {
      this.occ.addCylinder(this.objects[i * 3], this.objects[i * 3 + 1], REGISTER.radius, this.objects[i * 3 + 2], OBJECT_OWNER + i);
    }
  }

  /** Hold a fingertip on the knob to move the board somewhere else. */
  private updateKnob(h: number, lx: number, ly: number, lz: number, time: number): void {
    const on = Math.hypot(lx - KNOB.x, lz - KNOB.z) < KNOB.r + 0.006 && ly < 0.01 + TIP_PAD + 0.015;
    if (!on) {
      this.knobSince[h] = -1;
      this.knobArmed[h] = true;
      return;
    }
    if (!this.knobArmed[h]) return;
    if (this.knobSince[h] < 0) this.knobSince[h] = time;
    const held = time - this.knobSince[h];
    this.holdProgress[h] = Math.max(this.holdProgress[h], Math.min(1, held / KNOB_HOLD_S));
    if (held >= KNOB_HOLD_S) {
      this.knobArmed[h] = false;
      this.requestMove(time);
    }
  }

  private requestMove(time: number): void {
    this.listening = true;
    this.moveRequested = true;
    for (const c of this.calibrators) c.reset();
    this.logger?.event(time, 'move-requested');
    click(0.7, 0.4);
  }

  // -------------------------------------------------------------- the game

  private seenAt(s: number): boolean {
    this.route.at(s, this.at3);
    return look(this.lantern, this.occ, this.at3[0], CREATURE_Y, this.at3[1], this.sight).state === SEEN;
  }

  private restart(): void {
    const keep = this.creature;
    this.creature = newCreature();
    this.creature.spottedCount = keep.spottedCount;
    this.creature.dashes = keep.dashes;
    this.homeAt = -1;
    this.coverWatch.reset();
  }

  /** Where the trinket waits on the board (it is carried after a win). */
  private trinketHome = new Vector3();
  private eyeOpen = 1;
  private beamDir = new Vector3();

  private runGame(dt: number, time: number): void {
    const c = this.creature;
    const m = this.model;
    // Which hand is its cover right now? If the headset drops that hand while
    // the creature stands in the light, play waits for it (not "spotted").
    this.route.at(c.s, this.at3);
    look(this.lantern, this.occ, this.at3[0], CREATURE_Y, this.at3[1], this.sight);
    const shadeHand = this.sight.state === SHADOW && this.sight.by < OBJECT_OWNER ? this.sight.by : -1;
    const waiting = this.coverWatch.waitingFor;
    this.cw.handPresent = this.coverWatch.update(time, this.joints.tracked, shadeHand, this.sight.state === SEEN);
    if (this.coverWatch.waitingFor >= 0 && waiting < 0) {
      this.logger?.event(time, 'cover-hand-lost', { hand: HAND_SIDES[this.coverWatch.waitingFor], sMm: Math.round(c.s * 1000) });
    }

    if (c.mode === MODE_HOME && this.homeAt >= 0 && time - this.homeAt > NEXT_ROUND_S) this.restart();

    const ev = stepCreature(c, dt, this.cw);
    const s = c.s;
    switch (ev) {
      case EV_DASH_START:
        this.logger?.event(time, 'dash', { sMm: Math.round(s * 1000) });
        break;
      case EV_SPOTTED:
        this.logger?.event(time, 'spotted', { sMm: Math.round(s * 1000) });
        click(0.45, 0.7);
        hm(); // the keeper wakes (its eyes open and it stares, below)
        break;
      case EV_HOME:
        this.wins++;
        this.homeAt = time;
        this.logger?.event(time, 'home', { wins: this.wins, spotted: c.spottedCount });
        lock();
        chime();
        m.winBeads.count = Math.min(this.wins, WIN_BEADS);
        break;
      case EV_PAUSE:
        this.logger?.event(time, 'pause', { reason: this.coverWatch.waitingFor >= 0 ? 'cover-hand-lost' : 'no-hands' });
        break;
      case EV_RESUME:
        this.logger?.event(time, 'resume');
        break;
      case EV_BACK_IN_NOOK:
        this.logger?.event(time, 'back-in-nook');
        break;
    }

    // The creature's own sight line, for the log and the hum.
    this.route.at(s, this.at3);
    const cx = this.at3[0], cz = this.at3[1], heading = this.at3[2];
    look(this.lantern, this.occ, cx, CREATURE_Y, cz, this.sight);
    if (this.sight.state !== this.lineState || (this.sight.state === SHADOW && this.sight.by !== this.lineBy)) {
      if (this.sight.state === SHADOW || this.lineState === SHADOW) {
        this.logger?.event(time, 'line', {
          blocked: this.sight.state === SHADOW,
          by: this.sight.state === SHADOW ? this.ownerName(this.sight.by) : null,
          sMm: Math.round(s * 1000),
        });
      }
      this.lineState = this.sight.state;
      this.lineBy = this.sight.by;
    }
    setHum(c.mode === MODE_HOME ? 0.3 : 1, this.sight.state === SHADOW);
    // The first time it stands in a hand's shadow inside the light, the lesson is learned.
    if (!this.everDashed && this.sight.state === SHADOW && this.sight.by < OBJECT_OWNER) {
      this.everDashed = true;
      this.logger?.event(time, 'first-shadow');
    }

    // Creature pose and look.
    const cr = m.creature;
    cr.root.position.set(cx, 0, cz);
    cr.root.rotation.y = c.mode === MODE_RETREAT ? heading + Math.PI : heading;
    let bob = 0;
    let squash = 1;
    if (c.mode === MODE_DASH || c.mode === MODE_RETREAT) {
      bob = Math.abs(Math.sin(time * 26)) * 0.003;
      if (time - this.stepAt > 0.13) {
        this.stepAt = time;
        step();
      }
    } else if (c.mode === MODE_PAUSED) {
      squash = 0.9;
    } else if (c.mode === MODE_HOME) {
      bob = Math.max(0, Math.sin((time - this.homeAt) * 9)) * 0.008 * Math.max(0, 1 - (time - this.homeAt) / 2);
    } else {
      squash = 1 + Math.sin(time * 3) * 0.02; // breathing
    }
    cr.root.position.y = bob;
    cr.root.scale.set(1, squash, 1);
    const flash = c.mode === MODE_SPOTTED ? 0.5 + 0.5 * Math.sin(time * 30) : 0;
    cr.bodyMat.emissive.setRGB(flash * 0.6, flash * 0.12, 0);

    // Trinket: turns slowly in its spot; after a win the creature carries it
    // on its back, bobbing with it, until the next round starts.
    m.trinket.rotation.y = time * 0.8;
    m.trinket.visible = true;
    if (c.mode === MODE_HOME) {
      m.trinket.position.set(cx, 0.021 + bob, cz);
      m.trinket.scale.setScalar(0.7);
    } else {
      m.trinket.position.copy(this.trinketHome);
      m.trinket.scale.setScalar(1);
    }

    // The keeper wakes when it spots the creature: its eyes open and a thin
    // line of light stares at the creature while it freezes; they close again
    // once it is back in its nook.
    const awake = c.mode === MODE_SPOTTED || c.mode === MODE_RETREAT;
    this.eyeOpen += ((awake ? 4.5 : 1) - this.eyeOpen) * Math.min(1, dt * 20);
    for (const eye of m.keeperEyes) eye.scale.y = this.eyeOpen;
    m.beam.visible = c.mode === MODE_SPOTTED;
    if (m.beam.visible) {
      const l = this.lantern;
      this.beamDir.set(cx - l.x, CREATURE_Y + 0.004 - l.y, cz - l.z);
      const len = this.beamDir.length();
      m.beam.quaternion.setFromUnitVectors(this.yAxis, this.beamDir.multiplyScalar(1 / len));
      m.beam.scale.set(1, len, 1);
    }

    // Lantern: brighter while the keeper stares at the creature.
    const staring = this.sight.state === SEEN;
    m.lanternGlow.emissiveIntensity = (staring ? 2.4 : 1.5) + Math.sin(time * 7) * 0.08;
    (m.poolMat.uniforms.uFlicker as { value: number }).value = 0.94 + Math.sin(time * 5.3) * 0.04 + Math.sin(time * 13.1) * 0.02;

    // Path dots: lit / shadow / dark.
    for (let i = 0; i < PATH_DOTS; i++) {
      const ds = (i / (PATH_DOTS - 1)) * this.route.length;
      this.route.at(ds, this.at3);
      const st = look(this.lantern, this.occ, this.at3[0], CREATURE_Y, this.at3[1], this.sight).state;
      m.pathDots.setColorAt(i, st === SEEN ? this.colLit : st === SHADOW ? this.colShadow : this.colDark);
    }
    if (m.pathDots.instanceColor) m.pathDots.instanceColor.needsUpdate = true;

    // Ghost hand: shows the "stop" palm on every first run, until the creature
    // first stands in a hand's shadow (whether or not a desk tap is still awaited).
    const ghost = this.cues.ghost;
    m.ghostHand.visible = ghost;
    if (ghost) m.ghostMat.opacity = 0.18 + 0.14 * (0.5 + 0.5 * Math.sin(time * 3));

    // Cover proxy (debug): one dot per joint, sized as cover.
    if (flags.proxy) {
      let n = 0;
      for (let h = 0; h < 2; h++) {
        if (!this.joints.tracked[h]) continue;
        const l = this.local[h];
        for (let i = 0; i < JOINTS; i++) {
          setInstance(m.proxyDots, n++, l[i * 3], l[i * 3 + 1], l[i * 3 + 2], 0.011, this.mtx);
        }
      }
      m.proxyDots.count = n;
      m.proxyDots.instanceMatrix.needsUpdate = true;
    }
  }

  private ownerName(by: number): string {
    if (by === 0) return 'hand-left';
    if (by === 1) return 'hand-right';
    if (by >= OBJECT_OWNER) return `object-${by - OBJECT_OWNER}`;
    return 'none';
  }

  // ---------------------------------------------------------- visuals

  private updateRing(): void {
    const h = this.holdProgress[0] >= this.holdProgress[1] ? 0 : 1;
    const p = this.holdProgress[h];
    if (p < 0.08 || !this.joints.tracked[h]) {
      this.ring.visible = false;
      return;
    }
    const w = this.joints.world[h];
    this.ring.position.set(w[INDEX_TIP * 3], w[INDEX_TIP * 3 + 1] - TIP_PAD + 0.001, w[INDEX_TIP * 3 + 2]);
    this.ring.scale.setScalar(1 + (1 - p) * 1.6);
    this.ringMat.opacity = 0.35 + 0.65 * p;
    this.ring.visible = true;
  }

  private updatePrompt(): void {
    const card = this.prompt.mesh;
    const cues = this.cues;
    // The knob label stands just left of the knob (outside the board, clear of the nook).
    const knob = this.knobCard.mesh;
    knob.visible = cues.knobLabel && this.model.root.visible;
    if (knob.visible) this.placeCard(knob, KNOB.x - 0.047, KNOB.z, 0.016);
    this.promptKey = cues.prompt;
    if (cues.prompt === 'none') {
      card.visible = false;
      return;
    }
    this.prompt.set(PROMPT_LINES[cues.prompt]);
    this.placeCard(card, cues.promptOnBoard ? 0 : null, BOARD.zMin - 0.01, 0.13);
    card.visible = true;
  }

  /** A card behind the board (board frame x, z, height y) tilted toward the viewer; x === null floats it in front. */
  private placeCard(card: Mesh, x: number | null, z: number, y: number): void {
    const root = this.model.root;
    if (x !== null) {
      this.tmp.set(x, y, z);
      root.localToWorld(this.tmp);
      card.position.copy(this.tmp);
      this.tilt.setFromAxisAngle(this.xAxis, -0.35);
      card.quaternion.copy(root.quaternion).multiply(this.tilt);
    } else {
      card.position.copy(this.head).addScaledVector(this.forward, 0.42);
      card.position.y = this.head.y - 0.22;
      this.quat.setFromAxisAngle(this.yAxis, Math.atan2(-this.forward.x, -this.forward.z));
      this.tilt.setFromAxisAngle(this.xAxis, -0.45);
      card.quaternion.copy(this.quat).multiply(this.tilt);
    }
  }

  // ---------------------------------------------------------- tester mode

  private countFrame(delta: number, time: number): void {
    if (this.fpsStart < 0) {
      this.fpsStart = time;
      this.fpsFrames = 0;
      this.fpsWorst = 0;
      return;
    }
    this.fpsFrames++;
    if (delta > this.fpsWorst) this.fpsWorst = delta;
    // A dropped frame: longer than 1.5 display frames (72 Hz assumed until the session reports its rate).
    const rate = this.frameRate || 72;
    if (delta > 1.5 / rate) this.fpsDrops++;
    const span = time - this.fpsStart;
    if (span >= 1) {
      this.fps = this.fpsFrames / span;
      if (this.logger) {
        const s = this.xrManager.getSession() as (XRSession & { frameRate?: number }) | null;
        if (s?.frameRate) this.frameRate = s.frameRate;
        this.logger.event(time, 'fps', {
          fps: Math.round(this.fps * 10) / 10,
          worstMs: Math.round(this.fpsWorst * 10000) / 10,
          updP95Ms: this.updP95(),
          drops: this.fpsDrops,
          frameRate: this.frameRate || null,
          redraws: this.panelRedraws,
        });
      }
      this.fpsStart = time;
      this.fpsFrames = 0;
      this.fpsWorst = 0;
      this.fpsDrops = 0;
      this.panelRedraws = 0;
      this.updN = 0;
    }
  }

  /** 95th percentile of this second's update() times, ms (sorted in a preallocated buffer). */
  private updP95(): number {
    const n = this.updN;
    if (!n) return 0;
    for (let i = 0; i < n; i++) this.updSorted[i] = this.updMs[i];
    for (let i = n; i < UPD_BUF; i++) this.updSorted[i] = Number.POSITIVE_INFINITY;
    this.updSorted.sort();
    return Math.round(this.updSorted[Math.min(n - 1, Math.floor(n * 0.95))] * 1000) / 1000;
  }

  private updateTester(time: number): void {
    const panel = this.panel!;
    const placed = this.isPlaced();
    if (placed && this.guideStart < 0) this.guideStart = time + GUIDE_DELAY_S;
    let stepLine: [string, string] = ['', ''];
    if (!this.guideActive) {
      stepLine = placed
        ? ['Free play. Guided poses: leave the view,', '!then press "Enter: guided poses".']
        : this.placement === 'searching' || this.placement === 'restoring'
          ? ['!Looking for your desk...', '']
          : ['!Tap the desk beside you with one finger', 'and hold it still'];
    } else if (this.guideStart >= 0 && time >= this.guideStart) {
      let t = time - this.guideStart;
      let i = 0;
      for (; i < GUIDE.length; i++) {
        const span = GUIDE_PREP_S + GUIDE[i].seconds;
        if (t < span) break;
        t -= span;
      }
      if (i >= GUIDE.length) {
        this.logger?.setLabel('free', time);
        stepLine = ['!Done. Free play: help it cross.', 'Then leave the immersive view.'];
      } else if (t < GUIDE_PREP_S) {
        this.logger?.setLabel('prep', time);
        stepLine = [`!Next (${i + 1}/${GUIDE.length}): ${GUIDE[i].text[0]}`, GUIDE[i].text[1]];
      } else {
        this.logger?.setLabel(GUIDE[i].label, time);
        const left = Math.ceil(GUIDE[i].seconds - (t - GUIDE_PREP_S));
        stepLine = [`!Step ${i + 1}/${GUIDE.length} (${left}s): ${GUIDE[i].text[0]}`, GUIDE[i].text[1]];
      }
    } else if (!placed) {
      stepLine = this.placement === 'searching' || this.placement === 'restoring'
        ? ['!Looking for your desk...', '']
        : ['!Tap the desk with one finger', 'and hold it still'];
    } else {
      stepLine = ['!Get ready: a short guided test starts soon', ''];
    }

    if (time - this.panelAt >= PANEL_REDRAW_S) {
      this.panelAt = time;
      const hand = (h: number) =>
        this.joints.tracked[h] ? `${POSE_NAMES[this.pose[h].pose]}${this.pointing[h] ? '/point' : ''}` : '--';
      const line = this.lineState === SEEN ? 'SEEN' : this.lineState === SHADOW ? `shadow:${this.ownerName(this.lineBy)}` : 'dark';
      const redrawn = panel.set([
        `TEST ${this.emulator ? 'EMULATOR' : 'native'} ${this.placement} anchor ${this.deskAnchor.status} ${this.fps.toFixed(0)} fps`,
        `R ${hand(1)}   L ${hand(0)}   objects ${this.objectCount}`,
        `creature ${MODE_NAMES[this.creature.mode]}  line ${line}  lit ${(this.lightMap.litFraction * 100).toFixed(0)}%`,
        stepLine[0],
        stepLine[1],
        `log ${this.logger?.sampleCount ?? 0} samples${this.logger?.full ? ' (FULL)' : ''}, ${this.storeReady ? 'kept on this headset' : 'NOT kept: download before reload'}`,
      ]);
      if (redrawn) this.panelRedraws++;
    }
    if (placed) this.placeCard(panel.mesh, 0, BOARD.zMin - 0.04, 0.32);
    else {
      this.placeCard(panel.mesh, null, 0, 0);
      panel.mesh.position.y += 0.1;
    }
    panel.mesh.visible = true;
  }

  // ------------------------------------------------------- tester log storage

  /** Opens the on-headset log store and takes over a log kept from an earlier page load. */
  private async openLogStore(): Promise<void> {
    const store = new LogStore();
    this.logStore = store;
    if (await store.open()) {
      const restored = await store.load();
      if (restored && this.logger) {
        this.logger.adopt(restored);
        this.logCursor.markAll(restored);
        console.info(`[cover] tester log restored: ${restored.sessions.length} sessions`);
      }
      this.storeReady = store.status === 'ready';
    }
    window.dispatchEvent(new CustomEvent('cover:log-store'));
  }

  /** Writes what the log gained since the last write. */
  private async flushLog(): Promise<boolean> {
    if (!this.logger || !this.logStore || !this.storeReady) return false;
    const ok = await this.logFlusher.flush(this.logger.log);
    if (!ok) this.storeReady = false;
    return ok;
  }

  private async resetLog(): Promise<void> {
    if (!this.logger) return;
    this.logger.clear();
    this.logCursor.reset();
    if (this.logStore) {
      await this.logStore.clear();
      this.storeReady = this.logStore.status === 'ready';
    }
    window.dispatchEvent(new CustomEvent('cover:log-store'));
  }

  // -------------------------------------------------------------------- debug

  private exposeDebug(): void {
    const self = this;
    const debug: CoverDebug = {
      get placement() {
        return self.placement;
      },
      get listening() {
        return self.listening;
      },
      get creature() {
        const c = self.creature;
        return { s: +c.s.toFixed(4), mode: MODE_NAMES[c.mode], spotted: c.spottedCount, dashes: c.dashes, wins: self.wins, length: self.route.length };
      },
      get line() {
        return { state: self.lineState === SEEN ? 'seen' : self.lineState === SHADOW ? 'shadow' : 'dark', by: self.lineBy };
      },
      get hands() {
        return [0, 1].map((h) => ({
          tracked: self.joints.tracked[h],
          pose: POSE_NAMES[self.pose[h].pose],
          normalY: +self.pose[h].normalY.toFixed(3),
          pointing: self.pointing[h],
        }));
      },
      get objects() {
        return Array.from({ length: self.objectCount }, (_, i) => ({
          x: +self.objects[i * 3].toFixed(4),
          z: +self.objects[i * 3 + 1].toFixed(4),
          top: +self.objects[i * 3 + 2].toFixed(4),
        }));
      },
      get litFraction() {
        return +self.lightMap.litFraction.toFixed(3);
      },
      get fps() {
        return +self.fps.toFixed(1);
      },
      get anchorStatus() {
        return self.deskAnchor.status;
      },
      get placementInfo() {
        return self.placementInfo;
      },
      get cues() {
        const c = self.cues;
        return {
          ghost: c.ghost,
          prompt: c.prompt,
          knobLabel: c.knobLabel,
          canRegister: c.canRegister,
          ghostVisible: self.model.ghostHand.visible,
          promptVisible: self.prompt.mesh.visible,
          promptText: self.prompt.mesh.visible && self.promptKey !== 'none' ? PROMPT_LINES[self.promptKey as keyof typeof PROMPT_LINES].join(' ').replace(/!/g, '') : '',
        };
      },
      get coverWaitingFor() {
        return self.coverWatch.waitingFor;
      },
      get payoff() {
        const m = self.model;
        return { eyes: +self.eyeOpen.toFixed(2), stare: m.beam.visible, trinketCarried: m.trinket.scale.x < 1, beads: m.winBeads.count };
      },
      get emulator() {
        return self.emulator;
      },
      get logStore() {
        return {
          status: self.logStore?.status ?? 'off',
          error: self.logStore?.error ?? '',
          sessions: self.logger?.log.sessions.length ?? 0,
          full: self.logger?.full ?? false,
        };
      },
      flushLog: () => self.flushLog(),
      resetLog: () => self.resetLog(),
      armGuide() {
        self.guideArmed = true;
      },
      boardPoint(x, z, y) {
        const v = new Vector3(x, y, z);
        self.model.root.updateWorldMatrix(true, false);
        self.model.root.localToWorld(v);
        return [v.x, v.y, v.z];
      },
      toBoard(x, y, z) {
        const v = new Vector3(x, y, z);
        self.model.root.updateWorldMatrix(true, false);
        self.model.root.worldToLocal(v);
        return [v.x, v.y, v.z];
      },
      joints(hand) {
        return self.joints.tracked[hand] ? Array.from(self.joints.world[hand]) : null;
      },
      lantern: self.lantern,
      route: Array.from(self.level.route),
      logSamples: () => self.logger?.sampleCount ?? 0,
      exportLog: () => self.logger?.toJSON() ?? null,
      summary: () => (self.logger ? analyseLog(self.logger.log) : null),
      setLabel(label) {
        if (self.logger && (LABELS as readonly string[]).includes(label)) self.logger.setLabel(label as Label, self.lastTime);
      },
      requestMove() {
        self.requestMove(self.lastTime);
      },
      restart() {
        self.restart();
      },
      clearObjects() {
        self.clearObjects(self.lastTime);
      },
      sightAt(x, z) {
        const r = look(self.lantern, self.occ, x, CREATURE_Y, z, { state: DARK, by: BY_NONE });
        return r.state === SEEN ? 'seen' : r.state === SHADOW ? `shadow:${self.ownerName(r.by)}` : 'dark';
      },
    };
    (window as unknown as { __cover: CoverDebug }).__cover = debug;
  }
}

function polygonBounds(poly: readonly DOMPointReadOnly[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}
