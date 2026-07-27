/**
 * Same seed, same battle.
 *
 * This is what 6.1 exists to buy: without it, a balance change cannot be told
 * from noise. It runs defence mode, where the human contributes nothing, so any
 * difference between two runs of one seed is the simulation's fault.
 *
 * Two runs of the *same* seed must match exactly. Two runs of *different* seeds
 * must not — otherwise a seed that was quietly ignored would pass the first
 * check perfectly.
 */
import { chromium } from 'playwright';

const BASE = process.env.GAME_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log('  ok  ', name);
  } else {
    fail++;
    console.log('  FAIL', name, extra);
  }
};

// A castle with enough going on to diverge if anything is loose: a keep, a
// curtain wall and an arch for troops to walk under.
const blocks = [[35, 15, 'throne']];
for (let r = 15; r >= 11; r--)
  for (let c = 32; c <= 37; c++) if (!(c === 35 && r === 15)) blocks.push([c, r, 'stone']);
for (let r = 15; r >= 12; r--) blocks.push([24, r, 'stone']);
for (let r = 15; r >= 12; r--) blocks.push([28, r, 'stone']);
for (let c = 24; c <= 28; c++) blocks.push([c, 11, 'wood']);

/** Runs a defence battle at `seed` for `steps` simulation steps, hands-off. */
async function runBattle(seed, steps) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?seed=${seed}`, { waitUntil: 'networkidle' });
  await page.evaluate((b) => {
    localStorage.setItem(
      'siege-and-stone:castle:v1',
      JSON.stringify({ v: 1, spent: 700, blocks: b }),
    );
  }, blocks);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const state = await page.evaluate((n) => {
    const game = window.__game;
    game.scene.stop('Menu');
    game.scene.start('Defend');
    const scene = game.scene.getScene('Defend');

    // Drive the simulation directly rather than waiting on frames: the point is
    // to compare the sim, and a frame-paced run would take 90 real seconds.
    return new Promise((resolve) => {
      setTimeout(() => {
        for (let i = 0; i < n && !scene.finished; i++) scene.step();
        const blocks = scene.castle
          .all()
          .map((b) => `${b.col},${b.row},${b.mat},${b.hp.toFixed(4)}`)
          .sort();
        resolve({
          seed: scene.rng.seed,
          elapsed: Math.round(scene.elapsed),
          blocks,
          totalHp: +scene.castle.all().reduce((sum, b) => sum + b.hp, 0).toFixed(4),
          units: scene.units.map((u) => `${u.def.id},${u.x.toFixed(4)},${u.hp.toFixed(4)}`),
          balls: scene.balls.map((b) => `${b.x.toFixed(4)},${b.y.toFixed(4)}`),
          shotsFired: scene.shotsFired,
          wavesSent: scene.wavesSent,
        });
      }, 400);
    });
  }, steps);

  await page.close();
  return { state, errors };
}

const STEPS = 2400; // 40 seconds of battle at 1/60s per step

console.log('determinism');

const a = await runBattle(4821, STEPS);
const b = await runBattle(4821, STEPS);
const c = await runBattle(9137, STEPS);

check('no errors during the runs', a.errors.length + b.errors.length + c.errors.length === 0,
  [...a.errors, ...b.errors, ...c.errors].join('; '));
check('the URL seed is the seed the battle used', a.state.seed === 4821, `got ${a.state.seed}`);
check('the battle actually ran', a.state.elapsed > 30000 && a.state.shotsFired > 3,
  JSON.stringify({ elapsed: a.state.elapsed, shots: a.state.shotsFired }));
check('the AI did enough to diverge if anything were loose',
  a.state.wavesSent > 2 && a.state.blocks.length < 34,
  JSON.stringify({ waves: a.state.wavesSent, blocksLeft: a.state.blocks.length }));

const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
check('same seed: castle identical block for block, hitpoint for hitpoint',
  same(a.state.blocks, b.state.blocks),
  `${a.state.blocks.length} vs ${b.state.blocks.length} blocks, hp ${a.state.totalHp} vs ${b.state.totalHp}`);
check('same seed: troops in identical positions', same(a.state.units, b.state.units),
  `${JSON.stringify(a.state.units)} vs ${JSON.stringify(b.state.units)}`);
check('same seed: shells mid-flight identical', same(a.state.balls, b.state.balls));
check('same seed: the AI fired and sent the same number of everything',
  a.state.shotsFired === b.state.shotsFired && a.state.wavesSent === b.state.wavesSent);

check('a different seed produces a different battle',
  !same(a.state.blocks, c.state.blocks) || a.state.shotsFired !== c.state.shotsFired,
  'seeds 4821 and 9137 came out identical, which means the seed is being ignored');

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
