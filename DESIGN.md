# Siege & Stone — design

A 2D side-on castle game with two modes. In **Defence** you spend a gold budget
turning an empty plot into a fortress. In **Offence** you besiege that same
fortress with cannon and troops. The castle data format is shared, so anything
buildable is attackable.

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
debris integrate their own gravity in `SiegeScene`; structural integrity is
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

## Current state — milestone 1

Playable end to end: build a castle, besiege it, get a result, rebuild.

**Defence (build phase)**
- Timber / stone / iron palette with per-material cost, hitpoints and span
- 900 gold budget, full refund on erase
- Placement is rejected if the block would float, using the same solver the
  siege uses — so you cannot build something the physics will not honour
- Erasing a block auto-removes and refunds anything it orphaned
- The throne is fixed and cannot be erased; build around it
- Castle persists to `localStorage`

**Offence (siege)**
- Drag-to-aim cannon with a live trajectory preview and power ring
- Gold economy: shots cost 15, knights 40, sappers 70, income ticks up
- Knights and sappers march, step over single-cell ledges, and hack at walls
  they cannot climb. Sappers hit far harder but die to their own collapses
- Blast damage with radial falloff and per-material blast/melee resistances —
  stone shrugs off swords, timber does not; iron shrugs off cannon fire
- Four offence cards on an energy economy with draw/discard/reshuffle
- Win by destroying the throne; lose on the 3-minute timer

**Cards implemented**

| Card | Cost | Effect |
| --- | --- | --- |
| Chain Shot | 3 | Next shot splits into three weaker balls |
| Black Powder | 4 | Next shot hits far harder in a wide blast |
| Sapper Charge | 5 | Tap a wall to blow a hole through it |
| Rally | 3 | Troops move and hit harder for 8 seconds |

Three defence cards (Masons, Boiling Oil, Reinforce) are **defined in
`src/core/cards.ts` but not dealt**, because in this milestone you play the
attacker on both screens. They are wired for the defence-vs-AI level.

## Roadmap

**Milestone 2 — defence has an opponent.** An AI attacker runs waves against
your castle while you play the defence deck. This is what makes the defence
cards live and turns the build phase into a real half of the game.

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
