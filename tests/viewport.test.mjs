/**
 * Mobile fit and rotated-input checks.
 *
 * The stage turns a quarter circle on portrait screens, which means pointer
 * coordinates have to be un-rotated before Phaser sees them. That mapping is
 * the fragile part — it hooks `InputManager.transformPointer` — so it is tested
 * by tapping real screen pixels and asserting the game reacted, not by
 * inspecting the maths.
 */
import { chromium, devices } from 'playwright';

const URL = process.env.GAME_URL ?? 'http://localhost:5173/';
const EXEC = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Canvas geometry plus how much of the visible viewport it covers. */
const readFit = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const r = canvas.getBoundingClientRect();
    const vv = window.visualViewport;
    const visW = vv ? vv.width : window.innerWidth;
    const visH = vv ? vv.height : window.innerHeight;
    return {
      visible: [Math.round(visW), Math.round(visH)],
      canvas: [Math.round(r.width), Math.round(r.height)],
      rect: {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      },
      rotated: getComputedStyle(document.getElementById('game')).transform !== 'none',
      coverage: +(((r.width * r.height) / (visW * visH)) * 100).toFixed(1),
    };
  });

/** Screen position of a world point, inverting whatever transform is in play. */
function screenPointOf(fit, worldX, worldY, worldW = 1280, worldH = 600) {
  const { rect } = fit;
  if (fit.rotated) {
    return {
      x: rect.left + (worldY * rect.width) / worldH,
      y: rect.bottom - (worldX * rect.height) / worldW,
    };
  }
  return {
    x: rect.left + (worldX * rect.width) / worldW,
    y: rect.top + (worldY * rect.height) / worldH,
  };
}

const activeScenes = (page) =>
  page.evaluate(() =>
    window.__game.scene.scenes.filter((s) => s.scene.isActive()).map((s) => s.scene.key),
  );

async function openContext(browser, width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: devices['iPhone 12'].userAgent,
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__game && document.querySelector('canvas'));
  await page.waitForTimeout(700);
  return { ctx, page };
}

const browser = await chromium.launch({ executablePath: EXEC });

// ------------------------------------------------------------------ portrait

console.log('portrait 390x844');
{
  const { ctx, page } = await openContext(browser, 390, 844);
  const fit = await readFit(page);

  check('stage is rotated in portrait', fit.rotated, JSON.stringify(fit));
  check('canvas fills the width', Math.abs(fit.canvas[0] - 390) <= 2, `got ${fit.canvas[0]}`);
  check('coverage above 90%', fit.coverage > 90, `${fit.coverage}%`);

  // Tap the centre of BUILD YOUR CASTLE, which lives at world (640, 276).
  const p = screenPointOf(fit, 640, 276);
  check(
    'tap point is on screen',
    p.x > 0 && p.x < 390 && p.y > 0 && p.y < 844,
    `${p.x.toFixed(0)},${p.y.toFixed(0)}`,
  );
  // Empty ground, well below the menu buttons: nothing should happen. Guards
  // against a mapping that lands on a button by luck rather than by maths.
  const miss = screenPointOf(fit, 640, 560);
  await page.touchscreen.tap(miss.x, miss.y);
  await page.waitForTimeout(300);
  check('a tap below the buttons changes nothing', (await activeScenes(page)).includes('Menu'));

  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(500);
  check(
    'rotated tap opens the builder',
    (await activeScenes(page)).includes('Build'),
    (await activeScenes(page)).join(','),
  );

  // Dragging is how the player aims the cannon, so the move path needs the same
  // un-rotation as the tap path. In the builder a drag lays a row of blocks.
  const from = screenPointOf(fit, 22 * 32 + 16, 15 * 32 + 64 + 16);
  const to = screenPointOf(fit, 26 * 32 + 16, 15 * 32 + 64 + 16);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  const placed = await page.evaluate(() => {
    const build = window.__game.scene.getScene('Build');
    return build.castle.all().length;
  });
  check('a rotated drag lays a run of blocks', placed >= 4, `placed ${placed}`);
  await ctx.close();
}

// ----------------------------------------------------------------- landscape

console.log('landscape 844x390');
{
  const { ctx, page } = await openContext(browser, 844, 390);
  const fit = await readFit(page);

  check('stage is not rotated in landscape', !fit.rotated, JSON.stringify(fit));
  check('coverage above 90%', fit.coverage > 90, `${fit.coverage}%`);

  // Empty ground, well below the menu buttons: nothing should happen. Guards
  // against a mapping that lands on a button by luck rather than by maths.
  const miss = screenPointOf(fit, 640, 560);
  await page.touchscreen.tap(miss.x, miss.y);
  await page.waitForTimeout(300);
  check('a tap below the buttons changes nothing', (await activeScenes(page)).includes('Menu'));

  const p = screenPointOf(fit, 640, 276);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(500);
  check('upright tap opens the builder', (await activeScenes(page)).includes('Build'));
  await ctx.close();
}

// ------------------------------------------------------- rotating the device

console.log('rotate while playing');
{
  const { ctx, page } = await openContext(browser, 390, 844);
  check('starts rotated', (await readFit(page)).rotated);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(600);
  const land = await readFit(page);
  check('quarter turn dropped once the device is landscape', !land.rotated);
  check('still fills the screen', land.coverage > 90, `${land.coverage}%`);

  const p = screenPointOf(land, 640, 276);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(500);
  check('input follows the rotation', (await activeScenes(page)).includes('Build'));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  check('turns back in portrait', (await readFit(page)).rotated);
  await ctx.close();
}

// ------------------------------------- toolbar appearing without a rotation

console.log('address bar appears');
{
  const { ctx, page } = await openContext(browser, 844, 390);
  await page.setViewportSize({ width: 844, height: 320 });
  await page.waitForTimeout(600);
  const fit = await readFit(page);
  check('canvas stays inside the shorter viewport', fit.canvas[1] <= 322, `${fit.canvas[1]}`);
  check('coverage still above 80%', fit.coverage > 80, `${fit.coverage}%`);
  await ctx.close();
}

// ------------------------------------------------- HUD legibility and layout

console.log('HUD floors');
{
  const { ctx, page } = await openContext(browser, 844, 390);
  // Both battle modes need a castle to load.
  await page.evaluate(() => {
    const blocks = [[35, 15, 'throne']];
    for (let r = 15; r >= 12; r--) for (let c = 30; c <= 34; c++) blocks.push([c, r, 'stone']);
    localStorage.setItem(
      'siege-and-stone:castle:v1',
      JSON.stringify({ v: 1, spent: 400, blocks }),
    );
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  for (const key of ['Build', 'Siege', 'Defend']) {
    await page.evaluate((k) => {
      const g = window.__game;
      for (const s of ['Menu', 'Build', 'Siege', 'Defend']) g.scene.stop(s);
      g.scene.start(k);
    }, key);
    await page.waitForTimeout(800);

    const hud = await page.evaluate((k) => {
      const scene = window.__game.scene.getScene(k);
      const sizes = scene.children.list
        .filter((o) => o.type === 'Text' && o.text)
        .map((o) => ({ text: o.text.slice(0, 24), size: parseFloat(o.style.fontSize) }));
      const bar = scene.cardBar;
      return {
        sizes,
        bottom: bar ? bar.slotY(bar.engine.handSize - 1) + 114 : null,
      };
    }, key);

    // Guard against a vacuous pass: if nothing was collected, the selector broke.
    check(`${key}: HUD text was actually found`, hud.sizes.length >= 5, `${hud.sizes.length} texts`);
    const tooSmall = hud.sizes.filter((s) => s.size < 18);
    check(
      `${key}: no HUD text below 18px (~12 CSS px on a phone)`,
      tooSmall.length === 0,
      JSON.stringify(tooSmall),
    );
    if (hud.bottom !== null) {
      // The gun pivots at 542 and its barrel is 42 long, so at full elevation
      // the muzzle reaches 500. Anything in the hand below that hides the aim.
      check(`${key}: card column stops above the gun`, hud.bottom <= 492, `bottom=${hud.bottom}`);
    }
  }
  await ctx.close();
}

// -------------------------------------------------------------------- tablet

console.log('tablet portrait 820x1180');
{
  const { ctx, page } = await openContext(browser, 820, 1180);
  const fit = await readFit(page);
  check('coverage beats the 33% letterbox it replaces', fit.coverage > 60, `${fit.coverage}%`);
  await ctx.close();
}

await browser.close();

console.log(failures === 0 ? '\nviewport: all checks passed' : `\nviewport: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
