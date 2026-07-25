import { chromium } from 'playwright';
const SHOT = new URL('./screenshots/', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await b.newPage({ viewport: { width: 1280, height: 640 } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, x); } };

// A castle with towers, an arch and the throne — enough for the AI to chew on.
const blocks = [];
for (let r = 15; r >= 9; r--) { blocks.push([26, r, 'stone']); blocks.push([27, r, 'stone']); }
for (let r = 15; r >= 11; r--) blocks.push([32, r, 'stone']);
for (let c = 28; c <= 31; c++) blocks.push([c, 11, 'stone']);
for (let r = 15; r >= 12; r--) blocks.push([37, r, 'iron']);
blocks.push([35, 15, 'throne']);
blocks.push([35, 14, 'wood']); blocks.push([36, 14, 'wood']);

await page.goto(process.env.GAME_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(bl => localStorage.setItem('siege-and-stone:castle:v1', JSON.stringify({ v: 1, spent: 500, blocks: bl })), blocks);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOT}d0-menu.png` });

const restart = async () => {
  await page.evaluate(() => {
    const g = window.__game;
    for (const k of ['Menu', 'Result', 'Siege', 'Defend']) g.scene.stop(k);
    g.scene.start('Defend');
  });
  await page.waitForTimeout(900);
};
const probe = fn => page.evaluate(fn);

console.log('defence mode');

await restart();
const boot = await probe(() => {
  const s = window.__game.scene.getScene('Defend');
  return { blocks: s.castle.count(), throne: !!s.castle.find('throne'), side: s.playerSide, cards: s.cards.hand.map(c => c && c.id) };
});
check('defend scene boots with the saved castle', boot.blocks === 30, JSON.stringify(boot));
check('player side is defend', boot.side === 'defend');
check('hand is dealt from the defence deck',
  boot.cards.every(c => ['repair', 'boilingOil', 'reinforce'].includes(c)), JSON.stringify(boot.cards));

// --- The AI telegraphs, then fires -----------------------------------------
await restart();
const waitFor = async (fn, timeoutMs = 45000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(400);
  }
  return false;
};
// Battle time advances off frame deltas, which run well below wall clock in
// headless Chromium, so poll rather than assuming a fixed real-time budget.
await waitFor(() => window.__game.scene.getScene('Defend').shotsFired >= 1);
const aiState = await probe(() => {
  const s = window.__game.scene.getScene('Defend');
  return { telegraph: !!s.telegraph, balls: s.balls.length, shots: s.shotsFired, elapsed: Math.round(s.elapsed) };
});
await page.screenshot({ path: `${SHOT}d1-telegraph.png` });
// A shell can land before we look, so count shots rather than live projectiles.
check('AI opens fire within the first seconds', aiState.shots >= 1, JSON.stringify(aiState));

// --- Sustained AI assault damages the castle and sends troops --------------
await restart();
// Block count is too blunt: stone survives several hits, so early shots wound
// the castle without killing anything. Total hitpoints is the sensitive metric.
const totalHp = () => window.__game.scene.getScene('Defend').castle.all().reduce((n, b) => n + b.hp, 0);
const before = await probe(totalHp);
await waitFor(() => {
  const s = window.__game.scene.getScene('Defend');
  return s.wavesSent >= 1 && s.shotsFired >= 3;
}, 90000);
await page.waitForTimeout(2500);
const after = await probe(() => {
  const s = window.__game.scene.getScene('Defend');
  return {
    hp: s.castle.all().reduce((n, b) => n + b.hp, 0),
    units: s.units.length, waves: s.wavesSent, shots: s.shotsFired, elapsed: Math.round(s.elapsed),
  };
});
await page.screenshot({ path: `${SHOT}d2-assault.png` });
check('AI fire wears the castle down', after.hp < before, `${Math.round(before)}hp -> ${Math.round(after.hp)}hp after ${after.shots} shots`);
check('AI sends troop waves', after.waves >= 1, JSON.stringify(after));
check('troops are on the field', after.units >= 1, JSON.stringify(after));

// --- Masons repair damaged blocks ------------------------------------------
await restart();
const repair = await probe(() => {
  const s = window.__game.scene.getScene('Defend');
  const blk = s.castle.get(26, 15);
  blk.hp = blk.maxHp * 0.2;
  const damaged = blk.hp;
  const healed = s.repairArea(26 * 32 + 16, 64 + 15 * 32 + 16, 2.5, 0.45);
  return { damaged, after: s.castle.get(26, 15).hp, healed, max: blk.maxHp };
});
check('Masons restore hitpoints', repair.after > repair.damaged, JSON.stringify(repair));
check('Masons never overheal past max', repair.after <= repair.max, JSON.stringify(repair));

// --- Boiling oil damages attackers -----------------------------------------
await restart();
const oil = await probe(() => {
  const s = window.__game.scene.getScene('Defend');
  s.spawnUnit('knight');
  const u = s.units[0];
  u.x = 700; u.feetY = 576;
  const hpBefore = u.hp;
  const hits = s.damageUnitsInRadius(700, 560, 2, 70);
  return { hits, hpBefore, hpAfter: s.units[0] ? s.units[0].hp : 0 };
});
check('Boiling Oil hits attackers in radius', oil.hits === 1, JSON.stringify(oil));
check('Boiling Oil actually wounds them', oil.hpAfter < oil.hpBefore, JSON.stringify(oil));

// --- Reinforce reduces incoming damage --------------------------------------
await restart();
const reinforce = await probe(() => {
  const s = window.__game.scene.getScene('Defend');
  const slot = s.cards.hand.findIndex(c => c && c.id === 'reinforce');
  if (slot < 0) return { skipped: true };
  s.cards.energy = 10;
  s.onCardPressed(slot, s.cards.hand[slot]);
  return { mul: s.castleDamageMul };
});
if (reinforce.skipped) {
  // Force the card into hand rather than relying on the shuffle.
  const forced = await probe(() => {
    const s = window.__game.scene.getScene('Defend');
    s.cards.hand[0] = { id: 'reinforce', name: 'Reinforce', side: 'defense', cost: 5, kind: 'instant', blurb: '', accent: 0 };
    s.cards.energy = 10;
    s.onCardPressed(0, s.cards.hand[0]);
    return { mul: s.castleDamageMul };
  });
  check('Reinforce lowers castle damage taken', forced.mul === 0.6, JSON.stringify(forced));
} else {
  check('Reinforce lowers castle damage taken', reinforce.mul === 0.6, JSON.stringify(reinforce));
}

// Damage reduction must actually apply to incoming fire.
const reduced = await probe(() => {
  const s = window.__game.scene.getScene('Defend');
  s.castleDamageMul = 0.6;
  const blk = s.castle.get(37, 12); // iron, survives a hit
  const hp0 = blk.hp;
  s.explode(37 * 32 + 16, 64 + 12 * 32 + 16, 100, 1.0);
  const withMul = hp0 - s.castle.get(37, 12).hp;
  s.castleDamageMul = 1;
  const hp1 = s.castle.get(37, 12).hp;
  s.explode(37 * 32 + 16, 64 + 12 * 32 + 16, 100, 1.0);
  const withoutMul = hp1 - s.castle.get(37, 12).hp;
  return { withMul, withoutMul };
});
check('reinforced walls take strictly less damage', reduced.withMul < reduced.withoutMul, JSON.stringify(reduced));

// --- Win/lose conditions are inverted for the defender ----------------------
await restart();
await probe(() => { window.__game.scene.getScene('Defend').timeLeft = 10; });
await page.waitForTimeout(1400);
const held = await probe(() => ({
  active: window.__game.scene.getScenes(true).map(s => s.scene.key),
}));
check('surviving the timer ends the battle', held.active.includes('Result'), JSON.stringify(held));
await page.screenshot({ path: `${SHOT}d3-held.png` });

await restart();
await probe(() => {
  const s = window.__game.scene.getScene('Defend');
  const t = s.castle.find('throne');
  s.explode(t.col * 32 + 16, 64 + t.row * 32 + 16, 900, 1.5);
});
await page.waitForTimeout(1400);
const lost = await probe(() => window.__game.scene.getScenes(true).map(s => s.scene.key));
check('losing the throne ends the battle', lost.includes('Result'), JSON.stringify(lost));
await page.screenshot({ path: `${SHOT}d4-lost.png` });

console.log('\nerrors:', errs.length ? errs : 'none');
console.log(`${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail || errs.length ? 1 : 0);
