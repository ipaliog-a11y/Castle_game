# Siege & Stone

A 2D side-on castle game with two modes: build a fortress, then tear it down.

- **Defence** — spend a gold budget on timber, stone and iron to fortify the throne.
- **Offence** — besiege that same castle with cannon fire and troops.

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

**Siege** — drag anywhere to aim the cannon and release to fire; the dotted arc
previews the shot and the ring shows power. Buy knights and sappers from the top
bar. Play ability cards from the hand at the bottom left as energy allows —
targeted cards arm first, then resolve where you tap. Destroy the throne before
the timer runs out.

## Tests

```bash
npm test             # structural solver: support, cantilever, collapse, save round-trip
npm run test:sim     # full in-browser playthrough (needs `npm run dev` running)
```

`test:sim` drives the real game in Chromium and asserts on live simulation
state — unit pathing, collapse behaviour, the gold and cooldown economy, card
effects, and both win conditions. It writes screenshots to `tests/screenshots/`.
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
src/core/     castle grid + support solver, materials, units, cards, save format
src/scenes/   Menu, Build, Siege, Result
src/ui/       castle renderer, card bar, shared theme
tests/        solver tests and the browser playthrough
```

The structural model is in `src/core/castle.ts` — that file is the heart of the
game and the place to start reading.
