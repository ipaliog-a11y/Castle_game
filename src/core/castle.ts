import { GRID_COLS, GRID_ROWS } from './config';
import { MATERIALS, type MaterialId } from './materials';

export type DamageKind = 'blast' | 'melee' | 'impact';

export interface Block {
  col: number;
  row: number;
  mat: MaterialId;
  hp: number;
  maxHp: number;
}

export interface CastleSave {
  v: 1;
  spent: number;
  blocks: Array<[col: number, row: number, mat: MaterialId, hpFrac?: number]>;
}

const idx = (col: number, row: number) => row * GRID_COLS + col;

/**
 * The castle is a fixed grid of blocks. Structural integrity is not simulated
 * with rigid bodies — instead every block is either reachable from the ground
 * through a chain of supports or it is not, and unreachable blocks fall. The
 * chain allows limited sideways cantilever (per material) so arches and
 * battlements stand, but knocking out a pillar still drops everything above it.
 */
export class Castle {
  private cells: Array<Block | null> = new Array(GRID_COLS * GRID_ROWS).fill(null);

  inBounds(col: number, row: number): boolean {
    return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
  }

  get(col: number, row: number): Block | null {
    if (!this.inBounds(col, row)) return null;
    return this.cells[idx(col, row)];
  }

  has(col: number, row: number): boolean {
    return this.get(col, row) !== null;
  }

  place(col: number, row: number, mat: MaterialId, hpFrac = 1): Block | null {
    if (!this.inBounds(col, row) || this.has(col, row)) return null;
    const def = MATERIALS[mat];
    const block: Block = {
      col,
      row,
      mat,
      maxHp: def.hp,
      hp: Math.max(1, Math.round(def.hp * hpFrac)),
    };
    this.cells[idx(col, row)] = block;
    return block;
  }

  remove(col: number, row: number): Block | null {
    const block = this.get(col, row);
    if (block) this.cells[idx(col, row)] = null;
    return block;
  }

  all(): Block[] {
    const out: Block[] = [];
    for (const cell of this.cells) if (cell) out.push(cell);
    return out;
  }

  count(): number {
    let n = 0;
    for (const cell of this.cells) if (cell) n++;
    return n;
  }

  find(mat: MaterialId): Block | null {
    for (const cell of this.cells) if (cell && cell.mat === mat) return cell;
    return null;
  }

  /**
   * Applies damage and returns the block if this hit destroyed it. Resistances
   * are per material and per damage kind, so stone shrugs off swords while
   * timber burns down under them.
   */
  damage(block: Block, amount: number, kind: DamageKind): Block | null {
    const def = MATERIALS[block.mat];
    const mult =
      kind === 'blast' ? def.blastResist : kind === 'melee' ? def.meleeResist : 1;
    block.hp -= amount * mult;
    if (block.hp <= 0) {
      this.remove(block.col, block.row);
      return block;
    }
    return null;
  }

  /**
   * Marks every block that can trace a support chain back to the ground.
   * Seeds are the blocks resting on the bottom row. Support propagates
   * straight up for free and sideways at the cost of one span point, capped by
   * the material's `maxSpan`.
   */
  computeSupported(): Set<number> {
    const span = new Array<number>(GRID_COLS * GRID_ROWS).fill(Infinity);
    const queue: number[] = [];

    const bottom = GRID_ROWS - 1;
    for (let col = 0; col < GRID_COLS; col++) {
      const at = idx(col, bottom);
      if (this.cells[at]) {
        span[at] = 0;
        queue.push(at);
      }
    }

    // Upward edges reset the span to 0, which breaks Dijkstra's monotonic
    // ordering, so this relaxes to a fixpoint instead. The grid is small and
    // span only ever decreases, so it settles in a handful of passes.
    while (queue.length > 0) {
      const at = queue.pop()!;
      const s = span[at];
      const col = at % GRID_COLS;
      const row = (at - col) / GRID_COLS;

      // Straight up: a block sitting on a supported block is fully supported.
      this.relax(col, row - 1, 0, span, queue);
      // Sideways: costs one span point, bounded by the neighbour's material.
      this.relax(col - 1, row, s + 1, span, queue);
      this.relax(col + 1, row, s + 1, span, queue);
    }

    const supported = new Set<number>();
    for (let at = 0; at < span.length; at++) {
      if (span[at] !== Infinity) supported.add(at);
    }
    return supported;
  }

  private relax(
    col: number,
    row: number,
    candidate: number,
    span: number[],
    queue: number[],
  ): void {
    if (!this.inBounds(col, row)) return;
    const at = idx(col, row);
    const block = this.cells[at];
    if (!block) return;
    if (candidate > MATERIALS[block.mat].maxSpan) return;
    if (candidate >= span[at]) return;
    span[at] = candidate;
    queue.push(at);
  }

  /** Blocks that lost their support chain and should fall this frame. */
  findUnsupported(): Block[] {
    const supported = this.computeSupported();
    const falling: Block[] = [];
    for (let at = 0; at < this.cells.length; at++) {
      const block = this.cells[at];
      if (block && !supported.has(at)) falling.push(block);
    }
    // Fall from the bottom up so debris lands in a stable order.
    falling.sort((a, b) => b.row - a.row);
    return falling;
  }

  /** First free row a falling block in this column would come to rest on. */
  landingRow(col: number, fromRow: number): number {
    let row = fromRow;
    while (row + 1 < GRID_ROWS && !this.has(col, row + 1)) row++;
    return row;
  }

  serialize(spent: number): CastleSave {
    return {
      v: 1,
      spent,
      blocks: this.all().map((b) =>
        b.hp === b.maxHp
          ? ([b.col, b.row, b.mat] as [number, number, MaterialId])
          : ([b.col, b.row, b.mat, +(b.hp / b.maxHp).toFixed(3)] as [
              number,
              number,
              MaterialId,
              number,
            ]),
      ),
    };
  }

  static deserialize(save: CastleSave): Castle {
    const castle = new Castle();
    for (const [col, row, mat, hpFrac] of save.blocks) {
      castle.place(col, row, mat, hpFrac ?? 1);
    }
    return castle;
  }
}
