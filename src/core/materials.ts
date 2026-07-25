export type MaterialId = 'wood' | 'stone' | 'iron' | 'throne';

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
    hp: 40,
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
    hp: 110,
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
    cost: 45,
    hp: 260,
    maxSpan: 5,
    blastResist: 0.55,
    meleeResist: 0.3,
    fill: 0x6b7f9e,
    stroke: 0x3f4d63,
    brittleness: 0.35,
  },
  throne: {
    id: 'throne',
    name: 'Throne',
    cost: 0,
    hp: 200,
    maxSpan: 1,
    blastResist: 1.0,
    meleeResist: 1.0,
    fill: 0xd4a12c,
    stroke: 0x8a660f,
    brittleness: 1,
  },
};

export const BUILDABLE: MaterialId[] = ['wood', 'stone', 'iron'];
