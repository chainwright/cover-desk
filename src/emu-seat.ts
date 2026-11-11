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
 *   M        hand the emulator back to its own controls (its menus and gizmos)
 *
 * Inert anywhere else: it does nothing unless the emulator is present
 * (`window.IWER_DEVICE`), and the main build never contains the emulator.
 */
import type { CoverDebug } from './cover-system.ts';

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
/** The 'stop' hand: wrist 2 cm above the desk, 6 cm in front of the lantern (board frame, metres). */
export const STOP = { x: -0.035, z: -0.06, y: 0.02, lift: 0.2, minX: -0.08, maxX: 0.08 };
/**
 * Slide speed of the hand, m/s. Near the lantern the shadow on the path moves
 * about 3.8× faster than the hand (lantern to hand 4.5 cm, to path 17 cm), and
 * the creature runs at 13 cm/s: 3 cm/s keeps the shadow just slower than it.
 * Time steps are clamped like the game's (0.05 s), so it also holds when the
 * emulator renders slowly.
 */
export const SLIDE_SPEED = 0.03;

const KEYS_HTML =
  '<b>Emulator seat</b> · <b>H</b> stand your hand like \'stop\' between the lantern and the path, again to take it away' +
  ' · hold <b>← →</b> to slide it along and lead the creature · <b>L</b> lift it · <b>M</b> emulator\'s own controls';

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
  let x = STOP.x;
  let dir = 0;
  let last = 0;
  const slide = (now: number) => {
    if (dir !== 0 && raised) {
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

  /** Puts the right hand at board point (x, y, z), fingers up, palm toward the lantern. */
  const placeRight = () => {
    const f = cover();
    if (!f) return;
    const r = device.hands.right;
    const y = STOP.y + (lifted ? STOP.lift : 0);
    const [wx, wy, wz] = f.boardPoint(x, STOP.z, y);
    // Board axes in the world: across (+x) and toward the player (+z).
    const o = f.boardPoint(0, 0, 0);
    const ax = f.boardPoint(1, 0, 0);
    const yaw = Math.atan2(ax[2] - o[2], ax[0] - o[0]); // rotation of board +x about world up
    // Hand joint frame (WebXR): −Z toward the fingertips, +Y out of the back of the hand.
    // 'stop': fingertips up (−Z = world up), back of the hand toward the player (+Y = board +z).
    // That is a −90° turn about x, then the board's own turn about y.
    const qx = rotX(-Math.PI / 2);
    const qy = rotY(-yaw);
    const q = mul(qy, qx);
    r.poseId = 'flat';
    r.quaternion.set(q[0], q[1], q[2], q[3]);
    r.position.set(wx, wy, wz);
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
    raised = lifted = false;
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
      raised = !raised;
      lifted = false;
      if (raised) placeRight();
      else park(device.hands.right, 1);
    } else if (k === 'arrowleft' || k === 'arrowright') {
      dir = k === 'arrowleft' ? -1 : 1;
    } else if (k === 'l' && raised) {
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

type Q = [number, number, number, number];
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
