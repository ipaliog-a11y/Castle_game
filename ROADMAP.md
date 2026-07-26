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

### 6.0 Capture what is already known

Nothing else in this milestone is worth starting before the notes from actually
playing it are written down: what was boring, what was unclear, what was
frustrating, what felt good. Every target below is a hypothesis I derived from
the code, and a played opinion beats all of them.

**Done when** the observations are in a file or an issue, specific enough to act
on — "sappers die before they reach anything" rather than "attack feels weak".

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
2. **The three-minute timer has never met a good castle.** If the best archetype
   finishes with most of its blocks standing, defence is a formality: ramp the
   AI harder rather than lengthening the clock, which only makes a won battle
   take longer.
3. **Gold banking may trivialise walls.** Income is 7/s against a 420 cap and a
   15g shot on a 900 ms cooldown, so sustained fire is gold-limited but a full
   bank is 28 shots held in reserve. Check whether saving up and bursting beats
   playing continuously; if it does, lower the cap rather than the income.
4. **The march is about nine seconds.** Deliberate — it is the cannon's window —
   but it is the first thing to shorten if the middle of a battle drags.

Numbers live in `src/core/materials.ts` and `src/core/units.ts` and are meant to
be edited. **Done when** each hypothesis is either confirmed and fixed, or
recorded as measured and fine.

### 6.4 Phone legibility and touch targets

Framing is solved; size is not. On a 390×844 phone one world pixel is 0.65 CSS
pixels, which makes the current HUD:

| Element | World | On screen | Verdict |
| --- | --- | --- | --- |
| Body text | 13 px | 8.5 px | Unreadable |
| Status text | 15 px | 9.8 px | Barely |
| Gold / timer | 18 px | 11.7 px | Tight |
| `hudButton` | 150×34 | 97×22 | Under the 44 pt touch guideline |
| Card | 136×92 | 88×60 | Fine as is |

The HUDs in `SiegeScene`, `DefendScene` and `BuildScene` position everything with
magic numbers, so this is a refactor before it is a fix:

- `src/ui/layout.ts` — a scale factor plus anchor helpers (top-left, top-right,
  bottom-left), replacing the literals.
- Floors: no text below 20 world px, nothing tappable below 68 world px tall.
- Bump the scale further on small screens once the anchors make that cheap.

**Done when** the viewport tests assert the floors, so a future HUD tweak cannot
quietly reintroduce 8-pixel text.

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
