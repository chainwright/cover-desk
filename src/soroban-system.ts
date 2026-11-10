/**
 * Places the soroban on a detected desk (or at a comfortable fallback spot),
 * shows a dot on each index fingertip, moves beads when a fingertip pushes or
 * drags them, and shows each rod's value.
 */
import {
  createSystem,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  VisibilityState,
  XRPlane as XRPlaneComponent,
} from '@iwsdk/core';
import {
  push,
  readDeck,
  releasePusher,
  setCanonical,
  settle,
  type Pusher,
} from './bead-physics.js';
import { click } from './click-sound.js';
import {
  BEAD_RADIUS,
  BEAD_TOP,
  BEAD_Y,
  FINGER_RADIUS,
  FRAME_Z_MAX,
  FRAME_Z_MIN,
  LOWER,
  RODS,
  UPPER,
  rodX,
} from './soroban-layout.js';
import { buildSoroban, type SorobanModel } from './soroban-model.js';

const HANDS = ['left', 'right'] as const;
/** How long to wait for a desk plane before using the fallback spot. */
const DESK_WAIT_S = 2.5;
/** After a fallback, a desk found within this window still wins (once). */
const LATE_DESK_S = 10;
/** Beads settle into a clean state this long after the last touch. */
const SETTLE_DELAY_S = 0.12;
/** Inset from desk edges so the whole frame stays on the desk. */
const DESK_INSET = (FRAME_Z_MAX - FRAME_Z_MIN) / 2 + 0.01;

interface RodPushers {
  upper: Pusher;
  lower: Pusher;
  prevZ: number;
}

export type Placement = 'preview' | 'searching' | 'desk' | 'fallback';

/** Read-only state for tests and the emulator walkthrough. */
export interface FadeDebug {
  placement: Placement;
  values: number[];
  touching: boolean[];
  /** World position of a point in the abacus layout frame (x = rod centre). */
  rodPoint(rod: number, z: number, y: number): [number, number, number];
  beadCenter(rod: number, bead: number): number;
  /** Detected planes: semantic label, orientation, world height, size. */
  planes(): { label: string; orientation: string; x: number; y: number; z: number; yawDeg: number; w: number; d: number }[];
  layout: { upper: typeof UPPER; lower: typeof LOWER; beadY: number; beadTop: number };
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
  private values = new Int8Array(RODS);
  private dots: Mesh[] = [];
  private dotIdle!: MeshBasicMaterial;
  private dotTouch!: MeshBasicMaterial;
  private placement: Placement = 'preview';
  private searchStart = 0;
  private placedAt = 0;
  private touching = [false, false];

  private head = new Vector3();
  private forward = new Vector3();
  private target = new Vector3();
  private best = new Vector3();
  private tmp = new Vector3();
  private up = new Vector3();
  private tip = new Vector3();
  private local = new Vector3();

  init(): void {
    this.model = buildSoroban();
    this.world.createTransformEntity(this.model.root, { persistent: true });

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

    this.placePreview();
    this.exposeDebug();
  }

  update(delta: number, time: number): void {
    const vis = this.world.visibilityState.peek();
    if (vis === VisibilityState.NonImmersive) {
      if (this.placement !== 'preview') this.placePreview();
      return;
    }
    if (this.placement === 'preview') {
      this.placement = 'searching';
      this.searchStart = time;
      this.model.root.visible = false;
    }

    this.player.head.getWorldPosition(this.head);
    if (this.placement === 'searching') {
      if (this.head.y < 0.3) return; // no viewer pose yet
      this.updateForward();
      if (this.findDesk()) this.place(this.best, 'desk', time);
      else if (time - this.searchStart > DESK_WAIT_S) this.placeFallback(time);
      else return;
    } else if (this.placement === 'fallback' && time - this.placedAt < LATE_DESK_S) {
      // Re-place once if a desk shows up shortly after the fallback.
      this.updateForward();
      if (this.findDesk()) this.place(this.best, 'desk', time);
    }

    this.simulate(Math.min(delta, 0.05), time);
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

  private place(point: Vector3, how: Placement, time: number): void {
    const root = this.model.root;
    root.position.copy(point);
    root.position.y += 0.001;
    // Local +z (the near rail) toward the viewer.
    root.rotation.set(0, Math.atan2(this.head.x - point.x, this.head.z - point.z), 0);
    root.visible = true;
    this.placement = how;
    this.placedAt = time;
  }

  private placeFallback(time: number): void {
    // No desk: a comfortable spot about 45° below eye level, within reach.
    this.target.copy(this.head).addScaledVector(this.forward, 0.45);
    this.target.y = this.head.y - 0.45;
    this.place(this.target, 'fallback', time);
  }

  private placePreview(): void {
    const root = this.model.root;
    root.position.set(0, 0.74, -0.42);
    root.rotation.set(0, 0, 0);
    root.visible = true;
    this.placement = 'preview';
    for (const dot of this.dots) dot.visible = false;
  }

  // -------------------------------------------------------------- interaction

  private simulate(dt: number, time: number): void {
    const inner = this.model.inner;
    inner.updateWorldMatrix(true, false);

    for (let h = 0; h < HANDS.length; h++) {
      const side = HANDS[h];
      const dot = this.dots[h];
      const row = this.pushers[h];
      const source = this.input.xr.getPrimaryInputSource(side);
      let touching = false;
      if (!source) {
        dot.visible = false;
        for (let r = 0; r < RODS; r++) this.releaseRod(row[r]);
        this.touching[h] = false;
        continue;
      }
      this.player.indexTipSpaces[side].getWorldPosition(this.tip);
      dot.visible = true;
      dot.position.copy(this.tip);

      this.local.copy(this.tip);
      inner.worldToLocal(this.local);
      const y = this.local.y;
      const inHeight = y > -0.03 && y < BEAD_TOP + FINGER_RADIUS + 0.004;
      const onTop = y > BEAD_Y;
      for (let r = 0; r < RODS; r++) {
        const ps = row[r];
        const inBand = inHeight && Math.abs(this.local.x - rodX(r)) < BEAD_RADIUS + FINGER_RADIUS * 0.25;
        if (!inBand) {
          this.releaseRod(ps);
          continue;
        }
        ps.upper.z = ps.lower.z = this.local.z;
        ps.upper.prevZ = ps.lower.prevZ = ps.prevZ;
        const a = push(UPPER, this.upper[r], ps.upper, onTop);
        const b = push(LOWER, this.lower[r], ps.lower, onTop);
        ps.prevZ = this.local.z;
        if (a || b) {
          touching = true;
          this.lastTouch[r] = time;
        }
      }
      dot.material = touching ? this.dotTouch : this.dotIdle;
      this.touching[h] = touching;
    }

    for (let r = 0; r < RODS; r++) {
      const u = this.upper[r];
      const l = this.lower[r];
      if (time - this.lastTouch[r] > SETTLE_DELAY_S) {
        settle(UPPER, u, this.scratchU, dt);
        settle(LOWER, l, this.scratchL, dt);
      }
      const up = readDeck(UPPER, u);
      const low = readDeck(LOWER, l);
      const value = up * 5 + low;
      const old = this.values[r];
      if (value !== old) {
        if ((old >= 5 ? 1 : 0) !== up) click(0.8);
        else click(1 + 0.06 * low);
        this.values[r] = value;
        const mat = this.model.digits[r].material as MeshBasicMaterial;
        mat.map = this.model.digitTextures[value];
      }
      const beads = this.model.beads[r];
      beads[0].position.z = u[0];
      for (let j = 0; j < LOWER.count; j++) beads[1 + j].position.z = l[j];
    }
  }

  private releaseRod(ps: RodPushers): void {
    if (Number.isNaN(ps.prevZ)) return;
    releasePusher(ps.upper);
    releasePusher(ps.lower);
    ps.prevZ = Number.NaN;
  }

  // -------------------------------------------------------------------- debug

  private exposeDebug(): void {
    const self = this;
    const debug: FadeDebug = {
      get placement() {
        return self.placement;
      },
      get values() {
        return Array.from(self.values);
      },
      get touching() {
        return self.touching.slice();
      },
      rodPoint(rod, z, y) {
        const v = new Vector3(rodX(rod), y, z);
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
      layout: { upper: UPPER, lower: LOWER, beadY: BEAD_Y, beadTop: BEAD_TOP },
    };
    (window as unknown as { __fade: FadeDebug }).__fade = debug;
  }
}
