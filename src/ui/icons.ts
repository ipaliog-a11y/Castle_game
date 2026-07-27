import type Phaser from 'phaser';

/**
 * A drawn symbol for every card, material and troop type, so a player who cannot
 * read the name can still tell them apart and remember what each one did.
 *
 * These are vector, not images: no asset files to license or ship, they stay
 * sharp at any zoom, and they match how the rest of the game is drawn. Each is
 * authored in a nominal 100×100 box centred on the origin and scaled to fit.
 *
 * The bar for these is not "pretty". It is whether a six-year-old, having seen
 * a card work once, picks the same card again on sight — so each is one bold
 * silhouette rather than a detailed picture.
 */

type Ctx = {
  g: Phaser.GameObjects.Graphics;
  /** Maps a nominal −50..50 coordinate onto the screen. */
  px: (n: number) => number;
  py: (n: number) => number;
  /** Scales a nominal length. */
  s: (n: number) => number;
  accent: number;
  alpha: number;
};

export function drawGlyph(
  g: Phaser.GameObjects.Graphics,
  id: string,
  cx: number,
  cy: number,
  size: number,
  accent: number,
  alpha = 1,
): void {
  const k = size / 100;
  const ctx: Ctx = {
    g,
    px: (n) => cx + n * k,
    py: (n) => cy + n * k,
    s: (n) => n * k,
    accent,
    alpha,
  };
  (GLYPHS[id] ?? unknown)(ctx);
}

const IRON = 0xb9c4d6;
/**
 * Cards are filled 0x1a2130, so a symbol drawn in anything near that colour
 * disappears. Shapes that want to read as "dark" use SHADOW, which is light
 * enough to show against the card and dark enough to still read as iron or a
 * cooking pot.
 */
const SHADOW = 0x49536a;
const DARK = 0x1b2130;
const WOOD = 0x8a5a30;
const FLAME = 0xffcb6b;

const GLYPHS: Record<string, (c: Ctx) => void> = {
  /** Three shot linked by chain. */
  chainShot({ g, px, py, s, alpha }) {
    g.lineStyle(s(7), 0x7d879b, alpha);
    g.beginPath();
    g.moveTo(px(-32), py(6));
    g.lineTo(px(0), py(-10));
    g.lineTo(px(32), py(6));
    g.strokePath();
    for (const [x, y] of [
      [-32, 6],
      [0, -10],
      [32, 6],
    ]) {
      g.fillStyle(SHADOW, alpha);
      g.fillCircle(px(x), py(y), s(15));
      g.fillStyle(IRON, alpha * 0.9);
      g.fillCircle(px(x - 4), py(y - 5), s(5));
    }
  },

  /** A powder keg with a lit fuse. */
  blackPowder({ g, px, py, s, alpha }) {
    g.fillStyle(0x2c2118, alpha);
    g.fillRoundedRect(px(-27), py(-14), s(54), s(52), s(10));
    g.fillStyle(WOOD, alpha);
    g.fillRect(px(-27), py(-2), s(54), s(7));
    g.fillRect(px(-27), py(22), s(54), s(7));
    // Fuse, curling up and to the right, with a spark on the end.
    g.lineStyle(s(5), 0x6f5a44, alpha);
    g.beginPath();
    g.moveTo(px(4), py(-14));
    g.lineTo(px(14), py(-30));
    g.lineTo(px(28), py(-36));
    g.strokePath();
    g.fillStyle(FLAME, alpha);
    g.fillCircle(px(30), py(-38), s(10));
    g.fillStyle(0xfff3c4, alpha);
    g.fillCircle(px(30), py(-38), s(5));
  },

  /** A wall with a hole blown clean through it. */
  sapperCharge({ g, px, py, s, accent, alpha }) {
    g.fillStyle(0x8d949e, alpha);
    g.fillRect(px(-40), py(-30), s(80), s(60));
    g.lineStyle(s(3), 0x5b626d, alpha);
    for (let i = 1; i < 3; i++) {
      g.beginPath();
      g.moveTo(px(-40), py(-30 + i * 20));
      g.lineTo(px(40), py(-30 + i * 20));
      g.strokePath();
    }
    // The breach, plus chips flying out of it.
    g.fillStyle(DARK, alpha);
    g.fillCircle(px(0), py(0), s(22));
    g.fillStyle(accent, alpha);
    for (const [x, y, r] of [
      [-32, -22, 5],
      [30, -18, 6],
      [24, 26, 5],
      [-28, 24, 4],
    ]) {
      g.fillCircle(px(x), py(y), s(r));
    }
  },

  /** A raised banner. */
  rally({ g, px, py, s, accent, alpha }) {
    g.fillStyle(0x6f5a44, alpha);
    g.fillRect(px(-24), py(-42), s(8), s(84));
    g.fillStyle(accent, alpha);
    g.beginPath();
    g.moveTo(px(-16), py(-38));
    g.lineTo(px(38), py(-22));
    g.lineTo(px(-16), py(-6));
    g.closePath();
    g.fillPath();
    g.fillStyle(0xfff3c4, alpha * 0.9);
    g.fillCircle(px(-2), py(-22), s(6));
  },

  /** Fresh brickwork: a wall with a bold plus over it. */
  repair({ g, px, py, s, accent, alpha }) {
    g.fillStyle(0x8d949e, alpha);
    g.fillRect(px(-40), py(-18), s(80), s(50));
    g.lineStyle(s(3), 0x5b626d, alpha);
    for (let i = 1; i < 3; i++) {
      g.beginPath();
      g.moveTo(px(-40), py(-18 + i * 17));
      g.lineTo(px(40), py(-18 + i * 17));
      g.strokePath();
    }
    g.fillStyle(accent, alpha);
    g.fillRoundedRect(px(-10), py(-46), s(20), s(52), s(4));
    g.fillRoundedRect(px(-36), py(-30), s(72), s(20), s(4));
  },

  /** A cauldron tipping, with the oil already falling. */
  boilingOil({ g, px, py, s, accent, alpha }) {
    g.fillStyle(SHADOW, alpha);
    g.fillRoundedRect(px(-34), py(-32), s(68), s(36), s(8));
    g.fillStyle(accent, alpha);
    g.fillRect(px(-32), py(-34), s(64), s(9));
    // Legs, so it reads as a cauldron rather than a box.
    g.fillStyle(SHADOW, alpha);
    g.fillRect(px(-22), py(2), s(7), s(10));
    g.fillRect(px(15), py(2), s(7), s(10));
    for (const [x, y, r] of [
      [-18, 16, 7],
      [2, 28, 8],
      [22, 14, 6],
    ]) {
      g.fillStyle(accent, alpha);
      g.fillCircle(px(x), py(y), s(r));
    }
    g.fillStyle(0xfff3c4, alpha * 0.85);
    g.fillCircle(px(2), py(26), s(3));
  },

  // ------------------------------------------------------ build materials

  /** Stacked planks. */
  wood({ g, px, py, s, accent, alpha }) {
    for (const y of [-34, -8, 18]) {
      g.fillStyle(accent, alpha);
      g.fillRoundedRect(px(-42), py(y), s(84), s(22), s(3));
      g.lineStyle(s(2), 0x5d3a20, alpha * 0.8);
      g.beginPath();
      g.moveTo(px(-34), py(y + 11));
      g.lineTo(px(34), py(y + 11));
      g.strokePath();
    }
  },

  /** Bricks in a staggered bond — the give-away that it is masonry. */
  stone({ g, px, py, s, accent, alpha }) {
    const brick = (x: number, y: number, w: number) => {
      g.fillStyle(accent, alpha);
      g.fillRect(px(x), py(y), s(w), s(22));
      g.lineStyle(s(2), 0x5c626b, alpha * 0.8);
      g.strokeRect(px(x), py(y), s(w), s(22));
    };
    brick(-42, -34, 40);
    brick(2, -34, 40);
    brick(-42, -8, 18);
    brick(-20, -8, 40);
    brick(24, -8, 18);
    brick(-42, 18, 40);
    brick(2, 18, 40);
  },

  /** A riveted plate. */
  iron({ g, px, py, s, accent, alpha }) {
    g.fillStyle(accent, alpha);
    g.fillRoundedRect(px(-42), py(-32), s(84), s(64), s(6));
    g.fillStyle(0xe7ecf5, alpha * 0.25);
    g.fillRect(px(-42), py(-32), s(84), s(9));
    g.fillStyle(0xdfe6f2, alpha * 0.9);
    for (const [x, y] of [
      [-30, -20],
      [30, -20],
      [-30, 20],
      [30, 20],
    ]) {
      g.fillCircle(px(x), py(y), s(6));
    }
  },

  /** A block being struck out. */
  erase({ g, px, py, s, accent, alpha }) {
    g.fillStyle(0x5b626d, alpha * 0.7);
    g.fillRect(px(-34), py(-34), s(68), s(68));
    g.lineStyle(s(12), accent, alpha);
    g.beginPath();
    g.moveTo(px(-30), py(-30));
    g.lineTo(px(30), py(30));
    g.moveTo(px(30), py(-30));
    g.lineTo(px(-30), py(30));
    g.strokePath();
  },

  // ---------------------------------------------------------------- troops

  /**
   * A great helm. Not a shield — Reinforce already owns that silhouette — and
   * squarer than a first attempt that came out a featureless lozenge.
   */
  knight({ g, px, py, s, accent, alpha }) {
    // Plume first, so the helm overlaps its base.
    g.fillStyle(0xd6483a, alpha);
    g.fillRoundedRect(px(-8), py(-52), s(16), s(24), s(7));

    g.fillStyle(accent, alpha);
    g.fillRoundedRect(px(-28), py(-36), s(56), s(38), s(14));
    g.fillRect(px(-28), py(-14), s(56), s(44));
    g.fillStyle(accent, alpha);
    g.fillRoundedRect(px(-28), py(18), s(56), s(16), s(6));

    // Visor slit and nose bar: the two marks that say "helm" and not "bucket".
    g.fillStyle(DARK, alpha);
    g.fillRect(px(-23), py(-12), s(46), s(11));
    g.fillRect(px(-16), py(10), s(9), s(9));
    g.fillRect(px(7), py(10), s(9), s(9));
    g.fillStyle(0x5a6473, alpha);
    g.fillRect(px(-4), py(-36), s(8), s(30));
  },

  /**
   * A pickaxe: the tool, because the job is what distinguishes a sapper. The
   * head is a curve rather than two straight segments, which read as an arrow.
   */
  sapper({ g, px, py, s, accent, alpha }) {
    g.fillStyle(WOOD, alpha);
    g.fillRoundedRect(px(-6), py(-22), s(12), s(64), s(4));

    g.lineStyle(s(12), accent, alpha);
    g.beginPath();
    for (let i = 0; i <= 12; i++) {
      const t = -1 + (i / 12) * 2;
      const x = t * 40;
      const y = -32 + t * t * 24;
      if (i === 0) g.moveTo(px(x), py(y));
      else g.lineTo(px(x), py(y));
    }
    g.strokePath();
    g.fillStyle(0xdfe6f2, alpha * 0.7);
    g.fillCircle(px(0), py(-32), s(5));
  },

  // ----------------------------------------------------------------- cards

  /** A shield. */
  reinforce({ g, px, py, s, accent, alpha }) {
    g.fillStyle(accent, alpha);
    g.beginPath();
    g.moveTo(px(-34), py(-38));
    g.lineTo(px(34), py(-38));
    g.lineTo(px(34), py(4));
    g.lineTo(px(0), py(42));
    g.lineTo(px(-34), py(4));
    g.closePath();
    g.fillPath();
    g.fillStyle(0xe7ecf5, alpha * 0.85);
    g.fillRect(px(-6), py(-28), s(12), s(50));
    g.fillRect(px(-24), py(-14), s(48), s(12));
  },
};

/**
 * Whether an id has a drawn symbol. Tested against the deck, the buildable
 * materials and the troop roster, so anything new fails a test rather than
 * quietly falling back to a disc.
 */
export function hasGlyph(id: string): boolean {
  return id in GLYPHS;
}

/** Anything without art gets a plain disc rather than nothing at all. */
function unknown({ g, px, py, s, accent, alpha }: Ctx): void {
  g.fillStyle(accent, alpha);
  g.fillCircle(px(0), py(0), s(30));
}
