import Phaser from 'phaser';
import { audio } from '../core/audio';
import { solveLaunchAdaptive } from '../core/ballistics';
import { CARDS, CardEngine, DEFENSE_DECK, type CardDef } from '../core/cards';
import {
  BALL_GRAVITY,
  CANNON_X,
  CANNON_Y,
  CELL,
  GRID_ROWS,
  WORLD_WIDTH,
  colToX,
  rowToY,
} from '../core/config';
import { CARD_BASES, MATERIALS, isBase } from '../core/materials';
import type { PlayerSide } from '../core/store';
import type { UnitId } from '../core/units';
import { CardBar } from '../ui/CardBar';
import { FONT_SIZE, TOP_BAR_H } from '../ui/layout';
import { GameMenus } from '../ui/menus';
import { COLORS, FONT, glyphButton, panel } from '../ui/theme';
import { BattleScene } from './BattleScene';

/** How long the target marker shows before the shell is actually fired. */
const TELEGRAPH_MS = 850;

const AI_MIN_SPEED = 520;
const AI_MAX_SPEED = 1100;

/**
 * Defence: an AI besieges the castle you built while you hold it with cards.
 *
 * The AI's pressure ramps across the battle — it reloads faster and aims
 * tighter as time runs down — so surviving the last minute is meant to be the
 * hard part. Every shot is telegraphed before it flies, which is what makes
 * Masons and Boiling Oil reactive decisions rather than guesses.
 */
export class DefendScene extends BattleScene {
  protected readonly playerSide: PlayerSide = 'defend';

  private overlay!: Phaser.GameObjects.Graphics;
  private cards!: CardEngine;
  private cardBar!: CardBar;
  private menus!: GameMenus;

  private reloadTimer = 0;
  private waveTimer = 0;
  private telegraph: { x: number; y: number; at: number } | null = null;
  private lastAngle = -0.6;
  private wavesSent = 0;
  private shotsFired = 0;
  private reinforceUntil = 0;
  private flashUntil = 0;
  /** Troops waiting on their staggered arrival time. */
  private pending: Array<{ id: UnitId; at: number }> = [];

  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private pressureText!: Phaser.GameObjects.Text;

  constructor() {
    super('Defend');
  }

  create(): void {
    this.bootBattle();
    this.reloadTimer = 2000; // a moment to read the field before the first shot
    this.waveTimer = 4200;
    this.telegraph = null;
    this.wavesSent = 0;
    this.shotsFired = 0;
    this.reinforceUntil = 0;
    this.flashUntil = 0;
    this.pending = [];

    // Above the card column, so a targeting circle dragged over the hand is
    // still visible where it matters.
    this.overlay = this.add.graphics().setDepth(55);
    this.menus = new GameMenus(this, {
      onResume: () => this.setPaused(false),
      onGiveUp: () => this.finishBattle(true),
      giveUpLabel: 'Surrender',
      onMenu: () => this.scene.start('Menu'),
    });
    this.cards = new CardEngine(this.availableDeck(), {
      start: 6,
      regenPerSec: 1.15,
      rng: this.rng,
    });
    this.buildHud();
    this.bindInput();
    this.view.draw();
  }

  /**
   * The hand you built. Each defence card needs its base standing in the
   * castle, so which cards you hold is decided in the build phase.
   *
   * A castle with no bases at all is treated as pre-dating the mechanic and
   * gets the full deck. Silently handing someone an empty hand because their
   * saved castle is older than the feature would be a nasty way to find out.
   */
  private availableDeck(): string[] {
    if (this.basesAlive.size === 0) return DEFENSE_DECK;
    return DEFENSE_DECK.filter((id) => this.basesAlive.has(id));
  }

  /** A base has been destroyed; the card it powered goes with it. */
  protected override onBaseLost(card: string): void {
    if (!this.cards?.destroy(card)) return;
    const name = CARDS[card]?.name ?? card;
    this.flash(`${MATERIALS[CARD_BASES[card]].name} destroyed — ${name} is lost.`);
  }

  // ------------------------------------------------------------------- ai

  /**
   * 0 at the opening, 1 by the final seconds. Drives the difficulty ramp, and
   * is the same value the sky runs on — so the assault peaks in the dark.
   */
  private pressure(): number {
    return this.progress();
  }

  private runAi(deltaMs: number): void {
    const p = this.pressure();

    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.elapsed >= this.pending[i].at) {
        this.spawnUnit(this.pending[i].id);
        this.pending.splice(i, 1);
      }
    }

    // Resolve a telegraphed shot once its marker has had its moment.
    if (this.telegraph && this.elapsed >= this.telegraph.at) {
      this.fireAt(this.telegraph.x, this.telegraph.y);
      this.telegraph = null;
    }

    this.reloadTimer -= deltaMs;
    if (this.reloadTimer <= 0 && !this.telegraph) {
      const target = this.pickTarget();
      if (target) {
        // Aim wanders less as the siege wears on.
        const spread = 74 - 56 * p;
        this.telegraph = {
          x: target.x + this.rng.float(-spread, spread),
          y: target.y + this.rng.float(-spread * 0.5, spread * 0.5),
          at: this.elapsed + TELEGRAPH_MS,
        };
      }
      this.reloadTimer = this.rng.between(1500 - 800 * p, 2100 - 1000 * p);
    }

    this.waveTimer -= deltaMs;
    if (this.waveTimer <= 0) {
      this.sendWave(p);
      this.waveTimer = this.rng.between(5200 - 2000 * p, 7600 - 3000 * p);
    }
  }

  /**
   * Prefers load-bearing blocks low in the structure — knocking those out
   * drops everything above, which is the same tactic a human attacker learns.
   *
   * Only ever returns a point the cannon can actually reach. Height eats range
   * badly, so the top of a tall keep may simply be unhittable; aiming there
   * anyway would burn reloads on shots that never fire.
   */
  private pickTarget(): { x: number; y: number } | null {
    const blocks = this.castle.all();
    if (blocks.length === 0) return null;

    const throne = this.castle.find('throne');
    if (throne && this.rng.chance(0.2)) {
      const at = { x: colToX(throne.col) + CELL / 2, y: rowToY(throne.row) + CELL / 2 };
      if (this.solveFor(at.x, at.y)) return at;
    }

    // Go for a support base sometimes. Without this nothing ever attacks one on
    // purpose, so the defender's choice of where to put them would never be
    // tested — and killing the mason's yard early is exactly what a thinking
    // attacker does, because it stops the walls healing behind them.
    const bases = blocks.filter((b) => isBase(b.mat));
    if (bases.length > 0 && this.rng.chance(0.3)) {
      const pick = bases[this.rng.between(0, bases.length - 1)];
      const at = { x: colToX(pick.col) + CELL / 2, y: rowToY(pick.row) + CELL / 2 };
      if (this.solveFor(at.x, at.y)) return at;
    }

    // Score toward the bottom of the castle, then walk candidates best-first
    // until one has a firing solution.
    const ranked = blocks
      .map((b) => ({
        x: colToX(b.col) + CELL / 2,
        y: rowToY(b.row) + CELL / 2,
        score: b.row * 2 + this.rng.next() * GRID_ROWS,
      }))
      .sort((a, b) => b.score - a.score);

    for (const cand of ranked) {
      if (this.solveFor(cand.x, cand.y)) return { x: cand.x, y: cand.y };
    }
    return null;
  }

  /** Lobbed solution if possible, else a flat one. Null if out of reach. */
  private solveFor(x: number, y: number) {
    return (
      solveLaunchAdaptive(
        CANNON_X + 22,
        CANNON_Y - 10,
        x,
        y,
        AI_MIN_SPEED,
        AI_MAX_SPEED,
        BALL_GRAVITY,
        // Lob shots clear the outer wall instead of burying themselves in it.
        true,
      ) ??
      solveLaunchAdaptive(
        CANNON_X + 22,
        CANNON_Y - 10,
        x,
        y,
        AI_MIN_SPEED,
        AI_MAX_SPEED,
        BALL_GRAVITY,
        false,
      )
    );
  }

  private fireAt(x: number, y: number): void {
    // Aim scatter can push the point out of reach; fall back to the clean shot.
    const shot = this.solveFor(x, y);
    if (!shot) return;
    this.lastAngle = Math.atan2(shot.vy, shot.vx);
    this.shotsFired++;
    const heavy = this.rng.chance(0.25 + this.pressure() * 0.25);
    this.launch(shot.vx, shot.vy, heavy ? 75 : 42, heavy ? 1.9 : 1.25);
  }

  private sendWave(p: number): void {
    const count = 1 + Math.round(p * 2);
    for (let i = 0; i < count; i++) {
      const id: UnitId = this.rng.chance(0.35 + p * 0.2) ? 'sapper' : 'knight';
      // Stagger arrivals so a wave trickles in rather than appearing at once.
      // Queued against battle time, not Phaser's clock: a wall-clock timer here
      // would make the same seed spawn troops at different moments.
      this.pending.push({ id, at: this.elapsed + i * 650 });
    }
    this.wavesSent++;
    this.flash(`Wave ${this.wavesSent} incoming — ${count} attacker${count > 1 ? 's' : ''}.`);
  }

  // ---------------------------------------------------------------- cards

  private bindInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.finished || this.menus.isOpen) return;
      if (this.cardBar.hits(p.x, p.y) || p.y < TOP_BAR_H) return;
      if (this.cardBar.armedSlot >= 0) {
        this.resolveTargeted(this.cardBar.armedSlot, p.worldX, p.worldY);
      }
    });
  }

  private onCardPressed(slot: number, card: CardDef): void {
    if (this.finished) return;
    if (card.kind === 'targeted') {
      if (!this.cards.canPlay(slot)) return;
      this.cardBar.armedSlot = this.cardBar.armedSlot === slot ? -1 : slot;
      this.flash(this.cardBar.armedSlot >= 0 ? `Tap where you want ${card.name}.` : '', true);
      return;
    }
    const played = this.cards.play(slot);
    if (!played) return;
    audio.play('whoosh');

    if (played.id === 'reinforce') {
      this.castleDamageMul = 0.6;
      this.reinforceUntil = this.elapsed + 10_000;
      this.flash('Reinforced — the walls hold firmer for 10 seconds.');
    }
  }

  private resolveTargeted(slot: number, worldX: number, worldY: number): void {
    const card = this.cards.hand[slot];
    this.cardBar.armedSlot = -1;
    if (!card) return;
    const played = this.cards.play(slot);
    if (!played) return;
    audio.play('whoosh');

    if (played.id === 'repair') {
      const healed = this.repairArea(worldX, worldY, played.radius ?? 2.5, 0.45);
      this.flash(healed > 0 ? `Masons patched ${healed} block${healed > 1 ? 's' : ''}.` : 'Nothing damaged there.');
    } else if (played.id === 'boilingOil') {
      const hits = this.damageUnitsInRadius(worldX, worldY, played.radius ?? 2, 70);
      this.flash(hits > 0 ? `Oil scalded ${hits} attacker${hits > 1 ? 's' : ''}.` : 'The oil hit nothing.');
    }
  }

  // ----------------------------------------------------- battle callbacks

  protected onTick(_dt: number, deltaMs: number): void {
    this.cards.update(deltaMs);
    if (this.reinforceUntil > 0 && this.elapsed >= this.reinforceUntil) {
      this.reinforceUntil = 0;
      this.castleDamageMul = 1;
    }
    this.runAi(deltaMs);
  }

  protected onDraw(): void {
    this.drawOverlay();
    this.refreshHud();
  }

  protected checkEnd(): boolean | null {
    if (!this.castle.find('throne')) return true; // attacker won
    if (this.timeLeft <= 0) return false; // you held
    return null;
  }

  protected override cannonAngle(): number {
    return this.lastAngle;
  }

  // -------------------------------------------------------------- drawing

  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();

    // Incoming-shot marker: shrinks as the shot gets closer to firing.
    if (this.telegraph) {
      const remain = Phaser.Math.Clamp((this.telegraph.at - this.elapsed) / TELEGRAPH_MS, 0, 1);
      const r = 14 + remain * 34;
      g.lineStyle(2, 0xe5654f, 0.55 + (1 - remain) * 0.45);
      g.strokeCircle(this.telegraph.x, this.telegraph.y, r);
      g.lineStyle(1, 0xe5654f, 0.5);
      g.beginPath();
      g.moveTo(this.telegraph.x - r - 6, this.telegraph.y);
      g.lineTo(this.telegraph.x + r + 6, this.telegraph.y);
      g.moveTo(this.telegraph.x, this.telegraph.y - r - 6);
      g.lineTo(this.telegraph.x, this.telegraph.y + r + 6);
      g.strokePath();
    }

    if (this.cardBar.armedSlot >= 0) {
      const card = this.cards.hand[this.cardBar.armedSlot];
      const p = this.input.activePointer;
      if (card?.radius) {
        g.lineStyle(2, card.accent, 0.9);
        g.strokeCircle(p.worldX, p.worldY, card.radius * CELL);
      }
    }
  }

  // ------------------------------------------------------------------ hud

  private buildHud(): void {
    const g = this.add.graphics().setDepth(40);
    panel(g, 0, 0, WORLD_WIDTH, TOP_BAR_H, COLORS.panel, COLORS.panelEdge, 0.96, 0);

    const midY = TOP_BAR_H / 2;
    this.add
      .text(18, midY, 'HOLD THE KEEP', {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.headline}px`,
        color: COLORS.text,
      })
      .setOrigin(0, 0.5)
      .setDepth(41);
    this.timerText = this.add
      .text(250, midY, '', {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.headline}px`,
        color: COLORS.text,
      })
      .setOrigin(0, 0.5)
      .setDepth(41);
    this.statusText = this.add
      .text(360, midY, '', {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.body}px`,
        color: COLORS.dim,
      })
      .setOrigin(0, 0.5)
      .setDepth(41);
    this.pressureText = this.add
      .text(WORLD_WIDTH - 216, midY, '', {
        fontFamily: FONT,
        fontSize: `${FONT_SIZE.body}px`,
        color: COLORS.dim,
      })
      .setOrigin(1, 0.5)
      .setDepth(41);

    // Surrender moves inside the pause menu: conceding should not be one
    // mis-tap away from the card you were reaching for.
    glyphButton(this, WORLD_WIDTH - 106, midY, 'pause', () => this.togglePause());
    glyphButton(this, WORLD_WIDTH - 38, midY, 'options', () => this.openOptions());

    this.cardBar = new CardBar(this, this.cards, (slot, card) => this.onCardPressed(slot, card));

    // Clear of the card column, which owns the left edge below the bar.
    this.add
      .text(
        WORLD_WIDTH / 2 + 80,
        TOP_BAR_H + 26,
        'Survive the siege. Red crosshairs mark incoming fire.',
        { fontFamily: FONT, fontSize: `${FONT_SIZE.small}px`, color: COLORS.dim },
      )
      .setOrigin(0.5)
      .setDepth(41);
  }

  private togglePause(): void {
    if (this.finished) return;
    this.setPaused(!this.paused);
    this.menus.toggle();
  }

  private openOptions(): void {
    if (this.finished) return;
    this.setPaused(true);
    this.menus.openOptions();
  }

  private flash(msg: string, sticky = false): void {
    this.statusText.setText(msg);
    this.flashUntil = msg ? (sticky ? Infinity : this.elapsed + 2600) : 0;
  }

  private refreshHud(): void {
    const secs = Math.max(0, this.timeLeft / 1000);
    this.timerText
      .setText(`${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`)
      .setColor(secs < 30 ? COLORS.good : COLORS.text);

    if (this.elapsed >= this.flashUntil) {
      const throne = this.castle.find('throne');
      this.statusText.setText(throne ? `Throne ${Math.max(0, Math.ceil(throne.hp))} hp` : '');
    }

    const p = this.pressure();
    const bars = Math.round(p * 10);
    this.pressureText
      .setText(`Assault ${'|'.repeat(bars)}${'.'.repeat(10 - bars)}`)
      .setColor(p > 0.66 ? COLORS.danger : COLORS.dim);

    this.cardBar.refresh();
  }
}
