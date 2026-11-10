/**
 * Builds the soroban as plain Three.js objects. Beads move every frame, so the
 * model is created by the soroban system at runtime rather than authored in
 * the scene JSON.
 */
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector2,
} from '@iwsdk/core';
import {
  BEAD_HALF,
  BEAD_RADIUS,
  BEAD_Y,
  BEAM_HALF,
  CENTER_Z,
  FRAME_HALF_X,
  FRAME_HEIGHT,
  FRAME_Z_MAX,
  FRAME_Z_MIN,
  LOWER,
  RAIL,
  RODS,
  UPPER,
  rodX,
} from './soroban-layout.js';

export interface SorobanModel {
  /** Placed on the desk; local +z faces the user. */
  root: Group;
  /** Layout frame (beam at z = 0), offset so the frame is centred on `root`. */
  inner: Group;
  /** beads[rod][0] is the upper bead, beads[rod][1..4] the lower beads (1 nearest the beam). */
  beads: Mesh[][];
  /** One digit label per rod. */
  digits: Mesh[];
  /** Ten shared digit textures, 0–9. */
  digitTextures: CanvasTexture[];
}

function makeDigitTexture(d: number): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 50px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1d130c';
  ctx.strokeText(String(d), size / 2, size / 2 + 3);
  ctx.fillStyle = '#f4ead8';
  ctx.fillText(String(d), size / 2, size / 2 + 3);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function buildSoroban(): SorobanModel {
  const root = new Group();
  root.name = 'soroban';
  const inner = new Group();
  inner.name = 'soroban-frame';
  inner.position.z = -CENTER_Z;
  root.add(inner);

  const wood = new MeshStandardMaterial({ color: 0x3b2416, roughness: 0.72, metalness: 0 });
  const beadWood = new MeshStandardMaterial({ color: 0xc78c52, roughness: 0.42, metalness: 0 });
  const rodMat = new MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.35, metalness: 0.2 });
  const dotMat = new MeshBasicMaterial({ color: 0xf2e6c9 });

  const depth = FRAME_Z_MAX - FRAME_Z_MIN;
  const width = FRAME_HALF_X * 2 + RAIL * 2;

  // Frame: far rail, near rail, two side posts, and the beam.
  const railGeo = new BoxGeometry(width, FRAME_HEIGHT, RAIL);
  for (const z of [FRAME_Z_MIN + RAIL / 2, FRAME_Z_MAX - RAIL / 2]) {
    const rail = new Mesh(railGeo, wood);
    rail.position.set(0, FRAME_HEIGHT / 2, z);
    inner.add(rail);
  }
  const postGeo = new BoxGeometry(RAIL, FRAME_HEIGHT, depth);
  for (const s of [-1, 1]) {
    const post = new Mesh(postGeo, wood);
    post.position.set(s * (FRAME_HALF_X + RAIL / 2), FRAME_HEIGHT / 2, (FRAME_Z_MIN + FRAME_Z_MAX) / 2);
    inner.add(post);
  }
  const beam = new Mesh(new BoxGeometry(FRAME_HALF_X * 2, FRAME_HEIGHT, BEAM_HALF * 2), wood);
  beam.position.set(0, FRAME_HEIGHT / 2, 0);
  inner.add(beam);

  // Unit-rod dot on the beam (centre rod), as on a real soroban.
  const dot = new Mesh(new CircleGeometry(0.0032, 12), dotMat);
  dot.rotation.x = -Math.PI / 2;
  dot.position.set(rodX(Math.floor(RODS / 2)), FRAME_HEIGHT + 0.0005, 0);
  inner.add(dot);

  // Rods.
  const rodLen = depth - 2 * RAIL;
  const rodGeo = new CylinderGeometry(0.0022, 0.0022, rodLen, 6);
  rodGeo.rotateX(Math.PI / 2);
  // Bicone bead, axis along z.
  const profile = [
    new Vector2(0.0035, -BEAD_HALF),
    new Vector2(BEAD_RADIUS * 0.62, -BEAD_HALF * 0.72),
    new Vector2(BEAD_RADIUS, 0),
    new Vector2(BEAD_RADIUS * 0.62, BEAD_HALF * 0.72),
    new Vector2(0.0035, BEAD_HALF),
  ];
  const beadGeo = new LatheGeometry(profile, 14);
  beadGeo.rotateX(Math.PI / 2);

  const digitTextures: CanvasTexture[] = [];
  for (let d = 0; d < 10; d++) digitTextures.push(makeDigitTexture(d));
  const digitGeo = new PlaneGeometry(0.026, 0.026);

  const beads: Mesh[][] = [];
  const digits: Mesh[] = [];
  for (let r = 0; r < RODS; r++) {
    const x = rodX(r);
    const rod = new Mesh(rodGeo, rodMat);
    rod.position.set(x, BEAD_Y, (FRAME_Z_MIN + FRAME_Z_MAX) / 2);
    inner.add(rod);

    const rodBeads: Mesh[] = [];
    const upper = new Mesh(beadGeo, beadWood);
    upper.name = `bead-${r}-upper`;
    upper.position.set(x, BEAD_Y, UPPER.lo + BEAD_HALF);
    inner.add(upper);
    rodBeads.push(upper);
    for (let j = 0; j < LOWER.count; j++) {
      const lower = new Mesh(beadGeo, beadWood);
      lower.name = `bead-${r}-lower-${j}`;
      lower.position.set(x, BEAD_Y, LOWER.hi - BEAD_HALF - 2 * BEAD_HALF * (LOWER.count - 1 - j));
      inner.add(lower);
      rodBeads.push(lower);
    }
    beads.push(rodBeads);

    // Digit label: lies just in front of the near rail, tilted up toward the user.
    const mat = new MeshBasicMaterial({ map: digitTextures[0], transparent: true, depthWrite: false });
    const label = new Mesh(digitGeo, mat);
    label.name = `digit-${r}`;
    label.position.set(x, 0.012, FRAME_Z_MAX + 0.018);
    label.rotation.x = -Math.PI / 2 + 0.75;
    inner.add(label);
    digits.push(label);
  }

  return { root, inner, beads, digits, digitTextures };
}
