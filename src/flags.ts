/**
 * URL flags.
 *   ?test=1          tester mode: live contact panel, guided steps, log export
 *   ?read=rest       read each rod from where the finger comes to rest
 *                    (the faded-stage reader) instead of from bead collisions
 *   ?hands=mask|outline|off
 *                    mask (default): the tracked hand hides virtual beads behind it
 *                    and draws nothing, so the real hand shows through;
 *                    outline: the SDK's white hand outline; off: no hand at all
 *   ?occlude=depth   also request depth sensing and soften the abacus behind real
 *                    objects (costs GPU; off by default)
 *   ?reset=1         forget the saved desk spot
 *   ?guide=0         tester mode without the guided steps (for scripted runs)
 */
export type ReadMode = 'physics' | 'rest';
export type HandMode = 'mask' | 'outline' | 'off';

export interface Flags {
  test: boolean;
  read: ReadMode;
  hands: HandMode;
  depth: boolean;
  reset: boolean;
  guide: boolean;
}

export function parseFlags(search: string): Flags {
  const q = new URLSearchParams(search);
  const on = (k: string) => q.has(k) && q.get(k) !== '0' && q.get(k) !== 'false';
  const hands = q.get('hands');
  return {
    test: on('test'),
    read: q.get('read') === 'rest' ? 'rest' : 'physics',
    hands: hands === 'outline' || hands === 'off' ? hands : 'mask',
    depth: q.get('occlude') === 'depth',
    reset: on('reset'),
    guide: q.get('guide') !== '0',
  };
}

export const flags: Flags = parseFlags(typeof location === 'undefined' ? '' : location.search);
