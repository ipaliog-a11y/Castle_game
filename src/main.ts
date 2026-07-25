import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from './core/config';
import { BuildScene } from './scenes/BuildScene';
import { DefendScene } from './scenes/DefendScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultScene } from './scenes/ResultScene';
import { SiegeScene } from './scenes/SiegeScene';
import { installViewport } from './core/viewport';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  backgroundColor: '#10131c',
  scale: {
    // Sizing is driven by src/core/viewport.ts, which turns the stage a quarter
    // circle on portrait screens. FIT would fight that: the Scale Manager sizes
    // itself from the parent's *bounding box*, which swaps width and height the
    // moment the stage is rotated.
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  // Structural integrity is solved on the grid, not by a physics engine, so no
  // physics plugin is enabled — see src/core/castle.ts.
  scene: [MenuScene, BuildScene, DefendScene, SiegeScene, ResultScene],
});

game.events.once(Phaser.Core.Events.READY, () => installViewport(game));

// Dev-only handle so the playthrough tests can inspect the running simulation.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
