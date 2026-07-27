import Phaser from 'phaser';
import { audio } from '../core/audio';
import { solveLaunchAdaptive } from '../core/ballistics';
import { CardEngine, OFFENSE_DECK, type CardDef } from '../core/cards';
import {
  BUILD_COL_MIN,
  CANNON_X,
  CANNON_Y,
  CELL,
  GROUND_Y,
  WORLD_WIDTH,
  colToX,
  xToCol,
  yToRow,
} from '../core/config';
import type { PlayerSide } from '../core/store';
import {
  GOLD_MAX,
  GOLD_PER_SEC,
  GOLD_START,
  SHOT_COOLDOWN_MS,
  SHOT_GOLD,
  UNITS,
  type UnitId,
} from '../core/units';
import { CardBar } from '../ui/CardBar';
import { BUTTON, FONT_SIZE, TOP_BAR_H } from '../ui/layout';
import { COLORS, FONT, hudButton, iconButton, panel } from '../ui/theme';
import { BALL_GRAVITY, STEP_MS, BattleScene } from './BattleScene';

const MIN_SHOT_SPEED = 300;
const MAX_SHOT_SPEED = 1100;

/** Gold earned between income plinks. */
const GOLD_CHIME = 25;

/** Muzzle, where every shot and every preview starts. */
const MUZZLE_X = CANNON_X + 22;
const MUZZLE_Y = CANNON_Y - 10;

/** Offence: the player aims the cannon, buys troops and plays offence cards. */
export class SiegeScene extends BattleScene {
  protected readonly playerSide: PlayerSide = 'attack';

  private aimG!: Phaser.GameObjects.Graphics;
  private gold = GOLD_START;
  private cooldown = 0;

  /** Set by Chain Shot / Black Powder until the next cannon shot consumes it. */
  private shotMod: 'chain' | 'power' | null = null;

  private cards!: CardEngine;
  private cardBar!: CardBar;
  private aiming = false;
  /** Where the player is pointing — the shot's *target*, not a direction. */
  private aimX = 0;
  private aimY = 0;
  private flashUntil = 0;

  private goldText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private modText!: Phaser.GameObjects.Text;

  constructor() {
    super('Siege');
  }

  create(): void {
    this.bootBattle();
    this.gold = GOLD_START;
    this.cooldown = 0;
    this.shotMod = null;
    this.aiming = false;
    this.flashUntil = 0;
    // Point the gun at the castle's face to begin with, so the barrel is not
    // aimed at nothing before the first touch.
    this.aimX = colToX(BUILD_COL_MIN);
    this.aimY = GROUND_Y - 60;

    // Above the card column: the aim arc is the whole interface, and the
    // moment it disappears behind a card the shot becomes a guess.
    this.aimG = this.add.graphics().setDepth(55);
    this.cards = new CardEngine(OFFENSE_DECK, { rng: this.rng });
    this.buildHud();
    this.bindInput();
    this.view.draw();
  }

  // ---------------------------------------------------------------- input

  private bindInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.finished || this.cardBar.hits(p.x, p.y) || p.y < TOP_BAR_H) return;

      if (this.cardBar.armedSlot >= 0) {
        this.resolveTargeted(this.cardBar.armedSlot, p.worldX, p.worldY);
        return;
      }
      this.aiming = true;
      this.aimX = p.worldX;
      this.aimY = p.worldY;
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.aiming) return;
      this.aimX = p.worldX;
      this.aimY = p.worldY;
    });

    const release = () => {
      if (!this.aiming) return;
      this.aiming = false;
      this.fire();
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  /**
   * The shot that lands where the player is pointing.
   *
   * You touch the target, not a direction. The old scheme fired *along* the ray
   * from the gun through your finger, so gravity dropped the shell far below
   * where you had pointed and you had to drag well above a target to hit it —
   * aiming by feel for the arc rather than by looking at the thing you wanted
   * to break. Solving for the launch instead is the same maths the attacker AI
   * has always used, from `ballistics.ts`.
   *
   * The flat arc is preferred over the lob: a tapped point should be met by the
   * most direct shot, and where a wall is in the way the preview shows the
   * shell stopping at the wall, which is the honest answer.
   */
  private aimVector(): { vx: number; vy: number; power: number; short: boolean } {
    // Never aim backwards into the staging ground behind the gun.
    const tx = Math.max(this.aimX, MUZZLE_X + 48);
    const ty = this.aimY;

    let shot = this.solveTo(tx, ty);
    let short = false;

    if (!shot) {
      // Out of range. Walk the aim point back along the line toward the gun
      // until something is reachable, so pointing at the horizon means "as far
      // that way as I can throw" rather than a dead control.
      short = true;
      for (let t = 0.92; t >= 0.08 && !shot; t -= 0.06) {
        shot = this.solveTo(MUZZLE_X + (tx - MUZZLE_X) * t, MUZZLE_Y + (ty - MUZZLE_Y) * t);
      }
    }
    if (!shot) {
      // Nothing at all is reachable in that direction; keep the control alive
      // with a flat shot forward rather than firing nothing.
      const s = MAX_SHOT_SPEED * Math.SQRT1_2;
      return { vx: s, vy: -s, power: 1, short: true };
    }

    const speed = Math.hypot(shot.vx, shot.vy);
    const power = Phaser.Math.Clamp(
      (speed - MIN_SHOT_SPEED) / (MAX_SHOT_SPEED - MIN_SHOT_SPEED),
      0,
      1,
    );
    return { vx: shot.vx, vy: shot.vy, power, short };
  }

  private solveTo(tx: number, ty: number) {
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

  private fire(): void {
    if (this.cooldown > 0) return;
    if (this.gold < SHOT_GOLD) {
      this.flash('Not enough gold to load the cannon.');
      return;
    }
    this.gold -= SHOT_GOLD;
    this.cooldown = SHOT_COOLDOWN_MS;

    const { vx, vy } = this.aimVector();
    const powered = this.shotMod === 'power';
    const spread = this.shotMod === 'chain' ? [-0.13, 0, 0.13] : [0];

    for (const angle of spread) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      this.launch(
        vx * cos - vy * sin,
        vx * sin + vy * cos,
        powered ? 105 : this.shotMod === 'chain' ? 26 : 42,
        powered ? 2.3 : 1.25,
      );
    }

    this.shotMod = null;
    this.modText.setText('');
  }

  private deploy(id: UnitId): void {
    const def = UNITS[id];
    if (this.gold < def.gold) {
      this.flash('Not enough gold.');
      return;
    }
    this.gold -= def.gold;
    this.spawnUnit(id);
  }

  // ---------------------------------------------------------------- cards

  private onCardPressed(slot: number, card: CardDef): void {
    if (this.finished) return;
    if (card.kind === 'targeted') {
      if (!this.cards.canPlay(slot)) return;
      this.cardBar.armedSlot = this.cardBar.armedSlot === slot ? -1 : slot;
      this.flash(this.cardBar.armedSlot >= 0 ? `Tap the wall to place ${card.name}.` : '', true);
      return;
    }
    const played = this.cards.play(slot);
    if (!played) return;
    audio.play('whoosh');

    if (played.id === 'chainShot') {
      this.shotMod = 'chain';
      this.modText.setText('Loaded: Chain Shot');
    } else if (played.id === 'blackPowder') {
      this.shotMod = 'power';
      this.modText.setText('Loaded: Black Powder');
    } else if (played.id === 'rally') {
      this.rallyUntil = this.elapsed + 8000;
      this.flash('Rally! Knights press the attack.');
    }
  }

  private resolveTargeted(slot: number, worldX: number, worldY: number): void {
    const card = this.cards.hand[slot];
    this.cardBar.armedSlot = -1;
    if (!card) return;
    const played = this.cards.play(slot);
    if (!played) return;
    audio.play('whoosh');

    if (played.id === 'sapperCharge') {
      this.explode(worldX, worldY, 170, played.radius ?? 1.6);
      this.flash('');
    }
  }

  // ----------------------------------------------------- battle callbacks

  protected onTick(dt: number, deltaMs: number): void {
    this.cooldown = Math.max(0, this.cooldown - deltaMs);

    // Income plinks once per `GOLD_CHIME` earned rather than per frame, so it
    // reads as a purse filling instead of a Geiger counter. At 10g/s that is
    // about one every two and a half seconds — and it stops entirely at the
    // cap, which is the useful part: silence means gold is going to waste.
    const before = this.gold;
    this.gold = Math.min(GOLD_MAX, this.gold + GOLD_PER_SEC * dt);
    if (Math.floor(this.gold / GOLD_CHIME) > Math.floor(before / GOLD_CHIME)) {
      audio.play('gold');
    }

    this.cards.update(deltaMs);
  }

  protected onDraw(): void {
    this.drawAim();
    this.refreshHud();
  }

  protected checkEnd(): boolean | null {
    if (!this.castle.find('throne')) return true;
    if (this.timeLeft <= 0) return false;
    return null;
  }

  protected override cannonAngle(): number {
    const { vx, vy } = this.aimVector();
    return Math.atan2(vy, vx);
  }

  // -------------------------------------------------------------- drawing

  private drawAim(): void {
    const g = this.aimG;
    g.clear();

    if (this.cardBar.armedSlot >= 0) {
      const card = this.cards.hand[this.cardBar.armedSlot];
      const p = this.input.activePointer;
      if (card?.radius) {
        g.lineStyle(2, card.accent, 0.9);
        g.strokeCircle(p.worldX, p.worldY, card.radius * CELL);
      }
      return;
    }

    if (!this.aiming) return;
    const { vx, vy, power, short } = this.aimVector();
    // Amber when the shot reaches where you are pointing, red when the gun
    // cannot throw that far and is aiming as far as it can instead.
    const tint = short ? 0xe5654f : 0xffd08a;

    // Preview by running the same integration the projectile will use — at the
    // same step size, or the dotted arc quietly promises a shot that will not
    // happen.
    let x = MUZZLE_X;
    let y = MUZZLE_Y;
    let sx = vx;
    let sy = vy;
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
      if (this.castle.has(xToCol(x), yToRow(y))) break;
      if (i % 3 === 0) {
        g.fillStyle(tint, 0.6 - i * 0.0022);
        g.fillCircle(x, y, 3);
      }
    }

    // Where it will actually land, which is not always where you pointed — a
    // wall in the way is the interesting case, and the player should see it.
    g.lineStyle(2, tint, 0.95);
    g.strokeCircle(landedX, landedY, 9);
    g.lineStyle(1, tint, 0.5);
    g.strokeCircle(landedX, landedY, 15);

    // The point under the finger, so the touch always has something on it even
    // when the shell stops short of it.
    g.fillStyle(0xffffff, 0.55);
    g.fillCircle(this.aimX, this.aimY, 3);

    g.lineStyle(3, tint, 0.35);
    g.strokeCircle(CANNON_X, CANNON_Y - 10, 20 + power * 16);
  }

  // ------------------------------------------------------------------ hud

  private buildHud(): void {
    const g = this.add.graphics().setDepth(40);
    panel(g, 0, 0, WORLD_WIDTH, TOP_BAR_H, COLORS.panel, COLORS.panelEdge, 0.96, 0);

    const midY = TOP_BAR_H / 2;
    this.goldText = this.add
      .text(18, midY, '', {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.headline}px`,
        color: COLORS.gold,
      })
      .setOrigin(0, 0.5)
      .setDepth(41);
    this.timerText = this.add
      .text(190, midY, '', {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.headline}px`,
        color: COLORS.text,
      })
      .setOrigin(0, 0.5)
      .setDepth(41);
    this.statusText = this.add
      .text(300, midY, '', {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.body}px`,
        color: COLORS.dim,
      })
      .setOrigin(0, 0.5)
      .setDepth(41);
    // Sits clear of the card column, which owns the left edge below the bar.
    this.modText = this.add
      .text(WORLD_WIDTH / 2 + 80, TOP_BAR_H + 26, '', {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.small}px`,
        color: COLORS.gold,
      })
      .setOrigin(0.5)
      .setDepth(41);

    iconButton(
      this,
      720,
      midY,
      BUTTON.w,
      BUTTON.h,
      'knight',
      UNITS.knight.fill,
      `${UNITS.knight.name} ${UNITS.knight.gold}g`,
      () => this.deploy('knight'),
    );
    iconButton(
      this,
      926,
      midY,
      BUTTON.w,
      BUTTON.h,
      'sapper',
      UNITS.sapper.fill,
      `${UNITS.sapper.name} ${UNITS.sapper.gold}g`,
      () => this.deploy('sapper'),
    );
    hudButton(this, 1160, midY, 180, BUTTON.h, 'Give up', () => this.finishBattle(false));

    this.cardBar = new CardBar(this, this.cards, (slot, card) => this.onCardPressed(slot, card));

    this.add
      .text(WORLD_WIDTH / 2 + 80, TOP_BAR_H + 54, 'Touch where you want to hit — release to fire.', {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.small}px`,
        color: COLORS.dim,
      })
      .setOrigin(0.5)
      .setDepth(41);
  }

  /** Transient status message; sticky ones stay until explicitly cleared. */
  private flash(msg: string, sticky = false): void {
    this.statusText.setText(msg);
    this.flashUntil = msg ? (sticky ? Infinity : this.elapsed + 2200) : 0;
  }

  private refreshHud(): void {
    this.goldText.setText(`Gold ${Math.floor(this.gold)}`);
    const secs = Math.max(0, this.timeLeft / 1000);
    this.timerText
      .setText(`${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`)
      .setColor(secs < 30 ? COLORS.danger : COLORS.text);

    if (this.elapsed >= this.flashUntil) {
      const throne = this.castle.find('throne');
      this.statusText.setText(throne ? `Throne ${Math.max(0, Math.ceil(throne.hp))} hp` : '');
    }
    this.cardBar.refresh();
  }
}
