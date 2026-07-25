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

/** Attacker staging area. */
export const CANNON_X = 96;
export const CANNON_Y = GROUND_Y - 24;
export const SPAWN_X = 40;

export const BUILD_BUDGET = 900;
export const SIEGE_DURATION_MS = 180_000;

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
