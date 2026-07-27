import { chromium } from 'playwright';

const SHOT = new URL('./screenshots/', import.meta.url).pathname;
const BASE = process.env.GAME_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok  ', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

// Two pillars carrying a roof at row 11, a separate wall, and the throne.
// Ground under the arch is clear so units can walk beneath it.
const blocks = [];
for (let r = 15; r >= 12; r--) { blocks.push([25, r, 'stone']); blocks.push([30, r, 'stone']); }
for (let c = 25; c <= 30; c++) blocks.push([c, 11, 'stone']);
for (let r = 15; r >= 13; r--) blocks.push([33, r, 'stone']);
blocks.push([35, 15, 'throne']);

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate((b) => {
  localStorage.setItem('siege-and-stone:castle:v1', JSON.stringify({ v: 1, spent: 400, blocks: b }));
}, blocks);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

/** Restart the siege from the saved castle so each section starts clean. */
const restart = async () => {
  await page.evaluate(() => {
    const g = window.__game;
    g.scene.stop('Menu'); g.scene.stop('Result'); g.scene.stop('Siege');
    g.scene.start('Siege');
  });
  await page.waitForTimeout(900);
};
const probe = (fn) => page.evaluate(fn);

/**
 * Polls `read` until `done` is satisfied, or the wall-clock budget runs out.
 *
 * Battle time advances from frame deltas, and headless rendering delivers a
 * small and load-dependent fraction of real-time frames, so anything phrased as
 * "wait N seconds then assert" is really asserting on the machine. Polling the
 * simulation keeps the test about the game.
 */
async function waitFor(read, done, budgetMs = 20000) {
  const deadline = Date.now() + budgetMs;
  let last = await page.evaluate(read);
  while (Date.now() < deadline) {
    if (done(last)) return last;
    await page.waitForTimeout(200);
    last = await page.evaluate(read);
  }
  return last;
}

console.log('siege simulation');

await restart();
const setup = await probe(() => {
  const s = window.__game.scene.getScene('Siege');
  return { blocks: s.castle.count(), throne: !!s.castle.find('throne'), debris: s.debris.length };
});
check('siege boots with the saved castle intact', setup.blocks === 18, JSON.stringify(setup));
check('throne present at siege start', setup.throne);
check('nothing is falling at siege start', setup.debris === 0);

// --- Regression: units must not be snapped onto a roof above them ----------
await restart();
await probe(() => {
  const s = window.__game.scene.getScene('Siege');
  s.gold = 1000;
  s.deploy('knight');
  s.units[0].x = 27 * 32 + 16; // directly beneath the arch
});
await page.waitForTimeout(700);
const arch = await probe(() => {
  const u = window.__game.scene.getScene('Siege').units[0];
  return { feetY: u.feetY, x: u.x };
});
check('knight under an arch stays on the ground', arch.feetY > 500,
  `feetY=${arch.feetY}; roof top is 416, ground is 576`);
await page.screenshot({ path: `${SHOT}t1-under-arch.png` });

// --- Units march the field and reach the wall -----------------------------
await restart();
const marchStart = await probe(() => {
  const s = window.__game.scene.getScene('Siege');
  s.gold = 1000;
  s.deploy('knight');
  return s.units[0].x;
});
// Wait on the game reaching the wall, not on a wall-clock duration. Headless
// game time runs at a fraction of real time and that fraction moves with how
// loaded the machine is, so a fixed sleep here tests the CI box rather than the
// knight — it failed on an unchanged tree at 22% and passed at 32%.
const marchEnd = await waitFor(
  () => {
    const s = window.__game.scene.getScene('Siege');
    return { x: s.units[0]?.x ?? -1, alive: s.units.length, t: s.elapsed };
  },
  (r) => r.alive === 1 && r.x > 25 * 32 - 60,
  40000,
);
check('a knight marches across the open field to the wall',
  marchEnd.alive === 1 && marchEnd.x > 25 * 32 - 60,
  `${marchStart} -> ${JSON.stringify(marchEnd)}; wall face is at x=800`);
await page.screenshot({ path: `${SHOT}t2-advance.png` });

// --- A sapper undermining a wall brings the load above it down -------------
await restart();
const dig = await probe(() => {
  const s = window.__game.scene.getScene('Siege');
  s.gold = 1000;
  s.deploy('sapper');
  s.units[0].x = 25 * 32 - 40;
  return { blocks: s.castle.count() };
});
await page.waitForTimeout(7000);
const dug = await probe(() => {
  const s = window.__game.scene.getScene('Siege');
  return { blocks: s.castle.count(), units: s.units.length };
});
check('sapper breaks the wall block it reaches', dug.blocks < dig.blocks,
  `${dig.blocks} -> ${dug.blocks}`);
await page.screenshot({ path: `${SHOT}t3-sapper.png` });

// --- Knocking out a pillar collapses the arch it carries -------------------
await restart();
const collapse = await probe(() => {
  const s = window.__game.scene.getScene('Siege');
  const before = s.castle.count();
  for (let r = 15; r >= 12; r--) s.castle.remove(25, r); // remove the left pillar
  s.collapse();
  return { before, after: s.castle.count(), debris: s.debris.length };
});
check('losing a pillar puts the arch above into free fall', collapse.debris > 0,
  JSON.stringify(collapse));
await page.waitForTimeout(2000);
const settled = await probe(() => {
  const s = window.__game.scene.getScene('Siege');
  return { debris: s.debris.length, blocks: s.castle.count() };
});
check('debris settles instead of falling forever', settled.debris === 0, JSON.stringify(settled));
check('some fallen blocks survive as rubble', settled.blocks > 0, JSON.stringify(settled));
await page.screenshot({ path: `${SHOT}t4-collapse.png` });

// --- Cannon fire actually damages the castle -------------------------------
await restart();
const shotBefore = await probe(() => window.__game.scene.getScene('Siege').castle.count());
await probe(() => {
  const s = window.__game.scene.getScene('Siege');
  for (let i = 0; i < 6; i++) s.explode(25 * 32 + 16, 64 + 13 * 32, 90, 1.4);
});
await page.waitForTimeout(1800);
const shotAfter = await probe(() => window.__game.scene.getScene('Siege').castle.count());
check('sustained blast damage razes blocks', shotAfter < shotBefore, `${shotBefore} -> ${shotAfter}`);

// --- Firing costs gold and respects the cooldown ---------------------------
await restart();
const econ = await probe(() => {
  const s = window.__game.scene.getScene('Siege');
  s.aimX = 600; s.aimY = 300;
  const start = s.gold;
  s.fire();
  const spent = start - s.gold;
  const balls = s.balls.length;
  s.fire(); // still on cooldown, must be a no-op
  return { spent, balls, afterSecondFire: s.balls.length };
});
// Asserts that firing charges *something*, not what the price is. Pinning the
// number here means every balance pass breaks a test that is not about balance.
check('a shot costs gold', econ.spent > 0, JSON.stringify(econ));
check('a shot spawns one ball', econ.balls === 1, JSON.stringify(econ));
check('cooldown blocks an immediate second shot', econ.afterSecondFire === 1, JSON.stringify(econ));

// --- Cards: chain shot triples the projectiles -----------------------------
await restart();
const chain = await probe(() => {
  const s = window.__game.scene.getScene('Siege');
  s.aimX = 600; s.aimY = 300;
  s.shotMod = 'chain';
  s.cooldown = 0;
  s.fire();
  return { balls: s.balls.length, mod: s.shotMod };
});
check('chain shot fires three balls', chain.balls === 3, JSON.stringify(chain));
check('shot modifier is consumed after firing', chain.mod === null, JSON.stringify(chain));

// --- Card engine: playing a card spends energy and redeals -----------------
await restart();
const cardPlay = await probe(() => {
  const s = window.__game.scene.getScene('Siege');
  s.cards.energy = 10;
  const slot = s.cards.hand.findIndex((c) => c && c.kind !== 'targeted');
  const before = s.cards.hand[slot].name;
  const cost = s.cards.hand[slot].cost;
  s.onCardPressed(slot, s.cards.hand[slot]);
  return { spent: 10 - s.cards.energy, cost, refilled: !!s.cards.hand[slot], before };
});
check('playing a card spends its energy cost', cardPlay.spent === cardPlay.cost, JSON.stringify(cardPlay));
check('the emptied slot is refilled from the deck', cardPlay.refilled, JSON.stringify(cardPlay));

// --- Destroying the throne ends the siege ----------------------------------
await restart();
await probe(() => {
  const s = window.__game.scene.getScene('Siege');
  const t = s.castle.find('throne');
  s.explode(t.col * 32 + 16, 64 + t.row * 32 + 16, 900, 1.5);
});
await page.waitForTimeout(1500);
const ended = await probe(() => ({
  active: window.__game.scene.getScenes(true).map((s) => s.scene.key),
}));
check('destroying the throne hands off to the result screen',
  ended.active.includes('Result'), JSON.stringify(ended));
await page.screenshot({ path: `${SHOT}t5-result.png` });

// --- Timeout is a defender win ---------------------------------------------
await restart();
await probe(() => { window.__game.scene.getScene('Siege').timeLeft = 10; });
await page.waitForTimeout(1400);
const timeout = await probe(() => ({
  active: window.__game.scene.getScenes(true).map((s) => s.scene.key),
}));
check('running out of time also ends the siege', timeout.active.includes('Result'), JSON.stringify(timeout));


// --- Sandbox: no clock, no economy, and a counter that tells the truth ------
//
// The "smashed" tally is the only number the sandbox shows, and it is the one a
// young player watches. It must equal the blocks that actually left the castle:
// rubble which survives a fall is re-placed as a real block, so a naive count
// of what is missing reads near zero while a wall is pounded into a heap. The
// wall cases matter more than the single-block ones — a collapse kills blocks
// through paths a lone shot never touches, and one of those went uncounted
// until this test was written.
await page.evaluate(() => {
  const wall = [[35, 15, 'throne']];
  for (let r = 15; r >= 11; r--) for (let c = 29; c <= 34; c++) wall.push([c, r, 'stone']);
  localStorage.setItem('siege-and-stone:castle:v1', JSON.stringify({ v: 1, spent: 0, blocks: wall }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await probe(() => {
  const g = window.__game;
  for (const k of ['Menu', 'Build', 'Siege', 'Defend', 'Result']) g.scene.stop(k);
  g.scene.start('Sandbox');
});
await page.waitForTimeout(400);

const sand = await probe(() => {
  const s = window.__game.scene.getScene('Sandbox');
  const start = s.castle.count();
  const hadGold = s.gold !== undefined;
  for (let i = 0; i < 1800; i++) {
    const all = s.castle.all();
    if (all.length) {
      let best = null;
      for (const b of all) if (!best || b.row > best.row || (b.row === best.row && b.col < best.col)) best = b;
      s.aimX = best.col * 32 + 16;
      s.aimY = 64 + best.row * 32 + 16;
      if (s.cooldown <= 0) s.fire();
    }
    s.step();
  }
  return {
    start,
    left: s.castle.count(),
    smashed: s.blocksBroken,
    finished: s.finished,
    hadGold,
    debris: s.debris.length,
    afterRebuild: (s.rebuild(), s.castle.count()),
    brokenAfterRebuild: s.blocksBroken,
    skyLoops: [0, 75000, 150001].map((ms) => {
      const keep = s.elapsed;
      s.elapsed = ms;
      const v = +s.progress().toFixed(3);
      s.elapsed = keep;
      return v;
    }),
  };
});

check('sandbox razes the castle given enough free shots', sand.left === 0,
  JSON.stringify(sand));
check('sandbox never ends, even with the throne gone', sand.finished === false);
check('sandbox has no economy at all', sand.hadGold === false);
check('every block that left the castle was counted as smashed',
  sand.start - sand.left === sand.smashed && sand.debris === 0,
  `start ${sand.start}, left ${sand.left}, smashed ${sand.smashed}, debris ${sand.debris}`);
check('rebuild restores the castle and resets the tally',
  sand.afterRebuild === sand.start && sand.brokenAfterRebuild === 0,
  JSON.stringify({ afterRebuild: sand.afterRebuild, broken: sand.brokenAfterRebuild }));
check('the sandbox sky loops instead of ending at midnight',
  sand.skyLoops[0] === 0 && sand.skyLoops[1] === 0.5 && sand.skyLoops[2] === 0,
  JSON.stringify(sand.skyLoops));
await page.screenshot({ path: `${SHOT}t6-sandbox.png` });

console.log('\nerrors:', errors.length ? errors : 'none');
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
