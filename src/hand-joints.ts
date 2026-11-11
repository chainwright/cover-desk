/**
 * Reads all 25 joints of each tracked hand from the WebXR frame, into
 * preallocated buffers (no allocation per frame once a hand is known).
 *
 * WebXR reports a joint only when it is tracked; `fillPoses` fails if any
 * joint is missing, and then this hand counts as lost for this frame. There is
 * no per-joint confidence in WebXR, so "lost" is the only signal we get: the
 * creature waits while no hand is tracked.
 */
import { JOINTS } from './hand-proxy.ts';

type FillFrame = XRFrame & {
  fillPoses?: (spaces: XRSpace[], base: XRSpace, out: Float32Array) => boolean;
  fillJointRadii?: (spaces: XRJointSpace[], out: Float32Array) => boolean;
};

export class HandJoints {
  /** World-space joint positions, 25 × xyz per hand (valid only when `tracked[h]`). */
  readonly world = [new Float32Array(JOINTS * 3), new Float32Array(JOINTS * 3)];
  readonly radii = [new Float32Array(JOINTS), new Float32Array(JOINTS)];
  readonly tracked = [false, false];
  /** Which WebXR path filled the joints last time (for the tester log). */
  readonly posePath: ('fillPoses' | 'getJointPose' | 'none')[] = ['none', 'none'];
  /** Where the radii came from: fillJointRadii, the per-joint pose.radius, or zeroed (then the 7 mm floor applies). */
  readonly radiusPath: ('fillJointRadii' | 'pose.radius' | 'zeroed' | 'none')[] = ['none', 'none'];
  private spaces: (XRJointSpace[] | null)[] = [null, null];
  private sources: (XRInputSource | null)[] = [null, null];
  private matrices = new Float32Array(JOINTS * 16);

  /**
   * Updates hand `h` from `source` (or marks it lost). `toWorld` maps a
   * reference-space position to world space in place (the player rig).
   */
  read(
    h: number,
    frame: XRFrame | null | undefined,
    ref: XRReferenceSpace | null | undefined,
    source: XRInputSource | null | undefined,
    toWorld: (p: Float32Array, i: number) => void,
  ): boolean {
    const hand = source?.hand;
    if (!frame || !ref || !source || !hand) {
      this.tracked[h] = false;
      return false;
    }
    if (this.sources[h] !== source) {
      this.sources[h] = source;
      this.spaces[h] = Array.from(hand.values()).slice(0, JOINTS) as XRJointSpace[];
    }
    const spaces = this.spaces[h]!;
    if (spaces.length < JOINTS) {
      this.tracked[h] = false;
      return false;
    }
    const f = frame as FillFrame;
    const out = this.world[h];
    let ok = true;
    if (f.fillPoses) {
      this.posePath[h] = 'fillPoses';
      this.radiusPath[h] = 'zeroed';
      try {
        ok = f.fillPoses(spaces, ref, this.matrices);
      } catch {
        ok = false;
      }
      if (ok) {
        for (let i = 0; i < JOINTS; i++) {
          out[i * 3] = this.matrices[i * 16 + 12];
          out[i * 3 + 1] = this.matrices[i * 16 + 13];
          out[i * 3 + 2] = this.matrices[i * 16 + 14];
        }
      }
    } else {
      this.posePath[h] = 'getJointPose';
      this.radiusPath[h] = 'pose.radius';
      for (let i = 0; i < JOINTS && ok; i++) {
        const pose = frame.getJointPose?.(spaces[i], ref);
        if (!pose) {
          ok = false;
          break;
        }
        out[i * 3] = pose.transform.position.x;
        out[i * 3 + 1] = pose.transform.position.y;
        out[i * 3 + 2] = pose.transform.position.z;
        this.radii[h][i] = pose.radius ?? 0;
      }
    }
    if (ok && f.fillJointRadii) {
      try {
        if (f.fillJointRadii(spaces, this.radii[h])) this.radiusPath[h] = 'fillJointRadii';
        else {
          this.radii[h].fill(0);
          this.radiusPath[h] = 'zeroed';
        }
      } catch {
        this.radii[h].fill(0);
        this.radiusPath[h] = 'zeroed';
      }
    }
    if (ok) for (let i = 0; i < JOINTS; i++) toWorld(out, i);
    this.tracked[h] = ok;
    return ok;
  }

  /** Mean joint radius of hand h in mm (for the tester log). */
  meanRadiusMm(h: number): number {
    let sum = 0;
    for (let i = 0; i < JOINTS; i++) sum += this.radii[h][i];
    return Math.round((sum / JOINTS) * 10000) / 10;
  }
}
