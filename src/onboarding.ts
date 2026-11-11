/**
 * What the first run shows, as a pure function so it is unit-tested.
 *
 * Day-1 bug (found by the judges): the ghost hand and the teaching prompt
 * needed `!listening`, but after an automatic placement on a detected desk the
 * app keeps listening for a desk tap, so on the most likely first-run path a
 * new player never saw either, and could not register a real object until
 * they tapped the desk.
 *
 * Now:
 *  - the ghost "stop" palm and the teaching prompt show whenever the board is
 *    placed and the creature has never yet stood in a hand's shadow,
 *    whatever `listening` is;
 *  - "move the board" lives only on the knob (a small label), not in the
 *    main prompt;
 *  - a real object can be registered after a plane placement too.
 */

export type PlacementKind = 'preview' | 'restoring' | 'searching' | 'desk' | 'fallback' | 'touch' | 'anchor';

export interface CueInput {
  placement: PlacementKind;
  /** The board is visible and playable (desk, fallback, touch or anchor). */
  placed: boolean;
  /** A desk tap would (re)place the board. */
  listening: boolean;
  /** The player held the knob: the next desk tap moves the board. */
  moveRequested: boolean;
  /** The creature has stood in a hand's shadow at least once. */
  everDashed: boolean;
  /** The creature is paused (it waits for a hand). */
  paused: boolean;
}

export type PromptKind = 'none' | 'tap-desk' | 'tap-new-spot' | 'waits' | 'teach';

export interface Cues {
  ghost: boolean;
  prompt: PromptKind;
  /** The prompt sits on the board (true) or floats in front of the viewer (false). */
  promptOnBoard: boolean;
  /** The small "tap & hold to move" label by the knob. */
  knobLabel: boolean;
  /** A pointing hold on top of something may register it as cover. */
  canRegister: boolean;
}

export const PROMPT_LINES: Record<Exclude<PromptKind, 'none'>, readonly string[]> = {
  'tap-desk': ['Tap your desk with one finger', '!and hold it still'],
  'tap-new-spot': ['Tap the desk where you want it,', '!and hold it still'],
  waits: ['It waits for your hand.', '!Show me a hand.'],
  teach: ['Hold your hand up in the light,', "!like 'stop'"],
};

export const KNOB_LINES: readonly string[] = ['tap & hold', '!to move'];

export function newCues(): Cues {
  return { ghost: false, prompt: 'none', promptOnBoard: true, knobLabel: false, canRegister: false };
}

/** Writes the cues for this frame into `cues` (no allocation) and returns it. */
export function firstRunCues(i: CueInput, cues: Cues = newCues()): Cues {
  const onDesk = i.placed && i.placement !== 'fallback';
  cues.ghost = i.placed && !i.everDashed;
  cues.prompt = 'none';
  cues.promptOnBoard = true;
  cues.knobLabel = onDesk && !i.everDashed && !i.moveRequested;
  cues.canRegister = onDesk && !i.moveRequested && (!i.listening || i.placement === 'desk');
  if (!onDesk) {
    // Searching, or a board floating in the air: first find the desk.
    if (i.listening && i.placement !== 'restoring' && i.placement !== 'preview') {
      cues.prompt = 'tap-desk';
      cues.promptOnBoard = false;
    }
    return cues;
  }
  if (i.moveRequested) cues.prompt = 'tap-new-spot';
  else if (i.paused) cues.prompt = 'waits';
  else if (!i.everDashed) cues.prompt = 'teach';
  return cues;
}
