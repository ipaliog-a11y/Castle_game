import { CANNON_Y, WORLD_HEIGHT } from '../core/config';

/**
 * One place for HUD sizing, because the numbers are not arbitrary.
 *
 * The world is 1280×600 and the canvas is fitted to the screen, so on a 390px
 * phone one world pixel is about **0.65 CSS pixels**. Everything here is chosen
 * against that: `TEXT_MIN` lands on roughly 13 CSS pixels, which is about the
 * floor for reading at arm's length, and `TOUCH_MIN` on 44, the usual guideline
 * for something you tap with a thumb.
 *
 * Where the panels sit is not arbitrary either. The battlefield is crowded:
 *
 * ```
 *   x 0                                                            1280
 *     ├─ cannon ─┤                                ├──── castle ────────┤
 *     0        150                              640                  1248
 * ```
 *
 * The cannon owns the bottom left, the castle owns the right, and troops march
 * across the ground between them. That leaves the left *column* — above the
 * cannon and clear of both — as the only place a hand of cards can live without
 * covering something the player needs to watch. Hence a vertical card bar.
 */

/** ~12 CSS pixels on a phone. Below this, text on a 390px screen is a smudge. */
export const TEXT_MIN = 18;
/** ~44 CSS pixels, the usual floor for a thumb target. */
export const TOUCH_MIN = 68;

export const FONT_SIZE = {
  /** Gold, timer, scene name. */
  headline: 24,
  /** Status messages and readouts. */
  body: 21,
  /** Hints and secondary labels. */
  small: 20,
  cardName: 21,
  /** The smallest text in the game, and the only thing at the floor. */
  cardBlurb: TEXT_MIN,
  cardCost: 20,
};

/** Top strip carrying gold, the clock and the buttons. */
export const TOP_BAR_H = 64;

/**
 * Standard tappable HUD button. Height is short of `TOUCH_MIN`: the top bar is
 * the scarcest space in a 600px-tall world, and 56 still lands on about 36 CSS
 * pixels, against the 22 it replaced.
 */
export const BUTTON = { w: 196, h: 56 };

/**
 * Vertical card column down the left edge. It stops above the cannon: the
 * player must be able to see the gun that is firing at them (or for them).
 */
export const CARD = {
  x: 10,
  w: 240,
  h: 114,
  gap: 10,
  /** Symbol box on the left of each card; the text starts to its right. */
  icon: 56,
  iconPad: 12,
  /** Top of the energy readout; the hand starts below it. */
  meterY: TOP_BAR_H + 10,
  meterH: 40,
};

/** Left edge of a card's text, clear of the symbol. */
export const CARD_TEXT_X = CARD.x + CARD.iconPad * 2 + CARD.icon;

/** Where the hand begins, leaving room for the energy readout above it. */
export const CARD_TOP = CARD.meterY + CARD.meterH + 10;

/**
 * Highest point the gun occupies, and the floor the card column stops above.
 *
 * Not the carriage: the barrel pivots at `CANNON_Y - 10` and is 42 long, so at
 * full elevation its muzzle — the part you are actually reading when you aim —
 * swings up to `CANNON_Y - 52`. Measuring to the carriage would leave the
 * bottom card covering exactly the shots that need the most care.
 */
export const CANNON_TOP = CANNON_Y - 60;

export function cardBarBottom(handSize: number): number {
  return CARD_TOP + handSize * (CARD.h + CARD.gap) - CARD.gap;
}

/**
 * A guard rather than a comment. The hand growing a card, or the cards growing
 * taller, would silently start covering the gun again — which is the exact bug
 * this layout exists to fix — so it fails loudly at boot instead.
 */
export function assertCardBarClearsCannon(handSize: number): void {
  const bottom = cardBarBottom(handSize);
  if (bottom > CANNON_TOP) {
    throw new Error(
      `Card bar reaches ${bottom} but the cannon starts at ${CANNON_TOP}: ` +
        'shrink CARD.h or the hand size, or the gun goes back behind the cards.',
    );
  }
  if (bottom > WORLD_HEIGHT) {
    throw new Error(`Card bar reaches ${bottom}, past the bottom of the world.`);
  }
}
