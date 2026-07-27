export type MaterialId =
  | 'wood'
  | 'stone'
  | 'iron'
  | 'throne'
  | 'masonsYard'
  | 'oilVat'
  | 'bastion';

export interface Material {
  id: MaterialId;
  name: string;
  /** Gold to place one block during the build phase. */
  cost: number;
  hp: number;
  /**
   * How far a block of this material can cantilever sideways from a vertical
   * support before it counts as unsupported. Higher = wider arches and
   * battlements are stable.
   */
  maxSpan: number;
  /** Multiplier on damage taken from cannon fire specifically. */
  blastResist: number;
  /** Multiplier on damage taken from melee (knights, sappers). */
  meleeResist: number;
  fill: number;
  stroke: number;
  /** Rubble that survives a fall keeps this fraction of its max HP at most. */
  brittleness: number;
}

export const MATERIALS: Record<MaterialId, Material> = {
  wood: {
    id: 'wood',
    name: 'Timber',
    cost: 5,
    hp: 55,
    maxSpan: 2,
    blastResist: 1.35,
    meleeResist: 1.4,
    fill: 0x8a5a34,
    stroke: 0x5d3a20,
    brittleness: 0.9,
  },
  stone: {
    id: 'stone',
    name: 'Stone',
    cost: 15,
    hp: 150,
    maxSpan: 3,
    blastResist: 1.0,
    meleeResist: 0.55,
    fill: 0x8d949e,
    stroke: 0x5c626b,
    brittleness: 0.6,
  },
  iron: {
    id: 'iron',
    name: 'Iron',
    cost: 32,
    hp: 300,
    maxSpan: 5,
    blastResist: 0.55,
    meleeResist: 0.3,
    fill: 0x6b7f9e,
    stroke: 0x3f4d63,
    brittleness: 0.35,
  },
  /**
   * The three support bases. Each one powers a defence card: build it and you
   * have the card, lose it and the card dies with it. They cost no gold — where
   * you put them is the decision, not whether you can afford them — and two of
   * the three do a little of their card's job on their own, so they still
   * matter in a siege where nobody is holding the cards.
   */
  masonsYard: {
    id: 'masonsYard',
    name: "Mason's Yard",
    cost: 0,
    hp: 150,
    maxSpan: 1,
    blastResist: 1.0,
    meleeResist: 1.0,
    fill: 0x4f9d69,
    stroke: 0x2f6b45,
    brittleness: 1,
  },
  oilVat: {
    id: 'oilVat',
    name: 'Oil Vat',
    cost: 0,
    hp: 130,
    maxSpan: 1,
    blastResist: 1.0,
    meleeResist: 1.0,
    fill: 0xe07b2a,
    stroke: 0x8f4b13,
    brittleness: 1,
  },
  bastion: {
    id: 'bastion',
    name: 'Bastion',
    cost: 0,
    // No passive of its own, so it earns its place by being hard to shift.
    hp: 260,
    maxSpan: 1,
    blastResist: 0.7,
    meleeResist: 0.6,
    fill: 0x6b7f9e,
    stroke: 0x3f4d63,
    brittleness: 0.5,
  },
  throne: {
    id: 'throne',
    name: 'Throne',
    cost: 0,
    /**
     * Deliberately far tougher than any wall. The throne sits on the bottom row
     * at a fixed spot, so the cheapest plan was always to bore straight along
     * the ground to it — and a compact keep with only four columns in front of
     * the throne fell in 23 seconds no matter how much stone was piled above.
     * Making the last few metres the expensive part is what stops "reach it"
     * and "win" being the same thing.
     */
    hp: 380,
    maxSpan: 1,
    blastResist: 1.0,
    meleeResist: 1.0,
    fill: 0xd4a12c,
    stroke: 0x8a660f,
    brittleness: 1,
  },
};

export const BUILDABLE: MaterialId[] = ['wood', 'stone', 'iron'];

/**
 * Which defence card each base powers. Destroying the base takes the card out
 * of the defender's hand and out of their deck for the rest of the battle.
 *
 * This is what stops the far end of the build zone being dead space. A wall
 * behind the throne can never be on the attacker's path, so it was worthless;
 * a mason's yard behind the throne is worth a detour, which makes the ground it
 * stands on worth fighting over.
 */
export const CARD_BASES: Record<string, MaterialId> = {
  repair: 'masonsYard',
  boilingOil: 'oilVat',
  reinforce: 'bastion',
};

export const BASE_MATERIALS = Object.values(CARD_BASES);

export function isBase(mat: MaterialId): boolean {
  return BASE_MATERIALS.includes(mat);
}

/** The card a base powers, or null for ordinary masonry. */
export function cardForBase(mat: MaterialId): string | null {
  return Object.keys(CARD_BASES).find((id) => CARD_BASES[id] === mat) ?? null;
}
