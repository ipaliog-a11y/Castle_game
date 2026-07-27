/**
 * The simulation's dice.
 *
 * Every roll that changes what happens in a battle comes from here, seeded, so
 * the same seed replays the same battle. That is what makes balance work
 * possible at all: without it a tuning change cannot be told from noise.
 *
 * **Cosmetics deliberately do not use this.** Particle bursts and other visual
 * flourishes stay on `Math.random`. If they drew from the seeded stream, adding
 * a puff of smoke somewhere would shift every later roll and silently change
 * the outcome of every battle — the effect would be invisible in the diff and
 * catastrophic for the numbers.
 */
export class Rng {
  private state: number;

  constructor(readonly seed: number) {
    // Any non-zero state works; the offset just avoids a zero seed stalling.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** mulberry32: small, fast, and good enough for gameplay dice. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], inclusive — matching `Phaser.Math.Between`. */
  between(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** True with the given probability. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Fisher-Yates, in place. */
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}

/** A fresh seed, in a range short enough to read aloud and retype. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 100_000);
}

/**
 * The seed for the next battle: `?seed=1234` if the URL asks for one, else a
 * fresh one. Pinning a seed is how a battle gets handed to a test, to the
 * balance harness, or back to me from a player who thinks one was unfair.
 */
export function seedFromUrl(): number {
  if (typeof window === 'undefined') return randomSeed();
  const asked = new URLSearchParams(window.location.search).get('seed');
  if (asked === null) return randomSeed();
  const parsed = Number.parseInt(asked, 10);
  return Number.isFinite(parsed) ? parsed >>> 0 : randomSeed();
}
