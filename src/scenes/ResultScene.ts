import Phaser from 'phaser';
import { GROUND_Y, WORLD_HEIGHT, WORLD_WIDTH } from '../core/config';
import { store } from '../core/store';
import { COLORS, FONT, drawBackdrop, panel, soundButton } from '../ui/theme';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(): void {
    drawBackdrop(this, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y);
    soundButton(this, WORLD_WIDTH - 62, 62);
    const r = store.lastResult;
    const attackerWon = r?.attackerWon ?? false;
    const defending = r?.playerSide === 'defend';
    // The same battle outcome reads as a win or a loss depending on the side.
    const playerWon = defending ? !attackerWon : attackerWon;

    this.add
      .text(WORLD_WIDTH / 2, 160, attackerWon ? 'THE THRONE FALLS' : 'THE CASTLE HOLDS', {
        fontFamily: FONT,
        fontSize: '54px',
        color: playerWon ? COLORS.good : COLORS.danger,
      })
      .setOrigin(0.5);

    this.add
      .text(WORLD_WIDTH / 2, 208, playerWon ? 'Victory' : 'Defeat', {
        fontFamily: FONT,
        fontSize: '22px',
        color: playerWon ? COLORS.good : COLORS.danger,
      })
      .setOrigin(0.5);

    if (r) {
      const razed = r.blocksAtStart - r.blocksLeft;
      const lines = [
        `Battle lasted ${(r.msElapsed / 1000).toFixed(1)}s`,
        `${razed} of ${r.blocksAtStart} blocks brought down`,
        defending
          ? attackerWon
            ? 'They reached the throne. Build it stronger.'
            : 'Your walls held to the last bell.'
          : attackerWon
            ? 'Your castle was not strong enough.'
            : 'Your walls did their job.',
      ];
      this.add
        .text(WORLD_WIDTH / 2, 286, lines.join('\n'), {
          fontFamily: FONT,
          fontSize: '18px',
          color: COLORS.dim,
          align: 'center',
          lineSpacing: 8,
        })
        .setOrigin(0.5);

      // The seed, quietly. Out of the way during play, but here to quote when a
      // battle turns out to be worth arguing about — `?seed=` replays it exactly.
      this.add
        .text(WORLD_WIDTH - 22, WORLD_HEIGHT - 30, `seed ${r.seed}`, {
          fontFamily: FONT,
          fontSize: '18px',
          color: COLORS.dim,
        })
        .setOrigin(1, 1)
        .setAlpha(0.6);
    }

    this.button(WORLD_WIDTH / 2 - 230, 420, 'REBUILD', () => this.scene.start('Build'), 200);
    this.button(WORLD_WIDTH / 2, 420, 'DEFEND', () => this.scene.start('Defend'), 200);
    this.button(WORLD_WIDTH / 2 + 230, 420, 'LAY SIEGE', () => this.scene.start('Siege'), 200);
    this.button(WORLD_WIDTH / 2, 486, 'Menu', () => this.scene.start('Menu'), 140, 34);
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
