import Phaser from 'phaser';
import { audio } from '../core/audio';
import { drawGlyph } from './icons';
import { FONT_SIZE, TOUCH_MIN } from './layout';
import { SkyView } from './sky';

export const COLORS = {
  skyTop: 0x1b2338,
  skyBottom: 0x4a4360,
  hills: 0x2a2f45,
  ground: 0x3d3427,
  groundEdge: 0x574a37,
  panel: 0x151a26,
  panelEdge: 0x39435c,
  text: '#e7ecf5',
  dim: '#8e9ab2',
  gold: '#e8c15a',
  danger: '#e5654f',
  good: '#6fce93',
};

export const FONT = '"Trebuchet MS", "Segoe UI", sans-serif';

export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 16,
  color: string = COLORS.text,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color })
    .setOrigin(0, 0.5);
}

/** Rounded panel used for HUD chrome and cards. */
export function panel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  edge: number,
  alpha = 0.92,
  radius = 8,
): void {
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(2, edge, 1);
  g.strokeRoundedRect(x, y, w, h, radius);
}

/** Tappable HUD button. Swallows the tap so it never reaches the world. */
export function hudButton(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  w: number,
  h: number,
  text: string,
  onClick: () => void,
): void {
  const g = scene.add.graphics().setDepth(41);
  panel(g, cx - w / 2, cy - h / 2, w, h, 0x1d2536, 0x5c6a8a, 0.95, 6);
  scene.add
    .text(cx, cy, text, {
      fontFamily: FONT,
      fontSize: `${FONT_SIZE.small}px`,
      color: COLORS.text,
    })
    .setOrigin(0.5)
    .setDepth(42);
  scene.add
    .rectangle(cx, cy, w, h, 0, 0)
    .setDepth(43)
    .setInteractive({ useHandCursor: true })
    .on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        onClick();
      },
    );
}

/**
 * A HUD button that leads with a drawn symbol, for the things you buy or build.
 * Same behaviour as `hudButton`, including swallowing the tap.
 */
export function iconButton(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  w: number,
  h: number,
  glyph: string,
  accent: number,
  text: string,
  onClick: () => void,
): void {
  const left = cx - w / 2;
  const size = h - 14;
  const g = scene.add.graphics().setDepth(41);
  panel(g, left, cy - h / 2, w, h, 0x1d2536, 0x5c6a8a, 0.95, 6);
  drawGlyph(g, glyph, left + 10 + size / 2, cy, size, accent);

  scene.add
    .text(left + size + 22, cy, text, {
      fontFamily: FONT,
      fontSize: `${FONT_SIZE.small}px`,
      color: COLORS.text,
    })
    .setOrigin(0, 0.5)
    .setDepth(42);
  scene.add
    .rectangle(cx, cy, w, h, 0, 0)
    .setDepth(43)
    .setInteractive({ useHandCursor: true })
    .on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        onClick();
      },
    );
}

/**
 * A square, symbol-only HUD button.
 *
 * For the controls that need no caption — pause, options — and that have to fit
 * a top bar already carrying gold, a clock and two troop buttons. A cog and two
 * bars are understood without words, which is the only reason there is room for
 * them at all.
 */
export function glyphButton(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  glyph: string,
  onClick: () => void,
  size = 56,
): void {
  const g = scene.add.graphics().setDepth(41);
  panel(g, cx - size / 2, cy - size / 2, size, size, 0x1d2536, 0x5c6a8a, 0.95, 6);
  drawGlyph(g, glyph, cx, cy, size - 22, 0xdfe6f2);
  scene.add
    .rectangle(cx, cy, size, size, 0, 0)
    .setDepth(43)
    .setInteractive({ useHandCursor: true })
    .on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        onClick();
      },
    );
}

/**
 * The mute toggle.
 *
 * It lives on the calm screens — menu, builder, result — and deliberately not
 * in a battle HUD. The top bar is the scarcest space in a 600-pixel-tall world
 * and it is already over its touch-target budget; meanwhile the reason to
 * silence a game mid-battle is almost always "someone else is in the room",
 * which the phone's own volume switch answers faster than any button here.
 *
 * The symbol is the whole control. A crossed-out speaker needs no caption, and
 * a child who cannot read the word "sound" can still find it.
 */
export function soundButton(scene: Phaser.Scene, cx: number, cy: number): void {
  const size = TOUCH_MIN;
  const g = scene.add.graphics().setDepth(41);

  const paint = () => {
    g.clear();
    const off = audio.muted;
    panel(g, cx - size / 2, cy - size / 2, size, size, 0x1d2536, off ? 0x4a5570 : 0x5c6a8a, 0.95, 8);
    drawGlyph(g, off ? 'soundOff' : 'soundOn', cx, cy, size - 20, off ? 0x6d788f : 0xdfe6f2);
  };
  paint();

  scene.add
    .rectangle(cx, cy, size, size, 0, 0)
    .setDepth(43)
    .setInteractive({ useHandCursor: true })
    .on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        // Unmuting should be audible — a toggle you cannot hear the result of
        // leaves you tapping it twice to find out which way round it is.
        const muted = audio.toggleMuted();
        if (!muted) audio.play('place');
        paint();
      },
    );
}

/**
 * Dusk, matching the dark sky these screens were designed against.
 *
 * Not an aesthetic preference: the menu, builder and result screen all put dim
 * grey body text straight onto the backdrop, and against a daylight sky it is
 * close to unreadable. Unifying the sky renderer brightened these screens by
 * accident; this puts them back.
 */
const MENU_PROGRESS = 0.56;

/**
 * Backdrop for the scenes that are not a battle. Same renderer as the battle
 * sky, frozen at one time of day, so there is only one place that knows how the
 * hills and ground are drawn.
 */
export function drawBackdrop(
  scene: Phaser.Scene,
  width: number,
  height: number,
  groundY: number,
): void {
  new SkyView(scene, width, height, groundY).draw(MENU_PROGRESS);
}
