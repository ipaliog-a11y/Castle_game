import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from './config';

/**
 * Fits the fixed 1280×600 world onto a phone screen.
 *
 * Two problems, both invisible on desktop:
 *
 * 1. **The visible area is not what CSS thinks it is.** Mobile browsers report a
 *    layout viewport that ignores the collapsing address bar and the on-screen
 *    keyboard, so a canvas sized from `height: 100%` can be measured against a
 *    box that is not entirely on screen. The size here comes from
 *    `visualViewport` — the only value that describes what the player can
 *    actually see — and is re-applied whenever it changes.
 *
 * 2. **The world is 2.13:1; a phone held upright is about 1:2.2.** Letterboxing
 *    a landscape world into a portrait screen leaves a strip using barely a
 *    fifth of the display. Rather than ask the player to turn the device —
 *    which does nothing at all when they have rotation lock on, as most people
 *    do — the stage is rotated a quarter turn so portrait fills the screen with
 *    the same picture, sideways. Turn the phone clockwise and it reads upright;
 *    if rotation lock is off, the browser reports landscape, the quarter turn is
 *    dropped, and the result is identical.
 *
 * The game therefore runs with `Phaser.Scale.NONE`: the Scale Manager measures
 * its parent with `getBoundingClientRect`, which reports a rotated element's
 * *bounding box* — width and height swapped — so its own FIT mode cannot be
 * trusted once the stage is turned. Zoom is computed here instead.
 */

/** Enough of the Scale Manager to size the canvas; kept narrow deliberately. */
type ScaleManager = Phaser.Scale.ScaleManager;

export function installViewport(game: Phaser.Game): void {
  const stage = document.getElementById('stage');
  const wrapper = document.getElementById('game');
  if (!stage || !wrapper) return;

  let rotated = false;
  let frame = 0;

  const apply = (): void => {
    frame = 0;
    const vv = window.visualViewport;
    const visW = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
    const visH = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));

    rotated = visH > visW;

    // In element space the stage is always landscape-shaped; the quarter turn
    // is what makes it land on a portrait screen.
    const boxW = rotated ? visH : visW;
    const boxH = rotated ? visW : visH;

    stage.style.width = `${visW}px`;
    stage.style.height = `${visH}px`;
    wrapper.style.width = `${boxW}px`;
    wrapper.style.height = `${boxH}px`;
    wrapper.style.transform = rotated ? `translate(0, ${visH}px) rotate(-90deg)` : '';

    game.scale.setZoom(Math.min(boxW / WORLD_WIDTH, boxH / WORLD_HEIGHT));
  };

  /** Coalesce the burst of events a toolbar animation or rotation produces. */
  const schedule = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(apply);
  };

  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', () => {
    schedule();
    // iOS reports the pre-rotation size for a beat after the event fires.
    setTimeout(apply, 250);
  });
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);

  installRotatedInput(game, () => rotated);
  apply();
}

/**
 * Teaches the Input Manager about the quarter turn.
 *
 * `ScaleManager.transformX/transformY` map one axis each, which cannot express
 * a rotation, so the hook is one level up: `transformPointer` receives both
 * coordinates. It is handed the page position the pointer *would* have had with
 * the stage upright, leaving Phaser's own smoothing and history untouched.
 */
function installRotatedInput(game: Phaser.Game, isRotated: () => boolean): void {
  const input = game.input;
  const original = input.transformPointer.bind(input);

  input.transformPointer = function (
    pointer: Phaser.Input.Pointer,
    pageX: number,
    pageY: number,
    wasMove: boolean,
  ): void {
    if (!isRotated()) {
      original(pointer, pageX, pageY, wasMove);
      return;
    }

    const scale: ScaleManager = game.scale;
    const b = scale.canvasBounds;
    if (b.width === 0 || b.height === 0) {
      original(pointer, pageX, pageY, wasMove);
      return;
    }

    // `canvasBounds` is the axis-aligned box the turned canvas occupies on the
    // page, so the world's x runs up the screen and its y runs across it.
    const x = pageX - window.scrollX;
    const y = pageY - window.scrollY;
    const gameX = (b.bottom - y) * (WORLD_WIDTH / b.height);
    const gameY = (x - b.left) * (WORLD_HEIGHT / b.width);

    original(
      pointer,
      b.left + gameX / scale.displayScale.x,
      b.top + gameY / scale.displayScale.y,
      wasMove,
    );
  };
}
