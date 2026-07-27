# Roadmap

What gets built next, and why that and not something else. Design decisions and
how the existing systems work live in [DESIGN.md](DESIGN.md); this file is
forward-looking only.

## Standing decisions

| Question | Answer | Consequence |
| --- | --- | --- |
| Next milestone | **Feel and balance**, not new features | Nothing new ships until the existing loop is proven. |
| How central are cards | **A light layer, roughly as now** | The fusion/deckbuilding meta is off the table. Three or four abilities a side, and they stay a garnish on gold and walls. |
| Ambition | **Hobby project, release not excluded** | No store work now, but nothing gets built in a way that would have to be undone to release. See *Guardrails*. |

The card decision is the significant one: it retires what was milestone 4, a
combination mechanic with deckbuilding as progression. That was the original
pitch for the game, and dropping it is a real narrowing — but a collection
system on top of a loop nobody has proven is fun would have been the most
expensive way to find that out.

---

## Milestone 6 — feel and balance

The whole of this milestone changes numbers, timing and presentation. It adds no
new verbs. Its purpose is to answer one question: **is this fun for ten minutes,
on a phone, without me explaining it?**

### 6.0 Capture what is already known — **done, first pass**

Five observations came back from playing it, and all five are fixed: the card
bar covered the cannon, hits had no visible numbers, battles ran long, the HUD
was too small, and the energy total could not be read. What that leaves is the
next round of notes — a 90-second battle is a different game from a 180-second
one, and the balance below is now guesswork against a clock nobody has played.

The standing rule, which holds for every round after this one: nothing else in
this milestone is worth starting before the notes from actually playing it are
written down — what was boring, what was unclear, what was frustrating, what felt
good. Every target below is a hypothesis derived from the code, and a played
opinion beats all of them.

**Done when** the observations are specific enough to act on — "sappers die
before they reach anything" rather than "attack feels weak".

### 6.1 Make runs reproducible — **done**

Seeded dice, battle-time timers and a fixed simulation step; see DESIGN.md for
why all three were needed rather than just the first. The seed shows on the
result screen and is settable with `?seed=`.

The plan as written here was wrong in a way worth recording: it assumed seeding
`Math.random` was enough. It is not. The simulation integrated on frame deltas,
so two runs of one seed diverged on frame timing alone — and that same effect
was quietly making a test fail on an unchanged tree.

### 6.2 Build the balance harness — **done**

`tests/sim.test.mjs` already drives the real game headless in Chromium, and
`tests/determinism.test.mjs` shows how to drive the simulation directly rather
than waiting on frames: 40 seconds of battle runs in a fraction of that. The same
machinery, pointed at a batch of runs instead of assertions, is the tool this
milestone actually needs — `tests/balance.mjs`, a report generator rather than a
pass/fail test.

- Five castle archetypes, each built to the same 900 gold, saved as `CastleSave`
  JSON: thin curtain, thick keep, iron shell, timber sprawl, arch fort.
- Run each against the defence-mode AI *n* times per seed batch.
- Report attacker win rate, median time to throne, blocks standing, gold unspent.
- A scripted attacker for offence mode — aim at the lowest reachable block using
  `ballistics.ts`, buy troops when affordable — so the offence side gets numbers
  too. It stands in for a competent player, not a good one.

`npm run balance`. Five archetypes plus a bare-throne control, each at the 900g
budget, through both modes across a batch of seeds. `SEEDS=12` for tighter
numbers.

The control earns its place: it proves the table discriminates rather than
being saturated. Everything dies, but the bare throne dies in 4 seconds and a
thin curtain takes 33, so the differences between rows are real.

One correctness note, because it nearly poisoned the first report: the load
guard originally read "is the throne present" *after* the battle, which made it
fire on every row the attacker won — that is, all of them. It snapshots before
the loop now.

### 6.3 Settle the numbers — **first pass done, one problem left**

First report, 6 seeds per matchup:

```
  archetype       spend  blocks | AI attacks: win  survived  standing | bot attacks: win   time
  bare throne        0       0 |            100%  17.8s        0% |             100%      4s
  thin curtain     900      60 |            100%  67.7s        2% |             100%   33.1s
  thick keep       825      55 |            100%  40.3s       63% |             100%   17.5s
  iron shell       855      19 |            100%  38.6s       80% |             100%     26s
  timber sprawl    900     180 |            100%  39.8s       37% |             100%   21.8s
  arch fort        900      60 |            100%  69.7s        0% |             100%   27.8s
```

**The attacker is far too strong.** Every castle falls to both attackers, every
time. The scripted bot — which only ever shoots the lowest block and buys a
troop when it can — wins in 17 to 33 seconds of a 90-second battle. It plays no
cards and does not aim. That is the headline, and it is bigger than any of the
four hypotheses this section used to hold.

Read the defence column as a floor, not the real experience: those runs play no
cards at all. The offence column is the damning one, because that *is* the
player's role.

What the table falsified:

1. **Iron is not dominant — it is second worst.** The iron shell survives 38.6s
   against the thin curtain's 67.7s. At 45g you can only afford 19 blocks, which
   is not enough to cover the approach. Iron's problem is the price, not the
   resistances.
2. **Spread beats mass, and the reason is the collapse model.** A tall thin
   screen loses its bottom block, the eleven blocks above lose support, and the
   rubble lands *in the breach* — the wall partly reheals itself. The thick keep
   has no such trick and dies in 40s with 63% of it still standing.
3. **Depth in front of the throne is the only thing that matters.** The throne
   is fixed at the bottom row, so every attacker bores horizontally along the
   ground to reach it. Height and mass above that line are wasted, which is why
   the thick keep can lose with most of itself intact.

That third finding is a design problem, not a tuning one. Support bases are the
answer to the half of it about dead space behind the throne — see DESIGN.md.

#### After bases and a tuning pass

```
  archetype       spend  blocks | AI attacks: win  survived  standing  bases | bot attacks: win   time
  bare throne        0       0 |            100%  29.8s        0%      - |             100%   10.4s
  thin curtain     900      60 |             50%  86.8s        2%      - |               0%      -s
  thick keep       825      55 |            100%  39.1s       73%      - |             100%   26.8s
  iron shell       855      19 |            100%  40.6s       85%      - |             100%   58.6s
  timber sprawl    900     180 |            100%  39.8s       51%      - |             100%   28.5s
  arch fort        900      60 |            100%  89.3s        0%      - |               0%      -s
  bases clustered  660      47 |              0%     -s        4%    0/3 |               0%      -s
  bases spread     660      47 |             25%  88.5s        4%    1/3 |               0%      -s
```

Changed: stone 110→150 hp, timber 40→55, iron 45→32g and 260→300 hp, throne
200→380 hp, income 13→10/s, shot 15→18g, player shot 62→42 damage, AI 62→42 and
110→75, AI reload tightened.

The archetypes now differentiate instead of all reading 100%, and spreading the
bases keeps one more of them than clustering. But **the split is between spread
and compact, not between good and bad**, and that is the problem left:

- Spread castles (thin curtain, arch fort, both base rows) hold against the dumb
  bot every time.
- Compact ones (thick keep, iron shell, timber sprawl) fall every time.

Horizontal depth in front of the throne is still the only thing that really
counts. Bases give the rear a purpose, but they do not change what wins.

Two honest caveats on the table above. The defence column plays **no cards**, so
it is a floor. And my archetypes conflate *compact* with *shallow* — the "thick
keep" spans columns 31–38, which is only four columns in front of the throne, so
it is testing depth as much as it is testing thickness. A fair comparison would
hold depth constant, and that is the next thing to fix in the harness.

### 6.4 Phone legibility and touch targets — **done**

Framing is solved; size is not. On a 390×844 phone one world pixel is 0.65 CSS
pixels, which made the HUD:

| Element | Was | On screen | Now | On screen |
| --- | --- | --- | --- | --- |
| Card blurb | 11 px | 7.2 px | 18 px | 11.7 px |
| Status text | 15 px | 9.8 px | 21 px | 13.7 px |
| Gold / timer | 18 px | 11.7 px | 24 px | 15.6 px |
| `hudButton` | 150×34 | 97×22 | 196×56 | 127×36 |
| Card | 136×92 | 88×60 | 210×114 | 137×74 |

Buttons still sit under the 44 pt guideline at 36: the top bar is the scarcest
space in a 600px-tall world. It is a judgement, not an oversight.

`src/ui/layout.ts` now holds the sizes and the reasoning, replacing the magic
numbers the three HUDs each carried. `tests/viewport.test.mjs` asserts the 18px
floor in both battle modes, so a future tweak cannot quietly reintroduce
8-pixel text.

`BuildScene` is on the same layout now too. Left undone: the scale does not
respond to screen size — a tablet gets the same sizes as a phone, which is fine
but not optimal.

### 6.5 Legible to a six-year-old — **done for now**

Symbols on every card, build material and troop button, plus the
dawn-to-midnight sky (see DESIGN.md). All of it moves meaning out of words and
numbers.

Still word-only:

- **Win and lose**, which are a sentence on the result screen.

`maxSpan` used to be on this list — how far a material can cantilever, the
number that actually decides a castle, and invisible. It is now drawn on every
block in the build phase as a headroom bar rather than a digit; see DESIGN.md.

### 6.5b Build phase you can experiment in — **done**

Three changes, all in the builder, all aimed at the same thing: making the
structure rule discoverable instead of enforced.

- **Span headroom bars** on every block — green, amber, red as a block
  approaches its material's reach. This is the "stress view" 6.7 listed as a
  debug tool; it turned out to be a build-phase tool.
- **Undo** one placement or one erase, restoring orphaned blocks and their gold.
  Erasing was the destructive one — a pillar took its whole tower with it.
- **A sparkle and a word** when a placed block reaches 2 or more cells out, so a
  successful overhang gets noticed rather than merely allowed.

### 6.5c Playable at five — **first pass done**

A five-year-old ran out of clock. The obvious fix — a longer battle — turned out
to be wrong in a way only measuring showed: in defence the clock *is* the win
condition, and stretching it makes that mode strictly harder, not easier. The
numbers and the reasoning are in DESIGN.md.

What shipped instead:

- **Knock It Down**, a sandbox with no clock, no gold and no opponent. The
  rebuild button is the loop.
- **Support buildings are restricted to behind the throne**, for every player,
  because leaving them free had a dominant answer that made the rear space
  pointless — which is the thing bases were added to fix.
- **A one-tap Supports preset** that places whichever bases are missing, spread
  across the rear zone.

Still open, and the reason this is a first pass: a **difficulty tier** for the
two real modes. It cannot be a time slider — it needs different numbers per
mode, longer clock and cheaper shots when attacking, slower AI and wider scatter
when defending. Worth doing only after watching someone small actually play the
sandbox, because the sandbox may turn out to be the whole answer.

### 6.6 Sound — **done**

Eighteen voices, all synthesized with the Web Audio API rather than loaded:
cannon fire, a distinct impact per material, the throne's own gong, a rumble
for a collapse, rubble, melee, the two base passives, a card whoosh, an income
plink, build-phase taps, and three endings. `src/core/audio.ts`, with the
reasoning; `ASSETS.md` now exists and records that the game ships no asset
files at all.

Not through Phaser's sound manager, as this section originally assumed — that
is a player for loaded files and there is nothing to load. The engine talks to
Web Audio directly.

Three things worth carrying forward:

- **Voice management is the whole problem.** A shell landing in a wall damages
  a dozen blocks; a collapsing tower lands a dozen pieces of rubble. Played
  faithfully each of those is a burst that reads as a glitch. A per-sound
  minimum gap, measured in real milliseconds, collapses them — and folds the
  fixed timestep's catch-up bursts along with them.
- **A blast plays one material, not all of them.** Whichever took the most
  damage, except that the throne always wins. One sound means one event.
- **Audio must not be able to change the battle.** It draws only from
  `Math.random`, and nothing in the simulation reads it back.
  `tests/determinism.test.mjs` now runs the same seed silent and loud and
  requires the two battles to be identical block for block.

Left undone: no music, and no mute control inside a battle — the toggle is on
the menu, builder and result screens, because the battle top bar is already
over its touch-target budget and a phone's volume switch is faster anyway.

### 6.7 Impact polish — **mostly done**

Hit stop, camera punch, an escalating word on a four-block event, and dust on
every landing sized by the fall. Debris tumbles on the way down. See DESIGN.md
for why the freeze is safe and where it has to live.

Still open from the original list:

- **Cracks at hitpoint thresholds** rather than the current smooth tint, so
  damage reads at a glance instead of on inspection.

### 6.7 Impact polish — original list

Camera shake already scales with damage in `BattleScene`, and blocks tint as
their hitpoints fall, so this is a short list rather than a system:

- Dust when debris lands, sized by how far it fell.
- A brief hit stop on a large collapse — the pause is what sells the weight.
- Cracks at hitpoint thresholds rather than a smooth tint, so damage reads at a
  glance instead of on inspection.
- A camera punch and a brief hit stop on a large collapse, plus a floating
  "CRASH!" when one hit takes four or more blocks. Both must live in the draw
  half of the loop, never in `step()` — a hit stop inside the fixed step would
  desynchronise the seed and silently invalidate the balance harness.

The stress view this section used to list is done and shipped in the builder;
see 6.5b. The note about where a hit stop may live turned out to be exactly
right and is now enforced by a test.

---

## Milestone 7 — campaign

Handcrafted levels alternating attack and defence, with per-level budgets, fixed
decks and star ratings. Level data is the same `CastleSave` format the builder
already emits, so authoring a level means building one and saving it.

This is what gives the game a shape and a reason to open it twice. It is second
because levels tuned against unbalanced numbers would have to be retuned.

## Milestone 8 — Android

Capacitor wrap of `dist/`. The build emits relative paths, input is
pointer-based, and the screen fit removes the need for a landscape lock, so this
is mostly packaging plus whatever 6.4 leaves behind. Worth doing once there is
something worth installing.

## Ongoing — cards stay light

No fusion, no collection, no deckbuilding. If a battle wants more texture, that
is at most one or two more abilities a side, each of which has to earn its place
against the ones already there. The `CardEngine` supports this without changes.

---

## Guardrails

A hobby project that might one day be released is not the same as one that never
will. These cost nothing now and are expensive to retrofit:

- **Asset provenance.** Every sound, font and image is CC0, self-authored, or
  explicitly licensed for commercial use, and `ASSETS.md` records which and from
  where — written as assets land, not reconstructed later. This is the only item
  here that is genuinely painful to fix after the fact.
- **Save format stays versioned.** `CastleSave` already carries a version.
  Campaign levels will use the same format, so a migration path has to keep
  existing castles loadable.
- **No backend.** Nothing that needs a server, an account or a network call. The
  game runs on a plane, and staying that way keeps release a packaging problem
  rather than an operations one.
- **The Phaser input hook.** `src/core/viewport.ts` overrides
  `InputManager.transformPointer`, which is not a supported extension point. Any
  Phaser upgrade runs `npm run test:sim` before it is believed.

## Deliberately not doing

Accounts, servers, PvP, castle sharing codes, procedural level generation, and
the card fusion meta. All of them can be layered onto the existing save format
later; none of them makes the current game better.
