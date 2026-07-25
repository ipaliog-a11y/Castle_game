import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from './core/config';
import { BuildScene } from './scenes/BuildScene';
import { DefendScene } from './scenes/DefendScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultScene } from './scenes/ResultScene';
import { SiegeScene } from './scenes/SiegeScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  backgroundColor: '#10131c',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Structural integrity is solved on the grid, not by a physics engine, so no
  // physics plugin is enabled — see src/core/castle.ts.
  scene: [MenuScene, BuildScene, DefendScene, SiegeScene, ResultScene],
});

// Dev-only handle so the playthrough tests can inspect the running simulation.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
