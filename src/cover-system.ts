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
 * Level 2 (day 6, src/level2.ts): unlocked by a level-1 win; it starts once a
 * real object is registered, and needs it: a hand in the keeper's gaze wakes
 * it, so only the object can shade the middle of the path.
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
  XRMesh as XRMeshComponent,
  createSystem,
  Group,
  type Object3D,
} from '@iwsdk/core';
import { PLACE, TapCalibrator, spotFromTouch, type CalibResult, type PlaceParams } from './calibration.ts';
import { chime, click, hm, lock, lullaby, setHum, setSpatial, soundCounts, step, stir } from './click-sound.ts';
import { REGISTER, REGISTER_HOLD, TIP_PAD, distanceToPolyline, judgeRegistration, onKnob } from './contact.ts';
import { KNOB, MAX_OBJECT_MARKERS, OBJECT_OCCLUDER, PATH_DOTS, buildCover, dressEmulatedMug, ghostHandCapsules, setInstance, type CoverModel } from './cover-model.ts';
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
  MODE_NOOK,
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
import {
  L2_WIN,
  LanternWake,
  RoundCues,
  arcPoint,
  handAtTeachSpot,
  introActive,
  introFx,
  l2WinFx,
  nearestJointToLantern,
  newIntroFx,
  newL2WinFx,
  newPayoff,
  newWinFx,
  nextRoundDue,
  payoffFor,
  winFx,
} from './feedback.ts';
import { beadsFor, forgetProgress, loadProgress, saveProgress } from './progress-store.ts';
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
import { BOARD, CREATURE_Y, LEVEL_1, Route, TEACH_SPOT, type Level } from './level.ts';
import { Gaze, L2_LEFT, L2_RIGHT, LEVEL_2, LevelProgress, keepNewestObject, objectSlot, startLevel } from './level2.ts';
import { LightMap } from './light-map.ts';
import { LogKeeper, LogStore, type StoreStatus } from './log-store.ts';
import { KNOB_LINES, PROMPT_LINES, firstRunCues, newCues, type CueInput } from './onboarding.ts';
import { seatTrace } from './emu-seat.ts';
import { placementStep, type PlacementClock, type PlacementState, type PlacementWorld } from './placement.ts';
import { BY_NONE, DARK, Occluders, SEEN, SHADOW, look, type Lantern, type SightResult } from './sightline.ts';
import { TextCard } from './text-card.ts';
import { buildAmbience, type Ambience } from './ambience.ts';
import { STAR_FRACTIONS, STAR_OFFSET, buildNightChip, buildSky, buildStars, loadStars, saveStars, type NightChip, type Sky, type StarSet } from './stars.ts';
import { HOLD_S, PICK_R, SHELF, loadAnimatedTuck, loadPets, petMaterials, savePet, savedPet, type AnimatedPet, type PetId } from './pets.ts';
import { LABELS, TesterLogger, analyseLog, boardInView, logSettings, type Label } from './touch-log.ts';

/** Inset from desk edges so the whole board stays on the desk, whichever way it is turned. */
const DESK_INSET = Math.max(BOARD.halfX, (BOARD.zMax - BOARD.zMin) / 2) + 0.01;
/** A hold this far above a detected desk is a pause in the air, not a tap. */
const AIR_TAP = 0.03;
/** Board placement: centre a little further than the soroban's (the board is bigger). */
const BOARD_PLACE: PlaceParams = { ...PLACE, maxEyeDistance: 0.5, minReach: 0.28 };
const KNOB_HOLD_S = 0.8;
/** Owner tags for cover: hands 0/1, objects 10 + n. */
const OBJECT_OWNER = 10;
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
  { label: 'register', seconds: 15, text: ['Point down onto the top of a mug standing', 'between the lantern and the path. Hold still.'] },
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
  /**
   * Win and spotted feedback: keeper eye opening (1 closed), stare line, trinket on the creature's back, win beads shown;
   * day 5: keeper awake (a hand at the lantern), the win's hop (m), flare and newest bead's scale, and how often each sound played.
   */
  payoff: { eyes: number; stare: boolean; trinketCarried: boolean; beads: number; awake: boolean; hop: number; flare: number; bead: number; sounds: Record<string, number>; winTrace: [number, number, number][]; trinketOnMug: boolean; keeperNod: number; l2Climax: boolean };
  /** Day 7: the win effects the pure code gives `t` seconds after a win (the wiring check compares the applied ones with it). */
  winFxAt(t: number): { hop: number; flare: number; bead: number };
  /** Day 8: the same for level 2's climax. */
  l2WinFxAt(t: number): { hop: number; flare: number; bead: number; arc: number; eyes: number; nod: number };
  /** Day 8: the threat beat: frames it showed, frames in it that showed the teach card or the ghost (must be 0), showing now. */
  intro: { frames: number; teachDuring: number; active: boolean };
  /** Day 8: frames whose "again" card stayed up after the next round started with the hand back (must be 0). */
  againStuck: number;
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
  /** Day 6: the round's level, whether level 2 is unlocked, a hand in the keeper's gaze, the object covering the gaze. */
  level: { id: number; unlocked: boolean; gazeWake: boolean; mugCovers: boolean; ghostSpot: string; gazeShown: boolean; mugGhostShown: boolean; ghostAt: [number, number]; l2Won: boolean };
  /**
   * Day 6, /emu/ only (the O key): registers an object standing at board point (x, z) with its top at `top`,
   * through the same rules as a fingertip registration (judgeRegistration), without the hold. Returns the verdict.
   */
  registerAt(x: number, z: number, top: number): string;
  /** What the keeper makes of a creature standing at board point (x, z): 'seen' | 'shadow:<by>' | 'dark'. */
  sightAt(x: number, z: number): string;
  /** Forgets every registered object. */
  clearObjects(): void;
  /** Day 7b, /emu/: the last R lift-over as the emulator seat placed the hand, per frame [t s, x m, height m]. */
  seatTrace: readonly (readonly [number, number, number])[];
}

let debugHandle: CoverDebug | undefined;
/**
 * The running game's debug handle (the page's tester panel uses it). Day 7b:
 * it lives here, not on `window`; only the /emu/ build (and the dev server)
 * also puts it on `window` for the emulator checks, so the main build served
 * to a Quest carries no global handle.
 */
export function coverDebug(): CoverDebug | undefined {
  return debugHandle;
}

export class CoverSystem extends createSystem({
  planes: { required: [XRPlaneComponent] },
  meshes: { required: [XRMeshComponent] },
}) {
  private model!: CoverModel;
  private progress = new LevelProgress(startLevel(typeof location === 'undefined' ? '' : location.search));
  private level: Level = this.progress.level === 2 ? LEVEL_2 : LEVEL_1;
  private lantern: Lantern = LEVEL_1.lanterns[0];
  private route = new Route(LEVEL_1.route);
  /** Level 2: the keeper's gaze (same lantern and path in both levels). */
  private gaze = new Gaze(LEVEL_1.lanterns[0], this.route);
  /** Level 2: a hand shades the path inside the gaze (the keeper is awake); the object shades all of it. */
  private gazeWake = false;
  private mugCovers = false;
  private l2Won = false;
  private objOcc = new Occluders(1, MAX_OBJECT_MARKERS);
  private occ = new Occluders();
  private lightMap = new LightMap();
  /** Chief 12.11: visual-only night/glow/motes around the board (ambience.ts). */
  private amb!: Ambience;
  private sp = { l: new Vector3(), c: new Vector3(), f: new Vector3(), u: new Vector3(0, 1, 0) };
  /** Chief 12.11: the three creatures (pets.ts), the chosen one, the choice shelf and fingertip hold times. */
  private pets: Record<PetId, Group> | null = null;
  private petId: PetId = savedPet();
  private petOld: Object3D[] = [];
  private shelf = new Group();
  private shelfPets: Partial<Record<PetId, Group>> = {};
  private pickHold = new Float32Array(SHELF.length);
  private tuckAnim: AnimatedPet | null = null;
  /** Chief 12.11: the night's three stars (stars.ts). */
  private stars!: StarSet;
  private starPos = new Float32Array(9);
  private starS = new Float32Array(3);
  private starState = new Int8Array(3); // 0 waiting, 1 gathered, -1 lost (passed in the light)
  private starAt = new Float32Array(3);
  private stirred = false;
  private resultAt = -1;
  /** Chief 12.11: Night 7's finale (dawn, the creature climbs into your palm). */
  private finaleAt = -1;
  /** Chief 12.11 (tester clip: the restored board hung half off the desk): checked once per anchor restore. */
  private anchorChecked = false;
  private beatAt = 0;
  private resultN = [false, false, false];
  private starBook = loadStars();
  private sky!: Sky;
  private chip!: NightChip;
  /** ?sky=N shows N constellation stars (for checks and the video). */
  private skyTest = (() => { try { const v = new URLSearchParams(location.search).get('sky'); return v ? Number(v) : -1; } catch { return -1; } })();
  private petWaveUntil = 0;
  private sight: SightResult = { state: DARK, by: BY_NONE };
  private lineState = DARK;
  private lineBy = BY_NONE;
  private creature: CreatureState = newCreature();
  private cw!: CreatureWorld;
  private wins = 0;
  private homeAt = -1;
  private everDashed = false;
  private round = new RoundCues();
  /** A hand is at the lantern: the keeper is awake and sees the whole path. */
  private keeperAwake = false;
  /** Day 7: the lantern wake with hysteresis (wakes inside 6.3 cm, sleeps beyond 7 cm). */
  private lanternWake = new LanternWake();
  /** A tracked hand stands where the round starts (level 1's ghost spot, or level 2's left ghost). */
  private handBack = false;
  /** Day 7: the last win's frames as (t since home, hop applied, flare applied), for the wiring check. */
  private winTrace = new Float32Array(64 * 3);
  private winTraceN = 0;
  private pay = newPayoff();
  private fx = newWinFx();
  /** Day 8: the win showing is a level-2 win (its own climax, sound and card). */
  private l2Climax = false;
  private l2fx = newL2WinFx();
  private ifx = newIntroFx();
  /** The placement whose threat beat has played its sound (placedAt). */
  private stirFor = -1;
  private introFrames = 0;
  private teachDuringIntro = 0;
  private againStuck = 0;
  private arcAt = new Float32Array(3);
  private coverWatch = new CoverWatch();
  private moveRequested = false;
  private cues = newCues();
  private cueIn: CueInput = {
    placement: 'preview', placed: false, listening: false, moveRequested: false, everDashed: false, paused: false, leading: false, spotted: false, awake: false, again: false,
    unlocked: false, level: 1, objects: 0, mugCovers: false, gazeWake: false, pastGaze: false, l2Won: false,
  };
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
  /** Tester mode: the log's write path (5 s timer, retries, storage state). */
  private logKeeper: LogKeeper | null = null;
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
  private viewDir = new Vector3();
  private toBoardC = new Vector3();
  /** Per hand: last wrist position (board frame), its time, and a smoothed wrist speed (m/s). */
  private lastWrist = new Float32Array(6);
  private lastWristAt = [-1, -1];
  private wristSpeed = new Float32Array(2);
  private colLit = new Color(0xffd27a);
  private colShadow = new Color(0x7d93d8);
  private colDark = new Color(0xe9dfcc);
  private toWorld!: (p: Float32Array, i: number) => void;

  init(): void {
    this.model = buildCover(this.level, this.lightMap.data);
    this.amb = buildAmbience(this.level.lanterns[0], this.lightMap.data);
    this.model.root.add(this.amb.root);
    this.stars = buildStars();
    this.model.root.add(this.stars.root);
    this.sky = buildSky();
    this.model.root.add(this.sky.root);
    this.chip = buildNightChip();
    this.chip.mesh.position.set(0.13, 0.004, 0.11);
    this.model.root.add(this.chip.mesh);
    this.placeStars();
    this.shelf.name = 'pet-shelf';
    this.model.root.add(this.shelf);
    loadPets().then((p) => {
      this.pets = p;
      for (const s of SHELF) {
        const c = p[s.id].clone();
        c.position.set(s.x, 0, s.z);
        c.scale.setScalar(0.8);
        c.rotation.y = 0.3;
        this.shelf.add(c);
        this.shelfPets[s.id] = c;
      }
      this.applyPet(this.petId);
      return loadAnimatedTuck().then((a) => { this.tuckAnim = a; if (this.petId === 'tuck') this.applyPet('tuck'); });
    }).catch((e: unknown) => console.warn('[cover] pets not loaded', e));
    // Day 8: beads and the level-2 unlock carry over to the next visit (localStorage); ?reset=1 forgets them.
    if (flags.reset) forgetProgress();
    else this.restoreProgress();
    this.trinketHome.copy(this.model.trinket.position);
    const entity = this.world.createTransformEntity(this.model.root, { persistent: true });
    if (flags.depth) entity.addComponent(DepthOccludable);

    this.cw = {
      routeLength: this.route.length,
      handPresent: false,
      // A hand at the lantern wakes the keeper: it sees the whole path.
      seen: (s: number) => this.keeperAwake || this.seenAt(s),
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
      const logger = this.logger;
      this.logKeeper = new LogKeeper(() => logger.log);
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
    this.logKeeper?.frame(time);

    this.player.head.getWorldPosition(this.head);
    this.updateForward();
    this.updatePlacement(time);
    if (this.followAnchor && this.deskAnchor.anchor) this.applyAnchorPose();
    if (this.placement !== 'anchor') this.anchorChecked = false;
    else if (!this.anchorChecked && time - this.placedAt > 1.5) { this.anchorChecked = true; this.keepAnchorOnDesk(time); }

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
    this.updateWake(placed, time, Math.min(delta, 0.05));
    if (placed) {
      this.buildOccluders();
      this.lightMap.update(this.lantern, this.occ, CREATURE_Y);
      this.model.shadowTex.needsUpdate = true;
      this.runGame(Math.min(delta, 0.05), time);
      this.updateShelf(Math.min(delta, 0.05));
      this.updateStars(time, Math.min(delta, 0.05));
    } else {
      setHum(0, false);
    }
    this.amb.update(Math.min(delta, 0.05), time, {
      placed,
      staring: this.sight.state === SEEN || this.keeperAwake,
      flare: this.finaleAt >= 0 ? 1 : this.fx.flare,
      hands: this.joints.tracked[0] || this.joints.tracked[1],
    });
    if (placed) {
      const sp = this.sp;
      sp.l.set(this.lantern.x, this.lantern.y, this.lantern.z);
      root.localToWorld(sp.l);
      this.model.creature.root.getWorldPosition(sp.c);
      this.player.head.getWorldDirection(sp.f).negate();
      setSpatial([this.head.x, this.head.y, this.head.z], [sp.f.x, sp.f.y, sp.f.z], [0, 1, 0], [sp.l.x, sp.l.y, sp.l.z], [sp.c.x, sp.c.y, sp.c.z]);
    }
    this.updateCues();
    this.watchIntro(time);
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
    // Latched round state (feedback.ts): the slide card from the first wait in
    // a hand's lane until the first win, the spotted card until the next dash,
    // the "again" card and ghost from a win until a hand is back at the start.
    this.handBack = handAtTeachSpot(this.local, this.joints.tracked, undefined, this.level.needsObject ? L2_LEFT : TEACH_SPOT);
    this.round.frame(this.creature.mode, this.lineState === SHADOW && this.lineBy < OBJECT_OWNER, this.handBack);
    // Day 8: the round's own rule, checked where the glue feeds it (an outside run cut the hand-back here unnoticed).
    if (this.round.again && this.creature.mode !== MODE_HOME && this.handBack) this.againStuck++;
    i.leading = this.round.leading(this.wins);
    i.spotted = this.round.spotted;
    i.awake = this.keeperAwake;
    i.again = this.round.again;
    i.unlocked = this.progress.unlocked;
    i.level = this.level.id;
    i.objects = this.objectCount;
    i.mugCovers = this.mugCovers;
    i.gazeWake = this.gazeWake;
    i.pastGaze = this.creature.s >= this.gaze.s0 && this.creature.mode !== MODE_HOME;
    i.l2Won = this.l2Won;
    i.intro = introActive(i.placed, this.everDashed, this.lastTime - this.placedAt);
    i.l2Home = this.l2Climax;
    firstRunCues(i, this.cues);
  }

  /**
   * The keeper wakes while a tracked hand is within WAKE_RADIUS of the lantern (feedback.ts), and in level 2
   * while a hand shades any point of the path inside its gaze (level2.ts).
   */
  private updateWake(placed: boolean, time: number, dt: number): void {
    // Day 7: with hysteresis, so a hand jittering at the wake radius doesn't toggle it every frame;
    // day 8: a hand must stay inside the radius for WAKE_DWELL_S first (dt is the game's clamped step).
    if (!placed) this.lanternWake.reset();
    const h = placed ? this.lanternWake.update(this.local, this.joints.tracked, this.lantern, dt) : -1;
    const g = placed && this.level.needsObject ? this.gaze.handInGaze(this.local, this.joints.radii, this.joints.tracked) : -1;
    const awake = h >= 0 || g >= 0;
    if (awake && !this.keeperAwake) {
      hm();
      const by = h >= 0 ? h : g;
      this.logger?.event(time, 'keeper-woke', {
        hand: HAND_SIDES[by],
        reason: h >= 0 ? 'lantern' : 'gaze',
        level: this.level.id,
        // day 8: how long the hand stayed inside the wake radius first (lantern wakes only)
        afterMs: h >= 0 ? Math.round(this.lanternWake.wokeAfter * 1000) : null,
        distMm: Math.round(nearestJointToLantern(this.local[by], this.lantern) * 1000),
      });
    }
    this.keeperAwake = awake;
    this.gazeWake = h < 0 && g >= 0;
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
  /** Chief 12.11: makes `id` the creature (visual only). */
  private applyPet(id: PetId): void {
    if (!this.pets) return;
    const cr = this.model.creature;
    if (!this.petOld.length) for (const ch of cr.root.children) this.petOld.push(ch);
    for (const o of this.petOld) o.visible = false;
    for (const pid of Object.keys(this.pets) as PetId[]) cr.root.remove(this.pets[pid]);
    if (this.tuckAnim) cr.root.remove(this.tuckAnim.root);
    const model = id === 'tuck' && this.tuckAnim ? this.tuckAnim.root : this.pets[id];
    cr.root.add(model);
    cr.mats = petMaterials(model);
    this.petWaveUntil = this.lastTime + 2;
    this.petId = id;
    savePet(id);
    for (const s of SHELF) { const c = this.shelfPets[s.id]; if (c) c.visible = s.id !== id; }
    this.logger?.event(this.lastTime, 'pet', { id });
  }

  /** Chief 12.11: an index fingertip held on a shelf pet picks it. */
  private updateShelf(dt: number): void {
    if (!this.pets) return;
    // judges r2 (first five minutes): the choice comes after the first night; before that, Tuck and nothing else
    this.shelf.visible = this.wins >= 1;
    if (!this.shelf.visible) return;
    for (let k = 0; k < SHELF.length; k++) {
      const s = SHELF[k];
      let near = false;
      for (let h = 0; h < 2; h++) {
        if (!this.joints.tracked[h]) continue;
        const l = this.local[h];
        const x = l[INDEX_TIP * 3], y = l[INDEX_TIP * 3 + 1], z = l[INDEX_TIP * 3 + 2];
        if (y < 0.05 && Math.hypot(x - s.x, z - s.z) < PICK_R) near = true;
      }
      this.pickHold[k] = near ? this.pickHold[k] + dt : 0;
      if (this.pickHold[k] >= HOLD_S && s.id !== this.petId) {
        this.pickHold.fill(0);
        this.applyPet(s.id);
        click(1.2, 0.5);
      }
    }
    // the shelf pets breathe a little
    const t = this.lastTime;
    SHELF.forEach((s, i) => { const c = this.shelfPets[s.id]; if (c) c.position.y = Math.max(0, Math.sin(t * 3 + i * 2)) * 0.002; });
  }

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
    this.stagePreview();
  }

  /**
   * Day 8 (outside review: the page's preview showed the creature in full light, so the picture
   * contradicted the sentence under it): before Enter the board shows the lesson. The pale ghost hand
   * stands at its spot, the light map is computed from the ghost's own shape with the game's sight test,
   * and the creature is played forward with the game's rules (no keeper wake: the hand is far from the
   * lantern) until it waits at the far edge of the lane, inside the shadow.
   */
  private previewOcc = new Occluders(12, 1);
  private stagePreview(): void {
    const m = this.model;
    const occ = this.previewOcc;
    occ.clear();
    ghostHandCapsules(occ, TEACH_SPOT.x, TEACH_SPOT.z, 1);
    this.lightMap.update(this.lantern, occ, CREATURE_Y, true);
    m.shadowTex.needsUpdate = true;
    const at = [0, 0, 0];
    const c = newCreature();
    const w: CreatureWorld = {
      routeLength: this.route.length,
      handPresent: true,
      seen: (s) => (this.route.at(s, at), look(this.lantern, occ, at[0], CREATURE_Y, at[1], { state: DARK, by: BY_NONE }).state === SEEN),
    };
    for (let t = 0; t < 6 && c.mode !== MODE_HOME; t += 1 / 60) stepCreature(c, 1 / 60, w);
    this.route.at(c.s, this.at3);
    m.creature.root.position.set(this.at3[0], 0, this.at3[1]);
    m.creature.root.rotation.y = this.at3[2];
    m.creature.root.scale.set(1, 1, 1);
    m.ghostHand.position.set(TEACH_SPOT.x, 0, TEACH_SPOT.z);
    m.ghostHand.visible = true;
    m.ghostMat.opacity = 0.34;
    m.gaze.visible = false;
    m.mugGhost.visible = false;
    m.winBeads.count = beadsFor(this.wins);
    for (let i = 0; i < PATH_DOTS; i++) {
      this.route.at((i / (PATH_DOTS - 1)) * this.route.length, this.at3);
      const st = look(this.lantern, occ, this.at3[0], CREATURE_Y, this.at3[1], this.sight).state;
      m.pathDots.setColorAt(i, st === SEEN ? this.colLit : st === SHADOW ? this.colShadow : this.colDark);
    }
    if (m.pathDots.instanceColor) m.pathDots.instanceColor.needsUpdate = true;
  }

  /** Day 8: progress kept from an earlier visit (beads, the level-2 unlock). */
  private restoreProgress(): void {
    const p = loadProgress();
    this.wins = p.wins;
    if (p.unlocked) this.progress.unlocked = true;
  }

  /** Day 8: the threat beat's sound, once per placement, and the frames it showed (read by the wiring check). */
  private watchIntro(time: number): void {
    if (!this.cueIn.intro) return;
    if (this.stirFor !== this.placedAt) {
      this.stirFor = this.placedAt;
      stir();
    }
    this.introFrames++;
    if (this.cues.prompt === 'teach' || this.cues.ghost) this.teachDuringIntro++;
    void time;
  }

  private applyAnchorPose(): boolean {
    const frame = this.xrFrame;
    const space = this.xrManager.getReferenceSpace();
    if (!frame || !space) return false;
    return this.deskAnchor.pose(frame, space, this.model.root.position, this.model.root.quaternion);
  }

  /** Chief 12.11: a board restored from an old anchor may hang off the desk (seen on a real Quest 3): if the desk
   *  plane under it puts its centre outside the inset area, slide it back onto the desk (and stop following the anchor). */
  private keepAnchorOnDesk(time: number): void {
    const r = this.model.root.position;
    const plane = this.deskPlaneAt(r.x, r.y, r.z);
    if (!plane) return;
    this.tmp.set(r.x, plane.y, r.z);
    plane.obj.worldToLocal(this.tmp);
    const cx = plane.maxX - plane.minX > 2 * DESK_INSET
      ? Math.min(plane.maxX - DESK_INSET, Math.max(plane.minX + DESK_INSET, this.tmp.x))
      : (plane.minX + plane.maxX) / 2;
    const cz = plane.maxZ - plane.minZ > 2 * DESK_INSET
      ? Math.min(plane.maxZ - DESK_INSET, Math.max(plane.minZ + DESK_INSET, this.tmp.z))
      : (plane.minZ + plane.maxZ) / 2;
    const moveMm = Math.round(Math.hypot(cx - this.tmp.x, cz - this.tmp.z) * 1000);
    if (moveMm < 5) return;
    this.tmp.set(cx, 0, cz);
    plane.obj.localToWorld(this.tmp);
    const yaw = Math.atan2(this.head.x - this.tmp.x, this.head.z - this.tmp.z);
    this.logger?.event(time, 'anchor-off-desk', { moveMm, planeLabel: plane.label });
    this.place(this.tmp.x, plane.y, this.tmp.z, yaw, 'desk', time, { fromAnchor: true, moveMm });
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
        this.lastWristAt[h] = -1;
        this.wristSpeed[h] = 0;
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
      this.trackWristSpeed(h, l, time);
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
    const info = { xMm: Math.round(x * 1000), zMm: Math.round(z * 1000), topMm: Math.round((y - TIP_PAD) * 1000) };
    if (verdict !== 'ok') {
      // Holds at desk height or by a hand that isn't pointing are ordinary play: don't log them.
      if (verdict !== 'too-low' && verdict !== 'not-pointing') {
        this.logger?.event(time, 'register-rejected', { reason: verdict, hand: h, ...info });
        click(1.3, 0.2);
      }
      return;
    }
    this.addObject(x, z, y - TIP_PAD, time, { hand: h, ...info });
  }

  /** Registers an object (or replaces one touched again, or the oldest when full); level 2 counts one, so it replaces it. */
  private addObject(x: number, z: number, top: number, time: number, info: Record<string, unknown>): void {
    const pick = objectSlot(this.level.needsObject, this.objects, this.objectCount, x, z, REGISTER.replace, MAX_OBJECT_MARKERS);
    if (pick.shift) this.objects.copyWithin(0, 3);
    const slot = pick.slot;
    this.objectCount = pick.count;
    this.objects[slot * 3] = x;
    this.objects[slot * 3 + 1] = z;
    this.objects[slot * 3 + 2] = top;
    this.lastSlot = slot;
    this.syncObjectMarkers();
    this.logger?.event(time, 'register', { slot, level: this.level.id, ...info });
    click(0.9, 0.5);
  }

  /** The slot written last (level 2 keeps only that one when it starts). */
  private lastSlot = 0;

  /** Level 2 starts at a round boundary (the creature out of the light) once it is unlocked and an object is registered; it keeps the newest object. */
  private updateLevel(time: number): void {
    const c = this.creature;
    // A round boundary: home, in its nook, or waiting at the light's edge (out of the light).
    const boundary = c.mode === MODE_NOOK || c.mode === MODE_HOME || (c.mode === MODE_WAIT && this.lineState === DARK);
    if (!this.progress.update(this.objectCount, boundary)) return;
    this.level = LEVEL_2;
    if (this.objectCount > 1 || this.lastSlot !== 0) {
      this.objectCount = keepNewestObject(this.objects, this.objectCount, this.lastSlot);
      this.lastSlot = 0;
      this.syncObjectMarkers();
    }
    this.logger?.event(time, 'level', { level: 2, objects: this.objectCount });
    click(0.8, 0.6);
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
      const column = g.getObjectByName('occluder') as Mesh;
      column.scale.y = Math.max(0.001, this.objects[i * 3 + 2]);
      // Day 8: the /emu/ paper mug exists only in the /emu/ build (its dist check guards the main build).
      if (__COVER_EMU__ && this.emulator) dressEmulatedMug(g, this.objects[i * 3 + 2]);
      else column.material = OBJECT_OCCLUDER;
    }
  }

  private buildOccluders(): void {
    this.occ.clear();
    for (let h = 0; h < 2; h++) {
      if (this.joints.tracked[h]) addHandCapsules(this.local[h], this.joints.radii[h], h, this.occ);
    }
    this.objOcc.clear();
    for (let i = 0; i < this.objectCount; i++) {
      this.occ.addCylinder(this.objects[i * 3], this.objects[i * 3 + 1], REGISTER.radius, this.objects[i * 3 + 2], OBJECT_OWNER + i);
      this.objOcc.addCylinder(this.objects[i * 3], this.objects[i * 3 + 1], REGISTER.radius, this.objects[i * 3 + 2], OBJECT_OWNER + i);
    }
    this.addSceneCover();
    this.mugCovers = this.gaze.coveredBy(this.objOcc);
  }

  /** Chief 12.11 (judges: "the game reads my room"): furniture-scale objects from the headset's Space Setup
   *  (bounded scene meshes: a monitor, a lamp, a shelf…) standing on or by the play desk cast the lantern's
   *  shade like the hand does. Each box becomes a row of upright capsules along its long side. Small things
   *  (a cup) never appear in Space Setup: those stay touch-registered. No meshes → nothing changes. */
  private sceneCover = 0;
  private addSceneCover(): void {
    let n = 0;
    for (const e of this.queries.meshes.entities) {
      if (!e.getValue(XRMeshComponent, 'isBounded3D')) continue;
      const label = String(e.getValue(XRMeshComponent, 'semanticLabel') ?? '').toLowerCase();
      if (label === 'floor' || label === 'ceiling' || label === 'wall' || label === 'table' || label === 'desk' || label === 'global mesh') continue;
      const obj = e.object3D;
      const mn = e.getValue(XRMeshComponent, 'min') as number[] | undefined;
      const mx = e.getValue(XRMeshComponent, 'max') as number[] | undefined;
      if (!obj || !mn || !mx) continue;
      obj.updateWorldMatrix(true, false);
      // the box's 8 corners → board frame
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      const pts: number[] = [];
      for (let k = 0; k < 8; k++) {
        this.tmp.set(k & 1 ? mx[0] : mn[0], k & 2 ? mx[1] : mn[1], k & 4 ? mx[2] : mn[2]);
        obj.localToWorld(this.tmp);
        this.tmp.applyMatrix4(this.inv);
        pts.push(this.tmp.x, this.tmp.z);
        x0 = Math.min(x0, this.tmp.x); x1 = Math.max(x1, this.tmp.x);
        y0 = Math.min(y0, this.tmp.y); y1 = Math.max(y1, this.tmp.y);
        z0 = Math.min(z0, this.tmp.z); z1 = Math.max(z1, this.tmp.z);
      }
      // on/by the desk: rises above it, starts near it, within reach of the board
      if (y1 < 0.03 || y0 > 0.15 || y1 - y0 > 1.2) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (Math.hypot(cx, cz) > 0.7) continue;
      const lx = x1 - x0, lz = z1 - z0;
      const along = lx >= lz;
      const len = along ? lx : lz;
      const r = Math.max(0.012, Math.min(0.06, (along ? lz : lx) / 2));
      const segs = Math.max(1, Math.min(12, Math.ceil(len / 0.04)));
      const top = Math.min(y1, 0.5);
      for (let i = 0; i < segs; i++) {
        const t = (i + 0.5) / segs;
        const px = along ? x0 + t * lx : cx, pz = along ? cz : z0 + t * lz;
        this.occ.addCapsule(px, Math.max(0, y0) + r, pz, px, Math.max(r, top - r), pz, r, OBJECT_OWNER + 8 + n);
      }
      n++;
      if (n >= 4) break;
    }
    if (n !== this.sceneCover) {
      this.sceneCover = n;
      this.logger?.event(this.lastTime, 'scene-cover', { objects: n });
    }
  }

  /** Smoothed wrist speed (board frame, m/s; about 0.1 s time constant), logged with each spot. */
  private trackWristSpeed(h: number, l: Float32Array, time: number): void {
    const o = h * 3;
    const dt = time - this.lastWristAt[h];
    if (this.lastWristAt[h] >= 0 && dt > 0 && dt < 0.5) {
      const v = Math.hypot(l[WRIST * 3] - this.lastWrist[o], l[WRIST * 3 + 1] - this.lastWrist[o + 1], l[WRIST * 3 + 2] - this.lastWrist[o + 2]) / dt;
      this.wristSpeed[h] += (v - this.wristSpeed[h]) * Math.min(1, dt / 0.1);
    }
    this.lastWrist[o] = l[WRIST * 3];
    this.lastWrist[o + 1] = l[WRIST * 3 + 1];
    this.lastWrist[o + 2] = l[WRIST * 3 + 2];
    this.lastWristAt[h] = time;
  }

  /** Hold a pointing fingertip on the knob to move the board somewhere else (day 5: pointing only, so a resting hand never triggers it). */
  private updateKnob(h: number, lx: number, ly: number, lz: number, time: number): void {
    const on = onKnob(this.pointing[h], lx, ly, lz, KNOB);
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
    this.l2Climax = false;
    this.coverWatch.reset();
    this.starState.fill(0);
    this.stirred = false;
    this.placeStars();
  }

  /** Chief 12.11: the fallen stars at their spots along the route, a little toward the lantern. */
  private placeStars(): void {
    if (!this.stars) return;
    const L = this.route.length;
    for (let i = 0; i < 3; i++) {
      const s = STAR_FRACTIONS[i] * L;
      this.starS[i] = s;
      this.route.at(s, this.at3);
      const dx = this.lantern.x - this.at3[0], dz = this.lantern.z - this.at3[1];
      const d = Math.hypot(dx, dz) || 1;
      const night = Math.min(7, this.wins + 1);
      const off = STAR_OFFSET * (0.8 + 0.12 * night); // stars lie further into the light each night
      const x = this.at3[0] + (dx / d) * off, z = this.at3[1] + (dz / d) * off;
      this.starPos[i * 3] = x; this.starPos[i * 3 + 2] = z;
      const m = this.stars.fallen[i];
      m.position.set(x, 0.012, z);
      m.visible = true;
      m.scale.setScalar(1);
    }
  }

  /** Chief 12.11: gather or lose fallen stars as the creature passes them; spin; show the night's result. */
  private updateStars(time: number, dt: number): void {
    if (!this.stars) return;
    const c = this.creature;
    if (this.keeperAwake || c.mode === MODE_SPOTTED) this.stirred = true;
    for (let i = 0; i < 3; i++) {
      const m = this.stars.fallen[i];
      if (this.starState[i] === 0) {
        m.rotation.y = time * 1.6 + i;
        m.position.y = 0.012 + Math.sin(time * 2 + i) * 0.0015;
        if (c.s >= this.starS[i] && (c.mode === MODE_DASH || c.mode === MODE_WAIT)) {
          const st = look(this.lantern, this.occ, this.starPos[i * 3], CREATURE_Y, this.starPos[i * 3 + 2], { state: DARK, by: BY_NONE }).state;
          this.starState[i] = st === SEEN ? -1 : 1;
          this.starAt[i] = time;
          if (this.starState[i] === 1) click(1.6 + i * 0.15, 0.45);
          this.logger?.event(time, 'star', { i, gathered: this.starState[i] === 1 });
        }
      } else {
        const k = Math.min(1, (time - this.starAt[i]) / 0.5);
        if (this.starState[i] === 1) { m.position.y = 0.012 + k * 0.05; m.scale.setScalar(1 + k * 0.6); m.visible = k < 1; }
        else { m.scale.setScalar(Math.max(0.01, 1 - k)); m.visible = k < 1; }
      }
    }
    this.sky.set(this.skyTest >= 0 ? this.skyTest : this.starBook.total, time);
    {
      // this night's stars so far: home only counts once it is home
      const gathered = this.starState[0] === 1 && this.starState[1] === 1 && this.starState[2] === 1;
      const n = this.resultAt >= 0 ? this.resultN.filter(Boolean).length : (gathered ? 1 : 0) + (this.stirred ? 0 : 1);
      this.chip.set(Math.min(7, ((this.wins - (this.resultAt >= 0 ? 1 : 0)) % 7) + 1), this.resultAt >= 0 ? n : Math.min(n, 2));
    }
    // Night 7 finale: dawn lifts the night, the lantern goes out, the creature climbs into the nearest palm, a heartbeat
    if (this.finaleAt >= 0) {
      const t = time - this.finaleAt;
      const cr = this.model.creature;
      this.model.lanternGlow.emissiveIntensity = Math.max(0, 1.5 - t);
      let h = this.joints.tracked[0] ? 0 : this.joints.tracked[1] ? 1 : -1;
      if (h >= 0 && t > 1.5) {
        const l = this.local[h];
        const px = (l[0] + l[30]) / 2, py = (l[1] + l[31]) / 2, pz = (l[2] + l[32]) / 2; // wrist + middle metacarpal
        const k = Math.min(1, (t - 1.5) / 1.2);
        cr.root.position.x += (px - cr.root.position.x) * k;
        cr.root.position.y += (py + 0.012 - cr.root.position.y) * k;
        cr.root.position.z += (pz - cr.root.position.z) * k;
        if (t - this.beatAt > 0.9 && k >= 1) { this.beatAt = t; click(0.35, 0.5); setTimeout(() => click(0.32, 0.35), 160); }
      }
      if (t > 10) this.finaleAt = -1;
    }
    // the night's result above the trinket: stars light up one by one
    const res = this.stars.result;
    if (this.resultAt >= 0) {
      const t = time - this.resultAt;
      const tp = this.model.trinket.position;
      for (let i = 0; i < 3; i++) {
        const r = res[i];
        r.visible = t < 5;
        r.position.set(tp.x + (i - 1) * 0.022, 0.07 + Math.sin(time * 2 + i) * 0.002, tp.z);
        const on = this.resultN[i] && t > 0.35 * (i + 1);
        const mat = r.material as import('@iwsdk/core').MeshStandardMaterial;
        mat.emissiveIntensity = on ? 1.2 : 0.05;
        mat.color.setHex(on ? 0xffd36b : 0x4a4a52);
        const pop = on ? Math.max(0, 1 - (t - 0.35 * (i + 1)) * 4) : 0;
        r.scale.setScalar(1.6 + pop * 0.8);
        r.rotation.y = Math.sin(time * 1.5 + i) * 0.4;
      }
      if (t > 5) this.resultAt = -1;
    } else for (const r of res) r.visible = false;
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

    // Day 7: the next round waits for a hand back at the start (or NEXT_ROUND_MAX_S), so the ghost and the "again" card stay until then.
    if (c.mode === MODE_HOME && this.homeAt >= 0 && nextRoundDue(time - this.homeAt, this.handBack)) {
      // Day 8: logged with the wait and whether the hand was back (the 10 s fallback and the hand-back look alike otherwise).
      this.logger?.event(time, 'next-round', { afterMs: Math.round((time - this.homeAt) * 1000), handBack: this.handBack, level: this.level.id });
      this.restart();
    }

    const ev = stepCreature(c, dt, this.cw);
    this.round.onEvent(ev);
    const s = c.s;
    switch (ev) {
      case EV_DASH_START:
        this.logger?.event(time, 'dash', { sMm: Math.round(s * 1000) });
        break;
      case EV_SPOTTED:
        // Day 5: with the wrist speed of each tracked hand (mm/s), so a log shows whether spots came from fast slides.
        this.logger?.event(time, 'spotted', {
          sMm: Math.round(s * 1000),
          keeperAwake: this.keeperAwake,
          wristMmS: [0, 1].map((h) => (this.joints.tracked[h] ? Math.round(this.wristSpeed[h] * 1000) : null)),
        });
        click(0.45, 0.7);
        hm(); // the keeper wakes (its eyes open and it stares, below)
        break;
      case EV_HOME:
        this.wins++;
        this.homeAt = time;
        this.winTraceN = 0;
        if (this.level.needsObject) this.l2Won = true;
        this.l2Climax = this.level.needsObject;
        this.progress.onWin();
        saveProgress({ wins: this.wins, unlocked: this.progress.unlocked });
        this.logger?.event(time, 'home', { wins: this.wins, spotted: c.spottedCount, level: this.level.id, objects: this.objectCount });
        {
          const all = this.starState[0] === 1 && this.starState[1] === 1 && this.starState[2] === 1;
          this.resultN = [true, all, !this.stirred];
          this.resultAt = time;
          const n = this.resultN.filter(Boolean).length;
          const key = String(this.level.id);
          this.starBook.best[key] = Math.max(this.starBook.best[key] ?? 0, n);
          this.starBook.total += this.starState.reduce((a, v) => a + (v === 1 ? 1 : 0), 0);
          saveStars(this.starBook);
          this.logger?.event(time, 'night-stars', { n, all, calm: !this.stirred, total: this.starBook.total });
          if (this.wins % 7 === 0 || this.skyTest === 99) { this.finaleAt = time; this.logger?.event(time, 'finale', { wins: this.wins }); }
        }
        lock();
        if (this.l2Climax) lullaby();
        else chime();
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

    this.updateLevel(time);

    // The win's hop, flare and bead pop, timed from the moment it got home.
    winFx(c.mode === MODE_HOME && this.homeAt >= 0 ? time - this.homeAt : -1, this.fx);
    // Day 8: level 2's climax: the same hop, then the lantern dims to a glow (its own flare curve) and more, below.
    if (this.l2Climax) this.fx.flare = l2WinFx(c.mode === MODE_HOME && this.homeAt >= 0 ? time - this.homeAt : -1, this.l2fx).flare;
    introFx(this.cueIn.intro ? time - this.placedAt : -1, this.ifx);

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
    setHum(c.mode === MODE_HOME ? (this.l2Climax ? 0.12 : 0.3) : 1, this.sight.state === SHADOW);
    // The first time it stands in a hand's shadow inside the light, the lesson is learned.
    if (!this.everDashed && this.sight.state === SHADOW && this.sight.by < OBJECT_OWNER) {
      this.everDashed = true;
      this.logger?.event(time, 'first-shadow');
    }

    // Creature pose and look.
    const cr = m.creature;
    // the threat beat: it shrinks back toward its nook (ifx.flinch is 0 outside it)
    cr.root.position.set(cx - Math.sin(heading) * this.ifx.flinch, 0, cz - Math.cos(heading) * this.ifx.flinch);
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
      bob = this.fx.hop; // the win's hops (feedback.ts winFx)
    } else {
      squash = 1 + Math.sin(time * 3) * 0.02; // breathing
    }
    cr.root.position.y = bob;
    cr.root.scale.set(1, squash, 1);
    const flash = c.mode === MODE_SPOTTED ? 0.5 + 0.5 * Math.sin(time * 30) : 0;
    cr.bodyMat.emissive.setRGB(flash * 0.6, flash * 0.12, 0);
    // Chief 12.11: in the night the creature is lit only by the lantern: in shade it nearly vanishes, two eye glints stay.
    {
      const nf = this.amb.night();
      const lit = this.amb.litAt(cr.root.position.x, cr.root.position.z);
      const k = 1 - nf * (1 - (0.18 + 0.82 * lit));
      for (const e of cr.mats) e.m.color.copy(e.base).multiplyScalar(k);
      cr.glintMat.opacity = nf * (1 - lit) * (0.75 + 0.25 * Math.sin(time * 2.1));
      // blink every ~3.5 s (a 0.14 s close), sprout sways with its steps
      const bt = time % 3.7;
      const lid = bt < 0.14 ? Math.max(0.08, Math.abs(bt / 0.07 - 1)) : 1;
      for (const e of cr.eyes) e.scale.y = lid;
      cr.sprout.rotation.z = Math.sin(time * 2.4) * 0.12 + bob * 30;
      // Tuck's real animations: run while it moves, a happy jump at home after a win, waves when picked
      if (this.tuckAnim && this.petId === 'tuck') {
        const a = this.tuckAnim;
        a.mixer.update(dt);
        if (c.mode === MODE_DASH || c.mode === MODE_RETREAT) a.play('run');
        else if (c.mode === MODE_HOME) a.play('cheer');
        else if (time < this.petWaveUntil) a.play('wave');
        else a.play('idle');
      }
    }

    // Trinket: turns slowly in its spot; after a win the creature carries it
    // on its back, hopping with it, until the next round starts.
    m.trinket.rotation.y = time * 0.8;
    m.trinket.visible = true;
    const pay = payoffFor(c.mode, this.wins, this.keeperAwake, this.pay);
    if (pay.trinketOnBack) {
      m.trinket.position.set(cx, 0.021 + bob, cz);
      m.trinket.scale.setScalar(0.7);
      // Day 8, level 2: the creature tosses the trinket up onto the top of the object that held the shade.
      if (this.l2Climax && this.l2fx.arc > 0 && this.objectCount > 0) {
        arcPoint(this.l2fx.arc, cx, 0.021 + bob, cz, this.objects[0], this.objects[2] + 0.004, this.objects[1], L2_WIN.arcH, this.arcAt);
        m.trinket.position.set(this.arcAt[0], this.arcAt[1], this.arcAt[2]);
        m.trinket.scale.setScalar(0.7 + 0.2 * this.l2fx.arc);
      }
    } else {
      m.trinket.position.copy(this.trinketHome);
      m.trinket.scale.setScalar(1);
    }

    // The keeper wakes when it spots the creature, or when a hand is at its
    // lantern: its eyes open, and while the creature freezes a thin line of
    // light stares at it; they close again once it is back in its nook.
    this.eyeOpen += (pay.eyes - this.eyeOpen) * Math.min(1, dt * 20);
    // Day 8: during level 2's climax the keeper falls asleep for real; in the threat beat it half wakes.
    const eyeShown = this.l2Climax && c.mode === MODE_HOME ? this.l2fx.eyes : Math.max(this.eyeOpen, this.ifx.eyes);
    for (const eye of m.keeperEyes) eye.scale.y = eyeShown;
    m.keeper.rotation.set(this.l2Climax && c.mode === MODE_HOME ? this.l2fx.nod : 0, this.ifx.look, 0);
    m.beam.visible = pay.stare;
    if (m.beam.visible) {
      const l = this.lantern;
      this.beamDir.set(cx - l.x, CREATURE_Y + 0.004 - l.y, cz - l.z);
      const len = this.beamDir.length();
      m.beam.quaternion.setFromUnitVectors(this.yAxis, this.beamDir.multiplyScalar(1 / len));
      m.beam.scale.set(1, len, 1);
    }

    // Win: a bead per win, the newest pops in; the light's warm side flares.
    m.winBeads.count = pay.beads;
    m.setBead(pay.beads - 1, this.fx.bead);
    (m.poolMat.uniforms.uFlare as { value: number }).value = this.fx.flare;
    if (this.ifx.flare) (m.poolMat.uniforms.uFlare as { value: number }).value += this.ifx.flare; // the threat beat
    if (c.mode === MODE_HOME && this.homeAt >= 0 && this.winTraceN < 64) {
      const k = this.winTraceN++ * 3;
      this.winTrace[k] = time - this.homeAt;
      this.winTrace[k + 1] = cr.root.position.y;
      this.winTrace[k + 2] = (m.poolMat.uniforms.uFlare as { value: number }).value;
    }

    // Lantern: brighter while the keeper stares at the creature (or is awake).
    const staring = this.sight.state === SEEN || this.keeperAwake;
    m.lanternGlow.emissiveIntensity = (staring ? 2.4 : 1.5) + Math.sin(time * 7) * 0.08 + this.fx.flare * 2;
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
    if (ghost) {
      m.ghostMat.opacity = 0.18 + 0.14 * (0.5 + 0.5 * Math.sin(time * 3));
      const spot = this.cues.ghostSpot === 'left' ? L2_LEFT : this.cues.ghostSpot === 'right' ? L2_RIGHT : TEACH_SPOT;
      m.ghostHand.position.set(spot.x, 0, spot.z);
    }
    // Level 2: the keeper's gaze and, until an object covers it, the ghost mug.
    m.gaze.visible = this.cues.gaze;
    m.mugGhost.visible = this.cues.mugGhost;

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
        // Day 5: was the board in view this second (angle between the gaze and the board centre)?
        this.player.head.getWorldDirection(this.viewDir).negate();
        this.toBoardC.copy(this.model.root.position).sub(this.head);
        const viewDeg = this.toBoardC.lengthSq() > 1e-8 ? (this.viewDir.angleTo(this.toBoardC) * 180) / Math.PI : 180;
        this.logger.event(time, 'fps', {
          inView: boardInView(this.isPlaced(), viewDeg),
          viewDeg: Math.round(viewDeg),
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
        `log ${this.logger?.sampleCount ?? 0} samples${this.logger?.full ? ' (FULL)' : ''}, ${this.logKeeper?.kept ? 'kept on this headset' : 'NOT kept: download before reload'}`,
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
        this.logKeeper?.cursor.markAll(restored);
        console.info(`[cover] tester log restored: ${restored.sessions.length} sessions`);
      }
      this.logKeeper?.attach(store);
    }
    window.dispatchEvent(new CustomEvent('cover:log-store'));
  }

  /** Writes what the log gained since the last write (a failed write is retried by the next one; LogStore gives up after 3 in a row). */
  private async flushLog(): Promise<boolean> {
    const ok = (await this.logKeeper?.flush()) ?? false;
    if (!ok && this.logStore?.status === 'failed') window.dispatchEvent(new CustomEvent('cover:log-store'));
    return ok;
  }

  private async resetLog(): Promise<void> {
    if (!this.logger) return;
    this.logger.clear();
    this.logKeeper?.cursor.reset();
    if (this.logStore) {
      await this.logStore.clear();
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
        return {
          eyes: +self.eyeOpen.toFixed(2),
          stare: m.beam.visible,
          trinketCarried: m.trinket.scale.x < 1,
          beads: m.winBeads.count,
          awake: self.keeperAwake,
          hop: +m.creature.root.position.y.toFixed(4),
          winTrace: Array.from({ length: self.winTraceN }, (_, i) => [self.winTrace[i * 3], self.winTrace[i * 3 + 1], self.winTrace[i * 3 + 2]] as [number, number, number]),
          flare: +((m.poolMat.uniforms.uFlare as { value: number }).value).toFixed(3),
          bead: +self.fx.bead.toFixed(3),
          sounds: { ...soundCounts },
          trinketOnMug: self.l2Climax && self.l2fx.arc >= 1 && m.trinket.position.y > 0.05,
          keeperNod: +m.keeper.rotation.x.toFixed(3),
          l2Climax: self.l2Climax,
        };
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
      winFxAt: (t: number) => ({ ...winFx(t) }),
      l2WinFxAt: (t: number) => ({ ...l2WinFx(t) }),
      get intro() {
        return { frames: self.introFrames, teachDuring: self.teachDuringIntro, active: !!self.cueIn.intro };
      },
      get againStuck() {
        return self.againStuck;
      },
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
      get level() {
        const m = self.model;
        return {
          id: self.level.id,
          unlocked: self.progress.unlocked,
          gazeWake: self.gazeWake,
          mugCovers: self.mugCovers,
          ghostSpot: self.cues.ghostSpot,
          gazeShown: m.gaze.visible,
          mugGhostShown: m.mugGhost.visible,
          ghostAt: [+m.ghostHand.position.x.toFixed(4), +m.ghostHand.position.z.toFixed(4)] as [number, number],
          l2Won: self.l2Won,
        };
      },
      registerAt(x, z, top) {
        if (!self.isPlaced()) return 'not-placed';
        let keeperDistance = Math.hypot(x - self.lantern.x, z - self.lantern.z);
        for (const k of self.level.keepers) keeperDistance = Math.min(keeperDistance, Math.hypot(x - k.x, z - k.z));
        const verdict = judgeRegistration({ x, y: top + TIP_PAD, z, pointing: true, board: BOARD, routeDistance: distanceToPolyline(x, z, self.level.route), keeperDistance });
        if (verdict === 'ok') self.addObject(x, z, top, self.lastTime, { emulated: true, xMm: Math.round(x * 1000), zMm: Math.round(z * 1000), topMm: Math.round(top * 1000) });
        return verdict;
      },
      clearObjects() {
        self.clearObjects(self.lastTime);
      },
      seatTrace,
      sightAt(x, z) {
        const r = look(self.lantern, self.occ, x, CREATURE_Y, z, { state: DARK, by: BY_NONE });
        return r.state === SEEN ? 'seen' : r.state === SHADOW ? `shadow:${self.ownerName(r.by)}` : 'dark';
      },
    };
    debugHandle = debug;
    if (__COVER_EMU__) (window as unknown as Record<string, CoverDebug>)['__cover'] = debug;
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
