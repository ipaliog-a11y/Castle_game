import Phaser from 'phaser';
import { MAX_SHOT_SPEED, MIN_SHOT_SPEED, type Aim } from '../core/aiming';
import { CANNON_X, GROUND_Y } from '../core/config';
import { CARD } from './layout';
import { COLORS, FONT, panel } from './theme';
import { FONT_SIZE, TOUCH_MIN } from './layout';

/**
 * Expert aiming: elevation and power, set by hand.
 *
 * The other two modes solve the launch for you — you name a target and the
 * ballistics work backwards to an angle and a speed. This is the same two
 * numbers with the solver taken away, which is how artillery has always
 * actually worked and is a genuinely different skill: you learn the arcs
 * instead of learning to point.
 *
 * Placing them took two attempts. The obvious spot is around the gun itself,
 * bottom-left, under the thumb already there — but in a siege that corner is
 * the *card column*, and the first version put both sliders underneath a hand
 * of cards where they could not be seen or grabbed. The field is more crowded
 * than it looks: the top bar owns the strip above, the cards own the left down
 * to y≈490, the castle owns everything past x=640, and troops march along the
 * ground band. What is left is a block between the cards and the castle, which
 * is where these live — as near the gun as anything can actually be.
 */

/** Straight up is useless and so is straight ahead; this is the usable band. */
const MIN_ANGLE = -1.42; // ~81° above horizontal
const MAX_ANGLE = -0.05; // ~3°

/** Just clear of the card column's right edge, and above the ground band. */
const ELEV = { x: CARD.x + CARD.w + 54, top: 210, bottom: 462, w: TOUCH_MIN };
const POWER = { left: ELEV.x + 46, right: 616, y: 508, h: 34 };

/** Grab radius around a slider, so a near miss still counts as a grab. */
const GRAB_SLOP = 40;

export class GunSliders {
  private g: Phaser.GameObjects.Graphics;
  private elevText: Phaser.GameObjects.Text;
  private powerText: Phaser.GameObjects.Text;

  /** 0 at the bottom of the band, 1 at the top. */
  private elevation = 0.55;
  private power = 0.6;
  private dragging: 'elevation' | 'power' | null = null;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(44);
    const style = { fontFamily: FONT, fontSize: `${FONT_SIZE.small}px`, color: COLORS.dim };
    this.elevText = scene.add.text(ELEV.x, ELEV.top - 24, '', style).setOrigin(0.5).setDepth(45);
    this.powerText = scene.add
      .text(POWER.right, POWER.y - 30, '', style)
      .setOrigin(1, 0.5)
      .setDepth(45);
  }

  setVisible(visible: boolean): void {
    this.g.setVisible(visible);
    this.elevText.setVisible(visible);
    this.powerText.setVisible(visible);
    if (!visible) this.dragging = null;
  }

  /**
   * True if this pointer belongs to a slider.
   *
   * The scene asks before doing anything else with the tap, so dragging a
   * slider never also fires the gun — which on a touchscreen would make the
   * controls unusable, since every adjustment ends in a release.
   */
  grab(x: number, y: number): boolean {
    if (
      Math.abs(x - ELEV.x) < ELEV.w / 2 + GRAB_SLOP &&
      y > ELEV.top - GRAB_SLOP &&
      y < ELEV.bottom + GRAB_SLOP
    ) {
      this.dragging = 'elevation';
      this.drag(x, y);
      return true;
    }
    if (
      Math.abs(y - POWER.y) < POWER.h / 2 + GRAB_SLOP &&
      x > POWER.left - GRAB_SLOP &&
      x < POWER.right + GRAB_SLOP
    ) {
      this.dragging = 'power';
      this.drag(x, y);
      return true;
    }
    return false;
  }

  drag(x: number, y: number): boolean {
    if (this.dragging === 'elevation') {
      this.elevation = 1 - Phaser.Math.Clamp((y - ELEV.top) / (ELEV.bottom - ELEV.top), 0, 1);
      return true;
    }
    if (this.dragging === 'power') {
      this.power = Phaser.Math.Clamp((x - POWER.left) / (POWER.right - POWER.left), 0, 1);
      return true;
    }
    return false;
  }

  release(): void {
    this.dragging = null;
  }

  get isDragging(): boolean {
    return this.dragging !== null;
  }

  /** The shot the sliders currently describe. Same shape the solver returns. */
  aim(): Aim {
    const angle = MAX_ANGLE + (MIN_ANGLE - MAX_ANGLE) * this.elevation;
    const speed = MIN_SHOT_SPEED + (MAX_SHOT_SPEED - MIN_SHOT_SPEED) * this.power;
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      power: this.power,
      // Nothing is ever "short" here: the player set the speed themselves, so
      // there is no solver failing to reach a target to warn them about.
      short: false,
    };
  }

  draw(): void {
    const g = this.g;
    g.clear();

    // Elevation, vertical.
    const knobY = ELEV.bottom - (ELEV.bottom - ELEV.top) * this.elevation;
    panel(g, ELEV.x - ELEV.w / 2, ELEV.top - 10, ELEV.w, ELEV.bottom - ELEV.top + 20, 0x141a26, 0x46516c, 0.8, 10);
    g.fillStyle(0x2a3346, 1);
    g.fillRect(ELEV.x - 4, ELEV.top, 8, ELEV.bottom - ELEV.top);
    g.fillStyle(0xffd08a, 0.9);
    g.fillRect(ELEV.x - 4, knobY, 8, ELEV.bottom - knobY);
    for (let i = 0; i <= 4; i++) {
      const ty = ELEV.top + ((ELEV.bottom - ELEV.top) * i) / 4;
      g.fillStyle(0x8e9ab2, 0.5);
      g.fillRect(ELEV.x + 8, ty - 1, 9, 2);
    }
    this.knob(g, ELEV.x, knobY);

    // Power, horizontal.
    const knobX = POWER.left + (POWER.right - POWER.left) * this.power;
    panel(g, POWER.left - 12, POWER.y - POWER.h / 2, POWER.right - POWER.left + 24, POWER.h, 0x141a26, 0x46516c, 0.8, 10);
    g.fillStyle(0x2a3346, 1);
    g.fillRect(POWER.left, POWER.y - 4, POWER.right - POWER.left, 8);
    // Power runs green to red, so "wound right up" reads without the number.
    const hot = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0x6fce93),
      Phaser.Display.Color.ValueToColor(0xe5654f),
      100,
      Math.round(this.power * 100),
    );
    g.fillStyle(Phaser.Display.Color.GetColor(hot.r, hot.g, hot.b), 0.95);
    g.fillRect(POWER.left, POWER.y - 4, knobX - POWER.left, 8);
    this.knob(g, knobX, POWER.y);

    const degrees = Math.round(
      -(MAX_ANGLE + (MIN_ANGLE - MAX_ANGLE) * this.elevation) * (180 / Math.PI),
    );
    this.elevText.setText(`${degrees}°`);
    this.powerText.setText(`Power ${Math.round(this.power * 100)}%`);

    // A reminder of where the gun is, since in this mode the finger is nowhere
    // near it.
    g.lineStyle(2, 0xffd08a, 0.25);
    g.strokeCircle(CANNON_X, GROUND_Y - 34, 26);
  }

  private knob(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0xdfe6f2, 1);
    g.fillCircle(x, y, 13);
    g.fillStyle(0x1d2536, 1);
    g.fillCircle(x, y, 7);
  }

  destroy(): void {
    this.g.destroy();
    this.elevText.destroy();
    this.powerText.destroy();
  }
}
