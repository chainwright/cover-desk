/**
 * Chief, 12.11 (Roma 10065: "a game in the real world", modern look, wow):
 * visual-only ambience around the board. Nothing here touches the light map,
 * the sight test or the rules.
 *
 *  - night: a dark dome around the desk that dims the real room (passthrough)
 *    to dusk once the board is placed, so the lantern's pool reads as real
 *    light on the user's own desk; it lifts briefly on a win ("dawn")
 *  - a soft volumetric glow from the lantern down onto the pool (additive)
 *  - a halo around the lamp
 *  - dust motes / fireflies drifting inside the light, twinkling
 */
import {
  AdditiveBlending,
  KeepStencilOp,
  NotEqualStencilFunc,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from '@iwsdk/core';
import type { Lantern } from './sightline.ts';
import { MAP_COLS, MAP_MIN_D, MAP_ROWS } from './light-map.ts';

/** How dark the real room gets once the board is placed (0 = untouched passthrough). */
export const NIGHT_MAX = 0.55;
const MOTES = 24;

export interface Ambience {
  root: Group;
  /** placed: board on the desk; staring: keeper awake/looking; flare: the win flare (0..~1). */
  update(dt: number, time: number, s: { placed: boolean; staring: boolean; flare: number; hands: boolean }): void;
}

function radialTexture(inner: string, outer: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

export function buildAmbience(l: Lantern, map: Uint8Array): Ambience {
  const root = new Group();
  root.name = 'ambience';

  // ---------------------------------------------------------------- night dome
  const nightMat = new MeshBasicMaterial({
    color: 0x04060c, transparent: true, opacity: 0, depthWrite: false, side: BackSide,
    // not where the lantern's light marked the stencil (cover-model.ts 'light-erase')
    stencilWrite: true, stencilRef: 1, stencilFunc: NotEqualStencilFunc, stencilZPass: KeepStencilOp, stencilWriteMask: 0,
  });
  const night = new Mesh(new SphereGeometry(3, 24, 16), nightMat);
  night.name = 'night-dome';
  night.renderOrder = -20; // first: dims passthrough, the board draws over it
  night.frustumCulled = false;
  root.add(night);

  // ---------------------------------------------------------------- volumetric glow
  // An open cone from the lamp down to the middle of the pool, brighter near the lamp and toward its axis.
  const reach = l.range * 0.55;
  const base = Math.tan(l.half) * reach * 0.9;
  const height = l.y;
  const coneGeo = new ConeGeometry(base, Math.hypot(height, reach), 32, 1, true);
  coneGeo.translate(0, -Math.hypot(height, reach) / 2, 0); // apex at origin, opening along −y
  const coneMat = new ShaderMaterial({
    uniforms: { uCol: { value: new Color(0xffb35c) }, uI: { value: 0.0 } },
    vertexShader: /* glsl */ `
      varying float vH; varying vec3 vN; varying vec3 vV;
      void main() {
        vH = -position.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCol; uniform float uI;
      varying float vH; varying vec3 vN; varying vec3 vV;
      void main() {
        float rim = pow(abs(dot(vN, vV)), 1.5);       // soft toward the silhouette
        float fall = exp(-vH * 9.0);                   // fades down the cone
        gl_FragColor = vec4(uCol * rim * fall * uI, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: BackSide,
  });
  const cone = new Mesh(coneGeo, coneMat);
  cone.name = 'light-cone';
  cone.position.set(l.x, l.y, l.z);
  // tilt the axis from straight down toward the pool's middle (yaw direction, `reach` away)
  cone.rotation.order = 'YXZ';
  cone.rotation.y = l.yaw;
  cone.rotation.x = -Math.atan2(reach, height);
  cone.renderOrder = 4;
  root.add(cone);

  // ---------------------------------------------------------------- lamp halo
  const halo = new Sprite(new SpriteMaterial({
    map: radialTexture('rgba(255,210,140,0.9)', 'rgba(255,150,60,0)'),
    blending: AdditiveBlending, depthWrite: false, transparent: true,
  }));
  halo.position.set(l.x, l.y, l.z);
  halo.scale.setScalar(0.07);
  halo.renderOrder = 5;
  root.add(halo);

  // ---------------------------------------------------------------- motes
  const pos = new Float32Array(MOTES * 3);
  const seed = new Float32Array(MOTES * 4);
  for (let i = 0; i < MOTES; i++) {
    const a = l.yaw + (Math.random() * 2 - 1) * l.half * 0.9;
    const d = 0.03 + Math.random() * l.range * 0.85;
    seed[i * 4] = a;
    seed[i * 4 + 1] = d;
    seed[i * 4 + 2] = 0.008 + Math.random() * Math.max(0.02, l.y * 1.3);
    seed[i * 4 + 3] = Math.random() * 100;
  }
  const col = new Float32Array(MOTES * 3).fill(1);
  const moteGeo = new BufferGeometry();
  moteGeo.setAttribute('position', new BufferAttribute(pos, 3));
  moteGeo.setAttribute('color', new BufferAttribute(col, 3));
  const moteMat = new PointsMaterial({
    map: radialTexture('rgba(255,236,190,1)', 'rgba(255,190,90,0)'),
    size: 0.0045, sizeAttenuation: true, transparent: true, opacity: 0, vertexColors: true,
    blending: AdditiveBlending, depthWrite: false,
  });
  const motes = new Points(moteGeo, moteMat);
  motes.name = 'motes';
  motes.frustumCulled = false;
  motes.renderOrder = 6;
  root.add(motes);

  let night01 = 0;
  let dawn = 0;
  let handsLost = 0;
  /** Lit (0..1) at board point x, z from the light map (motes in the hand's shade go out). */
  const litAt = (x: number, z: number): number => {
    const rx = x - l.x, rz = z - l.z;
    const d = Math.hypot(rx, rz);
    let az = Math.atan2(rx, rz) - l.yaw;
    az = ((az + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const u = (az + l.half) / (2 * l.half), v = (d - MAP_MIN_D) / (l.range - MAP_MIN_D);
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    const c = Math.min(MAP_COLS - 1, Math.floor(u * MAP_COLS)), r = Math.min(MAP_ROWS - 1, Math.floor(v * MAP_ROWS));
    return map[(r * MAP_COLS + c) * 4] / 255;
  };
  const update: Ambience['update'] = (dt, time, s) => {
    // dusk falls over ~2.5 s after placement; a win lifts it toward dawn for a moment
    // safety: the night lifts when no hand has been tracked for 2 s (the player looked away or took the headset off)
    handsLost = s.hands ? 0 : handsLost + dt;
    const target = s.placed && handsLost < 2 ? 1 : 0;
    night01 += Math.sign(target - night01) * Math.min(Math.abs(target - night01), dt / (target > night01 ? 2.5 : 0.8));
    dawn = Math.max(dawn * Math.exp(-dt * 1.2), Math.min(1, s.flare));
    nightMat.opacity = NIGHT_MAX * night01 * (1 - 0.75 * dawn);
    const flick = 0.92 + Math.sin(time * 5.3) * 0.05 + Math.sin(time * 13.1) * 0.03;
    coneMat.uniforms.uI.value = night01 * flick * (s.staring ? 0.5 : 0.32) * (1 + dawn);
    halo.scale.setScalar((0.06 + 0.01 * flick) * (s.staring ? 1.3 : 1) * (1 + dawn));
    (halo.material as SpriteMaterial).opacity = 0.35 + 0.65 * night01;
    moteMat.opacity = 0.85 * night01;
    for (let i = 0; i < MOTES; i++) {
      const k = i * 4;
      const ph = seed[k + 3];
      const a = seed[k] + Math.sin(time * 0.21 + ph) * 0.08;
      const d = seed[k + 1] + Math.sin(time * 0.17 + ph * 1.7) * 0.01;
      pos[i * 3] = l.x + Math.sin(a) * d;
      pos[i * 3 + 1] = seed[k + 2] + Math.sin(time * 0.6 + ph) * 0.006;
      pos[i * 3 + 2] = l.z + Math.cos(a) * d;
      const lit = litAt(pos[i * 3], pos[i * 3 + 2]);
      const tw = 0.6 + 0.4 * Math.sin(time * 3.1 + ph * 5);
      col[i * 3] = lit * tw; col[i * 3 + 1] = lit * tw * 0.85; col[i * 3 + 2] = lit * tw * 0.6;
    }
    moteGeo.attributes.position.needsUpdate = true;
    moteGeo.attributes.color.needsUpdate = true;
    moteMat.size = 0.0035 + 0.0015 * Math.sin(time * 2.3);
  };
  update(0, 0, { placed: false, staring: false, flare: 0, hands: false });
  return { root, update };
}
