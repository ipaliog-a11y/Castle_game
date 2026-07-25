import Phaser from 'phaser';
import { Castle } from '../core/castle';
import {
  BUILD_BUDGET,
  BUILD_COL_MAX,
  BUILD_COL_MIN,
  CELL,
  GRID_COLS,
  GRID_ROWS,
  GROUND_Y,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  colToX,
  rowToY,
  xToCol,
  yToRow,
} from '../core/config';
import { BUILDABLE, MATERIALS, type MaterialId } from '../core/materials';
import { store } from '../core/store';
import { CastleView } from '../ui/CastleView';
import { COLORS, FONT, drawBackdrop, panel } from '../ui/theme';

type Tool = MaterialId | 'erase';

export class BuildScene extends Phaser.Scene {
  private castle!: Castle;
  private view!: CastleView;
  private overlay!: Phaser.GameObjects.Graphics;
  private tool: Tool = 'stone';
  private spent = 0;
  private painting = false;
  private hover: { col: number; row: number } | null = null;
  private budgetText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private paletteRefresh: Array<() => void> = [];

  constructor() {
    super('Build');
  }

  create(): void {
    this.castle = store.loadCastle();
    this.spent = store.castleSave?.spent ?? 0;

    drawBackdrop(this, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y);
    this.overlay = this.add.graphics().setDepth(3);
    this.view = new CastleView(this, this.castle, 5);

    this.buildHud();
    this.bindInput();
    this.redraw();
  }

  // ---------------------------------------------------------------- input

  private bindInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < 56) return; // HUD strip
      this.painting = true;
      this.apply(p.worldX, p.worldY);
    });
    this.input.on('pointerup', () => (this.painting = false));
    this.input.on('pointerupoutside', () => (this.painting = false));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const col = xToCol(p.worldX);
      const row = yToRow(p.worldY);
      this.hover = this.inBuildZone(col, row) ? { col, row } : null;
      if (this.painting && p.y >= 56) this.apply(p.worldX, p.worldY);
      else this.redraw();
    });
  }

  private inBuildZone(col: number, row: number): boolean {
    return col >= BUILD_COL_MIN && col <= BUILD_COL_MAX && row >= 0 && row < GRID_ROWS;
  }

  private apply(worldX: number, worldY: number): void {
    const col = xToCol(worldX);
    const row = yToRow(worldY);
    if (!this.inBuildZone(col, row)) {
      this.hint('You can only build inside the marked ground.');
      return;
    }
    if (this.tool === 'erase') this.erase(col, row);
    else this.place(col, row, this.tool);
    this.redraw();
  }

  private place(col: number, row: number, mat: MaterialId): void {
    if (this.castle.has(col, row)) return;
    const cost = MATERIALS[mat].cost;
    if (this.spent + cost > BUILD_BUDGET) {
      this.hint('Out of gold. Erase something or start the siege.');
      return;
    }
    const block = this.castle.place(col, row, mat);
    if (!block) return;

    // Reject anything that would float: the same support rule the siege uses.
    if (!this.castle.computeSupported().has(row * GRID_COLS + col)) {
      this.castle.remove(col, row);
      this.hint(`${MATERIALS[mat].name} can only overhang ${MATERIALS[mat].maxSpan} cells.`);
      return;
    }
    this.spent += cost;
    this.hint('');
  }

  private erase(col: number, row: number): void {
    const block = this.castle.get(col, row);
    if (!block) return;
    if (block.mat === 'throne') {
      this.hint('The throne stays. Build around it.');
      return;
    }
    this.castle.remove(col, row);
    this.spent -= MATERIALS[block.mat].cost;

    // Anything the removal orphaned comes down too, and is refunded.
    for (const orphan of this.castle.findUnsupported()) {
      this.castle.remove(orphan.col, orphan.row);
      if (orphan.mat !== 'throne') this.spent -= MATERIALS[orphan.mat].cost;
    }
    this.spent = Math.max(0, this.spent);
    this.hint('');
  }

  // ------------------------------------------------------------------ hud

  private buildHud(): void {
    const g = this.add.graphics().setDepth(40);
    panel(g, 0, 0, WORLD_WIDTH, 56, COLORS.panel, COLORS.panelEdge, 0.96, 0);

    this.add
      .text(16, 28, 'BUILD PHASE', { fontFamily: FONT, fontSize: '18px', color: COLORS.text })
      .setOrigin(0, 0.5);

    let x = 170;
    for (const mat of BUILDABLE) {
      x = this.paletteButton(x, mat, `${MATERIALS[mat].name}  ${MATERIALS[mat].cost}g`);
    }
    x = this.paletteButton(x + 12, 'erase', 'Erase');

    this.budgetText = this.add
      .text(WORLD_WIDTH - 232, 28, '', { fontFamily: FONT, fontSize: '18px', color: COLORS.gold })
      .setOrigin(1, 0.5)
      .setDepth(41);

    this.textButton(WORLD_WIDTH - 150, 28, 130, 34, 'BEGIN SIEGE', () => {
      store.saveCastle(this.castle, this.spent);
      this.scene.start('Siege');
    });
    this.textButton(WORLD_WIDTH - 150, 78, 130, 30, 'Menu', () => {
      store.saveCastle(this.castle, this.spent);
      this.scene.start('Menu');
    });
    this.textButton(WORLD_WIDTH - 296, 78, 130, 30, 'Clear all', () => {
      this.castle = store.newCastle();
      this.spent = 0;
      this.view.destroy();
      this.view = new CastleView(this, this.castle, 5);
      this.redraw();
    });

    this.hintText = this.add
      .text(16, 78, '', { fontFamily: FONT, fontSize: '14px', color: COLORS.danger })
      .setOrigin(0, 0.5)
      .setDepth(41);
  }

  private paletteButton(x: number, tool: Tool, text: string): number {
    const w = 132;
    const h = 34;
    const y = 11;
    const g = this.add.graphics().setDepth(41);
    const t = this.add
      .text(x + w / 2, 28, text, { fontFamily: FONT, fontSize: '14px', color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(42);

    const paint = () => {
      const on = this.tool === tool;
      g.clear();
      const accent = tool === 'erase' ? 0xb05a4a : MATERIALS[tool].fill;
      panel(g, x, y, w, h, on ? 0x27314a : 0x161c28, on ? accent : 0x2b3243, 0.95, 6);
      g.fillStyle(accent, on ? 1 : 0.5);
      g.fillRoundedRect(x + 6, y + 8, 10, h - 16, 2);
      t.setColor(on ? COLORS.text : COLORS.dim);
    };
    paint();
    this.paletteRefresh.push(paint);

    this.add
      .rectangle(x + w / 2, y + h / 2, w, h, 0, 0)
      .setDepth(43)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.tool = tool;
        for (const fn of this.paletteRefresh) fn();
      });

    return x + w + 8;
  }

  private textButton(
    cx: number,
    cy: number,
    w: number,
    h: number,
    text: string,
    onClick: () => void,
  ): void {
    const g = this.add.graphics().setDepth(41);
    panel(g, cx - w / 2, cy - h / 2, w, h, 0x1d2536, 0x5c6a8a, 0.95, 6);
    this.add
      .text(cx, cy, text, { fontFamily: FONT, fontSize: '14px', color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(42);
    this.add
      .rectangle(cx, cy, w, h, 0, 0)
      .setDepth(43)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        onClick();
      });
  }

  private hint(msg: string): void {
    this.hintText.setText(msg);
  }

  // -------------------------------------------------------------- drawing

  private redraw(): void {
    const g = this.overlay;
    g.clear();

    // Buildable ground marker.
    const x0 = colToX(BUILD_COL_MIN);
    const x1 = colToX(BUILD_COL_MAX + 1);
    g.fillStyle(0x6fce93, 0.05);
    g.fillRect(x0, rowToY(0), x1 - x0, GRID_ROWS * CELL);
    g.lineStyle(2, 0x6fce93, 0.35);
    g.beginPath();
    g.moveTo(x0, GROUND_Y);
    g.lineTo(x1, GROUND_Y);
    g.strokePath();

    g.lineStyle(1, 0xffffff, 0.05);
    for (let c = BUILD_COL_MIN; c <= BUILD_COL_MAX + 1; c++) {
      g.beginPath();
      g.moveTo(colToX(c), rowToY(0));
      g.lineTo(colToX(c), GROUND_Y);
      g.strokePath();
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      g.beginPath();
      g.moveTo(x0, rowToY(r));
      g.lineTo(x1, rowToY(r));
      g.strokePath();
    }

    const ghost =
      this.hover && this.tool !== 'erase' && !this.castle.has(this.hover.col, this.hover.row)
        ? { col: this.hover.col, row: this.hover.row, mat: this.tool }
        : undefined;
    this.view.draw({ showSupport: true, ghost });

    if (this.hover && this.tool === 'erase' && this.castle.has(this.hover.col, this.hover.row)) {
      g.lineStyle(2, 0xe5654f, 0.9);
      g.strokeRect(colToX(this.hover.col) + 1, rowToY(this.hover.row) + 1, CELL - 2, CELL - 2);
    }

    this.budgetText.setText(`Gold ${BUILD_BUDGET - this.spent} / ${BUILD_BUDGET}`);
  }
}
