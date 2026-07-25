import Phaser from 'phaser';
import type { CardDef, CardEngine } from '../core/cards';
import { COLORS, FONT, panel } from './theme';

const CARD_W = 136;
const CARD_H = 92;
const GAP = 10;

/**
 * Bottom-left hand of ability cards plus the energy meter. Slots are tappable
 * and report back which slot was pressed; the scene decides what the card does.
 */
export class CardBar {
  private g: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text[] = [];
  private blurbText: Phaser.GameObjects.Text[] = [];
  private costText: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Rectangle[] = [];

  /** Slot index of a targeted card waiting for the player to pick a spot. */
  armedSlot = -1;

  constructor(
    scene: Phaser.Scene,
    private engine: CardEngine,
    private x: number,
    private y: number,
    private onPress: (slot: number, card: CardDef) => void,
  ) {
    this.g = scene.add.graphics().setDepth(50).setScrollFactor(0);

    for (let i = 0; i < engine.handSize; i++) {
      const cx = this.x + i * (CARD_W + GAP);
      this.nameText.push(
        scene.add
          .text(cx + 12, this.y + 9, '', { fontFamily: FONT, fontSize: '14px', color: COLORS.text })
          .setDepth(51)
          .setScrollFactor(0),
      );
      this.blurbText.push(
        scene.add
          .text(cx + 12, this.y + 30, '', {
            fontFamily: FONT,
            fontSize: '11px',
            color: COLORS.dim,
            wordWrap: { width: CARD_W - 24 },
          })
          .setDepth(51)
          .setScrollFactor(0),
      );
      // Cost sits in the bottom-right corner so long card names get the full width.
      this.costText.push(
        scene.add
          .text(cx + CARD_W - 10, this.y + CARD_H - 7, '', {
            fontFamily: FONT,
            fontSize: '13px',
            color: COLORS.gold,
          })
          .setOrigin(1, 1)
          .setDepth(51)
          .setScrollFactor(0),
      );

      const zone = scene.add
        .rectangle(cx + CARD_W / 2, this.y + CARD_H / 2, CARD_W, CARD_H, 0, 0)
        .setDepth(52)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        // Stop the tap also reaching the world (aiming, targeting, building).
        ev.stopPropagation();
        const card = this.engine.hand[i];
        if (card) this.onPress(i, card);
      });
      this.zones.push(zone);
    }
  }

  /** True when the pointer is over any card, so the world should ignore it. */
  hits(px: number, py: number): boolean {
    const w = this.engine.handSize * (CARD_W + GAP);
    return px >= this.x && px <= this.x + w && py >= this.y && py <= this.y + CARD_H;
  }

  refresh(): void {
    const g = this.g;
    g.clear();

    // Energy meter above the hand.
    const meterW = this.engine.handSize * (CARD_W + GAP) - GAP;
    const meterY = this.y - 18;
    panel(g, this.x, meterY, meterW, 10, 0x0d1119, COLORS.panelEdge, 0.9, 5);
    const frac = this.engine.energy / this.engine.energyMax;
    g.fillStyle(0x4fa3d1, 1);
    g.fillRoundedRect(this.x + 1, meterY + 1, Math.max(0, (meterW - 2) * frac), 8, 4);

    for (let i = 0; i < this.engine.handSize; i++) {
      const cx = this.x + i * (CARD_W + GAP);
      const card = this.engine.hand[i];

      if (!card) {
        panel(g, cx, this.y, CARD_W, CARD_H, 0x0d1119, 0x232b3b, 0.7);
        this.nameText[i].setText('');
        this.blurbText[i].setText('');
        this.costText[i].setText('');
        continue;
      }

      const playable = this.engine.canPlay(i);
      const armed = this.armedSlot === i;
      panel(
        g,
        cx,
        this.y,
        CARD_W,
        CARD_H,
        playable ? 0x1a2130 : 0x131720,
        armed ? 0xf0e2a8 : playable ? card.accent : 0x2b3243,
        playable ? 0.95 : 0.75,
      );
      // Accent stripe so cards read as distinct at a glance.
      g.fillStyle(card.accent, playable ? 1 : 0.35);
      g.fillRoundedRect(cx, this.y, 4, CARD_H, 2);

      this.nameText[i].setText(card.name).setColor(playable ? COLORS.text : COLORS.dim);
      this.blurbText[i].setText(card.blurb).setAlpha(playable ? 1 : 0.5);
      this.costText[i].setText(`${card.cost} energy`).setAlpha(playable ? 1 : 0.4);
    }
  }

  destroy(): void {
    this.g.destroy();
    for (const t of [...this.nameText, ...this.blurbText, ...this.costText]) t.destroy();
    for (const z of this.zones) z.destroy();
  }
}
