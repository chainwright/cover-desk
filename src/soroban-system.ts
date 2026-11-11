/**
 * Places the soroban on the desk, shows a dot on each index fingertip, moves
 * beads when a fingertip pushes or drags them, and shows each rod's value.
 *
 * Placement, in order of preference:
 *   1. anchor   — the spot saved last session (persistent WebXR anchor);
 *   2. touch    — one-touch calibration: the user taps the desk and holds a
 *                 fingertip still for a moment; the abacus goes under that hand;
 *   3. desk     — a detected horizontal plane at desk height (automatic);
 *   4. fallback — a comfortable spot in the air when there is no desk.
 * While "listening", a tap on the desk (outside the abacus) re-places it. A
 * small knob at the near-left corner, held for a moment, starts listening again.
 */
import {
  CylinderGeometry,
  DepthOccludable,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
  VisibilityState,
  XRPlane as XRPlaneComponent,
  createSystem,
} from '@iwsdk/core';
import {
  push,
  readDeck,
  releasePusher,
  setCanonical,
  settle,
  type Pusher,
} from './bead-physics.js';
import { PLACE, TapCalibrator, spotFromTouch, type CalibResult } from './calibration.ts';
import { click } from './click-sound.js';
import {
  CONTACT,
  STATE_AWAY,
  STATE_BEAD,
  STATE_CONTACT,
  STATE_HOVER,
  STATE_NAMES,
  SURFACE,
  TIP_PAD,
  contactRod,
} from './contact.ts';
import { DeskAnchor } from './desk-anchor.ts';
import { flags } from './flags.ts';
import { deckAfterStroke, strokeDeck } from './rest-reader.ts';
import {
  BEAD_TOP,
  BEAD_Y,
  FINGER_RADIUS,
  FRAME_HALF_X,
  FRAME_Z_MAX,
  FRAME_Z_MIN,
  LOWER,
  RAIL,
  RODS,
  UPPER,
  rodX,
} from './soroban-layout.js';
import { buildSoroban, type SorobanModel } from './soroban-model.js';
import { TextCard } from './text-card.ts';
import { LABELS, TouchLogger, analyseLog, logSettings, type Label } from './touch-log.ts';

const HANDS = ['left', 'right'] as const;
/** How long to wait for a desk plane before using the fallback spot. */
const DESK_WAIT_S = 2.5;
/** After a fallback, a desk found within this window still wins (once). */
const LATE_DESK_S = 10;
/** How long to wait for last session's anchor before searching again. */
const RESTORE_WAIT_S = 4;
/** Beads settle into a clean state this long after the last touch. */
const SETTLE_DELAY_S = 0.12;
/** Inset from desk edges so the whole frame stays on the desk, whichever way it is turned. */
const DESK_INSET = Math.max((FRAME_Z_MAX - FRAME_Z_MIN) / 2, FRAME_HALF_X + RAIL) + 0.01;
/** A hold this far above a detected desk is a pause in the air, not a tap. */
const AIR_TAP = 0.03;
/** Calibration taps inside the abacus (plus this margin) are ignored. */
const FOOTPRINT_MARGIN = 0.03;
/** Move knob: layout-frame position, radius, and hold time. */
const KNOB_X = -(FRAME_HALF_X + RAIL + 0.024);
const KNOB_Z = FRAME_Z_MAX - 0.035;
const KNOB_R = 0.014;
const KNOB_HOLD_S = 0.8;
/** Rest reader: the finger counts as resting after this long within REST_STILL. */
const REST_DWELL_S = 0.35;
const REST_STILL = 0.003;

export type Placement = 'preview' | 'restoring' | 'searching' | 'desk' | 'fallback' | 'touch' | 'anchor';

interface RodPushers {
  upper: Pusher;
  lower: Pusher;
  prevZ: number;
}

interface StrokeState {
  rod: number;
  startZ: number;
  lastZ: number;
  top: boolean;
  stillSince: number;
}

/** Guided steps of tester mode (labels match the log). */
const GUIDE: { label: Label; seconds: number; text: [string, string] }[] = [
  { label: 'slide-desk', seconds: 8, text: ['Slide your fingertip along the desk,', 'under the middle rod, back and forth'] },
  { label: 'hover-2cm', seconds: 6, text: ['Hold your fingertip about 2 cm', 'above the middle rod. Do not touch.'] },
  { label: 'hover-5cm', seconds: 6, text: ['Move your fingertip back and forth', 'about 5 cm above the beads'] },
  { label: 'touch-top', seconds: 6, text: ['Rest your fingertip on top of', 'a bead on the middle rod and hold'] },
];
const GUIDE_PREP_S = 2.5;
const GUIDE_DELAY_S = 3;

/** Read-only state for tests, the emulator scripts and tester mode. */
export interface FadeDebug {
  placement: Placement;
  listening: boolean;
  values: number[];
  restValues: number[];
  touching: boolean[];
  /** Per hand: 'away' | 'hover' | 'contact' | 'bead'. */
  states: string[];
  /** Per hand: rod in contact or -1. */
  rods: number[];
  /** Per hand: fingertip in the layout frame (metres), or null. */
  tips: ([number, number, number] | null)[];
  anchorStatus: string;
  placementInfo: Record<string, unknown> | null;
  readMode: string;
  handMode: string;
  /** World position of a point in the abacus layout frame (x = rod centre). */
  rodPoint(rod: number, z: number, y: number): [number, number, number];
  /** World position of a layout-frame point. */
  layoutPoint(x: number, z: number, y: number): [number, number, number];
  beadCenter(rod: number, bead: number): number;
  planes(): { label: string; orientation: string; x: number; y: number; z: number; yawDeg: number; w: number; d: number }[];
  layout: {
    upper: typeof UPPER;
    lower: typeof LOWER;
    beadY: number;
    beadTop: number;
    surface: number;
    tipPad: number;
    contact: typeof CONTACT;
    knob: [number, number];
    frame: [number, number, number];
  };
  /** Tester log (test mode only). */
  logSamples(): number;
  exportLog(): string | null;
  summary(): unknown;
  setLabel(label: string): void;
  /** Starts listening for a desk tap, as the move knob does. */
  requestMove(): void;
}

export class SorobanSystem extends createSystem({
  planes: { required: [XRPlaneComponent] },
}) {
  private model!: SorobanModel;
  private upper: Float32Array[] = [];
  private lower: Float32Array[] = [];
  private scratchU = new Float32Array(UPPER.count);
  private scratchL = new Float32Array(LOWER.count);
  private pushers: RodPushers[][] = [];
  private lastTouch = new Float32Array(RODS).fill(-1);
  /** Value from bead positions (physics). */
  private physValues = new Int8Array(RODS);
  /** Value from where the finger rests (stroke reader). */
  private restUpper = new Int8Array(RODS);
  private restLower = new Int8Array(RODS);
  /** Value shown on the digit and voiced by the click. */
  private shown = new Int8Array(RODS);
  private dots: Mesh[] = [];
  private dotIdle!: MeshBasicMaterial;
  private dotContact!: MeshBasicMaterial;
  private dotTouch!: MeshBasicMaterial;
  private ring!: Mesh;
  private ringMat!: MeshBasicMaterial;
  private knob!: Mesh;
  private occluder!: MeshBasicMaterial;
  private prompt!: TextCard;
  private panel: TextCard | null = null;
  private logger: TouchLogger | null = null;

  private placement: Placement = 'preview';
  private placementInfo: Record<string, unknown> | null = null;
  private listening = false;
  private followAnchor = false;
  private searchStart = 0;
  private restoreStart = 0;
  private placedAt = 0;
  private resetDone = false;
  private deskAnchor = new DeskAnchor();
  private calibrators = [new TapCalibrator(), new TapCalibrator()];
  private calibProgress = new Float32Array(2);
  private knobSince = new Float32Array(2).fill(-1);
  private knobArmed = [true, true];
  private prevRod = new Int8Array(2).fill(-1);
  private states = new Int8Array(2);
  private tips = new Float32Array(6);
  private tipValid = [false, false];
  private strokes: StrokeState[] = [0, 1].map(() => ({ rod: -1, startZ: 0, lastZ: 0, top: false, stillSince: 0 }));
  private guideStart = -1;
  private guideStep = -1;
  private panelAt = 0;
  private lastTime = 0;

  private head = new Vector3();
  private forward = new Vector3();
  private target = new Vector3();
  private best = new Vector3();
  private tmp = new Vector3();
  private up = new Vector3();
  private tip = new Vector3();
  private local = new Vector3();
  private quat = new Quaternion();
  private tilt = new Quaternion();
  private xAxis = new Vector3(1, 0, 0);
  private yAxis = new Vector3(0, 1, 0);

  init(): void {
    this.model = buildSoroban();
    const entity = this.world.createTransformEntity(this.model.root, { persistent: true });
    if (flags.depth) entity.addComponent(DepthOccludable);

    // Move knob, outside the near-left corner of the frame.
    this.knob = new Mesh(
      new CylinderGeometry(KNOB_R, KNOB_R, 0.012, 20),
      new MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.6 }),
    );
    this.knob.name = 'move-knob';
    this.knob.position.set(KNOB_X, 0.006, KNOB_Z);
    this.model.inner.add(this.knob);

    for (let r = 0; r < RODS; r++) {
      const u = new Float32Array(UPPER.count);
      const l = new Float32Array(LOWER.count);
      setCanonical(UPPER, 0, u);
      setCanonical(LOWER, 0, l);
      this.upper.push(u);
      this.lower.push(l);
    }
    for (let h = 0; h < HANDS.length; h++) {
      const row: RodPushers[] = [];
      for (let r = 0; r < RODS; r++) {
        row.push({
          upper: { z: 0, prevZ: Number.NaN, radius: FINGER_RADIUS, sides: new Int8Array(UPPER.count) },
          lower: { z: 0, prevZ: Number.NaN, radius: FINGER_RADIUS, sides: new Int8Array(LOWER.count) },
          prevZ: Number.NaN,
        });
      }
      this.pushers.push(row);
    }

    // Fingertip dots: drawn on top so they stay visible inside a bead.
    this.dotIdle = new MeshBasicMaterial({ color: 0xfff3d6, depthTest: false, transparent: true, opacity: 0.95 });
    this.dotContact = new MeshBasicMaterial({ color: 0xffd08a, depthTest: false, transparent: true, opacity: 1 });
    this.dotTouch = new MeshBasicMaterial({ color: 0xffa640, depthTest: false, transparent: true, opacity: 1 });
    const dotGeo = new SphereGeometry(0.007, 12, 8);
    for (const side of HANDS) {
      const dot = new Mesh(dotGeo, this.dotIdle);
      dot.name = `fingertip-${side}`;
      dot.renderOrder = 10;
      dot.visible = false;
      this.world.createTransformEntity(dot, { persistent: true });
      this.dots.push(dot);
    }

    // Progress ring for a calibration hold or a knob hold: closes in on the fingertip.
    this.ringMat = new MeshBasicMaterial({ color: 0xffd08a, depthTest: false, transparent: true, opacity: 0 });
    this.ring = new Mesh(new RingGeometry(0.011, 0.015, 32), this.ringMat);
    this.ring.name = 'hold-ring';
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 11;
    this.ring.visible = false;
    this.world.createTransformEntity(this.ring, { persistent: true });

    // Occluder for the tracked hand: writes depth only, so beads behind the
    // real hand are not drawn and passthrough shows the hand instead.
    this.occluder = new MeshBasicMaterial({ colorWrite: false });

    this.prompt = new TextCard('prompt', {
      widthM: 0.3,
      heightM: 0.07,
      px: 900,
      font: 52,
      background: 'rgba(23,17,12,0.82)',
      color: '#f4ead8',
      accent: '#ffc27a',
    });
    this.prompt.mesh.visible = false;
    this.world.createTransformEntity(this.prompt.mesh, { persistent: true });

    if (flags.test) {
      this.panel = new TextCard('tester-panel', {
        widthM: 0.36,
        heightM: 0.19,
        px: 1080,
        font: 48,
        background: 'rgba(12,16,20,0.88)',
        color: '#e8eef2',
        accent: '#ffc27a',
      });
      this.panel.mesh.visible = false;
      this.world.createTransformEntity(this.panel.mesh, { persistent: true });
      const build = typeof __FADE_BUILD__ === 'string' ? __FADE_BUILD__ : 'dev';
      this.logger = new TouchLogger(
        logSettings(flags.read, flags.depth ? `${flags.hands}+depth` : flags.hands),
        navigator.userAgent,
        build,
      );
    }

    this.placePreview();
    this.exposeDebug();
  }

  update(delta: number, time: number): void {
    this.lastTime = time;
    const vis = this.world.visibilityState.peek();
    if (vis === VisibilityState.NonImmersive) {
      if (this.placement !== 'preview') this.endSession();
      return;
    }
    if (this.placement === 'preview') this.startSession(time);

    this.player.head.getWorldPosition(this.head);
    this.updateForward();

    if (this.placement === 'restoring') {
      if (this.deskAnchor.anchor && this.applyAnchorPose()) {
        this.model.root.visible = true;
        this.placement = 'anchor';
        this.placedAt = time;
        this.followAnchor = true;
        this.listening = false;
        this.placementInfo = { method: 'anchor', savedBy: this.deskAnchor.savedMethod(), ...this.distanceInfo() };
        this.logger?.setPlacement(this.placementInfo);
        this.logger?.event(time, 'placement', this.placementInfo);
      } else if (
        this.deskAnchor.status === 'restore-failed' ||
        this.deskAnchor.status === 'unsupported' ||
        time - this.restoreStart > RESTORE_WAIT_S
      ) {
        this.logger?.event(time, 'anchor-restore', { ok: false, status: this.deskAnchor.status });
        this.placement = 'searching';
        this.searchStart = time;
      }
    } else if (this.placement === 'searching') {
      if (this.head.y >= 0.3) {
        if (this.findDesk()) this.placeAt(this.best, 'desk', time);
        else if (time - this.searchStart > DESK_WAIT_S) this.placeFallback(time);
      }
    } else if (this.placement === 'fallback' && time - this.placedAt < LATE_DESK_S) {
      // Re-place once if a desk shows up shortly after the fallback.
      if (this.findDesk()) this.placeAt(this.best, 'desk', time);
    }

    if (this.followAnchor && this.deskAnchor.anchor) this.applyAnchorPose();

    this.applyHandMode();
    this.simulate(Math.min(delta, 0.05), time);
    this.updateRing();
    this.updatePrompt();
    if (this.panel) this.updateTester(time);
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
    this.guideStep = -1;
    for (const c of this.calibrators) c.reset();
    this.logger?.startSession(time);
    this.logger?.setLabel('free', time);
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
    this.placePreview();
    window.dispatchEvent(new CustomEvent('fade:session-end'));
  }

  // ---------------------------------------------------------------- placement

  private updateForward(): void {
    this.player.head.getWorldDirection(this.forward); // Object3D's +z in world
    this.forward.negate(); // the viewer looks down -z
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
  }

  /**
   * Picks the horizontal plane at desk height closest to where a seated
   * person would want the abacus (in front, within reach). Writes the spot to
   * `this.best`. Returns false if none fits.
   */
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
      if (this.up.y < 0.9) continue; // must face up
      obj.getWorldPosition(this.tmp);
      const height = this.tmp.y;
      const drop = this.head.y - height;
      if (height < 0.4 || drop < 0.2 || drop > 1.2) continue;

      // Ideal spot: in front of the viewer, about 45° below eye level, within reach.
      const reach = Math.min(0.55, Math.max(0.35, drop));
      this.target.copy(this.head).addScaledVector(this.forward, reach);
      this.target.y = height;
      this.local.copy(this.target);
      obj.worldToLocal(this.local);

      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of plane.polygon) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
      const cx = maxX - minX > 2 * DESK_INSET
        ? Math.min(maxX - DESK_INSET, Math.max(minX + DESK_INSET, this.local.x))
        : (minX + maxX) / 2;
      const cz = maxZ - minZ > 2 * DESK_INSET
        ? Math.min(maxZ - DESK_INSET, Math.max(minZ + DESK_INSET, this.local.z))
        : (minZ + maxZ) / 2;
      const miss = Math.hypot(this.local.x - cx, this.local.z - cz);
      if (miss > 0.6) continue; // desk is not where the user is looking
      const isDesk = label === 'table' || label === 'desk';
      const score = miss - (isDesk ? 0.3 : 0);
      if (score < bestScore) {
        bestScore = score;
        this.best.set(cx, 0, cz);
        obj.localToWorld(this.best);
      }
    }
    return bestScore < Number.POSITIVE_INFINITY;
  }

  /**
   * The detected horizontal surface under a world point, nearest in height to
   * `y` (from 35 cm below to 8 cm above; floors and ceilings ignored), as its
   * object and local bounds; null if none.
   */
  private deskPlaneAt(
    x: number,
    y: number,
    z: number,
  ): { obj: Object3D; y: number; minX: number; maxX: number; minZ: number; maxZ: number } | null {
    let best: { obj: Object3D; y: number; minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
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
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of plane.polygon) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
      if (this.tmp.x < minX || this.tmp.x > maxX || this.tmp.z < minZ || this.tmp.z > maxZ) continue;
      best = { obj, y: py, minX, maxX, minZ, maxZ };
    }
    return best;
  }

  private placeAt(point: Vector3, how: Placement, time: number, extra: Record<string, unknown> = {}): void {
    const yaw = Math.atan2(this.head.x - point.x, this.head.z - point.z);
    this.place(point.x, point.y, point.z, yaw, how, time, extra);
  }

  private place(
    x: number,
    y: number,
    z: number,
    yaw: number,
    how: Placement,
    time: number,
    extra: Record<string, unknown> = {},
  ): void {
    const root = this.model.root;
    root.position.set(x, y + 0.001, z);
    // Local +z (the near rail) toward the viewer.
    root.quaternion.setFromAxisAngle(this.yAxis, yaw);
    root.visible = true;
    this.placement = how;
    this.placedAt = time;
    this.followAnchor = false;
    if (how === 'touch') this.listening = false;
    this.placementInfo = { method: how, ...this.distanceInfo(), ...extra };
    this.logger?.setPlacement(this.placementInfo);
    this.logger?.event(time, 'placement', this.placementInfo);

    if (how === 'desk' || how === 'touch') {
      const session = this.xrManager.getSession();
      const space = this.xrManager.getReferenceSpace();
      if (session && space && this.xrFrame) {
        this.deskAnchor.save(session, this.xrFrame, space, x, y + 0.001, z, yaw, how);
        this.followAnchor = true; // follows once the new anchor exists
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
    // No desk: a comfortable spot about 45° below eye level, within reach.
    this.target.copy(this.head).addScaledVector(this.forward, 0.32);
    this.target.y = this.head.y - 0.32;
    this.placeAt(this.target, 'fallback', time);
  }

  private placePreview(): void {
    const root = this.model.root;
    root.position.set(0, 0.74, -0.42);
    root.rotation.set(0, 0, 0);
    root.visible = true;
    this.placement = 'preview';
    this.followAnchor = false;
    this.listening = false;
    for (const dot of this.dots) dot.visible = false;
    this.ring.visible = false;
    this.prompt.mesh.visible = false;
    if (this.panel) this.panel.mesh.visible = false;
  }

  private applyAnchorPose(): boolean {
    const frame = this.xrFrame;
    const space = this.xrManager.getReferenceSpace();
    if (!frame || !space) return false;
    return this.deskAnchor.pose(frame, space, this.model.root.position, this.model.root.quaternion);
  }

  /**
   * A finished tap-and-hold: put the abacus under that hand. Returns false
   * (and changes nothing) when a detected desk shows the finger stopped in the air.
   */
  private calibrateFrom(res: CalibResult, hand: number, time: number): boolean {
    const deskY = res.y - TIP_PAD;
    // With a detected desk under the finger we know where its edges are, so the
    // spot may be pulled in toward the viewer and then kept on the desk.
    // Without one, it stays close to where the finger touched.
    const plane = this.deskPlaneAt(res.x, deskY, res.z);
    if (plane && deskY - plane.y > AIR_TAP) {
      this.logger?.event(time, 'calibration-rejected', {
        hand: HANDS[hand],
        aboveDeskMm: Math.round((deskY - plane.y) * 1000),
      });
      return false;
    }
    const spot = spotFromTouch(
      res.x, deskY, res.z, this.head.x, this.head.y, this.head.z,
      plane ? { ...PLACE, maxPull: Number.POSITIVE_INFINITY } : PLACE,
    );
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
      hand: HANDS[hand],
      deskY: +deskY.toFixed(4),
      spreadMm: +(res.spread * 1000).toFixed(1),
      samples: res.samples,
      planeDeltaMm: plane ? +((plane.y - deskY) * 1000).toFixed(1) : null,
      pulledIn: spot.moved,
      keptOnDesk,
      offsetFromTouchMm: Math.round(Math.hypot(spot.x - res.x, spot.z - res.z) * 1000),
    };
    this.logger?.setCalibration(calib);
    this.logger?.event(time, 'calibrated', calib);
    for (const c of this.calibrators) c.reset();
    this.place(spot.x, spot.y, spot.z, spot.yaw, 'touch', time, { touch: calib });
    click(0.7, 0.6);
    return true;
  }

  private insideFootprint(wx: number, wy: number, wz: number): boolean {
    if (!this.model.root.visible) return false;
    this.tmp.set(wx, wy, wz);
    this.model.inner.worldToLocal(this.tmp);
    return (
      Math.abs(this.tmp.x) < FRAME_HALF_X + RAIL + FOOTPRINT_MARGIN + 0.04 &&
      this.tmp.z > FRAME_Z_MIN - FOOTPRINT_MARGIN &&
      this.tmp.z < FRAME_Z_MAX + FOOTPRINT_MARGIN
    );
  }

  // -------------------------------------------------------------- hands

  /** Applies the ?hands= mode to the SDK's hand visuals once they exist. */
  private applyHandMode(): void {
    if (flags.hands === 'outline') return;
    for (const side of HANDS) {
      const visual = this.input.xr.visualAdapters.hand[side].visual;
      const model = visual?.model as Object3D | undefined;
      if (!model || model.userData.fadeHands === flags.hands) continue;
      model.traverse((o) => {
        const mesh = o as Mesh;
        if (!(mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) return;
        if (mesh.renderOrder === 999) {
          mesh.visible = false; // the white outline
        } else if (flags.hands === 'mask') {
          mesh.material = this.occluder;
          mesh.renderOrder = -10; // before the abacus, so it hides what is behind the hand
        } else {
          mesh.visible = false;
        }
      });
      model.userData.fadeHands = flags.hands;
    }
  }

  // -------------------------------------------------------------- interaction

  private simulate(dt: number, time: number): void {
    const inner = this.model.inner;
    const placed = this.model.root.visible;
    inner.updateWorldMatrix(true, false);

    for (let h = 0; h < HANDS.length; h++) {
      const side = HANDS[h];
      const dot = this.dots[h];
      const row = this.pushers[h];
      const source = this.input.xr.getPrimaryInputSource(side);
      this.calibProgress[h] = 0;
      if (!source) {
        dot.visible = false;
        this.loseHand(h, time);
        continue;
      }
      this.player.indexTipSpaces[side].getWorldPosition(this.tip);
      dot.visible = true;
      dot.position.copy(this.tip);
      this.tipValid[h] = true;

      if (this.listening) {
        const res = this.calibrators[h].push(
          time, this.tip.x, this.tip.y, this.tip.z, this.head.x, this.head.y, this.head.z,
        );
        this.calibProgress[h] = this.calibrators[h].progress;
        if (this.insideFootprint(this.tip.x, this.tip.y, this.tip.z)) this.calibProgress[h] = 0;
        else if (res) {
          if (this.calibrateFrom(res, h, time)) {
            // The abacus moved: this frame's local coordinates are stale.
            inner.updateWorldMatrix(true, false);
          } else {
            this.calibrators[h].reset();
          }
        }
      }

      if (!placed && !this.model.root.visible) {
        this.states[h] = STATE_AWAY;
        dot.material = this.dotIdle;
        continue;
      }

      this.local.copy(this.tip);
      inner.worldToLocal(this.local);
      const lx = this.local.x;
      const ly = this.local.y;
      const lz = this.local.z;
      this.tips[h * 3] = lx;
      this.tips[h * 3 + 1] = ly;
      this.tips[h * 3 + 2] = lz;

      this.updateKnob(h, lx, ly, lz, time);

      const rod = contactRod(lx, ly, this.prevRod[h]);
      const onTop = ly > BEAD_Y;
      let touched = false;
      for (let r = 0; r < RODS; r++) {
        const ps = row[r];
        if (r !== rod) {
          this.releaseRod(ps);
          continue;
        }
        ps.upper.z = ps.lower.z = lz;
        ps.upper.prevZ = ps.lower.prevZ = ps.prevZ;
        const a = push(UPPER, this.upper[r], ps.upper, onTop);
        const b = push(LOWER, this.lower[r], ps.lower, onTop);
        ps.prevZ = lz;
        if (a || b) {
          touched = true;
          this.lastTouch[r] = time;
        }
      }
      if (touched && this.listening && this.placement === 'desk') {
        this.listening = false; // the user accepted the detected spot by using it
      }

      const over =
        Math.abs(lx) < FRAME_HALF_X + RAIL + 0.05 &&
        lz > FRAME_Z_MIN - 0.05 &&
        lz < FRAME_Z_MAX + 0.05 &&
        ly < 0.25;
      const state = touched ? STATE_BEAD : rod >= 0 ? STATE_CONTACT : over ? STATE_HOVER : STATE_AWAY;
      if (this.logger && state !== this.states[h] && (state >= STATE_CONTACT) !== (this.states[h] >= STATE_CONTACT)) {
        this.logger.event(time, state >= STATE_CONTACT ? 'contact-start' : 'contact-end', {
          hand: h,
          rod: state >= STATE_CONTACT ? rod : this.prevRod[h],
          yMm: Math.round(ly * 1000),
        });
      }
      this.states[h] = state;
      dot.material = state === STATE_BEAD ? this.dotTouch : state === STATE_CONTACT ? this.dotContact : this.dotIdle;

      this.updateStroke(h, rod, lz, ly, time);
      this.prevRod[h] = rod;
      if (over) this.logger?.sample(time, h, lx, ly, lz, rod, state);
    }

    for (let r = 0; r < RODS; r++) {
      const u = this.upper[r];
      const l = this.lower[r];
      if (time - this.lastTouch[r] > SETTLE_DELAY_S) {
        settle(UPPER, u, this.scratchU, dt);
        settle(LOWER, l, this.scratchL, dt);
      }
      const phys = readDeck(UPPER, u) * 5 + readDeck(LOWER, l);
      if (phys !== this.physValues[r]) {
        this.logger?.event(time, 'value', { rod: r, from: this.physValues[r], to: phys });
        this.physValues[r] = phys;
      }
      this.show(r, flags.read === 'rest' ? this.restUpper[r] * 5 + this.restLower[r] : phys);
      const beads = this.model.beads[r];
      beads[0].position.z = u[0];
      for (let j = 0; j < LOWER.count; j++) beads[1 + j].position.z = l[j];
    }
  }

  private show(r: number, value: number): void {
    const old = this.shown[r];
    if (value === old) return;
    const up = value >= 5 ? 1 : 0;
    if ((old >= 5 ? 1 : 0) !== up) click(0.8);
    else click(1 + 0.06 * (value - up * 5));
    this.shown[r] = value;
    const mat = this.model.digits[r].material as MeshBasicMaterial;
    mat.map = this.model.digitTextures[value];
  }

  private loseHand(h: number, time: number): void {
    for (let r = 0; r < RODS; r++) this.releaseRod(this.pushers[h][r]);
    this.calibrators[h].reset();
    this.knobSince[h] = -1;
    this.knobArmed[h] = true;
    this.updateStroke(h, -1, 0, 0, time);
    this.prevRod[h] = -1;
    this.states[h] = STATE_AWAY;
    this.tipValid[h] = false;
  }

  private releaseRod(ps: RodPushers): void {
    if (Number.isNaN(ps.prevZ)) return;
    releasePusher(ps.upper);
    releasePusher(ps.lower);
    ps.prevZ = Number.NaN;
  }

  /** Hold a fingertip on the knob to place the abacus somewhere else. */
  private updateKnob(h: number, lx: number, ly: number, lz: number, time: number): void {
    const on = Math.hypot(lx - KNOB_X, lz - KNOB_Z) < KNOB_R + 0.006 && ly < 0.012 + TIP_PAD + 0.015;
    if (!on) {
      this.knobSince[h] = -1;
      this.knobArmed[h] = true;
      return;
    }
    if (!this.knobArmed[h]) return;
    if (this.knobSince[h] < 0) this.knobSince[h] = time;
    const held = time - this.knobSince[h];
    this.calibProgress[h] = Math.max(this.calibProgress[h], Math.min(1, held / KNOB_HOLD_S));
    if (held >= KNOB_HOLD_S) {
      this.knobArmed[h] = false;
      this.requestMove(time);
    }
  }

  private requestMove(time: number): void {
    this.listening = true;
    for (const c of this.calibrators) c.reset();
    this.logger?.event(time, 'move-requested');
    click(0.7, 0.4);
  }

  // ---------------------------------------------------------- rest reader

  /**
   * Reads each rod from where the finger comes to rest (the reader for the
   * faded stages). In "physics" mode it runs in the shadow and only logs.
   */
  private updateStroke(h: number, rod: number, z: number, y: number, time: number): void {
    const s = this.strokes[h];
    if (rod !== s.rod) {
      if (s.rod >= 0) this.commitStroke(h, time);
      s.rod = rod;
      if (rod >= 0) {
        s.startZ = s.lastZ = z;
        s.top = y > BEAD_Y;
        s.stillSince = time;
      }
      return;
    }
    if (rod < 0) return;
    if (Math.abs(z - s.lastZ) > REST_STILL) {
      s.lastZ = z;
      s.stillSince = time;
    } else if (time - s.stillSince > REST_DWELL_S && Math.abs(s.lastZ - s.startZ) >= 0.01) {
      this.commitStroke(h, time);
      s.startZ = s.lastZ;
      s.stillSince = time;
    }
  }

  private commitStroke(h: number, time: number): void {
    const s = this.strokes[h];
    const r = s.rod;
    if (r < 0) return;
    const stroke = { startZ: s.startZ, endZ: s.lastZ, top: s.top };
    const before = this.restUpper[r] * 5 + this.restLower[r];
    if (strokeDeck(s.startZ) === 'upper') {
      this.restUpper[r] = deckAfterStroke(UPPER, FINGER_RADIUS, this.restUpper[r], stroke);
    } else {
      this.restLower[r] = deckAfterStroke(LOWER, FINGER_RADIUS, this.restLower[r], stroke);
    }
    const after = this.restUpper[r] * 5 + this.restLower[r];
    if (after === before) return;
    const phys = readDeck(UPPER, this.upper[r]) * 5 + readDeck(LOWER, this.lower[r]);
    this.logger?.event(time, 'rest-value', {
      rod: r,
      from: before,
      to: after,
      physics: phys,
      startMm: Math.round(s.startZ * 1000),
      endMm: Math.round(s.lastZ * 1000),
      top: s.top,
    });
    if (flags.read === 'rest') {
      // The rest reading is the truth: lay the beads out to match it.
      setCanonical(UPPER, this.restUpper[r], this.upper[r]);
      setCanonical(LOWER, this.restLower[r], this.lower[r]);
    }
  }

  // ---------------------------------------------------------- visuals

  private updateRing(): void {
    const h = this.calibProgress[0] >= this.calibProgress[1] ? 0 : 1;
    const p = this.calibProgress[h];
    if (p < 0.08 || !this.tipValid[h]) {
      this.ring.visible = false;
      return;
    }
    this.dots[h].getWorldPosition(this.tmp);
    this.ring.position.set(this.tmp.x, this.tmp.y - TIP_PAD + 0.001, this.tmp.z);
    this.ring.scale.setScalar(1 + (1 - p) * 1.6);
    this.ringMat.opacity = 0.35 + 0.65 * p;
    this.ring.visible = true;
  }

  private updatePrompt(): void {
    const card = this.prompt.mesh;
    if (!this.listening || this.placement === 'restoring') {
      card.visible = false;
      return;
    }
    const placed = this.model.root.visible && this.placement !== 'fallback';
    this.prompt.set(
      placed
        ? ['Tap the desk to move it there,', '!or start sliding beads']
        : ['Tap your desk where you want it', '!and hold your fingertip still'],
    );
    this.placeCard(card, placed ? 0 : null, -0.17, 0.09);
    card.visible = true;
  }

  /**
   * Puts a card behind the abacus (root frame x, z, height y), tilted toward
   * the viewer; with `x === null`, floats it in front of the viewer instead.
   */
  private placeCard(card: Mesh, x: number | null, z: number, y: number): void {
    const root = this.model.root;
    if (x !== null) {
      this.tmp.set(x, y, z);
      root.localToWorld(this.tmp);
      card.position.copy(this.tmp);
      this.tilt.setFromAxisAngle(this.xAxis, -0.55);
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

  private updateTester(time: number): void {
    const panel = this.panel!;
    const placed = this.model.root.visible;
    // Guided steps start a few seconds after the abacus is first placed.
    if (placed && this.guideStart < 0) this.guideStart = time + GUIDE_DELAY_S;
    let stepLine: [string, string] = ['', ''];
    if (!flags.guide) {
      stepLine = ['Free play (guided steps off)', ''];
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
        stepLine = ['!Done. Free play: slide some beads.', 'Then leave the immersive view.'];
      } else if (t < GUIDE_PREP_S) {
        this.logger?.setLabel('prep', time);
        stepLine = [`!Next (${i + 1}/${GUIDE.length}): ${GUIDE[i].text[0]}`, GUIDE[i].text[1]];
      } else {
        this.logger?.setLabel(GUIDE[i].label, time);
        const left = Math.ceil(GUIDE[i].seconds - (t - GUIDE_PREP_S));
        stepLine = [`!Step ${i + 1}/${GUIDE.length} (${left}s): ${GUIDE[i].text[0]}`, GUIDE[i].text[1]];
      }
      this.guideStep = i;
    } else if (!placed) {
      stepLine = ['!Tap the desk where you want the abacus', 'and hold your fingertip still'];
    } else {
      stepLine = ['!Get ready: a short guided test starts soon', ''];
    }

    if (time - this.panelAt > 0.12) {
      this.panelAt = time;
      const hand = (h: number) => {
        if (!this.tipValid[h]) return '--';
        const y = Math.round(this.tips[h * 3 + 1] * 1000);
        const rod = this.prevRod[h];
        return `${y} mm ${STATE_NAMES[this.states[h]].toUpperCase()}${rod >= 0 ? ` rod ${rod + 1}` : ''}`;
      };
      const rest = Array.from({ length: RODS }, (_, r) => this.restUpper[r] * 5 + this.restLower[r]).join(' ');
      panel.set([
        `TEST  ${this.placement}  anchor ${this.deskAnchor.status}  read ${flags.read}`,
        `R ${hand(1)}   L ${hand(0)}`,
        `beads ${Array.from(this.physValues).join(' ')}   rest ${rest}`,
        stepLine[0],
        stepLine[1],
        `log ${this.logger?.sampleCount ?? 0} samples. Leave the view to download.`,
      ]);
    }
    if (placed) this.placeCard(panel.mesh, 0, -0.2, 0.2);
    else this.placeCard(panel.mesh, null, 0, 0);
    if (!placed) panel.mesh.position.y += 0.1;
    panel.mesh.visible = true;
  }

  // -------------------------------------------------------------------- debug

  private exposeDebug(): void {
    const self = this;
    const debug: FadeDebug = {
      get placement() {
        return self.placement;
      },
      get listening() {
        return self.listening;
      },
      get values() {
        return Array.from(self.physValues);
      },
      get restValues() {
        return Array.from({ length: RODS }, (_, r) => self.restUpper[r] * 5 + self.restLower[r]);
      },
      get touching() {
        return [self.states[0] === STATE_BEAD, self.states[1] === STATE_BEAD];
      },
      get states() {
        return Array.from(self.states, (s) => STATE_NAMES[s]);
      },
      get rods() {
        return Array.from(self.prevRod);
      },
      get tips() {
        return [0, 1].map((h) =>
          self.tipValid[h]
            ? ([self.tips[h * 3], self.tips[h * 3 + 1], self.tips[h * 3 + 2]] as [number, number, number])
            : null,
        );
      },
      get anchorStatus() {
        return self.deskAnchor.status;
      },
      get placementInfo() {
        return self.placementInfo;
      },
      readMode: flags.read,
      handMode: flags.depth ? `${flags.hands}+depth` : flags.hands,
      rodPoint(rod, z, y) {
        return debug.layoutPoint(rodX(rod), z, y);
      },
      layoutPoint(x, z, y) {
        const v = new Vector3(x, y, z);
        self.model.inner.updateWorldMatrix(true, false);
        self.model.inner.localToWorld(v);
        return [v.x, v.y, v.z];
      },
      beadCenter(rod, bead) {
        return bead === 0 ? self.upper[rod][0] : self.lower[rod][bead - 1];
      },
      planes() {
        return Array.from(self.queries.planes.entities, (e) => {
          const plane = e.getValue(XRPlaneComponent, '_plane') as XRPlane;
          const pos = new Vector3();
          e.object3D?.getWorldPosition(pos);
          const xs = plane.polygon.map((p) => p.x);
          const zs = plane.polygon.map((p) => p.z);
          return {
            label: (plane as unknown as { semanticLabel?: string }).semanticLabel ?? '',
            orientation: plane.orientation,
            x: +pos.x.toFixed(3),
            y: +pos.y.toFixed(3),
            z: +pos.z.toFixed(3),
            yawDeg: e.object3D ? +((e.object3D.rotation.y * 180) / Math.PI).toFixed(1) : 0,
            w: +(Math.max(...xs) - Math.min(...xs)).toFixed(2),
            d: +(Math.max(...zs) - Math.min(...zs)).toFixed(2),
          };
        });
      },
      layout: {
        upper: UPPER,
        lower: LOWER,
        beadY: BEAD_Y,
        beadTop: BEAD_TOP,
        surface: SURFACE,
        tipPad: TIP_PAD,
        contact: CONTACT,
        knob: [KNOB_X, KNOB_Z],
        frame: [FRAME_HALF_X + RAIL, FRAME_Z_MIN, FRAME_Z_MAX],
      },
      logSamples: () => self.logger?.sampleCount ?? 0,
      exportLog: () => self.logger?.toJSON() ?? null,
      summary: () => (self.logger ? analyseLog(self.logger.log) : null),
      setLabel(label) {
        if (self.logger && (LABELS as readonly string[]).includes(label)) {
          self.logger.setLabel(label as Label, self.lastTime);
        }
      },
      requestMove() {
        self.requestMove(self.lastTime);
      },
    };
    (window as unknown as { __fade: FadeDebug }).__fade = debug;
  }
}

