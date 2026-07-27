/**
 * How worn a block looks. Pure functions, deliberately in their own module so
 * they can be tested without a browser — `CastleView` pulls in Phaser, which a
 * plain node test cannot load.
 */

/**
 * Health thresholds between the four damage stages.
 *
 * Discrete stages rather than a continuum, and that is the whole point. A
 * smooth tint means 90% and 70% look identical, so damage could only be read by
 * staring at a block — and worse, it never told you whether one more hit would
 * finish it. Four steps make every transition a visible event, and "cracked"
 * versus "crumbling" is something you can act on.
 */
export const DAMAGE_STAGES = [0.75, 0.5, 0.25];

/** 0 for pristine, up to `DAMAGE_STAGES.length` for about to fall apart. */
export function damageStage(health: number): number {
  let stage = 0;
  for (const threshold of DAMAGE_STAGES) if (health < threshold) stage++;
  return stage;
}

/**
 * A stable pseudo-random number for a grid cell.
 *
 * Cracks have to land in the same place every frame. `draw` runs sixty times a
 * second, so cracks re-rolled per frame would shimmer like static — a fault
 * that is invisible in a screenshot and unbearable in motion. Deriving them
 * from the coordinates gives every block its own permanent pattern for free,
 * with no state to store and nothing taken from the battle's dice.
 */
export function cellHash(col: number, row: number): number {
  let h = (col * 73856093) ^ (row * 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}
