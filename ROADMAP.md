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

### 6.2 Build the balance harness — **done**, with one correction

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

Two correctness notes, both of which poisoned a report before being caught.

The load guard originally read "is the throne present" *after* the battle, which
made it fire on every row the attacker won — that is, all of them. It snapshots
before the loop now.

And the harness kept its own copy of the material prices, which drifted: iron
was still listed at 45 long after it was cut to 32, so the iron archetype was
built to a budget the game does not charge and under-spent by a third while
printing as if it had not. It reads `materials.ts` now. A report whose whole job
is to catch balance drift must not have any of its own — see 6.3 for the two
conclusions this cost.

### 6.3 Settle the numbers — **harness settled, one decision left**

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

**Two conclusions drawn from this table were wrong, and the harness was why.**
Kept here because the mistake is the useful part: every archetype was a fixed
pattern at a different place on the field, so material, shape, depth and spend
all moved at once and any of them could be credited with the result. The iron
shell was the worst case — 19 blocks at columns 33–37, only two of them in front
of the throne, and priced from a stale copy of the cost table that still said
45g. It was a 608 gold castle printing as 855 and losing to depth, not to iron.

#### With frontage and budget held constant

Same twelve columns for every archetype, all in front of the throne, each filled
bottom-up until the 900 runs out. Prices now read from `materials.ts` rather
than a copy. A row of this table finally isolates the thing it is named after.

```
  archetype       spend  blocks | AI attacks: win  survived  standing  bases | bot attacks: win   time
  bare throne        0       0 |            100%  29.8s        0%      - |             100%   10.4s
  stone wall       900      60 |             75%  85.5s        2%      - |               0%      -s
  iron wall        896      28 |             50%    87s       31%      - |               0%      -s
  timber wall      900     180 |            100%  50.6s        0%      - |             100%   38.8s
  stone screens    900      60 |            100%  78.5s        0%      - |               0%      -s
  arch fort        855      57 |             25%  86.2s        2%      - |               0%      -s
  bases stacked    900      63 |             75%  85.7s        5%    0/3 |               0%      -s
  bases spread     900      63 |              0%     -s        5%    1/3 |               0%      -s
```

The first three rows are one footprint and one budget, differing only in
material. The next two are both stone on that same footprint, differing only in
arrangement. What that shows:

1. **Iron is the best material, not the second worst.** 50% against stone's 75%
   and timber's 100%, and it finishes with 31% of itself still standing where
   stone finishes with 2%. The earlier finding was an artifact of testing iron
   at a third of the frontage on a third less gold.
2. **Mass beats gaps.** Solid stone loses 75% of the time; the same gold as tall
   gapped screens loses every time. The old "spread beats mass" was comparing
   spread-and-deep against massed-and-shallow.
3. **Arches are the best structure found so far** — 25%, on 855 gold, and the
   only row that beats iron. Piers and lintels put material where the support
   solver rewards it instead of where mass feels reassuring.
4. **Spreading the bases still wins**, now within the three legal rear columns:
   stacked loses all three and the throne 75% of the time; spread along the
   ground keeps one and holds every time.

#### With an attacker worth measuring against

The offence column above was near-useless: the scripted attacker lost to
everything except timber, and it was impossible to tell whether that meant the
game was balanced or the bot was bad. It was the bot. Measuring where its gold
went settled it — one full battle against a plain stone wall, spending
everything on one thing:

```
  shots     1080g ->  2760 damage    2.56 per gold   45 blocks left
  knights   1080g ->  7419 damage    6.87 per gold   17 blocks left
  sappers   1050g ->  8216 damage    7.82 per gold    9 blocks left
```

**The cannon is the least gold-efficient tool in the game by a factor of
three**, and the old bot spent nearly everything on it. The rewritten one buys
troops as its damage engine, keeps the cannon for opening the ground path troops
walk in on, concentrates fire on the first column that actually blocks that path
rather than re-picking a target every frame, and plays its cards — which the old
one never did at all.

```
  archetype       spend  blocks | AI attacks: win  survived  standing  bases | bot attacks: win   time
  bare throne        0       0 |            100%  29.8s        0%      - |             100%      7s
  stone wall       900      60 |             75%  85.5s        2%      - |              50%     88s
  iron wall        896      28 |             50%    87s       31%      - |               0%      -s
  timber wall      900     180 |            100%  50.6s        0%      - |             100%     25s
  stone screens    900      60 |            100%  78.5s        0%      - |             100%   53.8s
  arch fort        855      57 |             25%  86.2s        2%      - |             100%     61s
  bases stacked    900      63 |             75%  85.7s        5%    0/3 |             100%   57.4s
  bases spread     900      63 |              0%     -s        5%    1/3 |             100%   57.4s
```

Both columns discriminate now, from seven seconds to never, and reading them
together says more than either alone:

1. **Iron is the strongest material, confirmed from both sides.** It is the one
   castle a competent attacker never breaks, and second-best against the AI.
   Two independent measurements agreeing is the first result here that has not
   later turned out to be a harness artifact.
2. **The arch fort is a trap.** Best in the game against the AI at 25%, and it
   falls every time to the bot. Piers and lintels stop lobbed shells and let
   troops walk straight through the gaps underneath — it is strong against the
   opponent that shoots and helpless against the one that walks.
3. **Mass beats gaps twice over.** Gapped screens fall to both attackers where
   solid stone survives half the time against each.

**The open question, and it is a real one:** the cannon is the game's whole
interface — the aiming, the arc preview, three difficulty modes — and it is the
worst thing to spend gold on. Three readings, and no way to choose between them
from a table:

- The cannon is underpowered and wants cheaper shots or harder hits.
- Troops are overpowered because nothing shoots back at them in offence mode.
- It is correct as designed: the cannon is for *precision* — undermining and
  opening a path — and troops are for grinding, which is a legitimate division
  of labour that the damage-per-gold number simply does not capture.

This one needs a played opinion rather than another run of the harness, and it
is the last thing standing between here and a settled milestone 6.

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

### 6.7 Impact polish — **done**

Hit stop, camera punch, an escalating word on a four-block event, dust on every
landing sized by the fall, debris that tumbles, and four discrete damage stages
carried by cracks rather than by a tint. See DESIGN.md for why the freeze is
safe and where it has to live.

### 6.8 Pause and options — **done**

- **Pause**, built on the same wall-clock trick as the hit stop, so it costs no
  battle time and the simulation cannot tell. Give up and Surrender moved inside
  it, which is where an irreversible action belongs.
- **An options panel**, shared with the pause menu. Sound moved into it and the
  standalone mute button went away.
- **Three aim modes** — easy, advanced, expert — chosen there and persisted.
  Advanced truncates the preview at mid-field; expert replaces tap-to-target
  with elevation and power sliders. The harder modes change what is *shown*,
  never the ballistics, and a test holds that line.

The settings module is deliberately small and validating: a value written by a
later version, or edited by hand, falls back to the default rather than putting
the game in a state it cannot draw.

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
