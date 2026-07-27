import Phaser from 'phaser';
import type { Block, Castle } from '../core/castle';
import {
  CANNON_X,
  CANNON_Y,
  CELL,
  GRID_ROWS,
  GROUND_Y,
  SIEGE_DURATION_MS,
  SPAWN_X,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  colToX,
  rowToY,
  xToCol,
  yToRow,
} from '../core/config';
import { MATERIALS, cardForBase, isBase, type MaterialId } from '../core/materials';
import { Rng, seedFromUrl } from '../core/rng';
import { store, type PlayerSide } from '../core/store';
import { UNITS, type UnitDef, type UnitId } from '../core/units';
import { CastleView } from '../ui/CastleView';
import { SkyView } from '../ui/sky';
import { FONT } from '../ui/theme';

export const BALL_GRAVITY = 900;
const DEBRIS_GRAVITY = 1150;
const UNIT_GRAVITY = 1500;

/**
 * The simulation advances in fixed slices, never by whatever the last frame
 * happened to take.
 *
 * Two reasons, and the second is the important one. A phone dropping to 30fps
 * used to get materially different physics from a desktop at 60 — Euler
 * integration with a doubled `dt` overshoots — so a wall that held on one
 * device could fall on another. And a battle can only be replayed from a seed
 * if every step is identical, which a variable `dt` makes impossible no matter
 * how well the dice are seeded.
 */
export const STEP_MS = 1000 / 60;
/**
 * Ceiling on catch-up per frame. A backgrounded tab hands back a delta of
 * minutes; running that as thousands of steps would lock the page up, so the
 * battle simply loses that time instead.
 */
const MAX_CATCHUP_MS = 250;

/** How often the standing bases do their passive work. */
const BASE_PULSE_MS = 4000;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  trail: number[];
}

export interface Debris {
  x: number;
  y: number;
  vy: number;
  mat: MaterialId;
  hp: number;
  maxHp: number;
  startY: number;
  hitUnits: Set<Unit>;
}

export interface Unit {
  def: UnitDef;
  x: number;
  /** y of the unit's feet. */
  feetY: number;
  vy: number;
  hp: number;
  swing: number;
  /** Melee damage banked since the last swing, so numbers batch per blow. */
  dealt: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
}

/** A damage number drifting up from where a hit landed. */
interface Floater {
  x: number;
  y: number;
  life: number;
  text: string;
  color: string;
  size: number;
}

/**
 * Damage numbers are drawn through a fixed pool of Text objects. Creating a
 * Text per hit would allocate during the busiest frames of the battle — a
 * cannonball landing in a wall can damage a dozen blocks at once.
 */
const FLOATER_POOL = 14;
const FLOATER_LIFE = 1.05;

/**
 * Everything both battle modes share: the castle, projectiles, falling debris,
 * advancing troops, and how all of those hurt each other.
 *
 * The siege and the defence run the *same* simulation — the only difference is
 * who issues the orders. Subclasses supply the controller (player input or AI)
 * and the win condition; nothing about the physics changes between them.
 */
export abstract class BattleScene extends Phaser.Scene {
  protected castle!: Castle;
  protected sky!: SkyView;
  protected view!: CastleView;
  protected fx!: Phaser.GameObjects.Graphics;
  /** Shells and their trails, drawn above the HUD so the card bar never hides one. */
  private ballFx!: Phaser.GameObjects.Graphics;

  protected balls: Ball[] = [];
  protected debris: Debris[] = [];
  protected units: Unit[] = [];
  protected particles: Particle[] = [];
  protected floaters: Floater[] = [];
  private floaterPool: Phaser.GameObjects.Text[] = [];

  protected timeLeft = SIEGE_DURATION_MS;
  /**
   * Milliseconds of *battle* time, accumulated from frame deltas. Everything
   * with a duration is timed against this rather than `this.time.now`: mixing
   * the two would let a low frame rate stretch or shrink one effect relative to
   * another, which matters most on the weak devices that drop frames.
   */
  protected elapsed = 0;
  protected blocksAtStart = 0;
  protected finished = false;

  /** The battle's dice. Same seed, same battle — see `src/core/rng.ts`. */
  protected rng!: Rng;
  /** Unspent frame time carried into the next update. */
  private accumulator = 0;

  /** Scales all damage dealt to the castle. Reinforce drops this below 1. */
  protected castleDamageMul = 1;
  /** Battle-time stamp past which the rally buff has expired. */
  protected rallyUntil = 0;

  /** Base blocks still standing, by the card each one powers. */
  protected basesAlive = new Set<string>();
  /** Next battle time at which the standing bases do their passive work. */
  private baseTick = 0;

  /** Which side the human is playing, for the result screen. */
  protected abstract readonly playerSide: PlayerSide;

  /** Per-frame controller work: economy, AI, cards, input state. */
  protected abstract onTick(dt: number, deltaMs: number): void;
  /** Overlay drawing and HUD refresh, after the world is drawn. */
  protected abstract onDraw(): void;
  /** Return true to end the battle; the boolean is whether the attacker won. */
  protected abstract checkEnd(): boolean | null;

  // ------------------------------------------------------------------ setup

  protected bootBattle(): void {
    this.castle = store.loadCastle();
    this.blocksAtStart = this.castle.count();
    this.rng = new Rng(seedFromUrl());
    this.accumulator = 0;

    this.balls = [];
    this.debris = [];
    this.units = [];
    this.particles = [];
    this.floaters = [];
    this.timeLeft = SIEGE_DURATION_MS;
    this.elapsed = 0;
    this.finished = false;
    this.castleDamageMul = 1;
    this.rallyUntil = 0;
    this.baseTick = BASE_PULSE_MS;
    this.basesAlive = new Set();
    for (const block of this.castle.all()) {
      const card = cardForBase(block.mat);
      if (card) this.basesAlive.add(card);
    }

    this.sky = new SkyView(this, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y);
    this.sky.draw(0);
    this.view = new CastleView(this, this.castle, 5);
    this.fx = this.add.graphics().setDepth(10);
    // Above the card bar: a shell in flight must never be hidden by the HUD.
    this.ballFx = this.add.graphics().setDepth(56);

    this.floaterPool = [];
    for (let i = 0; i < FLOATER_POOL; i++) {
      this.floaterPool.push(
        this.add
          .text(0, 0, '', { fontFamily: FONT, fontSize: '24px', color: '#ffffff' })
          .setOrigin(0.5)
          .setDepth(57)
          .setVisible(false),
      );
    }
  }

  // ------------------------------------------------------------- main loop

  override update(_time: number, deltaMs: number): void {
    if (this.finished) return;

    this.accumulator = Math.min(this.accumulator + deltaMs, MAX_CATCHUP_MS);
    while (this.accumulator >= STEP_MS && !this.finished) {
      this.accumulator -= STEP_MS;
      this.step();
    }

    // Drawing happens once per frame regardless of how many steps ran.
    this.sky.draw(this.progress());
    this.view.draw();
    this.drawFx();
    this.onDraw();
  }

  /** One fixed slice of simulation. */
  private step(): void {
    const dt = STEP_MS / 1000;

    this.elapsed += STEP_MS;
    this.timeLeft -= STEP_MS;

    this.pulseBases();
    this.onTick(dt, STEP_MS);

    this.updateBalls(dt);
    this.updateDebris(dt);
    this.updateUnits(dt);
    this.updateParticles(dt);
    this.updateFloaters(dt);

    const verdict = this.checkEnd();
    if (verdict !== null) this.finishBattle(verdict);
  }

  /**
   * How far through the battle we are, 0 to 1. The sky reads this, and so does
   * the defence AI's difficulty ramp: one clock driving both means the sunset
   * *is* the halfway warning rather than merely coinciding with it.
   */
  protected progress(): number {
    return Phaser.Math.Clamp(1 - this.timeLeft / SIEGE_DURATION_MS, 0, 1);
  }

  // ------------------------------------------------------------ projectiles

  /** Adds a cannonball travelling at the given velocity. */
  protected launch(vx: number, vy: number, damage: number, radius: number): void {
    this.balls.push({
      x: CANNON_X + 22,
      y: CANNON_Y - 10,
      vx,
      vy,
      damage,
      radius,
      trail: [],
    });
    this.burst(CANNON_X + 26, CANNON_Y - 10, 10, 0xffcb6b, 160);
    this.cameras.main.shake(90, 0.003);
  }

  private updateBalls(dt: number): void {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.vy += BALL_GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      b.trail.push(b.x, b.y);
      if (b.trail.length > 16) b.trail.splice(0, 2);

      let hit = false;
      if (b.y >= GROUND_Y) {
        b.y = GROUND_Y;
        hit = true;
      } else if (this.castle.has(xToCol(b.x), yToRow(b.y))) {
        hit = true;
      }

      if (hit) {
        this.explode(b.x, b.y, b.damage, b.radius);
        this.balls.splice(i, 1);
      } else if (b.x < -80 || b.x > WORLD_WIDTH + 80 || b.y > WORLD_HEIGHT + 200) {
        this.balls.splice(i, 1);
      }
    }
  }

  /** Damages every block within `radiusCells`, with linear falloff. */
  protected explode(x: number, y: number, damage: number, radiusCells: number): void {
    const centerCol = xToCol(x);
    const centerRow = yToRow(y);
    const reach = Math.ceil(radiusCells);
    const destroyed: Block[] = [];
    let dealt = 0;

    for (let dc = -reach; dc <= reach; dc++) {
      for (let dr = -reach; dr <= reach; dr++) {
        const block = this.castle.get(centerCol + dc, centerRow + dr);
        if (!block) continue;
        const bx = colToX(block.col) + CELL / 2;
        const by = rowToY(block.row) + CELL / 2;
        const distCells = Math.hypot(bx - x, by - y) / CELL;
        if (distCells > radiusCells) continue;
        const falloff = 1 - (distCells / radiusCells) * 0.65;
        const hit = this.castle.damage(
          block,
          damage * falloff * this.castleDamageMul,
          'blast',
        );
        dealt += hit.applied;
        if (hit.killed) destroyed.push(hit.killed);
      }
    }

    // Troops standing in the blast take a share of it too.
    for (const unit of this.units) {
      const d = Math.hypot(unit.x - x, unit.feetY - unit.def.height / 2 - y) / CELL;
      if (d > radiusCells) continue;
      const toUnit = damage * 0.4 * (1 - d / radiusCells);
      unit.hp -= toUnit;
      dealt += toUnit;
    }

    for (const block of destroyed) {
      this.burst(
        colToX(block.col) + CELL / 2,
        rowToY(block.row) + CELL / 2,
        6,
        MATERIALS[block.mat].fill,
        120,
      );
    }
    this.burst(x, y, 16, 0xffd08a, 220);
    this.reportHit(x, y, dealt, destroyed.length);
    this.reconcileBases();
    this.cameras.main.shake(Math.min(220, 60 + damage), 0.002 + Math.min(0.006, damage / 40000));
    this.collapse();
  }

  /** Turns every block that lost its support chain into falling debris. */
  protected collapse(): void {
    const falling = this.castle.findUnsupported();
    for (const block of falling) {
      this.castle.remove(block.col, block.row);
      this.debris.push({
        x: colToX(block.col),
        y: rowToY(block.row),
        vy: 0,
        mat: block.mat,
        hp: block.hp,
        maxHp: block.maxHp,
        startY: rowToY(block.row),
        hitUnits: new Set(),
      });
    }
    if (falling.length > 0) this.reconcileBases();
  }

  private updateDebris(dt: number): void {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.vy += DEBRIS_GRAVITY * dt;
      d.y += d.vy * dt;

      const col = xToCol(d.x + CELL / 2);
      const restRow = this.castle.landingRow(col, Math.max(0, yToRow(d.y)));
      const restY = rowToY(restRow);

      // Crush anything caught underneath on the way down.
      for (const unit of this.units) {
        if (d.hitUnits.has(unit)) continue;
        if (Math.abs(unit.x - (d.x + CELL / 2)) > CELL * 0.7) continue;
        const head = unit.feetY - unit.def.height;
        if (d.y + CELL >= head && d.y <= unit.feetY) {
          unit.hp -= 45 + d.vy * 0.05;
          d.hitUnits.add(unit);
          this.burst(unit.x, head, 6, 0xd6483a, 140);
        }
      }

      if (d.y >= restY) {
        const fall = Math.max(0, restY - d.startY);
        const impact = (fall / CELL) * 22 * MATERIALS[d.mat].brittleness;
        d.hp -= impact;

        // Whatever it landed on takes the impact as well.
        const below = this.castle.get(col, restRow + 1);
        if (below) {
          const hit = this.castle.damage(below, impact * 0.8, 'impact');
          this.reportHit(d.x + CELL / 2, restY, hit.applied, hit.killed ? 1 : 0);
        }

        if (d.hp > 0 && restRow < GRID_ROWS && !this.castle.has(col, restRow)) {
          this.castle.place(col, restRow, d.mat, d.hp / d.maxHp);
        } else {
          this.burst(d.x + CELL / 2, restY + CELL / 2, 8, MATERIALS[d.mat].fill, 150);
        }
        this.debris.splice(i, 1);
        this.cameras.main.shake(60, 0.0015);
        this.collapse();
      }
    }
  }

  // ------------------------------------------------------------------ units

  protected spawnUnit(id: UnitId): Unit {
    const def = UNITS[id];
    const unit: Unit = {
      def,
      x: SPAWN_X + this.rng.between(-10, 10),
      feetY: GROUND_Y,
      vy: 0,
      hp: def.hp,
      swing: 0,
      dealt: 0,
    };
    this.units.push(unit);
    return unit;
  }

  private updateUnits(dt: number): void {
    const rallied = this.elapsed < this.rallyUntil;
    const speedMul = rallied ? 1.6 : 1;
    const dpsMul = rallied ? 1.5 : 1;

    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.hp <= 0) {
        this.burst(u.x, u.feetY - u.def.height / 2, 10, u.def.fill, 160);
        this.units.splice(i, 1);
        continue;
      }
      u.swing = Math.max(0, u.swing - dt);

      // Fall onto whatever surface is under the unit's own column.
      const surface = this.surfaceBelow(xToCol(u.x), u.feetY);
      if (u.feetY < surface - 0.5) {
        u.vy += UNIT_GRAVITY * dt;
        u.feetY = Math.min(surface, u.feetY + u.vy * dt);
        if (u.feetY >= surface) u.vy = 0;
        continue;
      }
      u.feetY = surface;
      u.vy = 0;

      const aheadX = u.x + u.def.width / 2 + 3;
      const aheadCol = xToCol(aheadX);
      const feetRow = yToRow(u.feetY - 1);
      const blocking = this.castle.get(aheadCol, feetRow);

      if (blocking) {
        const headroom = !this.castle.has(aheadCol, feetRow - 1);
        if (headroom && u.def.climb >= 1) {
          // A single-cell ledge is stepped over. Nudging x into the ledge's own
          // column keeps the unit from dropping straight back off it next frame.
          u.x = Math.max(u.x + u.def.speed * speedMul * dt, colToX(aheadCol) + 2);
          u.feetY = rowToY(feetRow);
        } else {
          const hit = this.castle.damage(
            blocking,
            u.def.dps * dpsMul * dt * this.castleDamageMul,
            'melee',
          );
          // Melee is continuous, so it is batched into one number per swing
          // rather than one per frame, which would be unreadable.
          u.dealt += hit.applied;
          if (u.swing <= 0) {
            u.swing = 0.45;
            this.burst(colToX(aheadCol), u.feetY - u.def.height * 0.5, 3, 0xffe9a8, 90);
            this.reportHit(
              colToX(aheadCol),
              u.feetY - u.def.height,
              u.dealt,
              hit.killed ? 1 : 0,
            );
            u.dealt = 0;
          }
          if (!this.castle.has(aheadCol, feetRow)) this.collapse();
        }
      } else {
        u.x += u.def.speed * speedMul * dt;
      }

      if (u.x > WORLD_WIDTH + 40) this.units.splice(i, 1);
    }
  }

  /**
   * Top of the first solid cell at or below the unit's feet, or the ground.
   * Scanning downward from the feet (rather than from the top of the column)
   * matters: a unit walking under an arch must not be snapped up onto its roof.
   */
  protected surfaceBelow(col: number, feetY: number): number {
    for (let row = Math.max(0, yToRow(feetY)); row < GRID_ROWS; row++) {
      if (this.castle.has(col, row)) return rowToY(row);
    }
    return GROUND_Y;
  }

  /**
   * What the bases do on their own.
   *
   * Small, and deliberately the same job as the card they power — a mason's
   * yard patches, an oil vat scalds. Without this they would be inert in a
   * siege, where nobody is holding cards, and the whole point of the mechanic
   * is that the ground they stand on is worth fighting over in both modes.
   */
  private pulseBases(): void {
    if (this.elapsed < this.baseTick) return;
    this.baseTick = this.elapsed + BASE_PULSE_MS;

    for (const block of this.castle.all()) {
      if (!isBase(block.mat)) continue;
      const x = colToX(block.col) + CELL / 2;
      const y = rowToY(block.row) + CELL / 2;
      if (block.mat === 'masonsYard') this.repairArea(x, y, 2.5, 0.05);
      else if (block.mat === 'oilVat') this.damageUnitsInRadius(x, y, 2.2, 24);
    }
  }

  /**
   * Called once for each base destroyed this frame. `collapse` and `explode`
   * both route through here so a base lost to a falling tower counts the same
   * as one shot off the wall.
   */
  protected onBaseLost(_card: string): void {}

  /** Notices bases that have stopped existing since the last check. */
  private reconcileBases(): void {
    if (this.basesAlive.size === 0) return;
    const standing = new Set<string>();
    for (const block of this.castle.all()) {
      const card = cardForBase(block.mat);
      if (card) standing.add(card);
    }
    for (const card of [...this.basesAlive]) {
      if (!standing.has(card)) {
        this.basesAlive.delete(card);
        this.onBaseLost(card);
      }
    }
  }

  // ------------------------------------------------------- defensive tools

  /** Scalds every attacker within the radius. Used by Boiling Oil. */
  protected damageUnitsInRadius(x: number, y: number, radiusCells: number, damage: number): number {
    let hits = 0;
    for (const unit of this.units) {
      const d = Math.hypot(unit.x - x, unit.feetY - unit.def.height / 2 - y) / CELL;
      if (d > radiusCells) continue;
      unit.hp -= damage * (1 - (d / radiusCells) * 0.5);
      this.burst(unit.x, unit.feetY - unit.def.height / 2, 8, 0xe07b2a, 170);
      hits++;
    }
    return hits;
  }

  /** Restores hitpoints to damaged blocks in the radius. Used by Masons. */
  protected repairArea(x: number, y: number, radiusCells: number, fraction: number): number {
    const centerCol = xToCol(x);
    const centerRow = yToRow(y);
    const reach = Math.ceil(radiusCells);
    let healed = 0;

    for (let dc = -reach; dc <= reach; dc++) {
      for (let dr = -reach; dr <= reach; dr++) {
        const block = this.castle.get(centerCol + dc, centerRow + dr);
        if (!block || block.hp >= block.maxHp) continue;
        const bx = colToX(block.col) + CELL / 2;
        const by = rowToY(block.row) + CELL / 2;
        if (Math.hypot(bx - x, by - y) / CELL > radiusCells) continue;
        block.hp = Math.min(block.maxHp, block.hp + block.maxHp * fraction);
        this.burst(bx, by, 4, 0x4f9d69, 90);
        healed++;
      }
    }
    return healed;
  }

  // ------------------------------------------------------- damage readout

  /**
   * Floats the damage a hit actually did above where it landed.
   *
   * One number per impact rather than one per block: a shell landing in a wall
   * damages everything in its radius, and a dozen numbers racing each other
   * tells you less than a single total. Blocks broken are appended, because
   * that is the part you are actually trying to achieve.
   */
  protected reportHit(x: number, y: number, dealt: number, broken: number): void {
    if (dealt < 1) return;
    const heavy = dealt >= 90;
    this.floaters.push({
      x,
      y,
      life: FLOATER_LIFE,
      text: broken > 0 ? `${Math.round(dealt)}  −${broken}` : `${Math.round(dealt)}`,
      color: broken > 0 ? '#ffd08a' : heavy ? '#ffb562' : '#e7ecf5',
      size: heavy || broken > 0 ? 28 : 22,
    });
    // Oldest first, so a busy moment drops stale numbers rather than new ones.
    if (this.floaters.length > FLOATER_POOL) this.floaters.shift();
  }

  private updateFloaters(dt: number): void {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.floaters.splice(i, 1);
        continue;
      }
      f.y -= 42 * dt;
    }

    for (let i = 0; i < this.floaterPool.length; i++) {
      const text = this.floaterPool[i];
      const f = this.floaters[i];
      if (!f) {
        text.setVisible(false);
        continue;
      }
      const t = f.life / FLOATER_LIFE;
      text
        .setVisible(true)
        .setPosition(f.x, f.y)
        .setText(f.text)
        .setColor(f.color)
        .setFontSize(f.size)
        // Hold full opacity for the first half, then fade, so short-lived
        // numbers are still readable at a glance.
        .setAlpha(Phaser.Math.Clamp(t * 2, 0, 1));
    }
  }

  // ------------------------------------------------------------ particles

  /**
   * Cosmetic only, and deliberately *not* on `this.rng`: drawing from the
   * seeded stream here would mean adding a puff of smoke silently changed the
   * outcome of every seeded battle.
   */
  protected burst(x: number, y: number, count: number, color: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      const life = 0.25 + Math.random() * 0.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life,
        maxLife: life,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 620 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  // -------------------------------------------------------------- drawing

  /** Barrel elevation, in radians. Subclasses point it wherever they aim. */
  protected cannonAngle(): number {
    return -0.5;
  }

  private drawFx(): void {
    const g = this.fx;
    g.clear();

    g.fillStyle(0x2c3346, 1);
    g.fillRect(CANNON_X - 26, CANNON_Y - 6, 52, 22);
    g.fillStyle(0x4a5570, 1);
    g.save();
    g.translateCanvas(CANNON_X, CANNON_Y - 10);
    g.rotateCanvas(this.cannonAngle());
    g.fillRect(0, -7, 42, 14);
    g.restore();
    g.fillStyle(0x1b2130, 1);
    g.fillCircle(CANNON_X, CANNON_Y - 10, 12);

    for (const d of this.debris) {
      const def = MATERIALS[d.mat];
      g.fillStyle(def.fill, 1);
      g.fillRect(d.x + 2, d.y + 2, CELL - 4, CELL - 4);
      g.lineStyle(1, def.stroke, 1);
      g.strokeRect(d.x + 2, d.y + 2, CELL - 4, CELL - 4);
    }

    for (const u of this.units) {
      const def = u.def;
      const top = u.feetY - def.height;
      g.fillStyle(0x000000, 0.25);
      g.fillEllipse(u.x, u.feetY + 2, def.width * 1.4, 6);
      g.fillStyle(def.fill, 1);
      g.fillRect(u.x - def.width / 2, top, def.width, def.height);
      g.lineStyle(1, def.stroke, 1);
      g.strokeRect(u.x - def.width / 2, top, def.width, def.height);
      // Helmet band and weapon, enough to tell the two unit types apart.
      g.fillStyle(def.stroke, 1);
      g.fillRect(u.x - def.width / 2, top + 6, def.width, 3);
      g.fillStyle(u.swing > 0.2 ? 0xffe9a8 : 0x8e9ab2, 1);
      g.fillRect(u.x + def.width / 2, top + 10, 10, 3);

      const hpFrac = Phaser.Math.Clamp(u.hp / def.hp, 0, 1);
      if (hpFrac < 1) {
        g.fillStyle(0x000000, 0.6);
        g.fillRect(u.x - 12, top - 8, 24, 4);
        g.fillStyle(hpFrac > 0.4 ? 0x6fce93 : 0xe5654f, 1);
        g.fillRect(u.x - 12, top - 8, 24 * hpFrac, 4);
      }
    }

    for (const p of this.particles) {
      g.fillStyle(p.color, Phaser.Math.Clamp(p.life / p.maxLife, 0, 1));
      g.fillRect(p.x, p.y, p.size, p.size);
    }

    // Shells go on their own layer, above the HUD, so a shot crossing the card
    // bar stays visible — losing sight of one mid-flight makes aiming guesswork.
    const gb = this.ballFx;
    gb.clear();
    for (const b of this.balls) {
      for (let i = 0; i < b.trail.length; i += 2) {
        const t = i / Math.max(2, b.trail.length);
        gb.fillStyle(0xffb562, t * 0.5);
        gb.fillCircle(b.trail[i], b.trail[i + 1], 2 + t * 3);
      }
      gb.fillStyle(0x2a2f3d, 1);
      gb.fillCircle(b.x, b.y, 7);
      gb.fillStyle(0xffd08a, 0.9);
      gb.fillCircle(b.x - 2, b.y - 2, 3);
    }
  }

  // --------------------------------------------------------------- ending

  protected finishBattle(attackerWon: boolean): void {
    if (this.finished) return;
    this.finished = true;
    store.lastResult = {
      attackerWon,
      seed: this.rng.seed,
      playerSide: this.playerSide,
      msElapsed: this.elapsed,
      blocksLeft: this.castle.count(),
      blocksAtStart: this.blocksAtStart,
    };
    this.time.delayedCall(600, () => this.scene.start('Result'));
  }
}
