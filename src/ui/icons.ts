import type Phaser from 'phaser';

/**
 * A drawn symbol for every card, so a player who cannot read the name can still
 * tell the cards apart and remember what each one did.
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

export function drawCardIcon(
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
  (ICONS[id] ?? unknown)(ctx);
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

const ICONS: Record<string, (c: Ctx) => void> = {
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

/** Card ids that have a drawn symbol. Tested against the deck, so a new card
 *  without art fails a test rather than quietly falling back to a disc. */
export function hasCardIcon(id: string): boolean {
  return id in ICONS;
}

/** Anything without art gets a plain disc rather than nothing at all. */
function unknown({ g, px, py, s, accent, alpha }: Ctx): void {
  g.fillStyle(accent, alpha);
  g.fillCircle(px(0), py(0), s(30));
}
