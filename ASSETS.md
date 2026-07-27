# Assets

The *Asset provenance* guardrail in [ROADMAP.md](ROADMAP.md) says every sound,
font and image has to be CC0, self-authored, or explicitly licensed for
commercial use, and that this file records which and from where — written as
things land rather than reconstructed later.

**The game ships no asset files.** Not as a matter of principle to begin with;
it just kept turning out that generating a thing was cheaper than sourcing one,
and after three of those in a row it became the rule.

| What | Where it comes from | Licence |
| --- | --- | --- |
| Card, material, troop and UI symbols | Drawn as vector paths in `src/ui/icons.ts` | Self-authored |
| Sky, hills, sun, moon and stars | Drawn procedurally in `src/ui/sky.ts` | Self-authored |
| Castle, troops, shells, debris, particles | Drawn as rectangles and circles at runtime | Self-authored |
| Sound effects | Synthesized with the Web Audio API in `src/core/audio.ts` | Self-authored |
| Type | `"Trebuchet MS", "Segoe UI", sans-serif` — whatever the device already has | System fonts, not embedded |

## Why synthesize the sound

The same three reasons as the vector symbols, which is why both ended up the
same way:

- **Nothing to license.** No hunting for a CC0 pack, no attribution file to keep
  correct, no risk of one sample in twenty turning out to be someone's YouTube
  rip.
- **Nothing to ship.** A sound pack is the sort of thing that quietly doubles a
  bundle, and this game is meant to load on a phone on a bad connection.
- **Tunable in place.** Making the timber impact more hollow is a number in
  `VOICES.hitWood`, not a different recording. The three material impacts have
  to be *tellable apart* rather than realistic, and that is much easier to
  iterate on when it is code.

The cost is real and worth stating: synthesized sound has a ceiling. These are
caricatures — a thunk, a crack, a clang — and no amount of tuning turns them
into a recording of masonry. That is an acceptable trade for a game drawn in
flat rectangles, and would not be for one that was not.

## If a real asset is ever added

Add a row above, with the source URL and the licence, in the same commit that
adds the file. The whole point of this file is that it is never written from
memory.
