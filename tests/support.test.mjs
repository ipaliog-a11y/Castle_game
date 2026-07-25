import { Castle } from '../src/core/castle.ts';
import { GRID_COLS, GRID_ROWS } from '../src/core/config.ts';

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
