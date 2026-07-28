/**
 * Player settings, persisted.
 *
 * Sound is deliberately *not* here — `audio.muted` already owns that, and one
 * setting living in two places is how a mute toggle ends up disagreeing with
 * itself. The options panel drives the audio engine directly for that row and
 * this module for the rest.
 */

const KEY = 'siege-and-stone:settings:v1';

/**
 * How the player points the cannon. A ladder, each rung strictly harder than
 * the one below it.
 *
 * - `easy` — touch the target. The arc is drawn the whole way and rings the
 *   spot it will actually reach. This is the mode the aiming was designed
 *   around and it stays the default.
 * - `advanced` — the same control, but the preview fades out at mid-field. You
 *   see the launch and the shape of the arc over open ground, and have to
 *   predict the rest. The half that is hidden is the half over the castle,
 *   which is exactly the half worth knowing.
 * - `expert` — no target at all. An elevation slider and a power slider beside
 *   the gun, the way artillery actually works, with the same truncated preview.
 */
export type AimMode = 'easy' | 'advanced' | 'expert';

export const AIM_MODES: Array<{ id: AimMode; name: string; blurb: string }> = [
  { id: 'easy', name: 'Easy', blurb: 'Touch where you want to hit.' },
  { id: 'advanced', name: 'Advanced', blurb: 'The arc fades out halfway. Judge the rest.' },
  { id: 'expert', name: 'Expert', blurb: 'Set angle and power on the sliders.' },
];

interface Saved {
  aimMode: AimMode;
}

const DEFAULTS: Saved = { aimMode: 'easy' };

class Settings {
  private values: Saved = { ...DEFAULTS };

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Saved>;
        // Validated rather than trusted: a setting written by a later version,
        // or edited by hand, must not put the game in a state it cannot draw.
        if (AIM_MODES.some((m) => m.id === parsed.aimMode)) {
          this.values.aimMode = parsed.aimMode as AimMode;
        }
      }
    } catch {
      // Corrupt or unavailable storage: the defaults are already in place.
    }
  }

  get aimMode(): AimMode {
    return this.values.aimMode;
  }

  set aimMode(mode: AimMode) {
    this.values.aimMode = mode;
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      // Private-mode browsers refuse writes; the in-memory value still works.
    }
  }
}

export const settings = new Settings();
