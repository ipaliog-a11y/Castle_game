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
import { BASE_MATERIALS, BUILDABLE, MATERIALS, isBase, type MaterialId } from '../core/materials';
import { store } from '../core/store';
import { CastleView } from '../ui/CastleView';
import { BASE_GLYPH, drawGlyph } from '../ui/icons';
import { BUTTON, FONT_SIZE, TOP_BAR_H } from '../ui/layout';
import { COLORS, FONT, drawBackdrop, panel } from '../ui/theme';

/** Palette entry: symbol on the left, name and price to its right. */
const PALETTE = { w: 168, h: 52, gap: 8, glyph: 38 };
/**
 * Bases get a square, symbol-only button. They have no price to show, their
 * glyph is already their identity — it is the same one their card wears — and
 * seven full-width entries do not fit the bar beside the gold and BEGIN SIEGE.
 */
const BASE_BUTTON_W = 64;

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
      if (p.y < TOP_BAR_H) return; // HUD strip
      this.painting = true;
      this.apply(p.worldX, p.worldY);
    });
    this.input.on('pointerup', () => (this.painting = false));
    this.input.on('pointerupoutside', () => (this.painting = false));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const col = xToCol(p.worldX);
      const row = yToRow(p.worldY);
      this.hover = this.inBuildZone(col, row) ? { col, row } : null;
      if (this.painting && p.y >= TOP_BAR_H) this.apply(p.worldX, p.worldY);
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
    for (const fn of this.paletteRefresh) fn();
    this.redraw();
  }

  private place(col: number, row: number, mat: MaterialId): void {
    if (this.castle.has(col, row)) return;
    if (isBase(mat) && this.castle.find(mat)) {
      this.hint(`You already have a ${MATERIALS[mat].name}. Erase it to move it.`);
      return;
    }
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
    panel(g, 0, 0, WORLD_WIDTH, TOP_BAR_H, COLORS.panel, COLORS.panelEdge, 0.96, 0);
    const midY = TOP_BAR_H / 2;

    let x = 16;
    for (const mat of BUILDABLE) {
      x = this.paletteButton(x, mat, `${MATERIALS[mat].name} ${MATERIALS[mat].cost}g`);
    }
    // Bases cost nothing: where they go is the decision, not whether you can
    // afford them. One of each, so the choice is placement and not quantity.
    for (const mat of BASE_MATERIALS) {
      x = this.paletteButton(x, mat, '', BASE_BUTTON_W);
    }
    // Erase is symbol-only too: a struck-out block needs no caption, and the
    // full-width version pushed into the gold readout.
    x = this.paletteButton(x + 10, 'erase', '', BASE_BUTTON_W);

    this.budgetText = this.add
      .text(WORLD_WIDTH - 236, midY, '', {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.headline}px`,
        color: COLORS.gold,
      })
      .setOrigin(1, 0.5)
      .setDepth(41);

    this.textButton(WORLD_WIDTH - 118, midY, 204, BUTTON.h, 'BEGIN SIEGE', () => {
      store.saveCastle(this.castle, this.spent);
      this.scene.start('Siege');
    });
    this.textButton(WORLD_WIDTH - 92, TOP_BAR_H + 40, 152, 44, 'Menu', () => {
      store.saveCastle(this.castle, this.spent);
      this.scene.start('Menu');
    });
    this.textButton(WORLD_WIDTH - 256, TOP_BAR_H + 40, 152, 44, 'Clear all', () => {
      this.castle = store.newCastle();
      this.spent = 0;
      this.view.destroy();
      this.view = new CastleView(this, this.castle, 5);
      this.redraw();
    });

    this.add
      .text(
        16,
        TOP_BAR_H + 48,
        'The yard, vat and bastion each give you a defence card — lose one in battle and the card goes with it.',
        { fontFamily: FONT, fontSize: `${FONT_SIZE.small}px`, color: COLORS.dim },
      )
      .setOrigin(0, 0.5)
      .setDepth(41);

    this.hintText = this.add
      .text(16, TOP_BAR_H + 22, '', {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.small}px`,
        color: COLORS.danger,
      })
      .setOrigin(0, 0.5)
      .setDepth(41);
  }

  /**
   * One palette entry. The symbol carries the meaning — planks, a staggered
   * brick bond, a riveted plate — so which material is selected reads without
   * the name, and the dimmed symbol on an unselected entry says so too.
   */
  private paletteButton(x: number, tool: Tool, text: string, width?: number): number {
    const { h, gap, glyph } = PALETTE;
    const w = width ?? PALETTE.w;
    const y = (TOP_BAR_H - h) / 2;
    const g = this.add.graphics().setDepth(41);
    const t = this.add
      .text(x + glyph + 22, y + h / 2, text, {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.small}px`,
        color: COLORS.text,
      })
      .setOrigin(0, 0.5)
      .setDepth(42);

    const paint = () => {
      const on = this.tool === tool;
      g.clear();
      const accent = tool === 'erase' ? 0xb05a4a : MATERIALS[tool].fill;
      panel(g, x, y, w, h, on ? 0x27314a : 0x161c28, on ? accent : 0x2b3243, 0.95, 6);
      // Symbol-only buttons centre their glyph; labelled ones lead with it.
      const gx = text ? x + 12 + glyph / 2 : x + w / 2;
      // A base's glyph is its card's, so the palette, the block on the field
      // and the card in your hand are all visibly the same thing.
      drawGlyph(g, BASE_GLYPH[tool] ?? tool, gx, y + h / 2, glyph, accent, on ? 1 : 0.45);
      // A base already placed reads as spent, so the palette shows the state of
      // the castle and not just what is selected.
      if (tool !== 'erase' && isBase(tool) && this.castle.find(tool)) {
        g.fillStyle(0x6fce93, 0.9);
        g.fillCircle(x + w - 10, y + 10, 5);
      }
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

    return x + w + gap;
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
      .text(cx, cy, text, {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.small}px`,
        color: COLORS.text,
      })
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
