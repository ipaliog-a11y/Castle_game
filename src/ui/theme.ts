import Phaser from 'phaser';

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

/** Draws the sky, hills and ground shared by both modes. */
export function drawBackdrop(
  scene: Phaser.Scene,
  width: number,
  height: number,
  groundY: number,
): void {
  const g = scene.add.graphics().setDepth(-100);
  g.fillGradientStyle(COLORS.skyTop, COLORS.skyTop, COLORS.skyBottom, COLORS.skyBottom, 1);
  g.fillRect(0, 0, width, groundY);

  g.fillStyle(COLORS.hills, 1);
  g.beginPath();
  g.moveTo(0, groundY);
  for (let x = 0; x <= width; x += 40) {
    const h = 46 + Math.sin(x * 0.004) * 30 + Math.sin(x * 0.011 + 1.7) * 16;
    g.lineTo(x, groundY - h);
  }
  g.lineTo(width, groundY);
  g.closePath();
  g.fillPath();

  g.fillStyle(COLORS.ground, 1);
  g.fillRect(0, groundY, width, height - groundY);
  g.fillStyle(COLORS.groundEdge, 1);
  g.fillRect(0, groundY, width, 4);
}
