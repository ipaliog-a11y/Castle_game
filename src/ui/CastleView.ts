import Phaser from 'phaser';
import type { Block, Castle } from '../core/castle';
import { CELL, GRID_COLS, colToX, rowToY } from '../core/config';
import { MATERIALS, type MaterialId } from '../core/materials';

/** Renders the castle grid. Both the builder and the siege use this. */
export class CastleView {
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, private castle: Castle, depth = 5) {
    this.g = scene.add.graphics().setDepth(depth);
  }

  draw(opts: { showSupport?: boolean; ghost?: { col: number; row: number; mat: MaterialId } } = {}): void {
    const g = this.g;
    g.clear();

    const unsupported = opts.showSupport ? this.unsupportedSet() : null;

    for (const block of this.castle.all()) {
      this.drawBlock(g, block, unsupported?.has(block.row * GRID_COLS + block.col) ?? false);
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

  private drawBlock(g: Phaser.GameObjects.Graphics, block: Block, unsupported: boolean): void {
    const def = MATERIALS[block.mat];
    const x = colToX(block.col);
    const y = rowToY(block.row);
    const health = Phaser.Math.Clamp(block.hp / block.maxHp, 0, 1);

    // Damaged blocks darken toward near-black so wear reads without extra art.
    const fill = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0x1a1410),
      Phaser.Display.Color.ValueToColor(def.fill),
      100,
      Math.round(30 + health * 70),
    );
    const tint = Phaser.Display.Color.GetColor(fill.r, fill.g, fill.b);

    g.fillStyle(tint, 1);
    g.fillRect(x, y, CELL, CELL);

    // Top highlight and bottom shade give the flat cells some relief.
    g.fillStyle(0xffffff, 0.07);
    g.fillRect(x, y, CELL, 3);
    g.fillStyle(0x000000, 0.16);
    g.fillRect(x, y + CELL - 4, CELL, 4);

    g.lineStyle(1, unsupported ? 0xe5654f : def.stroke, unsupported ? 1 : 0.85);
    g.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);

    if (block.mat === 'throne') {
      g.fillStyle(0xffe9a8, 0.9);
      g.fillRect(x + 8, y + 8, CELL - 16, CELL - 16);
      g.fillStyle(def.stroke, 1);
      g.fillRect(x + 12, y + 4, 3, 8);
      g.fillRect(x + CELL - 15, y + 4, 3, 8);
    }

    if (health < 0.75) {
      g.lineStyle(1, 0x000000, 0.5);
      g.beginPath();
      g.moveTo(x + 6, y + CELL - 4);
      g.lineTo(x + 13, y + CELL * 0.5);
      g.lineTo(x + 9, y + 6);
      if (health < 0.4) {
        g.moveTo(x + CELL - 5, y + 5);
        g.lineTo(x + CELL - 14, y + CELL * 0.55);
        g.lineTo(x + CELL - 8, y + CELL - 5);
      }
      g.strokePath();
    }

    if (unsupported) {
      g.fillStyle(0xe5654f, 0.18);
      g.fillRect(x, y, CELL, CELL);
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
