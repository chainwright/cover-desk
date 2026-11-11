/**
 * The tracked hand in passthrough (extracted from the desk prototype's system).
 *
 * The SDK draws the hand as a white outline plus a depth mask that renders
 * too late to hide anything. In "mask" mode the hand mesh writes depth only
 * and renders first, so virtual things behind the real hand are not drawn and
 * the passthrough hand shows through. "outline" keeps the SDK look; "off"
 * hides both.
 */
import { MeshBasicMaterial, type Mesh, type Object3D } from '@iwsdk/core';
import type { HandMode } from './flags.ts';

export const HAND_SIDES = ['left', 'right'] as const;

/** The parts of the SDK input API this needs. */
interface HandVisualSource {
  visualAdapters: { hand: Record<'left' | 'right', { visual?: { model?: unknown } | null }> };
}

export class HandMask {
  private readonly occluder = new MeshBasicMaterial({ colorWrite: false });

  constructor(private readonly mode: HandMode) {}

  /** Call every frame: the SDK creates hand models lazily. Cheap once applied. */
  apply(input: HandVisualSource): void {
    if (this.mode === 'outline') return;
    for (const side of HAND_SIDES) {
      const model = input.visualAdapters.hand[side].visual?.model as Object3D | undefined;
      if (!model || model.userData.coverHands === this.mode) continue;
      model.traverse((o) => {
        const mesh = o as Mesh;
        if (!(mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) return;
        if (mesh.renderOrder === 999) {
          mesh.visible = false; // the white outline
        } else if (this.mode === 'mask') {
          mesh.material = this.occluder;
          mesh.renderOrder = -10; // before the board, so it hides what is behind the hand
        } else {
          mesh.visible = false;
        }
      });
      model.userData.coverHands = this.mode;
    }
  }
}
