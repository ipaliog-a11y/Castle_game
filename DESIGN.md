# Siege & Stone — design

A 2D side-on castle game. You **build** a fortress from a gold budget, then play
either side of the siege on it: **hold** it against an AI besieger, or **attack**
it yourself with cannon and troops. One castle format, one battle simulation, so
anything buildable is attackable and both sides obey the same physics.

## Decisions taken

These were settled up front, because each one rules out a large amount of work.

| Question | Decision | Why it matters |
| --- | --- | --- |
| Destruction model | **HP blocks + support checks** | Blocks have hitpoints; when one dies, anything it was holding up falls. No rigid-body engine, so it stays cheap on Android and stays tunable, while keeping the "undermine the tower" tactic. |
| Defence loop | **Build phase, then watch and react** | A clear rhythm that reads well on touch and mirrors the offence loop. |
| Cards | **Special abilities only** | Cards are a layer on top, not the economy. Building and attacking use plain gold. Cheap to expand, cheap to cut. |
| Stack | **TypeScript + Phaser 3 + Vite** | Web-native, fast iteration, wraps to Android via Capacitor. |
| Perspective | **Side-on, no player avatar** | You are the commander, not a character. No character controller to build. |
| Offence loop | **Aim cannons + send waves** | Cannons breach, troops exploit the breach. Two tools that need each other. |
| Meta | **Single-player campaign, both sides** | No backend, ships offline, works on a plane. |

### On physics

Because destruction is HP-and-support rather than rigid bodies, **matter.js is
not used and no Phaser physics plugin is enabled**. Projectiles and falling
debris integrate their own gravity in `BattleScene`; structural integrity is
solved on the grid in `src/core/castle.ts`. This is a deliberate consequence of
the destruction model above.

## How structure works

The castle is a fixed 40×16 grid. Every block either traces a support chain back
to the ground or it does not; blocks that cannot, fall.

Support propagates from the ground row:

- **Upward** for free — a block sitting on a supported block is supported.
- **Sideways** at a cost of one "span" point, capped per material.

So a material's `maxSpan` is exactly how far it can cantilever before it drops.
Timber manages 2 cells, stone 3, iron 5. This one number is what makes material
choice a real decision rather than a hitpoint upgrade, and it produces arches,
battlements and gatehouses for free: build outward from a pillar and each block
is supported as you place it.

Because upward edges reset the span to zero, the solve is not monotonic and
cannot use Dijkstra — it relaxes to a fixpoint instead. The grid is 640 cells,
so this is trivially cheap and runs on every block destruction.

When blocks lose support they become debris that falls, crushes attackers on the
way down, damages whatever it lands on, and — if it survives the impact —
settles as rubble. Rubble piles are real blocks afterward, so a collapsed tower
becomes an obstacle that slows the next wave. That was not designed in; it fell
out of the model, and it is worth keeping.

## Current state — milestones 1 and 2

Playable end to end in both directions: build a castle, then either besiege it
yourself or hold it against an AI besieger.

**Build phase**
- Timber / stone / iron palette with per-material cost, hitpoints and span
- 900 gold budget, full refund on erase
- Placement is rejected if the block would float, using the same solver the
  siege uses — so you cannot build something the physics will not honour
- Erasing a block auto-removes and refunds anything it orphaned
- The throne is fixed and cannot be erased; build around it
- Castle persists to `localStorage`

**Offence (laying siege) — milestone 1**
- Drag-to-aim cannon with a live trajectory preview and power ring
- Gold economy: shots cost 15, knights 40, sappers 70, income ticks up
- Knights and sappers march, step over single-cell ledges, and hack at walls
  they cannot climb. Sappers hit far harder but die to their own collapses
- Blast damage with radial falloff and per-material blast/melee resistances —
  stone shrugs off swords, timber does not; iron shrugs off cannon fire
- Four offence cards on an energy economy with draw/discard/reshuffle
- Win by destroying the throne; lose on the 3-minute timer

**Defence (holding the keep) — milestone 2**
- An AI besieges the castle you built while you hold it with the defence deck
- Every AI shot is **telegraphed** by a shrinking crosshair before it flies,
  which is what turns Masons and Boiling Oil into reactions rather than guesses
- Difficulty ramps with a pressure value that runs 0 → 1 across the battle: the
  AI reloads faster, aims tighter, sends bigger waves and lobs heavier shot
- Win by surviving the timer; lose the moment the throne falls — the inverse of
  the siege, resolved from the same battle outcome

**Cards implemented**

| Card | Side | Cost | Effect |
| --- | --- | --- | --- |
| Chain Shot | Offence | 3 | Next shot splits into three weaker balls |
| Black Powder | Offence | 4 | Next shot hits far harder in a wide blast |
| Sapper Charge | Offence | 5 | Tap a wall to blow a hole through it |
| Rally | Offence | 3 | Troops move and hit harder for 8 seconds |
| Masons | Defence | 3 | Restore 45% of max HP to damaged blocks in radius |
| Boiling Oil | Defence | 4 | Scald attackers around the tapped point |
| Reinforce | Defence | 5 | Castle takes 40% less damage for 10 seconds |

## How the two modes share a simulation

`BattleScene` holds the entire battle: castle, projectiles, debris, troops and
every way they hurt each other. `SiegeScene` and `DefendScene` are thin
subclasses that supply only a controller and a win condition.

This is deliberate, and it is the reason defence was cheap to add. Both modes
run **byte-identical physics** — a wall that holds against the AI holds against
you, because it is the same code path, not a reimplementation. Subclasses
provide `onTick` (economy, AI, cards), `onDraw` (overlays, HUD) and `checkEnd`.

### The attacker AI

The AI needs real firing solutions, so `src/core/ballistics.ts` solves the
launch angle in closed form — the standard two-root projectile equation, with
the **lobbed** root chosen so shells clear the outer wall instead of burying
themselves in it. It is pure, isolated and directly tested.

Two things fell out of testing it that shaped the AI:

- **Height eats range badly.** A target 1082px away but 466px up is out of reach
  at full charge, even though flat ground at 1300px is not. So the AI only ever
  commits to targets it has already solved, walking its ranked candidates until
  one is reachable. Aiming at an unhittable tower top would silently burn
  reloads.
- **The AI undermines, like a good human attacker.** Target scoring is weighted
  toward low blocks, because knocking out a support drops everything above it.

### One clock, not two

Everything with a duration — reloads, telegraphs, rally, reinforce, status
messages — is timed against `elapsed`, the battle time accumulated from frame
deltas, never `this.time.now`. Mixing the two was a real bug found in testing:
game time ran at roughly a third of wall clock under headless rendering, which
would have quietly shrunk the telegraph warning window relative to the battle on
exactly the weak devices that drop frames.

## Roadmap

**Milestone 3 — campaign.** Handcrafted levels alternating attack and defence,
with per-level budgets, fixed decks and star ratings. Level data is the same
`CastleSave` format the builder already emits.

**Milestone 4 — card depth.** The combination mechanic: fusing two cards into a
stronger third (Oak + Iron → Reinforced Gate). Deckbuilding as meta-progression.
Worth doing only once the base loop is proven fun — a combination system on top
of a loop that does not work will not save it.

**Milestone 5 — Android.** Capacitor wrap of `dist/`. The build already emits
relative paths and the input is pointer-based, so this is mostly packaging plus
a pass on touch target sizes and a landscape lock.

Deliberately deferred: accounts, servers, PvP, castle sharing codes. All of it
can be layered on the existing save format later without reworking the core.

## Balance notes

Numbers live in `src/core/materials.ts` and `src/core/units.ts` and are meant to
be edited. Current tuning is a first pass, not a balanced game. Known soft spots:

- Iron is very strong against cannon fire (0.55×) and melee (0.3×); at 45g it
  may simply be the correct answer everywhere once you can afford it.
- The march across open ground takes roughly 9 seconds. That is deliberate time
  for the cannon to work, but it is the first thing to shorten if it drags.
- The 3-minute timer has not been tested against a genuinely good castle.
