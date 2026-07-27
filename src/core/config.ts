/** Shared world constants. Everything is expressed in grid cells first, pixels second. */

export const CELL = 32;

export const GRID_COLS = 40;
export const GRID_ROWS = 16;

/** Pixel offset of grid cell (0,0). The strip below the grid is the ground. */
export const GRID_ORIGIN_X = 0;
export const GRID_ORIGIN_Y = 64;

export const WORLD_WIDTH = GRID_COLS * CELL;
export const WORLD_HEIGHT = GRID_ORIGIN_Y + GRID_ROWS * CELL + 24;

/** y of the ground surface — the bottom edge of the last grid row. */
export const GROUND_Y = GRID_ORIGIN_Y + GRID_ROWS * CELL;

/** Columns the defender is allowed to build in. */
export const BUILD_COL_MIN = 20;
export const BUILD_COL_MAX = GRID_COLS - 2;

/** Where the throne sits. Destroying it ends the siege. */
export const THRONE_COL = 35;
export const THRONE_ROW = GRID_ROWS - 1;

/**
 * Support buildings may only stand strictly behind the throne.
 *
 * Without the rule there is a dominant answer and therefore no decision: the
 * safest cell for a base is the one immediately in *front* of the throne, where
 * the player's entire wall shields it, and tucking all three there leaves the
 * rear exactly as dead as it was before bases existed. Bases were added to give
 * that ground a purpose, so the ground is where they go.
 *
 * The rule is enforced when a block is placed, not when a castle is loaded. A
 * save made before this existed keeps its bases wherever they are — deleting
 * part of somebody's castle to enforce a balance rule is a worse trade than
 * letting an old castle keep a small advantage.
 */
export const BASE_COL_MIN = THRONE_COL + 1;

/** Attacker staging area. */
export const CANNON_X = 96;
export const CANNON_Y = GROUND_Y - 24;
export const SPAWN_X = 40;

export const BUILD_BUDGET = 900;

/**
 * A battle is 90 seconds. Three minutes left too much of the middle as waiting:
 * the economy paid out faster than it could be spent and the AI's pressure ramp
 * crawled. Everything timed against the clock was rescaled to match — income,
 * energy regen, AI reloads and wave spacing — so this constant cannot be changed
 * on its own without re-tuning `units.ts`, `cards.ts` and `DefendScene`.
 */
export const SIEGE_DURATION_MS = 90_000;

/**
 * Downward acceleration on cannonballs, in pixels per second squared.
 *
 * Here rather than in `BattleScene` because the aim solver, the arc preview and
 * the simulation all have to agree on it, and two of those three are not
 * scenes. A preview drawn against a different gravity than the shell flies with
 * is a lie the player has no way to see through.
 */
export const BALL_GRAVITY = 900;

/**
 * The simulation advances in fixed slices, never by whatever the last frame
 * happened to take.
 *
 * Two reasons, and the second is the important one. A phone dropping to 30fps
 * used to get materially different physics from a desktop at 60 — Euler
 * integration with a doubled `dt` overshoots — so a wall that held on one
 * device could fall on another. And a battle can only be replayed from a seed
 * if every step is identical, which a variable `dt` makes impossible no matter
 * how well the dice are seeded.
 */
export const STEP_MS = 1000 / 60;

export function colToX(col: number): number {
  return GRID_ORIGIN_X + col * CELL;
}

export function rowToY(row: number): number {
  return GRID_ORIGIN_Y + row * CELL;
}

export function xToCol(x: number): number {
  return Math.floor((x - GRID_ORIGIN_X) / CELL);
}

export function yToRow(y: number): number {
  return Math.floor((y - GRID_ORIGIN_Y) / CELL);
}
