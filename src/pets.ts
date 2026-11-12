/**
 * Chief 12.11 (Roma 10080/10082: "a cute realistic creature, and let the player pick one of three"):
 * three original creatures (cover/characters/TREND_JUDGE_2026-11-12.md), image → 3D with Tripo (Higgsfield),
 * loaded as GLB. Visual only: the creature's position, route and rules are unchanged; the old procedural
 * body is hidden and the chosen model is parented to the same root.
 *
 * Choosing: on the desk, at the board's near edge, the three stand on a little shelf; hold an index fingertip
 * on one for ~0.4 s and it becomes the creature (kept in localStorage). ?pet=bobo|lumi|tuck forces one.
 */
import { Box3, Group, Mesh, MeshStandardMaterial, Vector3, type Color, type Object3D } from '@iwsdk/core';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const PET_IDS = ['bobo', 'lumi', 'tuck'] as const;
export type PetId = (typeof PET_IDS)[number];
/** Longest side of each model on the desk (m). */
const SIZE: Record<PetId, number> = { bobo: 0.028, lumi: 0.036, tuck: 0.03 };
const KEY = 'cover-pet';

export function savedPet(): PetId {
  try {
    const q = new URLSearchParams(location.search).get('pet');
    if (q && (PET_IDS as readonly string[]).includes(q)) return q as PetId;
    const s = localStorage.getItem(KEY);
    if (s && (PET_IDS as readonly string[]).includes(s)) return s as PetId;
  } catch { /* storage blocked */ }
  return 'lumi';
}
export function savePet(id: PetId): void {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}

/** Loads one GLB, scales it to its size, base on y = 0, centred in x/z. */
async function loadOne(loader: GLTFLoader, id: PetId): Promise<Group> {
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}pets/${id}.glb`);
  const model = gltf.scene as unknown as Group;
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const s = SIZE[id] / Math.max(size.x, size.y, size.z);
  model.scale.setScalar(s);
  const box2 = new Box3().setFromObject(model);
  const c = box2.getCenter(new Vector3());
  model.position.set(-c.x, -box2.min.y, -c.z);
  const g = new Group();
  g.name = `pet-${id}`;
  g.add(model);
  return g;
}

export async function loadPets(): Promise<Record<PetId, Group>> {
  const loader = new GLTFLoader();
  const out = {} as Record<PetId, Group>;
  await Promise.all(PET_IDS.map(async (id) => { out[id] = await loadOne(loader, id); }));
  return out;
}

/** Every standard material in a model with its base colour (for the night dimming). */
export function petMaterials(o: Object3D): { m: MeshStandardMaterial; base: Color }[] {
  const out: { m: MeshStandardMaterial; base: Color }[] = [];
  o.traverse((x) => {
    const m = (x as Mesh).material as MeshStandardMaterial | undefined;
    if (m && m.isMeshStandardMaterial && !out.some((e) => e.m === m)) out.push({ m, base: m.color.clone() });
  });
  return out;
}

/** Shelf spots (board frame) for the three on the choice shelf, near edge, left of centre. */
export const SHELF = PET_IDS.map((id, i) => ({ id, x: -0.12 + i * 0.05, z: 0.105 }));
/** Fingertip within this of a shelf pet (m), held for HOLD_S, picks it. */
export const PICK_R = 0.025;
export const HOLD_S = 0.4;
