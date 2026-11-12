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
