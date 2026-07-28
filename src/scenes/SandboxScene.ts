import Phaser from 'phaser';
import { solveAim } from '../core/aiming';
import { audio } from '../core/audio';
import { WORLD_WIDTH } from '../core/config';
import type { PlayerSide } from '../core/store';
import { UNITS, type UnitId } from '../core/units';
import { settings, type AimMode } from '../core/settings';
import { GunSliders } from '../ui/GunSliders';
import { drawAimArc } from '../ui/aimView';
import { BUTTON, FONT_SIZE, TOP_BAR_H } from '../ui/layout';
import { GameMenus } from '../ui/menus';
import { COLORS, FONT, glyphButton, hudButton, iconButton, panel } from '../ui/theme';
import { BattleScene } from './BattleScene';

/**
 * Shots are free, so the only limit is how fast you can tap. 320ms is quick
 * enough to feel like a toy and slow enough that the screen does not become a
 * wall of shells.
 */
const SHOT_COOLDOWN_MS = 320;

/**
 * Harder-hitting than a siege shot, and deliberately so.
 *
 * The siege's 42 is balanced against gold and a clock — four hits to break one
 * stone block is a *cost*, and paying it is the game. Here there is no cost to
 * balance against, so that same number is just four taps before anything
 * visible happens, which is exactly the patience a five-year-old does not have.
 * At 92 a stone block goes in two and timber in one, and the wider blast means
 * a hit that misses still does something.
 */
const SHOT_DAMAGE = 92;
const SHOT_RADIUS = 1.6;

/** Troops are free too, so the field needs a ceiling somewhere. */
const MAX_UNITS = 14;

const AIM_HINT: Record<AimMode, string> = {
  easy: 'Touch where you want to hit. Nothing can be lost here.',
  advanced: 'The arc fades out halfway. Judge the rest.',
  expert: 'Set the angle and power, then tap the field to fire.',
};

/** How long one dawn-to-midnight cycle takes here. It loops rather than ends. */
const SKY_CYCLE_MS = 150_000;

/**
 * Knock it down. No clock, no gold, no opponent, nothing to lose.
 *
 * This exists because the collapse model is the actual toy, and every other
 * mode wraps it in scaffolding — an economy, a timer, a win condition — that a
 * five-year-old has to fight through before reaching the good part. Measuring
 * the clock made the case: 90 seconds is not enough for a young player to bring
 * a castle down, and simply lengthening it makes the *defence* mode strictly
 * harder rather than easier, because the AI's pressure ramp is normalised to
 * the battle's length. There was no single number to loosen. So this takes the
 * scaffolding away instead.
 *
 * The rebuild button is not a convenience, it is the loop. Without it you knock
 * the castle down once and the toy is over.
 */
export class SandboxScene extends BattleScene {
  protected readonly playerSide: PlayerSide = 'attack';

  private aimG!: Phaser.GameObjects.Graphics;
  private cooldown = 0;
  private aiming = false;
  private aimX = 0;
  private aimY = 0;
  private throneWasStanding = true;
  private flashUntil = 0;

  private menus!: GameMenus;
  private sliders!: GunSliders;
  private countText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super('Sandbox');
  }

  create(): void {
    this.bootBattle();
    this.cooldown = 0;
    this.aiming = false;
    this.throneWasStanding = !!this.castle.find('throne');
    this.flashUntil = 0;
    this.aimX = 700;
    this.aimY = 400;

    this.aimG = this.add.graphics().setDepth(55);
    this.sliders = new GunSliders(this);
    this.sliders.setVisible(settings.aimMode === 'expert');
    // No Give up row: there is nothing here to lose, which is the whole point.
    this.menus = new GameMenus(this, {
      onResume: () => this.setPaused(false),
      onMenu: () => this.scene.start('Menu'),
    });
    this.buildHud();
    this.bindInput();
    this.view.draw();
  }

  // ---------------------------------------------------------------- input

  private bindInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < TOP_BAR_H || this.menus.isOpen) return;
      if (settings.aimMode === 'expert' && this.sliders.grab(p.worldX, p.worldY)) return;
      this.aiming = true;
      this.aimX = p.worldX;
      this.aimY = p.worldY;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.sliders.drag(p.worldX, p.worldY)) return;
      if (!this.aiming) return;
      this.aimX = p.worldX;
      this.aimY = p.worldY;
    });
    const release = () => {
      if (this.sliders.isDragging) {
        this.sliders.release();
        return;
      }
      if (!this.aiming) return;
      this.aiming = false;
      this.fire();
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  /** Whichever control scheme is selected. See SiegeScene for the reasoning. */
  private currentAim() {
    return settings.aimMode === 'expert' ? this.sliders.aim() : solveAim(this.aimX, this.aimY);
  }

  private fire(): void {
    if (this.cooldown > 0) return;
    this.cooldown = SHOT_COOLDOWN_MS;
    const { vx, vy } = this.currentAim();
    this.launch(vx, vy, SHOT_DAMAGE, SHOT_RADIUS);
  }

  private deploy(id: UnitId): void {
    if (this.units.length >= MAX_UNITS) {
      this.flash('That is plenty of soldiers for now.');
      return;
    }
    this.spawnUnit(id);
  }

  /** Puts the castle back exactly as it was built, and clears the field. */
  private rebuild(): void {
    this.resetCastle();
    this.throneWasStanding = !!this.castle.find('throne');
    audio.play('repair');
    this.flash('Good as new.');
  }

  // ----------------------------------------------------- battle callbacks

  protected onTick(_dt: number, deltaMs: number): void {
    this.cooldown = Math.max(0, this.cooldown - deltaMs);

    // Bringing the throne down is still worth a fanfare even though nothing
    // ends. It is the thing the castle is built around, and a five-year-old who
    // manages it should be told so.
    const throne = !!this.castle.find('throne');
    if (this.throneWasStanding && !throne) {
      this.throneWasStanding = false;
      audio.play('fanfare');
      this.flash('The throne is down! Tap REBUILD to go again.');
    }
  }

  protected onDraw(): void {
    const g = this.aimG;
    g.clear();
    this.sliders.setVisible(settings.aimMode === 'expert');
    if (settings.aimMode === 'expert') {
      this.sliders.draw();
      drawAimArc(g, this.castle, this.sliders.aim(), this.aimX, this.aimY, 'expert');
    } else if (this.aiming) {
      drawAimArc(g, this.castle, solveAim(this.aimX, this.aimY), this.aimX, this.aimY, settings.aimMode);
    }
    this.refreshHud();
  }

  /** Nothing ends a sandbox. That is the entire point of it. */
  protected checkEnd(): boolean | null {
    return null;
  }

  /**
   * The sky loops instead of running down. Elsewhere the dawn-to-midnight
   * cycle *is* the clock — the sunset is the halfway warning — and with no
   * clock to show it would otherwise stick at midnight forever.
   */
  protected override progress(): number {
    return (this.elapsed % SKY_CYCLE_MS) / SKY_CYCLE_MS;
  }

  protected override cannonAngle(): number {
    const { vx, vy } = this.currentAim();
    return Math.atan2(vy, vx);
  }

  // ------------------------------------------------------------------ hud

  private buildHud(): void {
    const g = this.add.graphics().setDepth(40);
    panel(g, 0, 0, WORLD_WIDTH, TOP_BAR_H, COLORS.panel, COLORS.panelEdge, 0.96, 0);
    const midY = TOP_BAR_H / 2;

    this.add
      .text(18, midY, 'KNOCK IT DOWN', {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.headline}px`,
        color: COLORS.text,
      })
      .setOrigin(0, 0.5)
      .setDepth(41);

    this.countText = this.add
      .text(238, midY, '', {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.headline}px`,
        color: COLORS.gold,
      })
      .setOrigin(0, 0.5)
      .setDepth(41);

    iconButton(this, 522, midY, BUTTON.w, BUTTON.h, 'knight', UNITS.knight.fill, 'Knight', () =>
      this.deploy('knight'),
    );
    iconButton(this, 728, midY, BUTTON.w, BUTTON.h, 'sapper', UNITS.sapper.fill, 'Sapper', () =>
      this.deploy('sapper'),
    );
    hudButton(this, 920, midY, 176, BUTTON.h, 'REBUILD', () => this.rebuild());
    glyphButton(this, 1052, midY, 'pause', () => {
      this.setPaused(!this.paused);
      this.menus.toggle();
    });
    glyphButton(this, 1120, midY, 'options', () => {
      this.setPaused(true);
      this.menus.openOptions();
    });
    hudButton(this, 1214, midY, 116, BUTTON.h, 'Menu', () => this.scene.start('Menu'));

    this.statusText = this.add
      .text(WORLD_WIDTH / 2, TOP_BAR_H + 26, AIM_HINT[settings.aimMode], {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.small}px`,
        color: COLORS.dim,
      })
      .setOrigin(0.5)
      .setDepth(41);
  }

  private flash(msg: string): void {
    this.statusText.setText(msg);
    this.flashUntil = this.elapsed + 2600;
  }

  private refreshHud(): void {
    this.countText.setText(`${this.blocksBroken} smashed`);
    if (this.flashUntil > 0 && this.elapsed >= this.flashUntil) {
      this.flashUntil = 0;
      this.statusText.setText(AIM_HINT[settings.aimMode]);
    }
  }
}
