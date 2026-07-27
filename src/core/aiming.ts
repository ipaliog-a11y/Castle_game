import { solveLaunchAdaptive } from './ballistics';
import { BALL_GRAVITY, CANNON_X, CANNON_Y } from './config';

/**
 * Pointing the cannon at a place rather than in a direction.
 *
 * Extracted from `SiegeScene` when the sandbox needed the same control. It is
 * the whole of the aiming feel, and having two copies drift apart would mean
 * the practice mode taught a gun that behaves differently from the real one.
 */

/** Where every shot and every preview starts. */
export const MUZZLE_X = CANNON_X + 22;
export const MUZZLE_Y = CANNON_Y - 10;

export const MIN_SHOT_SPEED = 300;
export const MAX_SHOT_SPEED = 1100;

export interface Aim {
  vx: number;
  vy: number;
  /** 0..1, how much of the gun's range this shot uses. Drives the charge ring. */
  power: number;
  /** True when the target was out of reach and the gun is throwing as far as it can. */
  short: boolean;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * The shot that lands where the player is pointing.
 *
 * You touch the target, not a direction. The original scheme fired *along* the
 * ray from the gun through your finger, so gravity dropped the shell far below
 * where you had pointed and you had to drag well above a target to hit it —
 * aiming by feel for the arc rather than by looking at the thing you wanted to
 * break. Solving for the launch instead is the same maths the attacker AI has
 * always used, from `ballistics.ts`.
 *
 * The flat arc is preferred over the lob: a tapped point should be met by the
 * most direct shot, and where a wall is in the way the preview shows the shell
 * stopping at the wall, which is the honest answer.
 */
export function solveAim(targetX: number, targetY: number): Aim {
  // Never aim backwards into the staging ground behind the gun.
  const tx = Math.max(targetX, MUZZLE_X + 48);
  const ty = targetY;

  let shot = solveTo(tx, ty);
  let short = false;

  if (!shot) {
    // Out of range. Walk the aim point back along the line toward the gun until
    // something is reachable, so pointing at the horizon means "as far that way
    // as I can throw" rather than a dead control.
    short = true;
    for (let t = 0.92; t >= 0.08 && !shot; t -= 0.06) {
      shot = solveTo(MUZZLE_X + (tx - MUZZLE_X) * t, MUZZLE_Y + (ty - MUZZLE_Y) * t);
    }
  }
  if (!shot) {
    // Nothing at all is reachable in that direction; keep the control alive with
    // a flat shot forward rather than firing nothing.
    const s = MAX_SHOT_SPEED * Math.SQRT1_2;
    return { vx: s, vy: -s, power: 1, short: true };
  }

  const speed = Math.hypot(shot.vx, shot.vy);
  const power = clamp01((speed - MIN_SHOT_SPEED) / (MAX_SHOT_SPEED - MIN_SHOT_SPEED));
  return { vx: shot.vx, vy: shot.vy, power, short };
}

/** Flat solution if there is one, else the lob. Null when out of reach. */
function solveTo(tx: number, ty: number) {
  return (
    solveLaunchAdaptive(
      MUZZLE_X,
      MUZZLE_Y,
      tx,
      ty,
      MIN_SHOT_SPEED,
      MAX_SHOT_SPEED,
      BALL_GRAVITY,
      false,
    ) ??
    solveLaunchAdaptive(
      MUZZLE_X,
      MUZZLE_Y,
      tx,
      ty,
      MIN_SHOT_SPEED,
      MAX_SHOT_SPEED,
      BALL_GRAVITY,
      true,
    )
  );
}
