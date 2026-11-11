/**
 * Keeps the board on the same spot of the desk across sessions.
 *
 * We create our own WebXR anchor exactly at the board pose and ask the
 * browser for a persistent handle (a UUID). Next session we restore that UUID
 * and follow the anchor's pose. Only one persistent anchor of ours exists at a
 * time: the old one is deleted when the board is placed again (browsers cap
 * persistent anchors per site; the Quest browser allows 8, and none survive
 * private browsing).
 */
import { Quaternion, Vector3 } from '@iwsdk/core';

const KEY = 'cover.desk-anchor.v1';

interface Saved {
  uuid: string;
  method: string;
  savedAt: string;
}

type PersistentAnchor = XRAnchor & { requestPersistentHandle?: () => Promise<string> };
type PersistentSession = XRSession & {
  restorePersistentAnchor?: (uuid: string) => Promise<XRAnchor>;
  deletePersistentAnchor?: (uuid: string) => Promise<void>;
};

export type AnchorStatus =
  | 'none'
  | 'restoring'
  | 'restored'
  | 'restore-failed'
  | 'saving'
  | 'saved'
  | 'session-only'
  | 'save-failed'
  | 'unsupported';

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function writeSaved(s: Saved | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // storage may be unavailable (private browsing); the anchor then lasts one session
  }
}

export class DeskAnchor {
  anchor: XRAnchor | null = null;
  status: AnchorStatus = 'none';
  /** Bumped on session end so late async results are dropped. */
  private generation = 0;
  private quat = new Quaternion();
  private axis = new Vector3(0, 1, 0);

  hasSaved(): boolean {
    return readSaved() !== null;
  }

  savedMethod(): string | null {
    return readSaved()?.method ?? null;
  }

  /** Forget the saved spot (and delete its persistent anchor when a session is available). */
  forget(session?: XRSession | null): void {
    const saved = readSaved();
    writeSaved(null);
    const s = session as PersistentSession | null | undefined;
    if (saved && s?.deletePersistentAnchor) s.deletePersistentAnchor(saved.uuid).catch(() => {});
  }

  endSession(): void {
    this.generation++;
    this.anchor = null;
    if (this.status === 'restoring' || this.status === 'saving') this.status = 'none';
  }

  /** Tries to restore last session's anchor. Resolves true once it is live. */
  async restore(session: XRSession): Promise<boolean> {
    const saved = readSaved();
    const s = session as PersistentSession;
    if (!saved) return false;
    if (!s.restorePersistentAnchor) {
      this.status = 'unsupported';
      return false;
    }
    const gen = this.generation;
    this.status = 'restoring';
    try {
      const anchor = await s.restorePersistentAnchor(saved.uuid);
      if (gen !== this.generation) return false;
      this.anchor = anchor;
      this.status = 'restored';
      return true;
    } catch {
      if (gen !== this.generation) return false;
      // The runtime no longer knows this anchor (space cleared, other room…).
      writeSaved(null);
      this.status = 'restore-failed';
      return false;
    }
  }

  /**
   * Anchors the board at (x, y, z) with rotation `yaw` about +y and makes the
   * anchor persistent. Must be called inside the XR frame callback.
   */
  save(
    session: XRSession,
    frame: XRFrame,
    space: XRReferenceSpace,
    x: number,
    y: number,
    z: number,
    yaw: number,
    method: string,
  ): void {
    if (!frame.createAnchor) {
      this.status = 'unsupported';
      return;
    }
    const gen = ++this.generation;
    const previous = readSaved();
    const old = this.anchor;
    this.anchor = null; // don't follow the old spot while the new anchor is created
    this.status = 'saving';
    this.quat.setFromAxisAngle(this.axis, yaw);
    const pose = new XRRigidTransform(
      { x, y, z },
      { x: this.quat.x, y: this.quat.y, z: this.quat.z, w: this.quat.w },
    );
    frame
      .createAnchor(pose, space)
      ?.then(async (anchor) => {
        if (gen !== this.generation) {
          anchor.delete();
          return;
        }
        this.anchor = anchor;
        const a = anchor as PersistentAnchor;
        if (!a.requestPersistentHandle) {
          this.status = 'session-only';
          return;
        }
        try {
          const uuid = await a.requestPersistentHandle();
          if (gen !== this.generation) return;
          const s = session as PersistentSession;
          if (previous && previous.uuid !== uuid && s.deletePersistentAnchor) {
            s.deletePersistentAnchor(previous.uuid).catch(() => {});
          }
          writeSaved({ uuid, method, savedAt: new Date().toISOString() });
          this.status = 'saved';
        } catch {
          this.status = 'session-only';
        }
      })
      .catch(() => {
        if (gen === this.generation) this.status = 'save-failed';
      });
    if (old) {
      // createAnchor not settled yet: drop the old one now so it can't be followed.
      try {
        old.delete();
      } catch {
        /* already gone */
      }
    }
  }

  /** Writes the anchor's current pose; false when it isn't tracked this frame. */
  pose(frame: XRFrame, space: XRReferenceSpace, outPos: Vector3, outQuat: Quaternion): boolean {
    if (!this.anchor) return false;
    let p: XRPose | undefined;
    try {
      p = frame.getPose(this.anchor.anchorSpace, space);
    } catch {
      return false;
    }
    if (!p) return false;
    const t = p.transform;
    outPos.set(t.position.x, t.position.y, t.position.z);
    outQuat.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
    return true;
  }
}
