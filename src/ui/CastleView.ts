import Phaser from 'phaser';
import type { Block, Castle } from '../core/castle';
import { CELL, GRID_COLS, colToX, rowToY } from '../core/config';
import { MATERIALS, type MaterialId } from '../core/materials';
import { DAMAGE_STAGES, cellHash, damageStage } from './damage';
import { BASE_GLYPH, drawGlyph } from './icons';

/** Renders the castle grid. Both the builder and the siege use this. */
export class CastleView {
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, private castle: Castle, depth = 5) {
    this.g = scene.add.graphics().setDepth(depth);
  }

  draw(opts: { showSupport?: boolean; ghost?: { col: number; row: number; mat: MaterialId } } = {}): void {
    const g = this.g;
    g.clear();

    // In the builder, every block wears a bar showing how much cantilever it has
    // left before its material gives out. `maxSpan` is the number that decides
    // whether a castle stands, and it was invisible: you learned it by watching
    // things fall. Green means room to reach further, red means this block is
    // at its limit and the next one out will drop. Timber goes red after two
    // cells, stone three, iron five — which is the rule, shown rather than told.
    const spans = opts.showSupport ? this.castle.computeSpans() : null;
    const unsupported = opts.showSupport ? this.unsupportedSet() : null;

    for (const block of this.castle.all()) {
      this.drawBlock(g, block, unsupported?.has(block.row * GRID_COLS + block.col) ?? false);
      if (spans) this.drawHeadroom(g, block, spans);
    }

    if (opts.ghost) {
      const { col, row, mat } = opts.ghost;
      const def = MATERIALS[mat];
      const x = colToX(col);
      const y = rowToY(row);
      g.fillStyle(def.fill, 0.45);
      g.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      g.lineStyle(2, 0xffffff, 0.6);
      g.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
    }
  }

  private unsupportedSet(): Set<number> {
    const supported = this.castle.computeSupported();
    const out = new Set<number>();
    for (const b of this.castle.all()) {
      const at = b.row * GRID_COLS + b.col;
      if (!supported.has(at)) out.add(at);
    }
    return out;
  }

  /** Span headroom as a bar along the block's base. */
  private drawHeadroom(g: Phaser.GameObjects.Graphics, block: Block, spans: number[]): void {
    const left = this.castle.spanHeadroom(block.col, block.row, spans);
    if (left < 0) return; // already floating; the red outline says so

    const x = colToX(block.col);
    const y = rowToY(block.row);
    const colour = left === 0 ? 0xe5654f : left === 1 ? 0xe8c15a : 0x6fce93;
    // Width tracks how much is left, so a run of blocks reaching outward shows
    // the bar shrinking cell by cell.
    const frac = Math.min(1, (left + 1) / 4);
    g.fillStyle(0x000000, 0.35);
    g.fillRect(x + 4, y + CELL - 7, CELL - 8, 4);
    g.fillStyle(colour, 0.95);
    g.fillRect(x + 4, y + CELL - 7, (CELL - 8) * frac, 4);
  }

  private drawBlock(g: Phaser.GameObjects.Graphics, block: Block, unsupported: boolean): void {
    const def = MATERIALS[block.mat];
    const x = colToX(block.col);
    const y = rowToY(block.row);
    const health = Phaser.Math.Clamp(block.hp / block.maxHp, 0, 1);

    const stage = damageStage(health);

    // Wear darkens the block, but only so far.
    //
    // This used to run down to 30% of the material's colour, which meant a
    // nearly-dead iron block, stone block and timber block all converged on the
    // same dark smudge — you could no longer tell what you were shooting at,
    // which is exactly when knowing matters. The floor is 62% now, so a
    // material stays recognisable at any health, and the *damage* is carried by
    // the cracks below instead of by the colour.
    const shade = 100 - stage * 13;
    const fill = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0x1a1410),
      Phaser.Display.Color.ValueToColor(def.fill),
      100,
      shade,
    );
    const tint = Phaser.Display.Color.GetColor(fill.r, fill.g, fill.b);

    g.fillStyle(tint, 1);
    g.fillRect(x, y, CELL, CELL);

    // Top highlight and bottom shade give the flat cells some relief.
    g.fillStyle(0xffffff, 0.07);
    g.fillRect(x, y, CELL, 3);
    g.fillStyle(0x000000, 0.16);
    g.fillRect(x, y + CELL - 4, CELL, 4);

    // A base wears its card's symbol, so losing one reads as losing the card.
    const glyph = BASE_GLYPH[block.mat];
    if (glyph) {
      drawGlyph(g, glyph, x + CELL / 2, y + CELL / 2, CELL - 6, 0xf2f5fb, 0.55 + health * 0.45);
    }

    g.lineStyle(1, unsupported ? 0xe5654f : def.stroke, unsupported ? 1 : 0.85);
    g.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);

    if (block.mat === 'throne') {
      g.fillStyle(0xffe9a8, 0.9);
      g.fillRect(x + 8, y + 8, CELL - 16, CELL - 16);
      g.fillStyle(def.stroke, 1);
      g.fillRect(x + 12, y + 4, 3, 8);
      g.fillRect(x + CELL - 15, y + 4, 3, 8);
    }

    this.drawCracks(g, block, stage);

    if (unsupported) {
      g.fillStyle(0xe5654f, 0.18);
      g.fillRect(x, y, CELL, CELL);
    }
  }

  /**
   * One crack per damage stage, spreading inward from the edges.
   *
   * Drawn twice — a dark line with a pale one offset a pixel below it — because
   * a single dark stroke on a dark block is invisible at phone scale, and the
   * highlight is what makes a crack read as a split rather than a scratch. The
   * last stage adds a broken-off corner, which is the one shape that says
   * "about to go" at a glance rather than on inspection.
   */
  private drawCracks(g: Phaser.GameObjects.Graphics, block: Block, stage: number): void {
    if (stage === 0) return;
    const x = colToX(block.col);
    const y = rowToY(block.row);
    const h = cellHash(block.col, block.row);
    const mid = CELL / 2;

    for (let i = 0; i < stage; i++) {
      const bits = (h >>> (i * 7)) & 0x7f;
      // Each crack starts on its own edge, so two never sit on top of each other.
      const edge = (i + (h & 3)) % 4;
      const along = 6 + (bits & 7) * 2.5;
      const kink = ((bits >> 3) & 7) - 3.5;

      const start =
        edge === 0 ? [along, 0]
        : edge === 1 ? [CELL, along]
        : edge === 2 ? [CELL - along, CELL]
        : [0, CELL - along];
      const end = [mid + kink * 1.6, mid - kink];
      const bend = [(start[0] + end[0]) / 2 + kink, (start[1] + end[1]) / 2 - kink * 1.2];

      const path = (dx: number, dy: number) => {
        g.beginPath();
        g.moveTo(x + start[0] + dx, y + start[1] + dy);
        g.lineTo(x + bend[0] + dx, y + bend[1] + dy);
        g.lineTo(x + end[0] + dx, y + end[1] + dy);
        g.strokePath();
      };

      g.lineStyle(2, 0x140f0c, 0.62);
      path(0, 0);
      g.lineStyle(1, 0xffffff, 0.14);
      path(0.5, 1.5);
    }

    // Crumbling: a corner has gone. Reads instantly, and from across the field.
    if (stage >= DAMAGE_STAGES.length) {
      const corner = h & 3;
      const cx = corner === 0 || corner === 3 ? x : x + CELL;
      const cy = corner < 2 ? y : y + CELL;
      const sx = cx === x ? 1 : -1;
      const sy = cy === y ? 1 : -1;
      const bite = 9 + (h & 3);
      g.fillStyle(0x0d0a08, 0.55);
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + sx * bite, cy);
      g.lineTo(cx, cy + sy * bite);
      g.closePath();
      g.fillPath();
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
