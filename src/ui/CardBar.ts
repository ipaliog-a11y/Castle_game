import Phaser from 'phaser';
import type { CardDef, CardEngine } from '../core/cards';
import { drawCardIcon } from './icons';
import { CARD, CARD_TEXT_X, CARD_TOP, FONT_SIZE, assertCardBarClearsCannon } from './layout';
import { COLORS, FONT, panel } from './theme';

/**
 * The hand of ability cards, as a column down the left edge, with the energy
 * readout above it.
 *
 * Vertical rather than along the bottom because the bottom of the battlefield
 * belongs to the cannon and the marching troops — see `layout.ts` for the map.
 * The energy total is spelled out as a number *and* drawn as one pip per point,
 * because "can I afford the 5-cost card right now" is a question a smooth bar
 * cannot answer.
 *
 * Each card leads with a drawn symbol and its cost beneath, so the card can be
 * recognised and priced without reading the name — see `icons.ts`.
 */
export class CardBar {
  private g: Phaser.GameObjects.Graphics;
  private energyText: Phaser.GameObjects.Text;
  private nameText: Phaser.GameObjects.Text[] = [];
  private blurbText: Phaser.GameObjects.Text[] = [];
  private costText: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Rectangle[] = [];

  /** Slot index of a targeted card waiting for the player to pick a spot. */
  armedSlot = -1;

  constructor(
    scene: Phaser.Scene,
    private engine: CardEngine,
    private onPress: (slot: number, card: CardDef) => void,
  ) {
    assertCardBarClearsCannon(engine.handSize);

    this.g = scene.add.graphics().setDepth(50).setScrollFactor(0);

    this.energyText = scene.add
      .text(CARD.x + 10, CARD.meterY + 3, '', {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.body}px`,
        color: COLORS.text,
      })
      .setDepth(51)
      .setScrollFactor(0);

    for (let i = 0; i < engine.handSize; i++) {
      const cy = this.slotY(i);
      this.nameText.push(
        scene.add
          .text(CARD_TEXT_X, cy + 12, '', {
            fontFamily: FONT,
            fontSize: `${FONT_SIZE.cardName}px`,
            color: COLORS.text,
          })
          .setDepth(51)
          .setScrollFactor(0),
      );
      this.blurbText.push(
        scene.add
          .text(CARD_TEXT_X, cy + 40, '', {
            fontFamily: FONT,
            fontSize: `${FONT_SIZE.cardBlurb}px`,
            color: COLORS.dim,
            wordWrap: { width: CARD.x + CARD.w - CARD_TEXT_X - 12 },
          })
          .setDepth(51)
          .setScrollFactor(0),
      );
      // Cost sits directly under the symbol. Pairing the two means the whole
      // left edge of the card answers "what is it, and can I afford it".
      this.costText.push(
        scene.add
          .text(this.iconX(), cy + CARD.h - 26, '', {
            fontFamily: FONT,
            fontSize: `${FONT_SIZE.cardCost}px`,
            color: COLORS.gold,
          })
          .setOrigin(0.5, 0)
          .setDepth(51)
          .setScrollFactor(0),
      );

      const zone = scene.add
        .rectangle(CARD.x + CARD.w / 2, cy + CARD.h / 2, CARD.w, CARD.h, 0, 0)
        .setDepth(52)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      zone.on(
        'pointerdown',
        (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
          // Stop the tap also reaching the world (aiming, targeting, building).
          ev.stopPropagation();
          const card = this.engine.hand[i];
          if (card) this.onPress(i, card);
        },
      );
      this.zones.push(zone);
    }
  }

  private slotY(i: number): number {
    return CARD_TOP + i * (CARD.h + CARD.gap);
  }

  /** Centre of the symbol box, which the cost is centred under too. */
  private iconX(): number {
    return CARD.x + CARD.iconPad + CARD.icon / 2;
  }

  /** True when the pointer is over the bar, so the world should ignore it. */
  hits(px: number, py: number): boolean {
    const bottom = this.slotY(this.engine.handSize - 1) + CARD.h;
    return px >= CARD.x && px <= CARD.x + CARD.w && py >= CARD.meterY && py <= bottom;
  }

  refresh(): void {
    const g = this.g;
    g.clear();

    this.drawEnergy(g);

    for (let i = 0; i < this.engine.handSize; i++) {
      const cy = this.slotY(i);
      const card = this.engine.hand[i];

      if (!card) {
        panel(g, CARD.x, cy, CARD.w, CARD.h, 0x0d1119, 0x232b3b, 0.7);
        this.nameText[i].setText('');
        this.blurbText[i].setText('');
        this.costText[i].setText('');
        continue;
      }

      const playable = this.engine.canPlay(i);
      const armed = this.armedSlot === i;
      panel(
        g,
        CARD.x,
        cy,
        CARD.w,
        CARD.h,
        playable ? 0x1a2130 : 0x131720,
        armed ? 0xf0e2a8 : playable ? card.accent : 0x2b3243,
        playable ? 0.95 : 0.75,
      );
      // Accent stripe so cards read as distinct at a glance.
      g.fillStyle(card.accent, playable ? 1 : 0.35);
      g.fillRoundedRect(CARD.x, cy, 5, CARD.h, 2);

      drawCardIcon(
        g,
        card.id,
        this.iconX(),
        cy + 12 + CARD.icon / 2,
        CARD.icon,
        card.accent,
        playable ? 1 : 0.4,
      );

      this.nameText[i].setText(card.name).setColor(playable ? COLORS.text : COLORS.dim);
      this.blurbText[i].setText(card.blurb).setAlpha(playable ? 1 : 0.5);
      this.costText[i].setText(`${card.cost}`).setAlpha(playable ? 1 : 0.4);
    }
  }

  /** Number plus one pip per point, so a cost can be counted off against it. */
  private drawEnergy(g: Phaser.GameObjects.Graphics): void {
    const energy = Math.floor(this.engine.energy);
    const max = this.engine.energyMax;
    panel(g, CARD.x, CARD.meterY, CARD.w, CARD.meterH, 0x0d1119, COLORS.panelEdge, 0.92, 6);
    this.energyText.setText(`Energy ${energy}/${max}`);

    const pipW = (CARD.w - 20) / max;
    for (let i = 0; i < max; i++) {
      const filled = i < energy;
      g.fillStyle(filled ? 0x4fa3d1 : 0x232b3b, filled ? 1 : 0.8);
      g.fillRoundedRect(
        CARD.x + 10 + i * pipW,
        CARD.meterY + CARD.meterH - 12,
        Math.max(2, pipW - 3),
        5,
        2,
      );
    }
  }

  destroy(): void {
    this.g.destroy();
    this.energyText.destroy();
    for (const t of [...this.nameText, ...this.blurbText, ...this.costText]) t.destroy();
    for (const z of this.zones) z.destroy();
  }
}
