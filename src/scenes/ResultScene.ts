import Phaser from 'phaser';
import { GROUND_Y, WORLD_HEIGHT, WORLD_WIDTH } from '../core/config';
import { store } from '../core/store';
import { COLORS, FONT, drawBackdrop, panel } from '../ui/theme';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(): void {
    drawBackdrop(this, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y);
    const r = store.lastResult;
    const won = r?.attackerWon ?? false;

    this.add
      .text(WORLD_WIDTH / 2, 170, won ? 'THE THRONE FALLS' : 'THE CASTLE HOLDS', {
        fontFamily: FONT,
        fontSize: '54px',
        color: won ? COLORS.danger : COLORS.good,
      })
      .setOrigin(0.5);

    if (r) {
      const razed = r.blocksAtStart - r.blocksLeft;
      const lines = [
        `Siege lasted ${(r.msElapsed / 1000).toFixed(1)}s`,
        `${razed} of ${r.blocksAtStart} blocks brought down`,
        won ? 'Your castle was not strong enough.' : 'Your walls did their job.',
      ];
      this.add
        .text(WORLD_WIDTH / 2, 250, lines.join('\n'), {
          fontFamily: FONT,
          fontSize: '18px',
          color: COLORS.dim,
          align: 'center',
          lineSpacing: 8,
        })
        .setOrigin(0.5);
    }

    this.button(WORLD_WIDTH / 2 - 150, 400, 'REBUILD', () => this.scene.start('Build'));
    this.button(WORLD_WIDTH / 2 + 150, 400, 'SIEGE AGAIN', () => this.scene.start('Siege'));
    this.button(WORLD_WIDTH / 2, 470, 'Menu', () => this.scene.start('Menu'), 140, 34);
  }

  private button(
    cx: number,
    cy: number,
    text: string,
    onClick: () => void,
    w = 260,
    h = 52,
  ): void {
    const g = this.add.graphics();
    panel(g, cx - w / 2, cy - h / 2, w, h, 0x1d2536, 0x5c6a8a, 0.95, 8);
    this.add
      .text(cx, cy, text, { fontFamily: FONT, fontSize: '18px', color: COLORS.text })
      .setOrigin(0.5);
    this.add
      .rectangle(cx, cy, w, h, 0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', onClick);
  }
}
