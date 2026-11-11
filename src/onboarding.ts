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
  /**
   * The creature stands waiting in a hand's shadow out on the path and has
   * never reached its trinket: the hand has to slide along to lead it.
   */
  leading: boolean;
  /** Day 5: the creature was spotted and has not dashed again since. */
  spotted?: boolean;
  /** Day 5: a hand is at the lantern and the keeper is awake. */
  awake?: boolean;
  /** Day 5: a win, and no hand back at the ghost's spot yet. */
  again?: boolean;
  /** Day 6: level 2 is unlocked (a level-1 win or ?level=2). */
  unlocked?: boolean;
  /** Day 6: the round's level (1 when absent). */
  level?: number;
  /** Day 6: registered real objects. */
  objects?: number;
  /** Day 6, level 2: the registered object shades the whole stretch of path inside the gaze. */
  mugCovers?: boolean;
  /** Day 6, level 2: a hand shades the path inside the gaze (the keeper is awake). */
  gazeWake?: boolean;
  /** Day 6, level 2: the creature waits at or past the gaze (the hand goes over to the other side). */
  pastGaze?: boolean;
  /** Day 6, level 2: won at least once. */
  l2Won?: boolean;
}

export type PromptKind = 'none' | 'tap-desk' | 'tap-new-spot' | 'waits' | 'teach' | 'slide' | 'spotted' | 'too-close' | 'again'
  | 'unlocked' | 'need-object' | 'mug-off' | 'gaze' | 'l2-teach' | 'l2-swap';

/** Where the ghost hand stands: level 1's spot, or level 2's left or right of the gaze. */
export type GhostSpot = 'teach' | 'left' | 'right';

export interface Cues {
  ghost: boolean;
  prompt: PromptKind;
  /** The prompt sits on the board (true) or floats in front of the viewer (false). */
  promptOnBoard: boolean;
  /** The small "tap & hold to move" label by the knob. */
  knobLabel: boolean;
  /** A pointing hold on top of something may register it as cover. */
  canRegister: boolean;
  /** Day 6: where the ghost hand stands. */
  ghostSpot: GhostSpot;
  /** Day 6: the keeper's gaze is drawn (level 2, or level 2 unlocked). */
  gaze: boolean;
  /** Day 6: the ghost mug shows where the object goes. */
  mugGhost: boolean;
}

export const PROMPT_LINES: Record<Exclude<PromptKind, 'none'>, readonly string[]> = {
  'tap-desk': ['Tap your desk with one finger', '!and hold it still'],
  'tap-new-spot': ['Tap the desk where you want it,', '!and hold it still'],
  waits: ['It waits for your hand.', '!Show me a hand.'],
  // Day 3: "Hold your hand up in the light" sent hands into the lit area in
  // front of the path (no shadow on it) or above the sight line (a wrist
  // higher than about 7 cm). The hand must stand low, between lantern and path.
  teach: ["Stand your hand like 'stop'", '!between the lantern and the path'],
  // Day 4: a standing hand shades a lane, not the whole light, so the
  // creature waits at the lane's far edge until the hand slides along.
  slide: ['Slide your hand along, slowly:', '!it follows your shadow'],
  // Day 5: after a spot the slide card stayed, with no reason and the wrong
  // next step; after a win nothing said where to go.
  spotted: ['It saw it!', "!Keep your hand in the light's way"],
  'too-close': ['Too close: the keeper woke up.', '!Keep your hand off the lantern'],
  again: ['Home! Bring your hand back', '!to the ghost for another round'],
  // Day 6, level 2: a real object is needed. Unlocked by a level-1 win; it
  // starts once an object is registered, and without one the game says so.
  unlocked: ['Level 2: stand a mug or a book', '!in the gaze; hold a finger on top'],
  'need-object': ['Level 2 needs a real mug or book', '!in the gaze; hold a finger on top'],
  'mug-off': ["The mug must cover the gaze:", '!stand it on the ghost mug'],
  gaze: ['A hand in its gaze wakes it.', '!Only the mug may stand there'],
  'l2-teach': ['Hand at the ghost; edge it to', '!the mug, but not into the gaze'],
  'l2-swap': ['The mug hides it. Lift your hand', '!over to the other ghost'],
};

export const KNOB_LINES: readonly string[] = ['tap & hold', '!to move'];

export function newCues(): Cues {
  return { ghost: false, prompt: 'none', promptOnBoard: true, knobLabel: false, canRegister: false, ghostSpot: 'teach', gaze: false, mugGhost: false };
}

/** Writes the cues for this frame into `cues` (no allocation) and returns it. */
export function firstRunCues(i: CueInput, cues: Cues = newCues()): Cues {
  const onDesk = i.placed && i.placement !== 'fallback';
  cues.ghost = i.placed && (!i.everDashed || !!i.again);
  cues.prompt = 'none';
  cues.promptOnBoard = true;
  cues.knobLabel = onDesk && !i.everDashed && !i.moveRequested;
  cues.canRegister = onDesk && !i.moveRequested && (!i.listening || i.placement === 'desk');
  cues.ghostSpot = 'teach';
  const l2 = i.level === 2;
  cues.gaze = i.placed && (l2 || !!i.unlocked);
  cues.mugGhost = cues.gaze && (!i.objects || (l2 && !i.mugCovers));
  if (!onDesk) {
    // A board floating in the air: ask for a desk tap. Not while the desk is
    // still being looked for (day 4): the card made people tap during an
    // automatic placement that came a moment later.
    if (i.listening && i.placement === 'fallback') {
      cues.prompt = 'tap-desk';
      cues.promptOnBoard = false;
    }
    return cues;
  }
  if (l2) return level2Cues(i, cues);
  if (i.moveRequested) cues.prompt = 'tap-new-spot';
  else if (i.paused) cues.prompt = 'waits';
  else if (i.awake) cues.prompt = 'too-close';
  else if (i.spotted) cues.prompt = 'spotted';
  else if (!i.everDashed) cues.prompt = 'teach';
  else if (i.again) cues.prompt = 'again';
  else if (i.leading) cues.prompt = 'slide';
  // Level 1 after its first win (once the "again" card is done), no object yet: say what level 2 needs; level 1 plays on meanwhile.
  if (i.unlocked && !i.objects && cues.prompt === 'none') cues.prompt = 'unlocked';
  return cues;
}

/**
 * Level 2's cards. The ghost hand stands left of the gaze to start and right
 * of it once the creature waits in the mug's shadow. Without an object the
 * card says level 2 needs one: the level is never faked (no win without it).
 */
function level2Cues(i: CueInput, cues: Cues): Cues {
  cues.ghost = false;
  // the same order as level 1 for what both share (a move, a lost hand, a waking keeper, a spot)
  const shared = i.moveRequested ? 'tap-new-spot' : i.paused ? 'waits' : i.gazeWake ? 'gaze' : i.awake ? 'too-close' : 'none';
  if (shared !== 'none') cues.prompt = shared;
  else if (!i.objects) cues.prompt = 'need-object';
  else if (!i.mugCovers) cues.prompt = 'mug-off';
  else if (i.spotted) {
    cues.prompt = 'spotted';
  } else if (i.again) {
    cues.prompt = 'again';
    cues.ghost = true;
    cues.ghostSpot = 'left';
  } else if (i.pastGaze) {
    cues.prompt = 'l2-swap';
    cues.ghost = true;
    cues.ghostSpot = 'right';
  } else if (!i.l2Won) {
    cues.prompt = 'l2-teach';
    cues.ghost = true;
    cues.ghostSpot = 'left';
  }
  return cues;
}
