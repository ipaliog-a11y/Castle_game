export type UnitId = 'knight' | 'sapper';

export interface UnitDef {
  id: UnitId;
  name: string;
  gold: number;
  hp: number;
  /** Pixels per second along the ground. */
  speed: number;
  /** Damage per second against castle blocks. */
  dps: number;
  width: number;
  height: number;
  fill: number;
  stroke: number;
  /** How many cells of vertical climb the unit can step up without stopping. */
  climb: number;
}

export const UNITS: Record<UnitId, UnitDef> = {
  knight: {
    id: 'knight',
    name: 'Knight',
    gold: 40,
    hp: 90,
    speed: 85,
    dps: 26,
    width: 16,
    height: 40,
    fill: 0xc7d0dc,
    stroke: 0x5a6473,
    climb: 1,
  },
  sapper: {
    id: 'sapper',
    name: 'Sapper',
    gold: 70,
    hp: 55,
    speed: 65,
    dps: 68,
    width: 16,
    height: 34,
    fill: 0x9c6b3f,
    stroke: 0x5c3d21,
    climb: 1,
  },
};

/**
 * Tuned for a 90-second battle (`SIEGE_DURATION_MS`).
 *
 * Income roughly doubled when the clock halved, so a battle still pays out
 * about the same total. The cap did not: banking 420 gold let you sit through
 * the opening and then delete a wall with a burst of shots, which is a worse
 * game than spending as you go. 260 is a little over a full magazine.
 */
export const GOLD_START = 190;
export const GOLD_PER_SEC = 13;
export const GOLD_MAX = 260;
export const SHOT_GOLD = 15;
export const SHOT_COOLDOWN_MS = 900;
