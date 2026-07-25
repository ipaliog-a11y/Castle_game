# Siege & Stone

A 2D side-on castle game with two modes: build a fortress, then tear it down.

- **Build** — spend a gold budget on timber, stone and iron to fortify the throne.
- **Defence** — hold that castle against an AI besieger using your defence cards.
- **Offence** — besiege the same castle yourself with cannon fire and troops.

Blocks have hitpoints, and anything that loses its support falls. Knock out a
pillar and the tower above it comes down; undermine a wall and it lands on your
own sappers.

See [DESIGN.md](DESIGN.md) for the design decisions, how the structural model
works, and the roadmap.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

Build for production:

```bash
npm run build        # typechecks, then emits dist/
npm run preview
```

## Playing

**Build phase** — pick a material, click or drag on the marked ground to place
blocks, and use Erase to take them back at full refund. Blocks that would float
are refused: each material can only overhang so far (timber 2 cells, stone 3,
iron 5), which is what makes arches and battlements a real decision. The throne
is fixed and must be built around. Hit **Begin Siege** when you are done.

**Hold the keep** (defence) — an AI besieges your castle. Every incoming shot is
marked by a shrinking red crosshair before it flies, so you can react: patch the
wall with Masons, scald the troops climbing it with Boiling Oil, or brace the
whole castle with Reinforce. The assault meter in the top right shows the AI
ramping up — it reloads faster, aims tighter and sends bigger waves as the clock
runs down. Survive to the final bell and the castle holds.

**On a phone** — hold it in landscape if you can. If your screen is upright the
whole game turns a quarter circle to fill it, so turn the phone clockwise to
read it; that also means rotation lock does not stop you playing. Browser
pinch-zoom is off on purpose — it fights drag-to-aim — but the picture already
fills the screen, so there is nothing off-frame to zoom towards.

**Lay siege** (offence) — drag anywhere to aim the cannon and release to fire;
the dotted arc previews the shot and the ring shows power. Buy knights and
sappers from the top bar. Play ability cards from the hand at the bottom left as
energy allows — targeted cards arm first, then resolve where you tap. Destroy
the throne before the timer runs out.

## Tests

```bash
npm test             # solver + ballistics maths, no browser needed
npm run test:sim     # full in-browser playthroughs (needs `npm run dev` running)
```

`npm test` covers the structural solver (support, cantilever limits, arch
stability, collapse, save round-trip) and the firing-solution maths, including
the ranges the cannon genuinely cannot reach.

`test:sim` drives the real game in Chromium and asserts on live simulation
state — unit pathing, collapse behaviour, the gold and cooldown economy, card
effects, the attacker AI, defence card effects, and the win conditions for both
sides. It writes screenshots to `tests/screenshots/`. It also covers the mobile
fit: that the canvas fills a phone screen in either orientation, and that taps
and drags land where they are aimed once the stage is rotated.
It needs a Chromium; either run `npx playwright install chromium` or point
`CHROMIUM_PATH` at an existing one.

## Deployment

Pushing to `main` runs `.github/workflows/deploy-pages.yml`, which typechecks,
runs the solver tests, builds, and force-pushes the contents of `dist/` to the
**`gh-pages`** branch. That branch holds build output only — never edit it by
hand, as every deploy replaces it wholesale.

For this to serve, **Settings → Pages → Source must be "Deploy from a branch"
with branch `gh-pages` and folder `/ (root)`.** Pointing Pages at `main` cannot
work: the repo root holds TypeScript source, and its `index.html` references
`/src/main.ts`, which a browser cannot execute without a bundler.

The site is served from a project subpath (`/Castle_game/`), which is why
`vite.config.ts` sets `base: './'` — all asset URLs stay relative.

## Layout

```
src/core/     castle grid + support solver, ballistics, materials, units, cards
src/scenes/   Menu, Build, BattleScene (shared sim), Defend, Siege, Result
src/ui/       castle renderer, card bar, shared theme
tests/        solver + ballistics tests, and the browser playthroughs
```

The structural model is in `src/core/castle.ts` — that file is the heart of the
game and the place to start reading. `src/scenes/BattleScene.ts` is next: both
battle modes run that one simulation, so a wall behaves identically whether the
AI is shooting at it or you are.
