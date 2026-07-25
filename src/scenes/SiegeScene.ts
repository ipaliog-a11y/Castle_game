import Phaser from 'phaser';
import type { Block, Castle } from '../core/castle';
import { CardEngine, OFFENSE_DECK, type CardDef } from '../core/cards';
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
import { MATERIALS, type MaterialId } from '../core/materials';
import { store } from '../core/store';
import {
  GOLD_MAX,
  GOLD_PER_SEC,
  GOLD_START,
  SHOT_COOLDOWN_MS,
  SHOT_GOLD,
  UNITS,
  type UnitDef,
  type UnitId,
} from '../core/units';
import { CardBar } from '../ui/CardBar';
import { CastleView } from '../ui/CastleView';
import { COLORS, FONT, drawBackdrop, panel } from '../ui/theme';

const BALL_GRAVITY = 900;
const DEBRIS_GRAVITY = 1150;
const UNIT_GRAVITY = 1500;
const MIN_SHOT_SPEED = 300;
const MAX_SHOT_SPEED = 1100;
const MAX_DRAG = 380;

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  trail: number[];
}

interface Debris {
  x: number;
  y: number;
  vy: number;
  mat: MaterialId;
  hp: number;
  maxHp: number;
  startY: number;
  hitUnits: Set<Unit>;
}

interface Unit {
  def: UnitDef;
  x: number;
  /** y of the unit's feet. */
  feetY: number;
  vy: number;
  hp: number;
  swing: number;
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

export class SiegeScene extends Phaser.Scene {
  private castle!: Castle;
  private view!: CastleView;
  private fx!: Phaser.GameObjects.Graphics;
  private aimG!: Phaser.GameObjects.Graphics;

  private balls: Ball[] = [];
  private debris: Debris[] = [];
  private units: Unit[] = [];
  private particles: Particle[] = [];

  private gold = GOLD_START;
  private timeLeft = SIEGE_DURATION_MS;
  private cooldown = 0;
  private blocksAtStart = 0;
  private elapsed = 0;
  private finished = false;

  /** Set by Chain Shot / Black Powder until the next cannon shot consumes it. */
  private shotMod: 'chain' | 'power' | null = null;
  private rallyUntil = 0;

  private cards!: CardEngine;
  private cardBar!: CardBar;
  private aiming = false;
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
    this.castle = store.loadCastle();
    this.blocksAtStart = this.castle.count();

    this.balls = [];
    this.debris = [];
    this.units = [];
    this.particles = [];
    this.gold = GOLD_START;
    this.timeLeft = SIEGE_DURATION_MS;
    this.cooldown = 0;
    this.elapsed = 0;
    this.finished = false;
    this.shotMod = null;
    this.rallyUntil = 0;

    drawBackdrop(this, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y);
    this.view = new CastleView(this, this.castle, 5);
    this.fx = this.add.graphics().setDepth(10);
    this.aimG = this.add.graphics().setDepth(20);

    this.cards = new CardEngine(OFFENSE_DECK);
    this.buildHud();
    this.bindInput();
    this.view.draw();
  }

  // ---------------------------------------------------------------- input

  private bindInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.finished || this.cardBar.hits(p.x, p.y) || p.y < 52) return;

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

  private aimVector(): { vx: number; vy: number; power: number } {
    const dx = this.aimX - CANNON_X;
    const dy = this.aimY - CANNON_Y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const power = Phaser.Math.Clamp(dist / MAX_DRAG, 0.15, 1);
    const speed = MIN_SHOT_SPEED + power * (MAX_SHOT_SPEED - MIN_SHOT_SPEED);
    return { vx: (dx / dist) * speed, vy: (dy / dist) * speed, power };
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
      this.balls.push({
        x: CANNON_X + 22,
        y: CANNON_Y - 10,
        vx: vx * cos - vy * sin,
        vy: vx * sin + vy * cos,
        damage: powered ? 150 : this.shotMod === 'chain' ? 38 : 62,
        radius: powered ? 2.3 : 1.25,
        trail: [],
      });
    }

    this.burst(CANNON_X + 26, CANNON_Y - 10, 10, 0xffcb6b, 160);
    this.cameras.main.shake(90, 0.003);
    this.shotMod = null;
    this.modText.setText('');
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

    if (played.id === 'chainShot') {
      this.shotMod = 'chain';
      this.modText.setText('Loaded: Chain Shot');
    } else if (played.id === 'blackPowder') {
      this.shotMod = 'power';
      this.modText.setText('Loaded: Black Powder');
    } else if (played.id === 'rally') {
      this.rallyUntil = this.time.now + 8000;
      this.flash('Rally! Knights press the attack.');
    }
  }

  private resolveTargeted(slot: number, worldX: number, worldY: number): void {
    const card = this.cards.hand[slot];
    this.cardBar.armedSlot = -1;
    if (!card) return;
    const played = this.cards.play(slot);
    if (!played) return;

    if (played.id === 'sapperCharge') {
      this.explode(worldX, worldY, 170, played.radius ?? 1.6);
      this.flash('');
    }
  }

  // ----------------------------------------------------------- simulation

  override update(_time: number, deltaMs: number): void {
    if (this.finished) return;
    const dt = Math.min(deltaMs, 50) / 1000;

    this.elapsed += deltaMs;
    this.timeLeft -= deltaMs;
    this.cooldown = Math.max(0, this.cooldown - deltaMs);
    this.gold = Math.min(GOLD_MAX, this.gold + GOLD_PER_SEC * dt);
    this.cards.update(deltaMs);

    this.updateBalls(dt);
    this.updateDebris(dt);
    this.updateUnits(dt);
    this.updateParticles(dt);

    this.view.draw();
    this.drawFx();
    this.drawAim();
    this.refreshHud();

    if (!this.castle.find('throne')) this.finish(true);
    else if (this.timeLeft <= 0) this.finish(false);
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
  private explode(x: number, y: number, damage: number, radiusCells: number): void {
    const centerCol = xToCol(x);
    const centerRow = yToRow(y);
    const reach = Math.ceil(radiusCells);
    const destroyed: Block[] = [];

    for (let dc = -reach; dc <= reach; dc++) {
      for (let dr = -reach; dr <= reach; dr++) {
        const block = this.castle.get(centerCol + dc, centerRow + dr);
        if (!block) continue;
        const bx = colToX(block.col) + CELL / 2;
        const by = rowToY(block.row) + CELL / 2;
        const distCells = Math.hypot(bx - x, by - y) / CELL;
        if (distCells > radiusCells) continue;
        const falloff = 1 - (distCells / radiusCells) * 0.65;
        const killed = this.castle.damage(block, damage * falloff, 'blast');
        if (killed) destroyed.push(killed);
      }
    }

    // Attackers standing in the blast take a share of it too.
    for (const unit of this.units) {
      const d = Math.hypot(unit.x - x, unit.feetY - unit.def.height / 2 - y) / CELL;
      if (d <= radiusCells) unit.hp -= damage * 0.4 * (1 - d / radiusCells);
    }

    for (const block of destroyed) {
      this.burst(colToX(block.col) + CELL / 2, rowToY(block.row) + CELL / 2, 6, MATERIALS[block.mat].fill, 120);
    }
    this.burst(x, y, 16, 0xffd08a, 220);
    this.cameras.main.shake(Math.min(220, 60 + damage), 0.002 + Math.min(0.006, damage / 40000));
    this.collapse();
  }

  /** Turns every block that lost its support chain into falling debris. */
  private collapse(): void {
    for (const block of this.castle.findUnsupported()) {
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
        if (below) this.castle.damage(below, impact * 0.8, 'impact');

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

  private updateUnits(dt: number): void {
    const rallied = this.time.now < this.rallyUntil;
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
          this.castle.damage(blocking, u.def.dps * dpsMul * dt, 'melee');
          if (u.swing <= 0) {
            u.swing = 0.45;
            this.burst(colToX(aheadCol), u.feetY - u.def.height * 0.5, 3, 0xffe9a8, 90);
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
  private surfaceBelow(col: number, feetY: number): number {
    for (let row = Math.max(0, yToRow(feetY)); row < GRID_ROWS; row++) {
      if (this.castle.has(col, row)) return rowToY(row);
    }
    return GROUND_Y;
  }

  private deploy(id: UnitId): void {
    const def = UNITS[id];
    if (this.gold < def.gold) {
      this.flash('Not enough gold.');
      return;
    }
    this.gold -= def.gold;
    this.units.push({
      def,
      x: SPAWN_X + Phaser.Math.Between(-10, 10),
      feetY: GROUND_Y,
      vy: 0,
      hp: def.hp,
      swing: 0,
    });
  }

  // ------------------------------------------------------------ particles

  private burst(x: number, y: number, count: number, color: number, speed: number): void {
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

  private drawFx(): void {
    const g = this.fx;
    g.clear();

    // Cannon.
    g.fillStyle(0x2c3346, 1);
    g.fillRect(CANNON_X - 26, CANNON_Y - 6, 52, 22);
    g.fillStyle(0x4a5570, 1);
    const { vx, vy } = this.aimVector();
    const ang = Math.atan2(vy, vx);
    g.save();
    g.translateCanvas(CANNON_X, CANNON_Y - 10);
    g.rotateCanvas(ang);
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

    for (const b of this.balls) {
      for (let i = 0; i < b.trail.length; i += 2) {
        const t = i / Math.max(2, b.trail.length);
        g.fillStyle(0xffb562, t * 0.5);
        g.fillCircle(b.trail[i], b.trail[i + 1], 2 + t * 3);
      }
      g.fillStyle(0x2a2f3d, 1);
      g.fillCircle(b.x, b.y, 7);
      g.fillStyle(0xffd08a, 0.9);
      g.fillCircle(b.x - 2, b.y - 2, 3);
    }

    for (const p of this.particles) {
      g.fillStyle(p.color, Phaser.Math.Clamp(p.life / p.maxLife, 0, 1));
      g.fillRect(p.x, p.y, p.size, p.size);
    }
  }

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
    const { vx, vy, power } = this.aimVector();

    // Preview by running the same integration the projectile will use.
    let x = CANNON_X + 22;
    let y = CANNON_Y - 10;
    let sx = vx;
    let sy = vy;
    const step = 1 / 40;
    for (let i = 0; i < 90; i++) {
      sy += BALL_GRAVITY * step;
      x += sx * step;
      y += sy * step;
      if (y > GROUND_Y || x > WORLD_WIDTH) break;
      if (this.castle.has(xToCol(x), yToRow(y))) break;
      if (i % 3 === 0) {
        g.fillStyle(0xffd08a, 0.55 - i * 0.004);
        g.fillCircle(x, y, 3);
      }
    }

    g.lineStyle(3, 0xffd08a, 0.35);
    g.strokeCircle(CANNON_X, CANNON_Y - 10, 20 + power * 16);
  }

  // ------------------------------------------------------------------ hud

  private buildHud(): void {
    const g = this.add.graphics().setDepth(40);
    panel(g, 0, 0, WORLD_WIDTH, 52, COLORS.panel, COLORS.panelEdge, 0.96, 0);

    this.goldText = this.add
      .text(16, 26, '', { fontFamily: FONT, fontSize: '18px', color: COLORS.gold })
      .setOrigin(0, 0.5)
      .setDepth(41);
    this.timerText = this.add
      .text(200, 26, '', { fontFamily: FONT, fontSize: '18px', color: COLORS.text })
      .setOrigin(0, 0.5)
      .setDepth(41);
    this.statusText = this.add
      .text(340, 26, '', { fontFamily: FONT, fontSize: '15px', color: COLORS.dim })
      .setOrigin(0, 0.5)
      .setDepth(41);
    this.modText = this.add
      .text(WORLD_WIDTH / 2, 72, '', { fontFamily: FONT, fontSize: '15px', color: COLORS.gold })
      .setOrigin(0.5)
      .setDepth(41);

    this.hudButton(WORLD_WIDTH - 350, 26, 150, 34, `Knight  ${UNITS.knight.gold}g`, () =>
      this.deploy('knight'),
    );
    this.hudButton(WORLD_WIDTH - 190, 26, 150, 34, `Sapper  ${UNITS.sapper.gold}g`, () =>
      this.deploy('sapper'),
    );
    this.hudButton(WORLD_WIDTH - 70, 78, 110, 28, 'Give up', () => this.finish(false));

    this.cardBar = new CardBar(this, this.cards, 16, WORLD_HEIGHT - 104, (slot, card) =>
      this.onCardPressed(slot, card),
    );

    this.add
      .text(16, 76, 'Drag anywhere to aim — release to fire.', {
        fontFamily: FONT,
        fontSize: '13px',
        color: COLORS.dim,
      })
      .setOrigin(0, 0.5)
      .setDepth(41);
  }

  private hudButton(
    cx: number,
    cy: number,
    w: number,
    h: number,
    text: string,
    onClick: () => void,
  ): void {
    const g = this.add.graphics().setDepth(41);
    panel(g, cx - w / 2, cy - h / 2, w, h, 0x1d2536, 0x5c6a8a, 0.95, 6);
    this.add
      .text(cx, cy, text, { fontFamily: FONT, fontSize: '14px', color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(42);
    this.add
      .rectangle(cx, cy, w, h, 0, 0)
      .setDepth(43)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        onClick();
      });
  }

  /** Transient status message; sticky ones stay until explicitly cleared. */
  private flash(msg: string, sticky = false): void {
    this.statusText.setText(msg);
    this.flashUntil = msg ? (sticky ? Infinity : this.time.now + 2200) : 0;
  }

  private refreshHud(): void {
    this.goldText.setText(`Gold ${Math.floor(this.gold)}`);
    const secs = Math.max(0, this.timeLeft / 1000);
    this.timerText
      .setText(`${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`)
      .setColor(secs < 30 ? COLORS.danger : COLORS.text);

    if (this.time.now >= this.flashUntil) {
      const throne = this.castle.find('throne');
      this.statusText.setText(throne ? `Throne ${Math.max(0, Math.ceil(throne.hp))} hp` : '');
    }
    this.cardBar.refresh();
  }

  private finish(attackerWon: boolean): void {
    if (this.finished) return;
    this.finished = true;
    store.lastResult = {
      attackerWon,
      msElapsed: this.elapsed,
      blocksLeft: this.castle.count(),
      blocksAtStart: this.blocksAtStart,
    };
    this.time.delayedCall(600, () => this.scene.start('Result'));
  }
}
