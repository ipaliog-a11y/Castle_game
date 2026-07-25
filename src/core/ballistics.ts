export interface LaunchSolution {
  vx: number;
  vy: number;
  /** Launch angle in radians, measured upward from the +x axis. */
  angle: number;
}

/**
 * Closed-form firing solution: the launch velocity that carries a projectile
 * from (x0, y0) to (tx, ty) at a fixed speed under constant gravity.
 *
 * Screen coordinates, so y grows downward and gravity pulls toward +y. There
 * are generally two solutions — a flat arc and a lobbed one; `highArc` picks
 * the lob, which clears walls the flat shot would slam into.
 *
 * Returns null when the target is out of range at this speed.
 */
export function solveLaunch(
  x0: number,
  y0: number,
  tx: number,
  ty: number,
  speed: number,
  gravity: number,
  highArc = false,
): LaunchSolution | null {
  const dx = tx - x0;
  const dy = y0 - ty; // upward positive, to keep the algebra conventional
  const v2 = speed * speed;

  const disc = v2 * v2 - gravity * (gravity * dx * dx + 2 * dy * v2);
  if (disc < 0) return null; // out of range

  const root = Math.sqrt(disc);
  const denom = gravity * dx;
  if (Math.abs(denom) < 1e-6) return null; // directly overhead; no useful arc

  const angle = Math.atan2(highArc ? v2 + root : v2 - root, denom);
  return {
    vx: speed * Math.cos(angle),
    vy: -speed * Math.sin(angle),
    angle,
  };
}

/**
 * Finds the slowest shot in [minSpeed, maxSpeed] that still reaches the target.
 * Firing no harder than necessary keeps arcs readable and gives the defender a
 * fair chance to watch the shell come in.
 */
export function solveLaunchAdaptive(
  x0: number,
  y0: number,
  tx: number,
  ty: number,
  minSpeed: number,
  maxSpeed: number,
  gravity: number,
  highArc = false,
  steps = 8,
): LaunchSolution | null {
  for (let i = 0; i <= steps; i++) {
    const speed = minSpeed + ((maxSpeed - minSpeed) * i) / steps;
    const hit = solveLaunch(x0, y0, tx, ty, speed, gravity, highArc);
    if (hit) return hit;
  }
  return null;
}
