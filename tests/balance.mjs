/**
 * The balance harness. A report generator, not a test — it prints numbers and
 * exits zero either way, because "iron is too strong" is a judgement and not an
 * assertion.
 *
 * Five castle archetypes, each built to the same gold budget, are put through
 * both modes across a batch of seeds:
 *
 *   - **defence**, where the game's own AI attacks and nobody defends, so the
 *     numbers describe the castle against a fixed opponent;
 *   - **offence**, where a scripted attacker plays for the human — it aims at
 *     the lowest reachable block and buys troops when it can afford them. It
 *     stands in for a competent player, not a good one, so read its win rate as
 *     a floor rather than a verdict.
 *
 * Battles are stepped directly rather than played at frame rate: a 90-second
 * battle is 5400 fixed steps and runs in a fraction of a second. This is only
 * meaningful because of 6.1 — the same seed gives the same battle, so a change
 * in these tables is a change in the game and not in the weather.
 *
 *   node tests/balance.mjs            # 4 seeds per matchup
 *   SEEDS=12 node tests/balance.mjs   # tighter numbers, slower
 */
import { chromium } from 'playwright';

const BASE = process.env.GAME_URL || 'http://localhost:5173/';
const SEED_COUNT = Number(process.env.SEEDS || 4);
const BUDGET = 900;
const COST = { wood: 5, stone: 15, iron: 45, throne: 0, masonsYard: 0, oilVat: 0, bastion: 0 };

// Build zone is columns 20..38; the throne is fixed at (35, 15).
const THRONE = [35, 15, 'throne'];

/** Every archetype starts with the throne, and never overwrites its cell. */
function build(fn) {
  const blocks = [THRONE];
  const seen = new Set(['35,15']);
  fn((col, row, mat) => {
    if (col < 20 || col > 38 || row < 0 || row > 15) return;
    const key = `${col},${row}`;
    if (seen.has(key)) return;
    if (spend(blocks) + COST[mat] > BUDGET) return; // never overspend
    seen.add(key);
    blocks.push([col, row, mat]);
  });
  return blocks;
}

const spend = (blocks) => blocks.reduce((sum, b) => sum + COST[b[2]], 0);

const ARCHETYPES = {
  // Control. No castle at all — just the throne standing in the open. If this
  // does not die far faster than everything else, the table is saturated and
  // the numbers below it mean nothing.
  'bare throne (control)': build(() => {}),

  // Several thin stone screens. Cheap frontage, nothing load-bearing behind it.
  'thin curtain': build((put) => {
    for (const col of [22, 25, 28, 31, 34]) for (let r = 15; r >= 4; r--) put(col, r, 'stone');
    for (const [c, r] of [[34, 15], [36, 15], [35, 14]]) put(c, r, 'stone');
  }),

  // One solid mass of stone with the throne buried in the middle of it.
  'thick keep': build((put) => {
    for (let r = 15; r >= 9; r--) for (let c = 31; c <= 38; c++) put(c, r, 'stone');
  }),

  // The hypothesis under test: 20 iron blocks is the whole budget.
  'iron shell': build((put) => {
    for (let r = 15; r >= 13; r--) for (let c = 33; c <= 37; c++) put(c, r, 'iron');
    for (let c = 33; c <= 37; c++) put(c, 12, 'iron');
  }),

  // The other extreme: 180 blocks of timber, wide and deep and weak.
  'timber sprawl': build((put) => {
    for (let r = 15; r >= 6; r--) for (let c = 20; c <= 38; c++) put(c, r, 'wood');
  }),

  // Pillars and lintels, leaning on maxSpan rather than on mass.
  'arch fort': build((put) => {
    for (const col of [22, 26, 30, 34, 38]) for (let r = 15; r >= 6; r--) put(col, r, 'stone');
    for (const row of [6, 10, 14]) for (let c = 20; c <= 38; c++) put(c, row, 'stone');
  }),

  // The two rows that measure the support-base decision. Same wall, same gold,
  // same three bases — only where they sit differs. Clustered they are deep but
  // one breach reaches all three; spread they are shallower but a breach costs
  // one card, not the hand.
  'bases clustered': build((put) => {
    put(37, 15, 'masonsYard');
    put(38, 15, 'oilVat');
    put(37, 14, 'bastion');
    for (const col of [24, 27, 30, 33]) for (let r = 15; r >= 5; r--) put(col, r, 'stone');
  }),

  'bases spread': build((put) => {
    put(21, 15, 'masonsYard');
    put(29, 15, 'oilVat');
    put(38, 15, 'bastion');
    for (const col of [24, 27, 30, 33]) for (let r = 15; r >= 5; r--) put(col, r, 'stone');
  }),
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

/**
 * Plays one battle to its end and returns the outcome.
 *
 * `mode` is 'Defend' (the AI attacks an undefended castle) or 'Siege' (a
 * scripted attacker plays the human side).
 */
async function battle(blocks, seed, mode) {
  await page.goto(`${BASE}?seed=${seed}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((b) => {
    localStorage.setItem(
      'siege-and-stone:castle:v1',
      JSON.stringify({ v: 1, spent: 0, blocks: b }),
    );
  }, blocks);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__game);
  await page.waitForTimeout(250);

  return page.evaluate(
    ([key]) => {
      const game = window.__game;
      for (const s of ['Menu', 'Build', 'Siege', 'Defend', 'Result']) game.scene.stop(s);
      game.scene.start(key);

      return new Promise((resolve) => {
        setTimeout(() => {
          const s = game.scene.getScene(key);
          // Snapshot *before* the battle. Reading these afterwards, as a first
          // version did, makes "throne present" mean "the attacker lost".
          const startBlocks = s.castle.count();
          const throneAtStart = !!s.castle.find('throne');
          const basesAtStart = s.basesAlive.size;

          /**
           * A stand-in for a competent attacker: shoot the lowest block that can
           * be reached, and spend spare gold on troops. It does not play cards,
           * flank, or concentrate fire — deliberately, so its win rate reads as
           * a floor for what a human can manage.
           */
          const attack = () => {
            if (s.gold === undefined) return;
            const all = s.castle.all();
            if (all.length === 0) return;
            let best = null;
            for (const b of all) {
              // Lowest first, nearest as the tie-break: undermine, do not chip.
              if (!best || b.row > best.row || (b.row === best.row && b.col < best.col)) best = b;
            }
            s.aimX = best.col * 32 + 16;
            s.aimY = 64 + best.row * 32 + 16;
            if (s.cooldown <= 0 && s.gold >= 15) s.fire();
            else if (s.gold >= 110) s.deploy(s.gold >= 200 ? 'sapper' : 'knight');
          };

          const MAX_STEPS = 6000; // 100s of battle; the clock ends it at 90
          for (let i = 0; i < MAX_STEPS && !s.finished; i++) {
            if (key === 'Siege') attack();
            s.step();
          }

          resolve({
            // Guards the whole report: a castle that failed to load would make
            // every row look identical and equally hopeless.
            throneAtStart,
            attackerWon: !s.castle.find('throne'),
            seconds: +(s.elapsed / 1000).toFixed(1),
            blocksLeft: s.castle.count(),
            startBlocks,
            hpLeft: Math.round(s.castle.all().reduce((sum, b) => sum + b.hp, 0)),
            basesLeft: s.basesAlive.size,
            basesAtStart,
            goldLeft: s.gold === undefined ? null : Math.round(s.gold),
          });
        }, 250);
      });
    },
    [mode],
  );
}

const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const pct = (n, d) => (d === 0 ? '  -  ' : `${Math.round((n / d) * 100)}%`.padStart(5));

const seeds = Array.from({ length: SEED_COUNT }, (_, i) => 1000 + i * 977);
const rows = [];

console.log(`\nBalance report — ${SEED_COUNT} seeds per matchup, ${BUDGET}g budget\n`);

for (const [name, blocks] of Object.entries(ARCHETYPES)) {
  const cost = spend(blocks);
  const row = { name, cost, blocks: blocks.length - 1 };

  for (const mode of ['Defend', 'Siege']) {
    const runs = [];
    for (const seed of seeds) runs.push(await battle(blocks, seed, mode));
    const bad = runs.find((r) => !r.throneAtStart || r.startBlocks !== blocks.length);
    if (bad) {
      console.log(
        `  !! ${name}/${mode}: expected ${blocks.length} blocks, scene had ${bad.startBlocks}` +
          `, throne ${bad.throneAtStart} — ignore this row`,
      );
    }
    const wins = runs.filter((r) => r.attackerWon);
    row[mode] = {
      winRate: wins.length / runs.length,
      timeToThrone: median(wins.map((r) => r.seconds)),
      blocksLeft: median(runs.map((r) => r.blocksLeft)),
      standing: median(runs.map((r) => r.blocksLeft / r.startBlocks)),
      basesAtStart: runs[0].basesAtStart,
      basesKept: median(runs.map((r) => r.basesLeft)),
    };
  }
  rows.push(row);
  process.stdout.write(`  ${name} done\n`);
}

console.log(
  '\n  archetype       spend  blocks | AI attacks: win  survived  standing  bases | bot attacks: win   time',
);
console.log('  ' + '-'.repeat(107));
for (const r of rows) {
  const d = r.Defend;
  const s = r.Siege;
  console.log(
    '  ' +
      r.name.padEnd(15) +
      String(r.cost).padStart(5) +
      String(r.blocks).padStart(8) +
      ' |' +
      pct(d.winRate, 1).padStart(16) +
      `${d.timeToThrone === null ? '     -' : String(d.timeToThrone).padStart(6)}s` +
      pct(d.standing, 1).padStart(10) +
      `${d.basesAtStart ? `${d.basesKept}/${d.basesAtStart}` : '  -'}`.padStart(7) +
      ' |' +
      pct(s.winRate, 1).padStart(17) +
      `${s.timeToThrone === null ? '      -' : String(s.timeToThrone).padStart(7)}s`,
  );
}

console.log(`
  win     = how often the attacker destroyed the throne
  survived= median battle length when the attacker won
  standing= median share of the castle's blocks still up at the end
  bases   = support bases still standing at the end, of those built
`);
if (errors.length) console.log('  page errors:', errors.slice(0, 5));

await browser.close();
