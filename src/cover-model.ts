/**
 * Everything drawn on the board, built in code: one material family (felt,
 * paper, turned wood), no textures, no files to load.
 *
 *  - the lantern-keeper (turned wood, felt nightcap) and its paper lantern
 *  - the light pool: the lantern's light on the desk, with the hand's shadow
 *    cut out of it, drawn from the light map (light-map.ts)
 *  - the felt creature, its nook, its trinket, the path as paper dots
 *  - markers for registered real objects, a move knob, a ghost hand that shows
 *    the "stop" palm in the first seconds
 *  - level 2 (day 6): the keeper's gaze, a pale wedge from the lantern across
 *    the middle of the path, and a ghost mug where a real object should stand
 */
import {
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  AlwaysStencilFunc,
  ReplaceStencilOp,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Group,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RGBAFormat,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  UnsignedByteType,
  BoxGeometry,
  TorusGeometry,
} from '@iwsdk/core';
import { BOARD, TEACH_SPOT, type Level } from './level.ts';
import { MAP_COLS, MAP_MIN_D, MAP_ROWS } from './light-map.ts';
import { REGISTER } from './contact.ts';
import { GAZE_HALF, MUG_SPOT } from './level2.ts';
import type { Lantern, Occluders } from './sightline.ts';

export const PATH_DOTS = 26;
export const MAX_OBJECT_MARKERS = 4;
/** A unit-high column of the registration footprint, base at y = 0 (scaled to each object's top). */
const OBJECT_COLUMN = new CylinderGeometry(REGISTER.radius, REGISTER.radius, 1, 32).translate(0, 0.5, 0);
/** Writes depth only: virtual things behind a registered real object are not drawn (passthrough shows the object). */
export const OBJECT_OCCLUDER = new MeshBasicMaterial({ colorWrite: false });
/**
 * /emu/ has no real object: the emulated one is drawn as an opaque paper mug with a handle instead (day 8:
 * it was a 60 % pale column that read as a glass). Built on first use and only reached when the build is
 * the /emu/ one (`__COVER_EMU__`) and the emulator runs, so the main build carries none of it: the build's
 * dist check fails if the material's name turns up in the main bundle (an outside run made the main build
 * draw the paper mug over a real one and nothing noticed).
 */
export const EMU_MUG_NAME = 'cover-emu-paper-mug';
let emuMugMat: MeshStandardMaterial | null = null;
export function dressEmulatedMug(marker: Group, top: number): void {
  emuMugMat ??= Object.assign(new MeshStandardMaterial({ color: 0xf1e4c8, roughness: 0.85, metalness: 0 }), { name: EMU_MUG_NAME });
  const column = marker.getObjectByName('occluder') as Mesh;
  column.material = emuMugMat;
  let handle = marker.getObjectByName('emu-mug-handle') as Mesh | undefined;
  if (!handle) {
    handle = new Mesh(new TorusGeometry(0.02, 0.0055, 10, 24, Math.PI), emuMugMat);
    handle.name = 'emu-mug-handle';
    handle.rotation.z = -Math.PI / 2; // a half ring standing on the mug's right side
    handle.position.x = REGISTER.radius - 0.002;
    marker.add(handle);
  }
  handle.position.y = top * 0.55;
  handle.visible = true;
}
export { WIN_BEADS } from './feedback.ts';
import { WIN_BEADS } from './feedback.ts';
export { KNOB } from './level.ts';
import { KNOB } from './level.ts';

const FELT = (color: number) => new MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
const WOOD = (color: number) => new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 });
const PAPER = (color: number) => new MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });

export interface Creature {
  root: Group;
  body: Mesh;
  bodyMat: MeshStandardMaterial;
  /** Chief 12.11: every felt material of the creature with its base colour (dimmed in the dark). */
  mats: { m: MeshStandardMaterial; base: Color }[];
  /** Two small glints in its eyes, shown in the dark ("two eyes under your palm"). */
  glintMat: MeshBasicMaterial;
}

export interface CoverModel {
  /** Board root: placed on the desk, +z toward the user. */
  root: Group;
  pool: Mesh;
  poolMat: ShaderMaterial;
  shadowTex: DataTexture;
  keeper: Group;
  /** The keeper's eyes: thin closed slits; scaled up in y when it wakes. */
  keeperEyes: Mesh[];
  /** A thin line of light from the lantern to the creature while the keeper stares at it (spotted). */
  beam: Mesh;
  lanternGlow: MeshStandardMaterial;
  creature: Creature;
  trinket: Group;
  nook: Mesh;
  pathDots: InstancedMesh;
  objectMarkers: Group[];
  /** One brass bead per win along the near edge (up to WIN_BEADS). */
  winBeads: InstancedMesh;
  /** Sets bead i's scale (the newest one pops in after a win); i < 0 does nothing. */
  setBead(i: number, scale: number): void;
  knob: Mesh;
  ghostHand: Group;
  ghostMat: MeshBasicMaterial;
  proxyDots: InstancedMesh;
  /** Level 2: the keeper's gaze (a pale wedge with brighter edges), hidden until level 2 is unlocked. */
  gaze: Group;
  /** Level 2: an outline where the real object should stand. */
  mugGhost: Group;
}

export function buildCover(level: Level, mapData: Uint8Array): CoverModel {
  const root = new Group();
  root.name = 'cover-board';

  // ------------------------------------------------------------ light pool
  const lantern = level.lanterns[0];
  const shadowTex = new DataTexture(mapData, MAP_COLS, MAP_ROWS, RGBAFormat, UnsignedByteType);
  shadowTex.magFilter = LinearFilter;
  shadowTex.minFilter = LinearFilter;
  shadowTex.needsUpdate = true;
  const poolMat = new ShaderMaterial({
    uniforms: {
      tMap: { value: shadowTex },
      uL: { value: [lantern.x, lantern.z] },
      uYaw: { value: lantern.yaw },
      uHalf: { value: lantern.half },
      uMinD: { value: MAP_MIN_D },
      uRange: { value: lantern.range },
      uWarm: { value: new Color(0xffc46b) },
      // Day 8 (outside review: the lane read weakly): the shade goes nearly black and is drawn denser, and
      // the shadow's edge gets a pale line. Visual only: the light map and the sight test are unchanged.
      uShade: { value: new Color(0x06070d) },
      uRim: { value: new Color(0xfff0d0) },
      uFlicker: { value: 1 },
      uFlare: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tMap;
      uniform vec2 uL;
      uniform float uYaw, uHalf, uMinD, uRange, uFlicker, uFlare;
      uniform vec3 uWarm, uShade, uRim;
      varying vec2 vPos;
      void main() {
        vec2 r = vPos - uL;
        float d = length(r);
        float az = atan(r.x, r.y) - uYaw;
        az = mod(az + 3.14159265, 6.2831853) - 3.14159265;
        float u = (az + uHalf) / (2.0 * uHalf);
        float v = (d - uMinD) / (uRange - uMinD);
        if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) discard;
        float raw = texture2D(tMap, vec2(u, v)).r;
        float lit = smoothstep(0.3, 0.7, raw);
        float edge = smoothstep(1.0, 0.8, abs(az) / uHalf) * smoothstep(1.0, 0.72, v) * smoothstep(0.0, 0.08, v);
        float fall = clamp(0.16 / (0.1 + d), 0.0, 1.0);
        vec3 col = mix(uShade, uWarm * (1.0 + uFlare), lit);
        // Chief 12.11: over the erased light only a faint warm wash (the real desk shows through); the lane gets
        // a little extra dark on top of the night so it still reads.
        float a = edge * mix(0.45, min(0.4, 0.2 * fall * uFlicker * (1.0 + uFlare)), lit);
        // the lane's edge: a pale line where the light map crosses from lit to shade
        float rim = (1.0 - smoothstep(0.12, 0.3, abs(raw - 0.5))) * edge * clamp(1.0 + uFlare, 0.3, 1.0);
        col = mix(col, uRim, rim);
        a = max(a, rim * 0.95);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const poolGeo = sectorGeometry(lantern, 48, 12);
  // Chief 12.11 (judges: "light must reveal the real desk, not paint over it"): the night dome (ambience.ts)
  // darkens the room except where this pass marks the stencil: the lit cells of the light map (dithered edge).
  // So in the light the real desk and the real hand show at full brightness, and the shade is the real desk
  // left in the dark. Works the same in passthrough and in the emulator's simulated room.
  const eraseMat = new ShaderMaterial({
    uniforms: poolMat.uniforms,
    vertexShader: poolMat.vertexShader,
    fragmentShader: /* glsl */ `
      uniform sampler2D tMap;
      uniform vec2 uL;
      uniform float uYaw, uHalf, uMinD, uRange, uFlicker, uFlare;
      varying vec2 vPos;
      void main() {
        vec2 r = vPos - uL;
        float d = length(r);
        float az = atan(r.x, r.y) - uYaw;
        az = mod(az + 3.14159265, 6.2831853) - 3.14159265;
        float u = (az + uHalf) / (2.0 * uHalf);
        float v = (d - uMinD) / (uRange - uMinD);
        if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) discard;
        float lit = smoothstep(0.3, 0.7, texture2D(tMap, vec2(u, v)).r);
        float edge = smoothstep(1.0, 0.75, abs(az) / uHalf) * smoothstep(1.0, 0.6, v) * smoothstep(0.0, 0.08, v);
        float fall = clamp(0.22 / (0.12 + d), 0.0, 1.0);
        float a = clamp(lit * edge * (0.55 + 0.45 * fall) * uFlicker * (1.0 + uFlare), 0.0, 1.0);
        if (a < 0.3) discard; // the hole's edge; the warm wash on top softens it
        gl_FragColor = vec4(0.0);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    colorWrite: false,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: AlwaysStencilFunc,
    stencilZPass: ReplaceStencilOp,
  });
  const erase = new Mesh(poolGeo, eraseMat);
  erase.name = 'light-erase';
  erase.position.y = 0.0012;
  erase.renderOrder = -30; // before the night dome (-20)
  root.add(erase);
  const pool = new Mesh(poolGeo, poolMat);
  pool.name = 'light-pool';
  pool.position.y = 0.0015;
  pool.renderOrder = 1;
  root.add(pool);

  // ------------------------------------------------------------ keeper + lantern
  const keeper = new Group();
  keeper.name = 'lantern-keeper';
  const k = level.keepers[0];
  keeper.position.set(k.x, 0, k.z);
  const wood = WOOD(0xb98a5a);
  const darkWood = WOOD(0x6b4a30);
  const body = new Mesh(new CylinderGeometry(0.015, 0.021, 0.048, 24), wood);
  body.position.y = 0.024;
  const collar = new Mesh(new CylinderGeometry(0.017, 0.017, 0.004, 24), darkWood);
  collar.position.y = 0.049;
  const head = new Mesh(new SphereGeometry(0.016, 24, 16), wood);
  head.position.y = 0.064;
  const cap = new Mesh(new ConeGeometry(0.016, 0.03, 20), FELT(0x3f5a7a));
  cap.position.set(0.004, 0.086, 0);
  cap.rotation.z = -0.5;
  const pom = new Mesh(new SphereGeometry(0.005, 12, 8), FELT(0xefe6d2));
  pom.position.set(0.016, 0.097, 0);
  const eyeMat = new MeshBasicMaterial({ color: 0x2a1d14 });
  const keeperEyes: Mesh[] = [];
  for (const sx of [-1, 1]) {
    const eye = new Mesh(new BoxGeometry(0.006, 0.0012, 0.001), eyeMat); // sleepy, closed
    eye.position.set(sx * 0.006, 0.066, 0.0158);
    keeper.add(eye);
    keeperEyes.push(eye);
  }
  keeper.add(body, collar, head, cap, pom);
  root.add(keeper);

  const post = new Mesh(new CylinderGeometry(0.0025, 0.0035, lantern.y - 0.008, 10), darkWood);
  post.position.set(lantern.x, (lantern.y - 0.008) / 2, lantern.z);
  const lanternGlow = new MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffb050, emissiveIntensity: 1.6, roughness: 0.9 });
  const lamp = new Mesh(new CylinderGeometry(0.009, 0.009, 0.016, 16), lanternGlow);
  lamp.position.set(lantern.x, lantern.y, lantern.z);
  const lid = new Mesh(new ConeGeometry(0.012, 0.008, 16), darkWood);
  lid.position.set(lantern.x, lantern.y + 0.012, lantern.z);
  root.add(post, lamp, lid);

  // The keeper's stare: a 1.2 mm line of warm light, unit length along +y, stretched and aimed by the system.
  const beamGeo = new CylinderGeometry(0.0006, 0.0006, 1, 6);
  beamGeo.translate(0, 0.5, 0);
  const beam = new Mesh(beamGeo, new MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.85, depthWrite: false }));
  beam.name = 'keeper-stare';
  beam.position.set(lantern.x, lantern.y, lantern.z);
  beam.visible = false;
  root.add(beam);

  // ------------------------------------------------------------ path, nook, trinket
  const r = level.route;
  const dotMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const dotGeo = new CircleGeometry(0.0035, 14);
  dotGeo.rotateX(-Math.PI / 2);
  const pathDots = new InstancedMesh(dotGeo, dotMat, PATH_DOTS);
  pathDots.name = 'path-dots';
  pathDots.position.y = 0.002;
  pathDots.renderOrder = 2;
  root.add(pathDots); // positions set by the system (it owns the Route)

  const nook = new Mesh(new SphereGeometry(0.028, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), FELT(0x4f6b45));
  nook.name = 'nook';
  nook.position.set(r[0] - 0.012, 0, r[1]);
  nook.scale.set(1, 0.9, 1);
  const door = new Mesh(new CircleGeometry(0.012, 20, 0, Math.PI), FELT(0x1e2418));
  door.position.set(0.0285, 0, 0);
  door.rotation.y = Math.PI / 2;
  nook.add(door);
  root.add(nook);

  const trinket = new Group();
  trinket.name = 'trinket';
  const n = r.length;
  trinket.position.set(r[n - 2] + 0.008, 0, r[n - 1]);
  const mat = new Mesh(new CircleGeometry(0.016, 24), PAPER(0xf1e6cf));
  mat.rotation.x = -Math.PI / 2;
  mat.position.y = 0.001;
  const brass = new MeshStandardMaterial({ color: 0xd9a441, roughness: 0.35, metalness: 0.6 });
  const top = new Mesh(new ConeGeometry(0.008, 0.012, 20), brass);
  top.rotation.x = Math.PI;
  top.position.y = 0.007;
  const spindle = new Mesh(new CylinderGeometry(0.0015, 0.0015, 0.008, 8), darkWood);
  spindle.position.y = 0.016;
  trinket.add(mat, top, spindle);
  root.add(trinket);

  // ------------------------------------------------------------ creature
  const creature = buildCreature();
  root.add(creature.root);

  // ------------------------------------------------------------ registered objects
  const objectMarkers: Group[] = [];
  const paper = PAPER(0xf3ead6);
  for (let i = 0; i < MAX_OBJECT_MARKERS; i++) {
    const g = new Group();
    g.name = `object-${i}`;
    const foot = new Mesh(new RingGeometry(REGISTER.radius - 0.004, REGISTER.radius, 40), paper);
    foot.rotation.x = -Math.PI / 2;
    foot.position.y = 0.002;
    const topRing = new Mesh(new RingGeometry(0.012, 0.016, 24), FELT(0xffb050));
    topRing.rotation.x = -Math.PI / 2;
    topRing.name = 'top';
    // Day 7: a depth-only column where the real object stands (its footprint, up to the touched top), drawn
    // first, so the real mug hides the virtual keeper, light and path behind it in passthrough (as the hand
    // mask does for the hand). The system scales it to the object's height; in /emu/ it is drawn visibly.
    const occluder = new Mesh(OBJECT_COLUMN, OBJECT_OCCLUDER);
    occluder.name = 'occluder';
    occluder.renderOrder = -5;
    g.add(foot, topRing, occluder);
    g.visible = false;
    root.add(g);
    objectMarkers.push(g);
  }

  // ------------------------------------------------------------ win tally
  const winBeads = new InstancedMesh(new SphereGeometry(0.0045, 12, 8), new MeshStandardMaterial({ color: 0xd9a441, roughness: 0.35, metalness: 0.6 }), WIN_BEADS);
  winBeads.name = 'win-beads';
  winBeads.count = 0;
  winBeads.frustumCulled = false;
  const bead = new Matrix4();
  const beadX = (i: number) => r[0] + 0.004 + i * 0.013;
  for (let i = 0; i < WIN_BEADS; i++) setInstance(winBeads, i, beadX(i), 0.0045, BOARD.zMax - 0.02, 1, bead);
  root.add(winBeads);
  const beadScale = new Float32Array(WIN_BEADS).fill(1);
  const setBead = (i: number, scale: number) => {
    if (i < 0 || i >= WIN_BEADS || beadScale[i] === scale) return;
    beadScale[i] = scale;
    setInstance(winBeads, i, beadX(i), 0.0045 * scale, BOARD.zMax - 0.02, scale, bead);
    winBeads.instanceMatrix.needsUpdate = true;
  };

  // ------------------------------------------------------------ move knob
  const knob = new Mesh(new CylinderGeometry(KNOB.r, KNOB.r, 0.01, 20), darkWood);
  knob.name = 'move-knob';
  knob.position.set(KNOB.x, 0.005, KNOB.z);
  root.add(knob);

  // ------------------------------------------------------------ ghost hand (teaches the "stop" palm)
  const ghostMat = new MeshBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.35, depthWrite: false, side: DoubleSide });
  const ghostHand = buildGhostHand(ghostMat);
  ghostHand.position.set(TEACH_SPOT.x, 0, TEACH_SPOT.z);
  root.add(ghostHand);

  // ------------------------------------------------------------ cover proxy (debug)
  const proxyDots = new InstancedMesh(
    new SphereGeometry(1, 10, 6),
    new MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.35, depthWrite: false }),
    50,
  );
  proxyDots.name = 'hand-proxy';
  proxyDots.count = 0;
  proxyDots.frustumCulled = false;
  root.add(proxyDots);

  // ------------------------------------------------------------ level 2: the gaze and the ghost mug
  const gaze = new Group();
  gaze.name = 'keeper-gaze';
  const gazeReach = { ...lantern, half: GAZE_HALF, range: 0.19 };
  const gazeFill = new Mesh(sectorGeometry(gazeReach, 8, 4), new MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide }));
  const edgeMat = new MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.7, depthWrite: false, side: DoubleSide });
  for (const sign of [-1, 1]) gaze.add(new Mesh(sectorGeometry({ ...gazeReach, yaw: lantern.yaw + sign * GAZE_HALF, half: 0.006 }, 1, 4), edgeMat));
  gaze.add(gazeFill);
  gaze.position.y = 0.0022;
  gaze.renderOrder = 3;
  gaze.visible = false;
  root.add(gaze);
  const mugGhost = new Group();
  mugGhost.name = 'mug-ghost';
  const mugRing = new Mesh(new RingGeometry(REGISTER.radius - 0.003, REGISTER.radius, 40), edgeMat);
  mugRing.rotation.x = -Math.PI / 2;
  mugRing.position.y = 0.0025;
  const mugWall = new Mesh(new CylinderGeometry(REGISTER.radius, REGISTER.radius, 0.09, 32, 1, true), new MeshBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.12, depthWrite: false, side: DoubleSide }));
  mugWall.position.y = 0.045;
  mugGhost.add(mugRing, mugWall);
  mugGhost.position.set(MUG_SPOT.x, 0, MUG_SPOT.z);
  mugGhost.visible = false;
  root.add(mugGhost);

  return {
    root, pool, poolMat, shadowTex, keeper, keeperEyes, beam, lanternGlow, creature, trinket, nook, pathDots,
    objectMarkers, winBeads, setBead, knob, ghostHand, ghostMat, proxyDots, gaze, mugGhost,
  };
}

function buildCreature(): Creature {
  const root = new Group();
  root.name = 'creature';
  const bodyMat = FELT(0xd2764b);
  const body = new Mesh(new SphereGeometry(0.0115, 24, 16), bodyMat);
  body.scale.set(1, 0.9, 1.15);
  body.position.y = 0.012;
  const belly = new Mesh(new SphereGeometry(0.0072, 16, 10), FELT(0xf0d2b0));
  belly.position.set(0, 0.0105, 0.0072);
  const earMat = FELT(0xa8553a);
  for (const sx of [-1, 1]) {
    const ear = new Mesh(new ConeGeometry(0.004, 0.009, 12), earMat);
    ear.position.set(sx * 0.0055, 0.0235, -0.001);
    ear.rotation.z = -sx * 0.35;
    root.add(ear);
    const eye = new Mesh(new SphereGeometry(0.0017, 10, 6), new MeshBasicMaterial({ color: 0x1a120c }));
    eye.position.set(sx * 0.0045, 0.0155, 0.0115);
    root.add(eye);
    const foot = new Mesh(new SphereGeometry(0.0032, 10, 6), earMat);
    foot.position.set(sx * 0.005, 0.0022, 0.003);
    foot.scale.set(1, 0.6, 1.3);
    root.add(foot);
  }
  const tail = new Mesh(new SphereGeometry(0.0035, 10, 6), FELT(0xf0d2b0));
  tail.position.set(0, 0.011, -0.0125);
  root.add(body, belly, tail);
  const glintMat = new MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0, depthWrite: false });
  for (const sx of [-1, 1]) {
    const g = new Mesh(new SphereGeometry(0.0014, 8, 6), glintMat);
    g.position.set(sx * 0.0045 + 0.0006, 0.0162, 0.0128);
    root.add(g);
  }
  const mats: { m: MeshStandardMaterial; base: Color }[] = [];
  root.traverse((o) => {
    const m = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (m && (m as MeshStandardMaterial).isMeshStandardMaterial && !mats.some((e) => e.m === m)) mats.push({ m, base: m.color.clone() });
  });
  return { root, body, bodyMat, mats, glintMat };
}

/** The ghost hand's shape (board frame, wrist at x, z on the desk): palm, four fingers, thumb. */
const GHOST = {
  palm: { w: 0.075, h: 0.08, d: 0.018, y: 0.06 },
  fingers: [[-0.027, 0.062], [-0.009, 0.072], [0.009, 0.07], [0.027, 0.058]] as const,
  fingerR: 0.0085,
};

/**
 * Day 8: the page's preview (before Enter) shows the lane the ghost hand casts, with the creature waiting
 * in it. These capsules follow the ghost hand's own meshes (palm as four upright capsules, fingers, thumb),
 * so the light map computes the shadow of exactly what is drawn, with the game's sight test.
 */
export function ghostHandCapsules(occ: Occluders, x: number, z: number, owner: number): void {
  const p = GHOST.palm;
  const y0 = p.y - p.h / 2 + 0.006, y1 = p.y + p.h / 2 - 0.006;
  for (const [fx, len] of GHOST.fingers) {
    occ.addCapsule(x + fx, y0, z, x + fx, y1, z, p.d / 2 + 0.001, owner);
    occ.addCapsule(x + fx, 0.1, z, x + fx, 0.1 + len - GHOST.fingerR, z, GHOST.fingerR, owner);
  }
  occ.addCapsule(x - 0.038, 0.045, z, x - 0.062, 0.079, z, 0.009, owner);
}

function buildGhostHand(mat: MeshBasicMaterial): Group {
  // An upright open right hand seen from behind, palm toward the lantern (−z),
  // wrist on the desk: its thumb is on the left (−x). (Day 4: the thumb was on
  // the right, a left hand, while the docs and the /emu/ seat use the right.)
  const g = new Group();
  g.name = 'ghost-hand';
  const palm = new Mesh(new BoxGeometry(GHOST.palm.w, GHOST.palm.h, GHOST.palm.d), mat);
  palm.position.y = GHOST.palm.y;
  g.add(palm);
  for (const [x, len] of GHOST.fingers) {
    const f = new Mesh(new CapsuleGeometry(GHOST.fingerR, len - 2 * GHOST.fingerR, 4, 10), mat);
    f.position.set(x, 0.1 + len / 2, 0);
    g.add(f);
  }
  const thumb = new Mesh(new CapsuleGeometry(0.009, 0.035, 4, 10), mat);
  thumb.position.set(-0.05, 0.062, 0.004);
  thumb.rotation.z = 0.7;
  g.add(thumb);
  return g;
}

/** A flat annular sector in the xz plane covering the lantern's light. */
function sectorGeometry(l: Lantern, segs: number, rings: number): BufferGeometry {
  const verts: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const d = MAP_MIN_D + ((l.range - MAP_MIN_D) * i) / rings;
    for (let j = 0; j <= segs; j++) {
      const a = l.yaw - l.half + (2 * l.half * j) / segs;
      verts.push(l.x + Math.sin(a) * d, 0, l.z + Math.cos(a) * d);
    }
  }
  const w = segs + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * w + j;
      idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Sets instance i of an InstancedMesh to a translation + uniform scale (no allocation). */
export function setInstance(mesh: InstancedMesh, i: number, x: number, y: number, z: number, s: number, m: Matrix4): void {
  m.makeScale(s, s, s);
  m.setPosition(x, y, z);
  mesh.setMatrixAt(i, m);
}

export type { Object3D };
