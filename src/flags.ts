/**
 * URL flags.
 *   ?test=1          tester mode: live panel (fps, hand pose, sight line), guided
 *                    hand-pose steps, log export
 *   ?hands=mask|outline|off
 *                    mask (default): the tracked hand hides virtual things behind it
 *                    and draws nothing, so the real hand shows through;
 *                    outline: the SDK's white hand outline; off: no hand at all
 *   ?proxy=1         draw the hand's cover proxy (one dot per joint, sized as cover)
 *   ?occlude=depth   also request depth sensing and soften virtual things behind
 *                    real objects (costs GPU; off by default)
 *   ?reset=1         forget the saved desk spot
 *   ?guide=0         tester mode without the guided steps (for scripted runs)
 */
export type HandMode = 'mask' | 'outline' | 'off';

export interface Flags {
  test: boolean;
  hands: HandMode;
  proxy: boolean;
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
    hands: hands === 'outline' || hands === 'off' ? hands : 'mask',
    proxy: on('proxy'),
    depth: q.get('occlude') === 'depth',
    reset: on('reset'),
    guide: q.get('guide') !== '0',
  };
}

export const flags: Flags = parseFlags(typeof location === 'undefined' ? '' : location.search);
