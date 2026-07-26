import Phaser from 'phaser';
import { FONT_SIZE } from './layout';
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

/** Late-afternoon light: warm, but with the sun still well clear of the hills. */
const MENU_PROGRESS = 0.36;

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
