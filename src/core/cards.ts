import { Rng, randomSeed } from './rng';

export type Side = 'offense' | 'defense';

/**
 * How the card resolves once played:
 *  - `instant`  fires the moment it is tapped
 *  - `targeted` arms the card, then resolves where the player next taps
 *  - `arm`      modifies the next cannon shot instead of doing anything now
 */
export type CardKind = 'instant' | 'targeted' | 'arm';

export interface CardDef {
  id: string;
  name: string;
  side: Side;
  cost: number;
  kind: CardKind;
  blurb: string;
  accent: number;
  /** Radius in cells for targeted cards, used to draw the placement preview. */
  radius?: number;
}

export const CARDS: Record<string, CardDef> = {
  chainShot: {
    id: 'chainShot',
    name: 'Chain Shot',
    side: 'offense',
    cost: 3,
    kind: 'arm',
    blurb: 'Next shot splits into three balls.',
    accent: 0xe0803a,
  },
  blackPowder: {
    id: 'blackPowder',
    name: 'Black Powder',
    side: 'offense',
    cost: 4,
    kind: 'arm',
    blurb: 'Next shot hits harder, in a wider blast.',
    accent: 0xd6483a,
  },
  sapperCharge: {
    id: 'sapperCharge',
    name: 'Sapper Charge',
    side: 'offense',
    cost: 5,
    kind: 'targeted',
    radius: 1.6,
    blurb: 'Blows a hole through the wall you tap.',
    accent: 0xb8452f,
  },
  rally: {
    id: 'rally',
    name: 'Rally',
    side: 'offense',
    cost: 3,
    kind: 'instant',
    blurb: 'Troops move and hit harder for 8s.',
    accent: 0xc9a227,
  },
  // Defined and ready for the defence-vs-AI level; not dealt in the siege
  // prototype because you play the attacker there.
  repair: {
    id: 'repair',
    name: 'Masons',
    side: 'defense',
    cost: 3,
    kind: 'targeted',
    radius: 2.5,
    blurb: 'Repairs damaged blocks around your tap.',
    accent: 0x4f9d69,
  },
  boilingOil: {
    id: 'boilingOil',
    name: 'Boiling Oil',
    side: 'defense',
    cost: 4,
    kind: 'targeted',
    radius: 2,
    blurb: 'Scalds attackers around your tap.',
    accent: 0xe07b2a,
  },
  reinforce: {
    id: 'reinforce',
    name: 'Reinforce',
    side: 'defense',
    cost: 5,
    kind: 'instant',
    blurb: 'Castle takes 40% less damage, for 10s.',
    accent: 0x6b7f9e,
  },
};

export const OFFENSE_DECK = ['chainShot', 'blackPowder', 'sapperCharge', 'rally'];
export const DEFENSE_DECK = ['repair', 'boilingOil', 'reinforce'];

export class CardEngine {
  private rng: Rng;

  energy: number;
  readonly energyMax: number;
  readonly regenPerSec: number;
  readonly handSize: number;

  hand: Array<CardDef | null> = [];
  private draw: CardDef[] = [];
  private discard: CardDef[] = [];

  constructor(
    deckIds: string[],
    opts: {
      handSize?: number;
      energyMax?: number;
      regenPerSec?: number;
      start?: number;
      /** The battle's dice, so a seeded battle deals the same hand. */
      rng?: Rng;
    } = {},
  ) {
    this.rng = opts.rng ?? new Rng(randomSeed());
    this.handSize = opts.handSize ?? 3;
    this.energyMax = opts.energyMax ?? 10;
    // Halving the clock halves how many cards a battle can afford, so regen
    // roughly doubled to keep a hand worth holding rather than hoarding.
    this.regenPerSec = opts.regenPerSec ?? 1.0;
    this.energy = opts.start ?? 5;

    // Two copies of each card keeps the draw varied without a real collection.
    for (const id of deckIds) {
      this.draw.push(CARDS[id], CARDS[id]);
    }
    this.shuffle(this.draw);
    for (let i = 0; i < this.handSize; i++) this.hand.push(this.drawOne());
  }

  update(deltaMs: number): void {
    this.energy = Math.min(this.energyMax, this.energy + (this.regenPerSec * deltaMs) / 1000);
  }

  canPlay(slot: number): boolean {
    const card = this.hand[slot];
    return !!card && this.energy >= card.cost;
  }

  /** Spends the energy, clears the slot and deals a replacement. */
  play(slot: number): CardDef | null {
    const card = this.hand[slot];
    if (!card || this.energy < card.cost) return null;
    this.energy -= card.cost;
    this.discard.push(card);
    this.hand[slot] = this.drawOne();
    return card;
  }

  private drawOne(): CardDef | null {
    if (this.draw.length === 0) {
      if (this.discard.length === 0) return null;
      this.draw = this.discard;
      this.discard = [];
      this.shuffle(this.draw);
    }
    return this.draw.pop() ?? null;
  }

  private shuffle<T>(arr: T[]): void {
    this.rng.shuffle(arr);
  }
}
