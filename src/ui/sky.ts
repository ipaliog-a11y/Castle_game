import Phaser from 'phaser';

/**
 * The sky, and with it the clock.
 *
 * A battle opens at dawn, the sun crosses and sets at the halfway mark, and the
 * moon carries the second half. That is not decoration: it means the time left
 * can be read without reading anything. A player who cannot yet tell 1:29 from
 * 0:29 can tell that the sun is going down.
 *
 * The whole backdrop is redrawn each frame from a single `progress` value in
 * 0..1, so it stays in lockstep with `timeLeft` and needs no state of its own.
 */

/** Sky gradient keyframes: [progress, top colour, horizon colour]. */
const SKY: Array<[number, number, number]> = [
  [0.0, 0x2a2340, 0xd98a5a], // dawn — the horizon is already warm
  [0.12, 0x2f4f7a, 0x9fb8d8], // morning
  [0.3, 0x3d7fc4, 0xa8cdf0], // midday
  [0.42, 0x3a5f96, 0xe0a86a], // afternoon, going gold
  [0.5, 0x2b2a52, 0xe2683f], // sunset
  [0.58, 0x171a30, 0x4a3358], // dusk
  [0.75, 0x0b0e1a, 0x1c2340], // night
  [1.0, 0x080a14, 0x161c33], // deepest night, just before the end
];

const HILLS_DAY = 0x2a2f45;
const GROUND_DAY = 0x3d3427;
const GROUND_EDGE_DAY = 0x574a37;

const STAR_COUNT = 70;

/**
 * The arc the sun and moon trace, in world coordinates.
 *
 * It does not run edge to edge. The card column owns the left 250px, so a sun
 * rising at x=0 would spend the first nine seconds of the battle behind the
 * HUD — and dawn is the moment the whole idea rests on. The peak stops short of
 * the top for the same reason: at 78 the moon sat squarely on the hint text.
 *
 * The base sits *below* the hill line on purpose. An earlier version lifted it
 * clear of the hilltops so a rising sun would not be "buried" in them, which
 * got it backwards: the body then popped into existence in mid-air and started
 * climbing. Being briefly hidden is the whole effect — the hills are drawn
 * after the sun and moon, so each one rises out from behind them, glow first.
 */
const ARC_LEFT = 300;
const ARC_RIGHT_INSET = 60;
const ARC_PEAK_Y = 155;
/**
 * How far *below* the ground line the arc starts and ends.
 *
 * Below, not above: the hills and ground are drawn after the sun and moon, so
 * a body parked under the ground line is completely covered. That is what makes
 * both ends of the journey read — it rises out from behind the hills at the
 * start of its half and sinks back behind them at the end, rather than blinking
 * into and out of existence in mid-air.
 */
const ARC_BASE_DROP = 14;

export class SkyView {
  private g: Phaser.GameObjects.Graphics;
  /** Fixed star field, so stars do not shimmer around between frames. */
  private stars: Array<{ x: number; y: number; r: number; twinkle: number }> = [];

  constructor(
    scene: Phaser.Scene,
    private width: number,
    private height: number,
    private groundY: number,
  ) {
    this.g = scene.add.graphics().setDepth(-100);

    // A cheap deterministic scatter. Two irrational-ish steps mod 1 give a
    // spread that looks random without needing a seeded generator here.
    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push({
        x: ((i * 0.6180339887) % 1) * width,
        y: ((i * 0.4142135624) % 1) * (groundY - 90),
        r: 1 + ((i * 7) % 3) * 0.5,
        twinkle: (i % 5) / 5,
      });
    }
  }

  /** @param progress 0 at the opening bell, 1 as the battle ends. */
  draw(progress: number): void {
    const p = Phaser.Math.Clamp(progress, 0, 1);
    const g = this.g;
    g.clear();

    const [top, horizon] = this.skyColours(p);
    g.fillGradientStyle(top, top, horizon, horizon, 1);
    g.fillRect(0, 0, this.width, this.groundY);

    // Night runs 0 at sunset to 1 once dusk is over; everything that dims uses it.
    const night = Phaser.Math.Clamp((p - 0.46) / 0.16, 0, 1);

    if (night > 0.05) this.drawStars(g, night);
    this.drawCelestial(g, p);
    this.drawLand(g, night);
  }

  /** Interpolates the gradient keyframes either side of `p`. */
  private skyColours(p: number): [number, number] {
    let i = 0;
    while (i < SKY.length - 2 && p > SKY[i + 1][0]) i++;
    const [p0, top0, hor0] = SKY[i];
    const [p1, top1, hor1] = SKY[i + 1];
    const t = p1 === p0 ? 0 : (p - p0) / (p1 - p0);
    return [mix(top0, top1, t), mix(hor0, hor1, t)];
  }

  private drawStars(g: Phaser.GameObjects.Graphics, night: number): void {
    for (const s of this.stars) {
      g.fillStyle(0xf2f4ff, night * (0.35 + s.twinkle * 0.5));
      g.fillCircle(s.x, s.y, s.r);
    }
  }

  /**
   * Sun for the first half, moon for the second. Both trace the same arc from
   * the left horizon to the right, so "how high is it" reads as "how long is
   * left in this half".
   */
  private drawCelestial(g: Phaser.GameObjects.Graphics, p: number): void {
    const sun = p < 0.5;
    const u = sun ? p / 0.5 : (p - 0.5) / 0.5;
    const x = ARC_LEFT + u * (this.width - ARC_RIGHT_INSET - ARC_LEFT);
    const base = this.groundY + ARC_BASE_DROP;
    const y = base - Math.sin(Math.PI * u) * (base - ARC_PEAK_Y);
    const r = sun ? 34 : 27;
    const core = sun ? 0xffd98a : 0xe8eefc;
    const glow = sun ? 0xffb347 : 0x8fa6d8;

    for (let i = 4; i >= 1; i--) {
      g.fillStyle(glow, 0.07 * i);
      g.fillCircle(x, y, r + i * 13);
    }
    g.fillStyle(core, 1);
    g.fillCircle(x, y, r);

    if (!sun) {
      // Craters, so it reads as a moon rather than a pale sun.
      g.fillStyle(0xc3cee6, 0.75);
      g.fillCircle(x - 8, y - 6, 6);
      g.fillCircle(x + 9, y + 4, 4.5);
      g.fillCircle(x - 2, y + 11, 3);
    }
  }

  private drawLand(g: Phaser.GameObjects.Graphics, night: number): void {
    // Land keeps a little of its colour at night rather than going flat black,
    // so troops on the ground stay legible in the second half of the battle.
    const dim = 1 - night * 0.55;

    g.fillStyle(scale(HILLS_DAY, dim), 1);
    g.beginPath();
    g.moveTo(0, this.groundY);
    for (let x = 0; x <= this.width; x += 40) {
      const h = 46 + Math.sin(x * 0.004) * 30 + Math.sin(x * 0.011 + 1.7) * 16;
      g.lineTo(x, this.groundY - h);
    }
    g.lineTo(this.width, this.groundY);
    g.closePath();
    g.fillPath();

    g.fillStyle(scale(GROUND_DAY, dim), 1);
    g.fillRect(0, this.groundY, this.width, this.height - this.groundY);
    g.fillStyle(scale(GROUND_EDGE_DAY, dim), 1);
    g.fillRect(0, this.groundY, this.width, 4);
  }
}

function mix(a: number, b: number, t: number): number {
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.ValueToColor(a),
    Phaser.Display.Color.ValueToColor(b),
    100,
    Math.round(Phaser.Math.Clamp(t, 0, 1) * 100),
  );
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}

function scale(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return Phaser.Display.Color.GetColor(r, g, b);
}
