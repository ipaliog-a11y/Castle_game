import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../core/config';
import { FONT_SIZE, TOUCH_MIN } from './layout';
import { COLORS, FONT, panel } from './theme';

/**
 * A modal panel over whatever scene is running.
 *
 * Built once and shown or hidden, rather than created on demand. A pause menu
 * that allocates a dozen Phaser objects every time it opens is the sort of
 * thing that stutters on the device it matters on, and the pause button is the
 * one control a player mashes.
 *
 * The blocker underneath is not decoration. Without it a tap that misses a menu
 * button falls straight through to the scene below — which in a battle means
 * firing the cannon at whatever is behind the pause menu.
 */

const ROW_H = TOUCH_MIN;
const ROW_GAP = 12;

export interface OverlayRow {
  label: string;
  /** Optional right-hand value, for a setting rather than an action. */
  value?: () => string;
  /** Optional second line under the label. */
  blurb?: () => string;
  onPress: () => void;
  /** Drawn in the danger colour. For things you cannot take back. */
  danger?: boolean;
}

export class Overlay {
  private root: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private rowTexts: Array<{
    label: Phaser.GameObjects.Text;
    value: Phaser.GameObjects.Text;
    blurb: Phaser.GameObjects.Text;
  }> = [];
  private rows: OverlayRow[] = [];
  private titleText: Phaser.GameObjects.Text;
  private hitZones: Phaser.GameObjects.Rectangle[] = [];

  /** Depth 80: above the card bar, the shells and the shouted word. */
  constructor(scene: Phaser.Scene, private maxRows = 5) {
    this.root = scene.add.container(0, 0).setDepth(80).setVisible(false);

    const blocker = scene.add
      .rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x0a0d14, 0.72)
      .setInteractive();
    // Swallow everything. The scene below must not see a stray tap.
    blocker.on('pointerdown', (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      ev: Phaser.Types.Input.EventData,
    ) => ev.stopPropagation());
    this.root.add(blocker);

    this.g = scene.add.graphics();
    this.root.add(this.g);

    this.titleText = scene.add
      .text(WORLD_WIDTH / 2, 0, '', {
        fontFamily: FONT,
        fontSize: '38px',
        color: COLORS.text,
      })
      .setOrigin(0.5);
    this.root.add(this.titleText);

    for (let i = 0; i < maxRows; i++) {
      const label = scene.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: `${FONT_SIZE.body}px`, color: COLORS.text })
        .setOrigin(0, 0.5);
      const value = scene.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: `${FONT_SIZE.body}px`, color: COLORS.gold })
        .setOrigin(1, 0.5);
      const blurb = scene.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: `${FONT_SIZE.small}px`, color: COLORS.dim })
        .setOrigin(0, 0.5);
      this.root.add([label, value, blurb]);

      const zone = scene.add.rectangle(0, 0, 10, 10, 0, 0).setInteractive({ useHandCursor: true });
      zone.on(
        'pointerdown',
        (
          _p: Phaser.Input.Pointer,
          _x: number,
          _y: number,
          ev: Phaser.Types.Input.EventData,
        ) => {
          ev.stopPropagation();
          this.rows[i]?.onPress();
        },
      );
      this.root.add(zone);
      this.hitZones.push(zone);
      this.rowTexts.push({ label, value, blurb });
    }
  }

  get visible(): boolean {
    return this.root.visible;
  }

  show(title: string, rows: OverlayRow[]): void {
    this.rows = rows.slice(0, this.maxRows);
    this.root.setVisible(true);
    this.layout(title);
  }

  hide(): void {
    this.root.setVisible(false);
  }

  /** Re-renders the values in place. Used when a row toggles a setting. */
  refresh(title: string): void {
    if (this.root.visible) this.layout(title);
  }

  private layout(title: string): void {
    const w = 620;
    const x = (WORLD_WIDTH - w) / 2;
    const bodyH = this.rows.length * ROW_H + (this.rows.length - 1) * ROW_GAP;
    const h = 96 + bodyH + 28;
    const y = (WORLD_HEIGHT - h) / 2;

    this.g.clear();
    panel(this.g, x, y, w, h, 0x141a26, 0x5c6a8a, 0.98, 14);
    this.titleText.setPosition(WORLD_WIDTH / 2, y + 46);

    let rowY = y + 96;
    for (let i = 0; i < this.rowTexts.length; i++) {
      const row = this.rows[i];
      const t = this.rowTexts[i];
      const zone = this.hitZones[i];
      if (!row) {
        t.label.setVisible(false);
        t.value.setVisible(false);
        t.blurb.setVisible(false);
        zone.setVisible(false).disableInteractive();
        continue;
      }

      const blurb = row.blurb?.() ?? '';
      panel(this.g, x + 24, rowY, w - 48, ROW_H, 0x1d2536, 0x46516c, 0.95, 8);

      // With a second line the label rides high and the blurb sits under it;
      // without one it centres. Two layouts rather than one that suits neither.
      t.label
        .setVisible(true)
        .setPosition(x + 44, blurb ? rowY + ROW_H / 2 - 12 : rowY + ROW_H / 2)
        .setText(row.label)
        .setColor(row.danger ? COLORS.danger : COLORS.text);
      t.value
        .setVisible(!!row.value)
        .setPosition(x + w - 44, rowY + ROW_H / 2)
        .setText(row.value?.() ?? '');
      t.blurb
        .setVisible(!!blurb)
        .setPosition(x + 44, rowY + ROW_H / 2 + 13)
        .setText(blurb);

      zone
        .setVisible(true)
        .setPosition(x + w / 2, rowY + ROW_H / 2)
        .setSize(w - 48, ROW_H)
        .setInteractive({ useHandCursor: true });

      rowY += ROW_H + ROW_GAP;
    }

    this.titleText.setText(title);
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
