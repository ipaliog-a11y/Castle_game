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

### 6.1 Make runs reproducible

`Math.random()` is called directly in the card shuffle and in the AI's aim
spread, so no two battles are alike and none can be replayed. That blocks
balance work outright: you cannot tell a tuning change from noise.

- `src/core/rng.ts` — a small seeded PRNG.
- Thread it through `CardEngine` and `DefendScene`'s targeting.
- Seed settable from a URL parameter so a specific battle can be handed to
  someone else, or to a test.

**Done when** the same seed produces the same battle twice, verified by a test
that runs a fixed seed to completion and compares the outcome.

### 6.2 Build the balance harness

`tests/sim.test.mjs` already drives the real game headless in Chromium. The same
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

**Done when** one command prints a table you can read a balance decision off.

### 6.3 Settle the numbers

Four standing hypotheses, in the order I would test them:

1. **Iron is probably the correct answer to everything.** At 45g it has 260 hp,
   takes 0.55× from blast and 0.3× from melee, and cantilevers 5 cells. If the
   iron shell beats the stone keep on equal budget by a wide margin, the cost or
   the resistances are wrong — not both at once.
2. **The 90-second clock has never met a good castle.** The battle was halved on
   play feedback and everything timed against it was rescaled by hand — income,
   energy regen, AI reloads, wave spacing. Those multipliers are arithmetic, not
   evidence. If the best archetype finishes with most of its blocks standing,
   ramp the AI harder rather than lengthening the clock again.
3. **The gold cap is the lever, not the income.** 13/s against a 260 cap and a
   15g shot on a 900 ms cooldown: sustained fire is gold-limited, and the cap is
   deliberately a little over one magazine so banking cannot replace playing.
   Check whether saving up and bursting still beats spending as you go.
4. **The march is about seven seconds** — a twelfth of the battle now, against a
   twentieth before. It is the cannon's window, but it is the first thing to
   shorten if the middle of a battle drags.

Numbers live in `src/core/materials.ts` and `src/core/units.ts` and are meant to
be edited. **Done when** each hypothesis is either confirmed and fixed, or
recorded as measured and fine.

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

Left undone: `BuildScene` still positions its palette with literals, and the
scale does not yet respond to screen size — a tablet gets the same sizes as a
phone, which is fine but not optimal.

### 6.5 Sound

There is no audio at all, which is the single largest gap in how the game feels.
A collapse you hear is worth more than a collapse rendered better.

Cannon fire, ball impact on each material, a wall giving way, melee, the throne
falling, victory and defeat. Web Audio through Phaser's sound manager.

Source everything CC0 or synthesize it, and record provenance in `ASSETS.md` as
it lands — see *Guardrails*.

### 6.6 Impact polish

Camera shake already scales with damage in `BattleScene`, and blocks tint as
their hitpoints fall, so this is a short list rather than a system:

- Dust when debris lands, sized by how far it fell.
- A brief hit stop on a large collapse — the pause is what sells the weight.
- Cracks at hitpoint thresholds rather than a smooth tint, so damage reads at a
  glance instead of on inspection.
- A stress view during the build phase, drawing each block's span headroom. It
  is the debug view for the solver and probably also a real build-phase tool:
  the model's most interesting number is currently invisible.

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
