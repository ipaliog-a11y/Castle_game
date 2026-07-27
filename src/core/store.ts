import { Castle, type CastleSave } from './castle';
import { BUILD_BUDGET, THRONE_COL, THRONE_ROW } from './config';

const STORAGE_KEY = 'siege-and-stone:castle:v1';

export type PlayerSide = 'attack' | 'defend';

export interface SiegeResult {
  /** Who won the battle, independent of which side the human played. */
  attackerWon: boolean;
  /**
   * The battle's dice seed. Shown on the result screen so a battle worth
   * arguing about can be replayed exactly, with `?seed=`.
   */
  seed: number;
  playerSide: PlayerSide;
  msElapsed: number;
  blocksLeft: number;
  blocksAtStart: number;
}

/**
 * Both modes read and write the same castle, which is the whole point of the
 * prototype: what you build in the build phase is exactly what you besiege.
 */
class Store {
  castleSave: CastleSave | null = null;
  lastResult: SiegeResult | null = null;

  /** A fresh castle containing only the immovable throne. */
  newCastle(): Castle {
    const castle = new Castle();
    castle.place(THRONE_COL, THRONE_ROW, 'throne');
    return castle;
  }

  loadCastle(): Castle {
    if (this.castleSave) return Castle.deserialize(this.castleSave);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const save = JSON.parse(raw) as CastleSave;
        if (save.v === 1) {
          this.castleSave = save;
          return Castle.deserialize(save);
        }
      } catch {
        // Corrupt save: fall through to a fresh castle rather than dying.
      }
    }
    return this.newCastle();
  }

  saveCastle(castle: Castle, spent: number): void {
    this.castleSave = castle.serialize(spent);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.castleSave));
    } catch {
      // Private-mode browsers refuse writes; the in-memory copy still works.
    }
  }

  budgetLeft(): number {
    return BUILD_BUDGET - (this.castleSave?.spent ?? 0);
  }

  hasCastle(): boolean {
    if (this.castleSave) return this.castleSave.blocks.length > 1;
    return !!localStorage.getItem(STORAGE_KEY);
  }
}

export const store = new Store();
