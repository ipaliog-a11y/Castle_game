import Phaser from 'phaser';
import { GROUND_Y, WORLD_HEIGHT, WORLD_WIDTH } from '../core/config';
import { store } from '../core/store';
import { COLORS, FONT, drawBackdrop, panel } from '../ui/theme';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    drawBackdrop(this, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y);

    this.add
      .text(WORLD_WIDTH / 2, 150, 'SIEGE & STONE', {
        fontFamily: FONT,
        fontSize: '64px',
        color: COLORS.text,
      })
      .setOrigin(0.5);
    this.add
      .text(WORLD_WIDTH / 2, 202, 'Build it. Then bring it down.', {
        fontFamily: FONT,
        fontSize: '20px',
        color: COLORS.dim,
      })
      .setOrigin(0.5);

    this.button(WORLD_WIDTH / 2, 300, 'BUILD YOUR CASTLE', 'Defence — spend your budget on walls', () =>
      this.scene.start('Build'),
    );

    const canSiege = store.hasCastle();
    this.button(
      WORLD_WIDTH / 2,
      386,
      'LAY SIEGE',
      canSiege ? 'Offence — attack the castle you built' : 'Build a castle first',
      () => {
        if (canSiege) this.scene.start('Siege');
      },
      canSiege,
    );

    if (store.lastResult) {
      const r = store.lastResult;
      const msg = r.attackerWon
        ? `Last siege: throne fell in ${(r.msElapsed / 1000).toFixed(1)}s`
        : `Last siege: the castle held with ${r.blocksLeft}/${r.blocksAtStart} blocks standing`;
      this.add
        .text(WORLD_WIDTH / 2, 470, msg, { fontFamily: FONT, fontSize: '16px', color: COLORS.gold })
        .setOrigin(0.5);
    }
  }

  private button(
    cx: number,
    cy: number,
    title: string,
    sub: string,
    onClick: () => void,
    enabled = true,
  ): void {
    const w = 420;
    const h = 66;
    const g = this.add.graphics();
    const paint = (hover: boolean) => {
      g.clear();
      panel(
        g,
        cx - w / 2,
        cy - h / 2,
        w,
        h,
        enabled ? (hover ? 0x232c40 : 0x171d2b) : 0x131720,
        enabled ? (hover ? 0x7f8fb0 : COLORS.panelEdge) : 0x232b3b,
        0.95,
        10,
      );
    };
    paint(false);

    this.add
      .text(cx, cy - 10, title, {
        fontFamily: FONT,
        fontSize: '22px',
        color: enabled ? COLORS.text : COLORS.dim,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, cy + 16, sub, { fontFamily: FONT, fontSize: '13px', color: COLORS.dim })
      .setOrigin(0.5);

    const zone = this.add
      .rectangle(cx, cy, w, h, 0, 0)
      .setInteractive({ useHandCursor: enabled });
    zone.on('pointerover', () => paint(true));
    zone.on('pointerout', () => paint(false));
    zone.on('pointerup', onClick);
  }
}
