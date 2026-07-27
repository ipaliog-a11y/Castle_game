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

## Showing the solver its own working

`maxSpan` is the number that decides a castle, and until now it was invisible.
The builder enforced it — a block that would float was simply refused — but a
refusal teaches you where the edge is only by hitting it, one cell at a time,
with no sense of how much reach was left before you got there.

The solver already computed the answer and threw it away. `computeSupported()`
was a wrapper over a span relaxation that knew, for every block, how far
sideways it had reached to find the ground; it collapsed that to a boolean on
the way out. `computeSpans()` now returns the numbers and `computeSupported()`
derives the set from them, so there is still one solver and no chance of the
display disagreeing with the physics.

`spanHeadroom(col, row, spans)` turns that into what a builder wants to know:
`maxSpan - used`, how many *more* cells this block could reach. `CastleView`
draws it during the build phase as a bar along each block's base — green at 2 or
more, amber at 1, red at 0 — so an arch shows you it is running out of reach
before it refuses the next block. A block with no support chain returns −1 and
draws nothing, which cannot happen in the builder but can mid-collapse.

Two deliberate limits. The bar is build-phase only: during a battle it would
read as a hitpoint meter, and there is already tinting for that. And it is
per-block reach, not a global stress model — nothing here simulates load, only
distance from the ground, because that is all the collapse rule uses.

**Undo** is the other half of the same idea. Placing was already reversible by
erasing, but erasing was not: erase a pillar and the eleven blocks it held
vanished with it, refunded but gone. `BuildScene` keeps a history of what each
action placed and what it removed, so undo re-places the removed blocks
bottom-up — the order matters, since the solver rejects a block whose support
has not been put back yet — and refunds or re-charges to match. Being able to
take back a mistake cheaply is what makes experimenting with overhangs
reasonable, and the sparkle on a 2-cell-plus cantilever is there to suggest
that overhangs are the point.

## What the game sounds like

Eighteen voices, none of them a file. `src/core/audio.ts` builds each one out of
two primitives — a burst of filtered noise and a pitched tone with an envelope —
which is enough vocabulary for the whole pack. `ASSETS.md` covers why nothing is
sampled.

The design problem was not "what should a wall sound like". It was **how many
sounds a single event is allowed to make**. A cannonball landing in a wall
damages every block within its radius; a tower going over lands a dozen pieces
of rubble inside a second; six knights swing at roughly the same moment. Played
faithfully, each of those is a burst of noise that reads as a glitch rather than
as an event.

Three rules came out of that, and together they are most of the module:

- **A minimum gap per sound**, in real milliseconds. Two impacts 20ms apart
  become one. This is also what makes the fixed timestep safe: `update` can run
  fifteen simulation steps in one frame after a stall, and a real-time throttle
  folds that whole burst into a single play.
- **A blast plays one material.** Whichever absorbed the most damage — except
  the throne, which always wins, because it is the thing the battle is about.
  One sound means one thing happened.
- **Scale, do not multiply.** A bigger collapse is the same rumble louder, and
  rubble is pitched by how far it fell. Intensity is a parameter, not a count.

Two constraints the module has to honour, both of them about not disturbing
things that already work:

1. **It never touches the battle's dice.** Variation uses `Math.random`, exactly
   as `BattleScene.burst` does. Drawing from the seeded stream would mean adding
   a noise silently changed the outcome of every seeded battle.
2. **Nothing reads it back.** A muted battle and a loud one are the same battle,
   which is what lets the balance harness run with sound off and still produce
   numbers that describe the real game. `tests/determinism.test.mjs` runs one
   seed twice — once silent, once with audio genuinely running — and requires
   the two to match block for block.

The endings are keyed on whether *the player* won, not on what happened to the
throne: a fanfare for bringing it down, a settled chime for holding, and a soft
two-note fall for losing. Losing is deliberately gentle. A harsh buzzer is the
sound a six-year-old stops playing to, and the thing this game wants next is
another go.

## Knock it down — the sandbox

No clock, no gold, no opponent, no win condition. Your castle, a cannon, and
unlimited shots.

It exists because the collapse model is the actual toy and every other mode
wraps it in scaffolding — an economy, a timer, a thing to lose — that a young
player has to get through before reaching the good part.

The decision came out of measuring rather than guessing, and the measurement
changed the answer. The obvious fix for "90 seconds is not enough for a
five-year-old" is a longer clock, and on the same castle across four seeds that
makes things **worse**:

| clock | throne fell | median time |
| --- | --- | --- |
| 90s (normal) | 3/4 | 81s |
| 180s | 4/4 | 108s |
| 300s | 4/4 | 126s |
| no clock, AI pinned at its opening difficulty | 4/4 | 168s |

Two things fall out of that. In **defence** the clock *is* the win condition —
"survive to the bell" is the only way to win — so removing it does not make a
gentler mode, it deletes the win. And lengthening it does not help either,
because `pressure()` is normalised to progress through the battle: a 180-second
siege is the same difficulty curve stretched over twice as many AI shots. Only
in **offence** is the clock a genuine barrier, and there it is decisive — the
scripted bot wins 0/4 at 90 seconds and 4/4 with no clock, taking 194s.

So there was no single number to loosen. The sandbox takes the scaffolding away
instead.

Three things it needs that a battle does not:

- **A rebuild button**, which is not a convenience but the loop. Without it you
  knock the castle down once and the toy is over. `resetCastle()` reloads the
  saved castle and clears the field while reusing the sky, effects layers and
  floater pool — going back through `bootBattle` would allocate a scene's worth
  of Phaser objects every time a child got bored.
- **Harder shots.** The siege's 42 damage is balanced against gold and a clock;
  four hits per stone block is a *cost*, and paying it is the game. With nothing
  to balance against, that same number is four taps before anything visible
  happens. 92 breaks stone in two and timber in one.
- **A looping sky.** Everywhere else the dawn-to-midnight cycle *is* the clock,
  so with no clock it would stick at midnight forever.

The counter reads **blocks smashed**, cumulative, and that distinction matters:
rubble which survives a fall is re-placed as a real block, so counting what is
*missing* reads near zero while a wall is being pounded into a heap. Writing the
test for it turned up a genuine bug — debris landing on a weakened block can
destroy it, and that was the one kill in the game nothing counted.

## Where the support buildings go

Strictly behind the throne, for everyone.

Bases were added to give the ground behind the throne a purpose. Left
unrestricted they did the opposite: the safest cell for a base is the one
immediately in *front* of the throne, where the player's entire wall shields it,
so the dominant play was to tuck all three there and leave the rear exactly as
dead as before. A choice with one right answer is not a choice.

The rule is enforced when a block is placed, not when a castle is loaded. A save
made before it existed keeps its bases wherever they are — deleting part of
somebody's castle to enforce a balance rule is a worse trade than letting an old
castle keep a small advantage.

**Supports**, the one-tap preset, is the younger-player half of the same
feature. Noticing the shaded ground, picking three separate symbols and placing
each one is a step too many at five; this is that sequence on one button, and
because bases cost nothing there is no budget question hiding inside it. It
spreads before it fills — outer columns first, middle last — so two bases only
end up adjacent when the third has nowhere else to be. That is row-major
scanning across the zone rather than column-major, and getting it the wrong way
round stacked all three in a tower where one wide blast took the lot.

## Current state — milestones 1 and 2

Playable end to end in both directions: build a castle, then either besiege it
yourself or hold it against an AI besieger.

**Build phase**
- Timber / stone / iron palette with per-material cost, hitpoints and span
- 900 gold budget, full refund on erase
- Placement is rejected if the block would float, using the same solver the
  siege uses — so you cannot build something the physics will not honour
- Erasing a block auto-removes and refunds anything it orphaned
- **Every block wears its span headroom** as a small bar along its base: green
  with room to spare, amber one cell from the limit, red at it. See *Showing the
  solver its own working* below
- **Undo** steps back one placement or one erase, restoring orphaned blocks and
  the gold with them
- The throne is fixed and cannot be erased; build around it
- Castle persists to `localStorage`

**Offence (laying siege) — milestone 1**
- **Touch where you want to hit.** The finger is the shot's *target*, not a
  direction: the launch is solved with the same `ballistics.ts` the attacker AI
  uses, so the shell lands where you pointed and dragging micro-adjusts it. The
  preview rings the point it will actually reach, which is not always the point
  you chose — a wall in the way is the interesting case
- Gold economy: shots cost 18, knights 40, sappers 70, income ticks up
- Knights and sappers march, step over single-cell ledges, and hack at walls
  they cannot climb. Sappers hit far harder but die to their own collapses
- Blast damage with radial falloff and per-material blast/melee resistances —
  stone shrugs off swords, timber does not; iron shrugs off cannon fire
- Four offence cards on an energy economy with draw/discard/reshuffle
- Win by destroying the throne; lose when the 90-second clock runs out

**Defence (holding the keep) — milestone 2**
- An AI besieges the castle you built while you hold it with the defence deck
- Every AI shot is **telegraphed** by a shrinking crosshair before it flies,
  which is what turns Masons and Boiling Oil into reactions rather than guesses
- Difficulty ramps with a pressure value that runs 0 → 1 across the battle: the
  AI reloads faster, aims tighter, sends bigger waves and lobs heavier shot
- Win by surviving the timer; lose the moment the throne falls — the inverse of
  the siege, resolved from the same battle outcome

**Reading the battle without reading**

The game should make sense to a six-year-old, which rules out anything whose
meaning lives only in a word or a number.

- Everything the player picks from leads with a **drawn symbol**: cards (linked
  shot, a powder keg, a banner, a shield, a cauldron), build materials (planks,
  a staggered brick bond, a riveted plate), the erase tool, and the two troop
  types (a plumed helm, a pickaxe). Cards put the cost directly beneath, so the
  left edge answers "what is it, and can I afford it" without a name being read.
  They are vector, not art files: nothing to license, nothing to ship, and sharp
  at any zoom. A core test asserts every card, material and troop has one — and
  that the check itself can still fail — so nothing quietly falls back to a
  plain disc.
- The battle runs **dawn to midnight**. The sun rises as the fight is declared,
  crosses, and sets exactly at the halfway mark; the moon carries the second
  half. The sky is therefore the clock: a player who cannot yet read `1:29` can
  see that the sun is going down. `SkyView` takes the same 0..1 progress value
  that drives the attacker AI's difficulty ramp, so the assault peaks in the
  dark rather than merely near it.

Two placement details are load-bearing rather than decorative. The celestial arc
does not run edge to edge — the card column owns the left 250px, and a sun
rising at x=0 would spend the first nine seconds behind the HUD, which is the
one moment the whole idea rests on. Its peak stops short of the top for the same
reason: higher, and the moon sat on the hint text.

**Reading the battle**
- Every hit floats the damage it actually did, after the target material's
  resistance, and the count of blocks it brought down. One number per impact,
  not one per block: a shell landing in a wall hits everything in its radius,
  and a dozen numbers racing each other tells you less than a total
- Shells and the aim arc draw *above* the HUD. Losing sight of a shot mid-flight
  turns aiming into guesswork, so nothing is allowed to cover one
- Pointing past the gun's reach does not kill the control: the aim point walks
  back along the line until something is reachable, and the arc turns red to
  say so

**Support bases — where the castle's own space earns its keep**

Each defence card needs a building standing in your castle: a mason's yard for
Masons, an oil vat for Boiling Oil, a bastion for Reinforce. Build it and you
hold the card; lose it mid-battle and the card is struck from your hand and your
deck for good.

This exists to answer a real flaw. The build zone runs to column 38 but the
throne sits at 35, so anything placed behind the throne could never be on the
attacker's path — it was simply dead space, and the correct play was to shove
everything forward. A mason's yard back there is worth a detour, and the moment
the attacker has a reason to go somewhere, the ground on the way is worth
fighting over.

It gives the defender two decisions where there was none:

- **Which cards do you even want?** No yard, no Masons. That makes the deck a
  build decision without any of the collection meta that was retired.
- **Cluster or spread?** Together at the back they are deep, but one breach that
  reaches them takes all three. Apart, each is shallower but a breach costs one
  card rather than the hand.

Bases cost no gold — where they go is the decision, not whether you can afford
them — and two of the three do a little of their card's job unprompted, so they
still matter in a siege where nobody is holding cards. The attacker AI targets
them deliberately; without that, nothing would ever attack one and the choice
would never be tested.

The block on the field, the button in the palette and the card in your hand all
wear the same drawn symbol. That shared glyph is the whole explanation: the
cauldron blows up, the cauldron in your hand goes with it.

A castle saved before this existed has no bases at all, and is given the full
deck rather than an empty hand.

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

### One step, and one source of dice

A battle is reproducible: the same seed replays the same battle, block for block
and hitpoint for hitpoint. That is not a nicety — it is the precondition for
tuning anything, because without it a balance change cannot be told from noise.

Three things had to be true, and only the first is obvious:

- **All gameplay dice come from one seeded generator** (`src/core/rng.ts`).
  Note that `Phaser.Math.Between` and `FloatBetween` call `Math.random()`
  internally, so they cannot be seeded — they had to be replaced, not
  configured.
- **Nothing gameplay-relevant runs on the wall clock.** The wave stagger used
  `time.delayedCall`, so the same seed spawned troops at different moments; it
  is queued against battle time now.
- **The simulation advances in fixed slices**, `STEP_MS = 1000/60`, accumulated
  across frames rather than stepping by whatever the last frame took. This is
  the one that is easy to miss: with a variable `dt`, Euler integration gives
  different trajectories at 30fps than at 60, so two runs of one seed diverge no
  matter how careful the dice are. It also means a phone dropping frames now
  gets the *same physics* as a desktop rather than merely a slower version —
  before this, a wall that held on one device could fall on another.

Catch-up is capped at 250ms per frame, so a backgrounded tab loses that time
rather than running thousands of steps at once when it returns.

Cosmetic randomness — particle bursts — deliberately stays on `Math.random`. If
it drew from the seeded stream, adding a puff of smoke would shift every later
roll and silently change the outcome of every battle.

The seed is shown on the result screen and settable with `?seed=`, so a battle
worth arguing about can be handed back and replayed exactly.
`tests/determinism.test.mjs` runs one seed twice in defence mode — where the
human contributes nothing — and asserts the two battles are identical, plus that
a *different* seed produces a different battle, which is what catches a seed
being silently ignored.

### One clock, not two

Everything with a duration — reloads, telegraphs, rally, reinforce, status
messages — is timed against `elapsed`, the battle time accumulated from frame
deltas, never `this.time.now`. Mixing the two was a real bug found in testing:
game time ran at roughly a third of wall clock under headless rendering, which
would have quietly shrunk the telegraph warning window relative to the battle on
exactly the weak devices that drop frames.

## Where the HUD is allowed to be

The battlefield is crowded, and the HUD had been placed without regard for it:

```
  x 0                                                            1280
    ├─ cannon ─┤                                ├──── castle ────────┤
    0        150                              640                  1248
```

The cannon owns the bottom left, the castle owns the right, and troops march
along the ground between them. A hand of cards along the bottom sat directly on
top of the gun — you could not see the thing you were aiming. Moving it into the
sky was no better, because that is where the shot arc lives.

What is left is the left *column*: above the cannon, clear of the castle, and
above the heads of marching troops. So the hand is vertical, and it stops short
of the gun — not of the carriage, but of the muzzle at full elevation, which is
the part you read when you aim. `assertCardBarClearsCannon` fails at boot rather
than letting a taller card or a fourth slot quietly cover the barrel again.

Sizes are in `src/ui/layout.ts` and are chosen against the phone, not the
desktop. Fitted to a 390px screen a world pixel is about **0.65 CSS pixels**, so
the old 13px HUD text rendered at 8.5 — a smudge. The floor is now 18 world
pixels, about 12 on screen, asserted by `tests/viewport.test.mjs` so a future
tweak cannot quietly reintroduce it.

## Fitting a landscape world onto a phone

The world is a fixed 1280×600 — 2.13:1, near enough to a phone held sideways.
Two things then go wrong on mobile, and neither shows up on a desktop browser.

**The visible area is not what CSS thinks it is.** Mobile browsers report a
layout viewport that ignores the collapsing address bar, so a canvas sized from
`height: 100%` can be measured against a box that is not entirely on screen.
`src/core/viewport.ts` takes the size from `visualViewport` instead — the only
value that describes what the player can actually see — and re-applies it on
every resize, rotation and toolbar animation.

**A landscape world in a portrait screen is mostly letterbox.** Fitting 2.13:1
into a phone held upright filled about a fifth of the display. The usual answer
is a "please rotate your device" card, which does nothing whatsoever for the
many people who play with rotation lock on. So the stage itself is rotated a
quarter turn: portrait fills the screen with the same picture, sideways, and if
rotation lock is off the browser reports landscape, the turn is dropped, and the
result is identical. Measured coverage went from 22% to 99% on a 390×844 screen,
and from 33% to 67% on a tablet.

The cost is two pieces of plumbing:

- The Scale Manager measures its parent with `getBoundingClientRect`, which
  reports a rotated element's *bounding box* — width and height swapped. Its FIT
  mode cannot survive that, so the game runs on `Phaser.Scale.NONE` and the zoom
  is computed alongside the rotation.
- Pointer coordinates have to be un-rotated. `transformX`/`transformY` map one
  axis each and cannot express a rotation, so the hook is one level up, at
  `InputManager.transformPointer`, which receives both. It is handed the page
  position the pointer *would* have had with the stage upright, so Phaser's own
  smoothing and pointer history are untouched.

That override is the fragile part — it reaches into Phaser rather than sitting
on a documented extension point — so `tests/viewport.test.mjs` taps and drags
real screen pixels in a rotated portrait viewport and asserts the game reacted,
rather than checking the arithmetic. A Phaser upgrade that moves the hook fails
those tests loudly.

## Roadmap

Forward plan lives in [ROADMAP.md](ROADMAP.md), so there is one place to change
when priorities move. In short: feel and balance next, then a campaign, then
Android. Cards stay a light layer — the fusion and deckbuilding meta that was
milestone 4 has been retired.

## Balance notes

Numbers live in `src/core/materials.ts` and `src/core/units.ts` and are meant to
be edited. Current tuning is a first pass, not a balanced game.

A battle is **90 seconds**. It was three minutes, and the middle was waiting:
the economy paid out faster than it could be spent and the AI's ramp crawled.
Halving the clock meant rescaling everything measured against it — gold income
roughly doubled, the gold cap came *down* so banking cannot replace playing,
card energy regen roughly doubled, and the AI's reloads and wave spacing
tightened. Those are arithmetic, not evidence: `SIEGE_DURATION_MS` cannot be
changed on its own without walking the same list again.

Known soft spots:

- Iron is very strong against cannon fire (0.55×) and melee (0.3×); at 45g it
  may simply be the correct answer everywhere once you can afford it.
- The march across open ground takes roughly 7 seconds — a twelfth of the battle
  now rather than a twentieth. Deliberate time for the cannon to work, but the
  first thing to shorten if it drags.
- No archetype has been tested against the shorter clock. Whether 90 seconds is
  long enough to break a good castle, or short enough to make defence a
  formality, is unmeasured — see the balance harness in ROADMAP.md.
