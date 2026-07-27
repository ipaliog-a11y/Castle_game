import type Phaser from 'phaser';
import type { Castle } from '../core/castle';
import type { Aim } from '../core/aiming';
import { MUZZLE_X, MUZZLE_Y } from '../core/aiming';
import {
  BALL_GRAVITY,
  CANNON_X,
  CANNON_Y,
  GROUND_Y,
  STEP_MS,
  WORLD_WIDTH,
  xToCol,
  yToRow,
} from '../core/config';

/**
 * The dotted arc, the landing ring and the charge ring.
 *
 * Shared by the siege and the sandbox. The arc is the whole interface — the
 * moment it stops matching what the shell does, aiming becomes guesswork — so
 * it integrates with the *same* step size the simulation uses rather than a
 * convenient one. An earlier version stepped at 1/40 while the sim ran at 1/60
 * and quietly promised shots that would not happen.
 */
export function drawAimArc(
  g: Phaser.GameObjects.Graphics,
  castle: Castle,
  aim: Aim,
  fingerX: number,
  fingerY: number,
): void {
  // Amber when the shot reaches where you are pointing, red when the gun cannot
  // throw that far and is aiming as far as it can instead.
  const tint = aim.short ? 0xe5654f : 0xffd08a;

  let x = MUZZLE_X;
  let y = MUZZLE_Y;
  let sx = aim.vx;
  let sy = aim.vy;
  let landedX = x;
  let landedY = y;
  const step = STEP_MS / 1000;

  for (let i = 0; i < 200; i++) {
    sy += BALL_GRAVITY * step;
    x += sx * step;
    y += sy * step;
    landedX = x;
    landedY = y;
    if (y > GROUND_Y || x > WORLD_WIDTH) break;
    if (castle.has(xToCol(x), yToRow(y))) break;
    if (i % 3 === 0) {
      g.fillStyle(tint, 0.6 - i * 0.0022);
      g.fillCircle(x, y, 3);
    }
  }

  // Where it will actually land, which is not always where you pointed — a wall
  // in the way is the interesting case, and the player should see it.
  g.lineStyle(2, tint, 0.95);
  g.strokeCircle(landedX, landedY, 9);
  g.lineStyle(1, tint, 0.5);
  g.strokeCircle(landedX, landedY, 15);

  // The point under the finger, so the touch always has something on it even
  // when the shell stops short of it.
  g.fillStyle(0xffffff, 0.55);
  g.fillCircle(fingerX, fingerY, 3);

  g.lineStyle(3, tint, 0.35);
  g.strokeCircle(CANNON_X, CANNON_Y - 10, 20 + aim.power * 16);
}
