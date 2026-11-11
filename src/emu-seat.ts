/**
 * Desktop emulator only (the /emu/ build): a seated, hands-on start, so a
 * judge without a headset reaches the game in seconds instead of typing
 * headset coordinates into the emulator's menus (day-3 fix; on day 2 an
 * outside reviewer never got the board onto the emulated desk).
 *
 * On entering, the emulated headset sits at the emulated desk looking down
 * at it and switches to hands, so the board lands on the desk by itself.
 * The keyboard then moves the right hand:
 *   H        stand the hand like 'stop' between the lantern and the path / take it away
 *   ← →      hold to slide it along (at a speed the creature can follow)
 *   L        lift it 20 cm (the light passes under it: the creature is spotted)
 *   C        stand it right at the lantern, cupping it (day 5: the keeper wakes)
 *   M        hand the emulator back to its own controls (its menus and gizmos)
 *
 * Inert anywhere else: it does nothing unless the emulator is present
 * (`window.IWER_DEVICE`), and the main build never contains the emulator.
 */
import type { CoverDebug } from './cover-system.ts';
import { LEVEL_1, TEACH_SPOT } from './level.ts';

interface V3 { x: number; y: number; z: number; set(x: number, y: number, z: number): unknown }
interface Q4 { set(x: number, y: number, z: number, w: number): unknown }
interface EmuInput { position: V3; quaternion: Q4; poseId: string; connected: boolean }
interface EmuDevice {
  position: V3;
  quaternion: Q4;
  primaryInputMode: 'controller' | 'hand';
  controlMode: 'manual' | 'programmatic';
  hands: { left: EmuInput; right: EmuInput };
  notifyStateChange?(): void;
}

/** Where to sit in the emulator's home office (the desk top is at y ≈ 0.725 m, centred at z ≈ −1.93 m). */
export const SEAT = { x: 0, y: 1.18, z: -1.48, pitchDeg: -52 };
/**
 * The 'stop' hand: the wrist 2 cm above the desk where the first-run ghost
 * hand stands (TEACH_SPOT: halfway between the lantern and the path), board
 * frame, metres. Day 4: it stood 4.5 cm in front of the lantern, upside down
 * (see GRIP_TO_WRIST), and blacked out the whole light.
 */
export const STOP = { x: TEACH_SPOT.x, z: TEACH_SPOT.z, y: 0.02, lift: 0.2, minX: -0.12, maxX: 0.1 };
/**
 * Where the emulator puts the wrist relative to the hand position we set, in
 * the board frame, for the pose used here (its 'flat' hand turned fingers-up,
 * back of the hand toward the player). Read from the emulator's joint poses
 * on day 4 (no record of that reading was kept; the /emu/ runs since show the
 * hand casting the expected lane, litFraction 0.826): the position is the
 * grip, inside the hand, so setting it to the wrist spot put the wrist 11.7
 * cm under the desk. Day 1-3 also turned the hand the wrong
 * way (fingertips down into the lantern).
 */
export const GRIP_TO_WRIST = { x: 0.049, y: -0.117, z: 0.002 };
/**
 * Slide speed of the hand, m/s. From the teaching spot the shadow on the path
 * moves about 2× faster than the hand (lantern to hand 8 cm, to path 17 cm),
 * and the creature runs at 13 cm/s: 3 cm/s keeps the shadow (about 6.4 cm/s)
 * slower than it, so it follows. Time steps are clamped like the game's
 * (0.05 s), so it also holds when the emulator renders slowly.
 */
export const SLIDE_SPEED = 0.03;

/** C: the hand stands right in front of the lantern, cupping it (wrist 2.5 cm in front, centred). */
export const CUP = { x: LEVEL_1.lanterns[0].x, z: LEVEL_1.lanterns[0].z + 0.025 } as const;

type Q = [number, number, number, number];
type V = [number, number, number];

export interface SeatPose {
  /** Where to put the emulator's hand position (its grip), world. */
  position: V;
  /** The emulator hand's orientation, world (x, y, z, w). */
  quaternion: Q;
}

/**
 * The emulator hand pose that stands the right hand like 'stop' with its
 * wrist at board point (x, y, z): fingertips up, back of the hand toward the
 * player (palm toward the lantern). Pure, so it is unit-tested (an outside
 * run turned the hand the wrong way and dropped the grip offset, and no test
 * noticed). `boardPoint` maps a board-frame point to the world.
 */
export function seatHandPose(x: number, y: number, z: number, boardPoint: (x: number, z: number, y: number) => V): SeatPose {
  // Set the grip so that the wrist lands on (x, y, z).
  const position = boardPoint(x - GRIP_TO_WRIST.x, z - GRIP_TO_WRIST.z, y - GRIP_TO_WRIST.y);
  // Board axes in the world: across (+x) and toward the player (+z).
  const o = boardPoint(0, 0, 0);
  const ax = boardPoint(1, 0, 0);
  const yaw = Math.atan2(ax[2] - o[2], ax[0] - o[0]); // rotation of board +x about world up
  // Hand joint frame (WebXR): −Z toward the fingertips, +Y out of the back of the hand.
  // 'stop': fingertips up (−Z = world up), back of the hand toward the player (+Y = board +z).
  // That is a +90° turn about x (day 1-3 had −90°: fingertips down), then the board's own turn about y.
  const quaternion = mul(rotY(-yaw), rotX(Math.PI / 2));
  return { position, quaternion };
}

const KEYS_HTML =
  '<b>Emulator seat</b> · <b>H</b> stand your hand like \'stop\' between the lantern and the path, again to take it away' +
  ' · hold <b>← →</b> to slide it along and lead the creature · <b>L</b> lift it · <b>C</b> cup the lantern (it wakes the keeper) · <b>M</b> emulator\'s own controls';

export function installEmuSeat(cover: () => CoverDebug | undefined): void {
  const device = (window as unknown as { IWER_DEVICE?: EmuDevice }).IWER_DEVICE;
  if (!device) return;

  const hud = document.createElement('div');
  hud.id = 'emu-keys';
  hud.innerHTML = KEYS_HTML;
  Object.assign(hud.style, {
    position: 'fixed', left: '50%', top: '10px', transform: 'translateX(-50%)', zIndex: '2147483000',
    maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', padding: '8px 14px', borderRadius: '10px',
    background: 'rgba(23,17,12,0.86)', color: '#f4ead8', font: '13px/1.4 system-ui, sans-serif',
    textAlign: 'center', pointerEvents: 'none', display: 'none',
  });
  document.body.appendChild(hud);

  let seated = false;
  let raised = false;
  let lifted = false;
  let cupped = false;
  let x: number = STOP.x;
  let dir = 0;
  let last = 0;
  const slide = (now: number) => {
    if (dir !== 0 && raised && !cupped) {
      const dt = Math.min(0.05, (now - last) / 1000);
      x = Math.min(STOP.maxX, Math.max(STOP.minX, x + dir * SLIDE_SPEED * dt));
      placeRight();
    }
    last = now;
    if (seated) requestAnimationFrame(slide);
  };

  const park = (h: EmuInput, side: number) => {
    // Hands resting low beside the chair, out of the light.
    h.position.set(SEAT.x + side * 0.35, 0.6, SEAT.z + 0.1);
    h.quaternion.set(0, 0, 0, 1);
  };

  /** Puts the right hand, fingers up, palm toward the lantern: at the slide position, or cupping the lantern. */
  const placeRight = () => {
    const f = cover();
    if (!f) return;
    const r = device.hands.right;
    const y = STOP.y + (lifted ? STOP.lift : 0);
    const p = cupped ? seatHandPose(CUP.x, STOP.y, CUP.z, f.boardPoint) : seatHandPose(x, y, STOP.z, f.boardPoint);
    r.poseId = 'flat';
    r.quaternion.set(p.quaternion[0], p.quaternion[1], p.quaternion[2], p.quaternion[3]);
    r.position.set(p.position[0], p.position[1], p.position[2]);
    device.notifyStateChange?.();
  };

  const seat = () => {
    device.controlMode = 'programmatic';
    device.primaryInputMode = 'hand';
    device.position.set(SEAT.x, SEAT.y, SEAT.z);
    const q = rotX((SEAT.pitchDeg * Math.PI) / 180);
    device.quaternion.set(q[0], q[1], q[2], q[3]);
    park(device.hands.left, -1);
    park(device.hands.right, 1);
    raised = lifted = cupped = false;
    x = STOP.x;
    device.notifyStateChange?.();
    seated = true;
    hud.style.display = 'block';
    last = performance.now();
    requestAnimationFrame(slide);
  };

  window.addEventListener('cover:session-start', () => seat());
  window.addEventListener('cover:session-end', () => {
    seated = false;
    hud.style.display = 'none';
  });

  window.addEventListener('keydown', (e) => {
    if (!seated || device.controlMode !== 'programmatic') return;
    const k = e.key.toLowerCase();
    if (k === 'h') {
      // H stands the hand where the ghost stands (again after a win), or takes it away.
      raised = !raised;
      lifted = cupped = false;
      x = STOP.x;
      if (raised) placeRight();
      else park(device.hands.right, 1);
    } else if (k === 'c') {
      cupped = !cupped;
      raised = cupped;
      lifted = false;
      x = STOP.x;
      if (raised) placeRight();
      else park(device.hands.right, 1);
    } else if (k === 'arrowleft' || k === 'arrowright') {
      dir = k === 'arrowleft' ? -1 : 1;
    } else if (k === 'l' && raised && !cupped) {
      lifted = !lifted;
      placeRight();
    } else if (k === 'm') {
      device.controlMode = 'manual';
      hud.innerHTML = "<b>Emulator controls</b> (its own menus and gizmos). Press Enter again from the page for the seat.";
      return;
    } else return;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if ((k === 'arrowleft' && dir < 0) || (k === 'arrowright' && dir > 0)) dir = 0;
  });
}

function rotX(a: number): Q {
  return [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
}
function rotY(a: number): Q {
  return [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
}
function mul(a: Q, b: Q): Q {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
