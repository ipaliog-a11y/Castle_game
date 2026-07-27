import { Castle } from '../src/core/castle.ts';
import { GRID_COLS, GRID_ROWS } from '../src/core/config.ts';
import { solveLaunch, solveLaunchAdaptive } from '../src/core/ballistics.ts';
import { CARDS, DEFENSE_DECK, OFFENSE_DECK } from '../src/core/cards.ts';
import { BUILDABLE } from '../src/core/materials.ts';
import { UNITS } from '../src/core/units.ts';
import { hasGlyph } from '../src/ui/icons.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log('  ok  ', name); }
  else { fail++; console.log('  FAIL', name); }
};
const at = (c, r) => r * GRID_COLS + c;
const bottom = GRID_ROWS - 1;

console.log('support solver');

// 1. A block on the ground row supports itself.
{
  const c = new Castle();
  c.place(20, bottom, 'stone');
  check('ground block is supported', c.computeSupported().has(at(20, bottom)));
}

// 2. A floating block is not supported.
{
  const c = new Castle();
  c.place(20, 5, 'stone');
  check('floating block is unsupported', !c.computeSupported().has(at(20, 5)));
  check('floating block reported by findUnsupported', c.findUnsupported().length === 1);
}

// 3. A vertical tower is fully supported.
{
  const c = new Castle();
  for (let r = bottom; r >= bottom - 6; r--) c.place(20, r, 'stone');
  check('7-high tower fully supported', c.findUnsupported().length === 0);
}

// 4. Knock out the base and the whole tower falls.
{
  const c = new Castle();
  for (let r = bottom; r >= bottom - 6; r--) c.place(20, r, 'stone');
  c.remove(20, bottom);
  check('tower collapses when base removed', c.findUnsupported().length === 6);
}

// 5. Cantilever honours the material span (stone = 3).
{
  const c = new Castle();
  c.place(20, bottom, 'stone');
  c.place(20, bottom - 1, 'stone');
  for (let i = 1; i <= 4; i++) c.place(20 + i, bottom - 1, 'stone');
  const sup = c.computeSupported();
  check('stone cantilever cell 1 holds', sup.has(at(21, bottom - 1)));
  check('stone cantilever cell 3 holds', sup.has(at(23, bottom - 1)));
  check('stone cantilever cell 4 falls', !sup.has(at(24, bottom - 1)));
}

// 6. Timber (span 2) is weaker than stone (span 3).
{
  const c = new Castle();
  c.place(20, bottom, 'wood');
  c.place(20, bottom - 1, 'wood');
  for (let i = 1; i <= 3; i++) c.place(20 + i, bottom - 1, 'wood');
  const sup = c.computeSupported();
  check('timber cantilever cell 2 holds', sup.has(at(22, bottom - 1)));
  check('timber cantilever cell 3 falls', !sup.has(at(23, bottom - 1)));
}

// 7. An arch between two pillars stands (the reset-to-zero upward edge is
//    what makes this work, so it also guards the fixpoint relaxation).
{
  const c = new Castle();
  for (let r = bottom; r >= bottom - 4; r--) { c.place(20, r, 'stone'); c.place(26, r, 'stone'); }
  for (let col = 21; col <= 25; col++) c.place(col, bottom - 4, 'stone');
  check('5-wide arch between pillars stands', c.findUnsupported().length === 0);
}

// 8. Remove one pillar and the arch drops.
{
  const c = new Castle();
  for (let r = bottom; r >= bottom - 4; r--) { c.place(20, r, 'stone'); c.place(26, r, 'stone'); }
  for (let col = 21; col <= 25; col++) c.place(col, bottom - 4, 'stone');
  for (let r = bottom; r >= bottom - 4; r--) c.remove(26, r);
  const falling = c.findUnsupported();
  check('arch partially collapses without right pillar', falling.length > 0);
  check('cells within span of the surviving pillar still hold', falling.length === 2);
}

// 9. A tower resting on a cantilever is supported (upward edge resets span).
{
  const c = new Castle();
  c.place(20, bottom, 'iron');
  c.place(20, bottom - 1, 'iron');
  for (let i = 1; i <= 4; i++) c.place(20 + i, bottom - 1, 'iron');
  for (let r = bottom - 2; r >= bottom - 5; r--) c.place(24, r, 'iron');
  check('tower on an iron cantilever stands', c.findUnsupported().length === 0);
}

// 10. findUnsupported returns bottom-up so debris settles in order.
{
  const c = new Castle();
  for (let r = bottom - 1; r >= bottom - 4; r--) c.place(20, r, 'stone');
  const rows = c.findUnsupported().map((b) => b.row);
  check('unsupported blocks sorted bottom-up', rows.join() === [...rows].sort((a, b) => b - a).join());
}

// 11. landingRow drops debris onto the first solid cell.
{
  const c = new Castle();
  c.place(20, bottom, 'stone');
  check('landingRow rests on top of a stack', c.landingRow(20, 3) === bottom - 1);
  check('landingRow reaches the floor in an empty column', c.landingRow(21, 3) === bottom);
}

// 12. Serialization round-trips, including partial damage.
{
  const c = new Castle();
  c.place(20, bottom, 'stone');
  const b = c.place(21, bottom, 'iron');
  b.hp = b.maxHp * 0.5;
  const back = Castle.deserialize(c.serialize(100));
  check('round-trip keeps block count', back.count() === 2);
  check('round-trip keeps damage', Math.abs(back.get(21, bottom).hp - b.maxHp * 0.5) < 1);
  check('round-trip keeps material', back.get(21, bottom).mat === 'iron');
}

console.log('\nballistics');

const G = 900;

/** Integrates a shot the same way the game does and returns the closest approach. */
function simulate(x0, y0, vx, vy, tx, ty, steps = 4000, dt = 1 / 240) {
  let x = x0, y = y0, sy = vy, best = Infinity;
  for (let i = 0; i < steps; i++) {
    sy += G * dt;
    x += vx * dt;
    y += sy * dt;
    best = Math.min(best, Math.hypot(x - tx, y - ty));
    if (y > 4000) break;
  }
  return best;
}

// 13. A solved shot actually lands on the target it was solved for.
{
  const cases = [
    [118, 566, 800, 480],
    [118, 566, 1136, 552],
    [118, 566, 640, 200],
    [118, 566, 1000, 300],
  ];
  for (const [x0, y0, tx, ty] of cases) {
    const flat = solveLaunch(x0, y0, tx, ty, 1100, G, false);
    const lob = solveLaunch(x0, y0, tx, ty, 1100, G, true);
    check(`flat arc reaches (${tx},${ty})`, !!flat && simulate(x0, y0, flat.vx, flat.vy, tx, ty) < 4);
    check(`lobbed arc reaches (${tx},${ty})`, !!lob && simulate(x0, y0, lob.vx, lob.vy, tx, ty) < 4);
  }
}

// 14. The lob really is the higher of the two arcs.
{
  const flat = solveLaunch(118, 566, 900, 500, 1100, G, false);
  const lob = solveLaunch(118, 566, 900, 500, 1100, G, true);
  check('lobbed arc has the steeper launch angle', lob.angle > flat.angle);
  check('both arcs use the same speed', Math.abs(Math.hypot(flat.vx, flat.vy) - Math.hypot(lob.vx, lob.vy)) < 1e-6);
}

// 15. Out-of-range targets report no solution rather than a bad one.
{
  check('target beyond range returns null', solveLaunch(118, 566, 99999, 566, 400, G) === null);
  check('adaptive solver also gives up when unreachable',
    solveLaunchAdaptive(118, 566, 99999, 566, 300, 600, G) === null);
  // Height costs range: this target is only 1082px away but 466px up, and the
  // cannon cannot reach it even at full charge. The AI must handle that.
  check('a high, distant target is correctly rejected',
    solveLaunchAdaptive(118, 566, 1200, 100, 520, 1100, G, true) === null);
}

// 16. The adaptive solver finds the gentlest shot that still reaches.
{
  const near = solveLaunchAdaptive(118, 566, 700, 500, 520, 1100, G, true);
  const far = solveLaunchAdaptive(118, 566, 1200, 540, 520, 1100, G, true);
  check('adaptive solver hits a near target', !!near && simulate(118, 566, near.vx, near.vy, 700, 500) < 6);
  check('adaptive solver hits a far target', !!far && simulate(118, 566, far.vx, far.vy, 1200, 540) < 6);
  check('a nearer target is engaged with less speed',
    Math.hypot(near.vx, near.vy) < Math.hypot(far.vx, far.vy),
    );
}

// 17. Shots always travel toward the castle, never backwards off-screen.
{
  let ok = true;
  for (let tx = 700; tx <= 1250; tx += 50) {
    const s = solveLaunchAdaptive(118, 566, tx, 520, 520, 1100, G, true);
    if (!s || s.vx <= 0) ok = false;
  }
  check('every solved shot flies toward the castle', ok);
}

// 18. Everything the player picks from has a drawn symbol. The glyph is how
// someone who cannot read the name tells them apart, so shipping without one
// is a real gap, not a cosmetic gap.
{
  const dealt = [...OFFENSE_DECK, ...DEFENSE_DECK];
  check(
    `every dealt card has a glyph (${dealt.length} checked)`,
    dealt.every((id) => hasGlyph(id)),
  );
  check(
    'no card definition anywhere is without a glyph',
    Object.keys(CARDS).every((id) => hasGlyph(id)),
  );
  check(
    `every buildable material has a glyph (${BUILDABLE.length} checked)`,
    BUILDABLE.every((id) => hasGlyph(id)),
  );
  check('the erase tool has a glyph', hasGlyph('erase'));
  check(
    `every troop type has a glyph (${Object.keys(UNITS).length} checked)`,
    Object.keys(UNITS).every((id) => hasGlyph(id)),
  );
  // Guard the guard: a typo in hasGlyph that returned true for everything
  // would make all of the above pass silently.
  check('hasGlyph rejects an id with no art', !hasGlyph('trebuchet'));
}

// 19. Span headroom is the number the builder now shows, so it has to mean
// what the material says. A run reaching out from a pillar should count down
// to zero exactly at the material's limit, and timber should get there sooner
// than stone.
{
  const c = new Castle();
  for (let r = GRID_ROWS - 1; r >= 8; r--) c.place(10, r, 'stone');
  for (let col = 11; col <= 13; col++) c.place(col, 8, 'stone');
  let spans = c.computeSpans();
  check('stone pillar has full headroom', c.spanHeadroom(10, 8, spans) === 3);
  check('stone headroom counts down along a reach',
    [11, 12, 13].map((col) => c.spanHeadroom(col, 8, spans)).join(',') === '2,1,0');

  const t = new Castle();
  for (let r = GRID_ROWS - 1; r >= 8; r--) t.place(10, r, 'wood');
  for (let col = 11; col <= 12; col++) t.place(col, 8, 'wood');
  spans = t.computeSpans();
  check('timber runs out of headroom sooner than stone',
    [11, 12].map((col) => t.spanHeadroom(col, 8, spans)).join(',') === '1,0');

  // A block the solver rejects reports -1 rather than a misleading 0, so the
  // builder can tell "at the limit" from "already falling".
  const f = new Castle();
  f.place(5, 3, 'stone');
  check('a floating block reports no headroom at all',
    f.spanHeadroom(5, 3, f.computeSpans()) === -1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
