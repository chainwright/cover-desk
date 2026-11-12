/**
 * Chief 12.11 (Roma 10080/10082: "a cute realistic creature, and let the player pick one of three"):
 * three original creatures (cover/characters/TREND_JUDGE_2026-11-12.md), image → 3D with Tripo (Higgsfield),
 * loaded as GLB. Visual only: the creature's position, route and rules are unchanged; the old procedural
 * body is hidden and the chosen model is parented to the same root.
 *
 * Choosing: on the desk, at the board's near edge, the three stand on a little shelf; hold an index fingertip
 * on one for ~0.4 s and it becomes the creature (kept in localStorage). ?pet=bobo|lumi|tuck forces one.
 */
import { AnimationAction, AnimationClip, AnimationMixer, Box3, Group, Mesh, MeshStandardMaterial, Vector3, type Color, type Object3D } from '@iwsdk/core';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const PET_IDS = ['bobo', 'lumi', 'tuck'] as const;
export type PetId = (typeof PET_IDS)[number];
/** Longest side of each model on the desk (m). */
const SIZE: Record<PetId, number> = { bobo: 0.04, lumi: 0.05, tuck: 0.045 }; // judges r2: 1.5× for readability
const KEY = 'cover-pet';

export function savedPet(): PetId {
  try {
    const q = new URLSearchParams(location.search).get('pet');
    if (q && (PET_IDS as readonly string[]).includes(q)) return q as PetId;
    const s = localStorage.getItem(KEY);
    if (s && (PET_IDS as readonly string[]).includes(s)) return s as PetId;
  } catch { /* storage blocked */ }
  return 'tuck';
}
export function savePet(id: PetId): void {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}

/** Loads one GLB, scales it to its size, base on y = 0, centred in x/z. */
async function loadOne(loader: GLTFLoader, id: PetId): Promise<Group> {
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}pets/${id}.glb`);
  const model = gltf.scene as unknown as Group;
  let box = new Box3().setFromObject(model);
  let size = box.getSize(new Vector3());
  // a long body (Lumi) lies along x in the generated model: turn it so it runs along +z (the creature's heading)
  if (size.x > size.z * 1.3) {
    model.rotation.y = -Math.PI / 2;
    model.updateMatrixWorld(true);
    box = new Box3().setFromObject(model);
    size = box.getSize(new Vector3());
  } else {
    // the upright ones come out facing −z (their backs to the viewer on the shelf): turn them to +z
    model.rotation.y = Math.PI;
    model.updateMatrixWorld(true);
    box = new Box3().setFromObject(model);
  }
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

/** Chief 12.11 (Roma 10092: "alive, waving its paws"): Tuck rigged + four clips (Higgsfield 3D Rigging, Meshy library). */
export interface AnimatedPet {
  root: Group;
  mixer: AnimationMixer;
  play(name: 'idle' | 'run' | 'wave' | 'cheer', fade?: number): void;
  current: string;
}
export async function loadAnimatedTuck(): Promise<AnimatedPet> {
  const loader = new GLTFLoader();
  const base = `${import.meta.env.BASE_URL}pets/`;
  const [idle, run, wave, cheer] = await Promise.all(['idle', 'run', 'wave', 'cheer'].map((n) => loader.loadAsync(`${base}tuck_${n}.glb`)));
  const model = idle.scene as unknown as Group;
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  model.scale.setScalar(SIZE.tuck / Math.max(size.x, size.y, size.z));
  const b2 = new Box3().setFromObject(model);
  const c = b2.getCenter(new Vector3());
  model.position.set(-c.x, -b2.min.y, -c.z);
  const root = new Group();
  root.name = 'pet-tuck-animated';
  root.add(model);
  const mixer = new AnimationMixer(model);
  const clips: Record<string, AnimationClip> = { idle: idle.animations[0], run: run.animations[0], wave: wave.animations[0], cheer: cheer.animations[0] };
  const actions: Record<string, AnimationAction> = {};
  for (const [k, clip] of Object.entries(clips)) if (clip) actions[k] = mixer.clipAction(clip);
  const pet: AnimatedPet = {
    root, mixer, current: '',
    play(name, fade = 0.2) {
      if (pet.current === name || !actions[name]) return;
      const next = actions[name];
      next.reset().setEffectiveWeight(1).fadeIn(fade).play();
      if (pet.current && actions[pet.current]) actions[pet.current].fadeOut(fade);
      pet.current = name;
    },
  };
  pet.play('idle', 0);
  return pet;
}

/** Chief 12.11 (judges r2: one art language): plush props from the same image→3D pipeline. */
export async function loadProp(name: 'keeper' | 'nook' | 'star', size: number, turn = 0): Promise<Group> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}pets/prop_${name}.glb`);
  const model = gltf.scene as unknown as Group;
  model.rotation.y = turn;
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model);
  const sz = box.getSize(new Vector3());
  model.scale.setScalar(size / Math.max(sz.x, sz.y, sz.z));
  model.updateMatrixWorld(true);
  const b2 = new Box3().setFromObject(model);
  const c = b2.getCenter(new Vector3());
  model.position.set(-c.x, -b2.min.y, -c.z);
  const g = new Group();
  g.name = `prop-${name}`;
  g.add(model);
  return g;
}
