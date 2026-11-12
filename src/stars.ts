/**
 * Chief 12.11 (gameplay judges, Roma "ok" 10097): "Seven Nights", step 1: three stars per night.
 *  ★1 the creature gets home · ★2 it gathers all three fallen stars · ★3 the keeper never stirs.
 * A fallen star lies a little off the path toward the lantern; it is gathered when the creature passes it
 * while the STAR itself is in shade (the light map's own sight test), so a bigger / closer hand is needed:
 * risk against greed. Visual + scoring only: the creature's rules are unchanged.
 */
import { Color, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape } from '@iwsdk/core';

export const STAR_FRACTIONS = [0.3, 0.55, 0.8] as const;
/** How far a fallen star lies off the path toward the lantern (m). */
export const STAR_OFFSET = 0.022;
const KEY = 'cover-stars';

function starShape(r: number, inner: number): Shape {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? inner : r;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}
const GEO = new ExtrudeGeometry(starShape(0.0075, 0.0033), { depth: 0.002, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0006, bevelSegments: 2 });
GEO.center();

export function goldMat(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: 0xffd36b, emissive: new Color(0xffb02e), emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.6 });
}

export interface StarSet {
  /** The three fallen stars on the desk. */
  fallen: Mesh[];
  /** The night's result: three stars above the trinket. */
  result: Mesh[];
  root: Group;
}

export function buildStars(): StarSet {
  const root = new Group();
  root.name = 'stars';
  const fallen: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = new Mesh(GEO, goldMat());
    m.name = `fallen-star-${i}`;
    root.add(m);
    fallen.push(m);
  }
  const result: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = new Mesh(GEO, goldMat());
    m.name = `result-star-${i}`;
    m.scale.setScalar(1.6);
    m.visible = false;
    root.add(m);
    result.push(m);
  }
  return { fallen, result, root };
}

/** Best star count per level, and the total gathered (for the constellation). */
export function loadStars(): { best: Record<string, number>; total: number } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { best: v.best ?? {}, total: v.total ?? 0 };
  } catch { return { best: {}, total: 0 }; }
}
export function saveStars(s: { best: Record<string, number>; total: number }): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** The constellation over the real desk: one point per star gathered (up to 21 = 7 nights × 3), joined in order. */
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, LineBasicMaterial, LineSegments, Points, PointsMaterial } from '@iwsdk/core';
export const MAX_SKY = 21;
export interface Sky { root: Group; set(n: number, time: number): void; }
export function buildSky(): Sky {
  const root = new Group();
  root.name = 'constellation';
  // a hand-placed figure (a little fox-like shape) in board coordinates, 30–45 cm above the desk
  const pts: [number, number, number][] = [];
  for (let i = 0; i < MAX_SKY; i++) {
    const a = (i / MAX_SKY) * Math.PI * 2;
    const r = 0.13 + 0.05 * Math.sin(i * 1.7);
    pts.push([Math.cos(a) * r * 0.85, 0.2 + Math.sin(a) * r * 0.35 + 0.025 * Math.sin(i * 2.3), -0.02 + 0.03 * Math.cos(i * 1.3)]);
  }
  const pos = new Float32Array(MAX_SKY * 3);
  pts.forEach((p, i) => pos.set(p, i * 3));
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,240,200,1)'); grd.addColorStop(0.25, 'rgba(255,215,120,0.8)'); grd.addColorStop(1, 'rgba(255,190,90,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const geo = new BufferGeometry(); geo.setAttribute('position', new BufferAttribute(pos, 3));
  const mat = new PointsMaterial({ map: new CanvasTexture(c), size: 0.013, transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending });
  const points = new Points(geo, mat); points.frustumCulled = false;
  const lpos = new Float32Array((MAX_SKY - 1) * 6);
  for (let i = 0; i < MAX_SKY - 1; i++) { lpos.set(pts[i], i * 6); lpos.set(pts[i + 1], i * 6 + 3); }
  const lgeo = new BufferGeometry(); lgeo.setAttribute('position', new BufferAttribute(lpos, 3));
  const lines = new LineSegments(lgeo, new LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.35, depthWrite: false, depthTest: false, blending: AdditiveBlending }));
  lines.frustumCulled = false;
  points.renderOrder = 50; lines.renderOrder = 49;
  root.add(points, lines);
  let shown = -1;
  return {
    root,
    set(n: number, time: number) {
      const k = Math.max(0, Math.min(MAX_SKY, n));
      if (k !== shown) { geo.setDrawRange(0, k); lgeo.setDrawRange(0, Math.max(0, k - 1) * 2); shown = k; }
      mat.size = 0.012 + 0.003 * Math.sin(time * 2.2);
      root.visible = k > 0;
    },
  };
}
