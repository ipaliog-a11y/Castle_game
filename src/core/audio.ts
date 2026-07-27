/**
 * The sound pack, synthesized rather than sampled.
 *
 * Three reasons for making the noises instead of loading them. The game already
 * draws its icons as vector glyphs for the same reasons: nothing to license,
 * nothing to add to the bundle, and nothing to keep in sync with a credits file
 * — the *Asset provenance* guardrail in ROADMAP.md is satisfied by there being
 * no assets. It also means a sound can be tuned by editing a number here rather
 * than by finding a different recording.
 *
 * Two rules this module must never break:
 *
 * 1. **It never touches the battle's dice.** Variation uses `Math.random`, the
 *    same as `BattleScene.burst`. Drawing from the seeded stream would mean
 *    adding a noise silently changed the outcome of every seeded battle.
 * 2. **It never reports anything back.** Nothing in the simulation may read the
 *    state of the audio engine, so a muted battle and a loud one are the same
 *    battle. That is what lets the balance harness run with sound off.
 */

/** Browsers refuse to start audio until the user has touched something. */
type Ctx = AudioContext | null;

export type SoundId =
  | 'cannon'
  | 'hitWood'
  | 'hitStone'
  | 'hitIron'
  | 'hitThrone'
  | 'hitGround'
  | 'collapse'
  | 'rubble'
  | 'melee'
  | 'oil'
  | 'repair'
  | 'whoosh'
  | 'gold'
  | 'place'
  | 'erase'
  | 'fanfare'
  | 'chime'
  | 'defeat';

const MUTE_KEY = 'siege-and-stone:muted';

/**
 * Everything is summed into one gain node, kept well below 1. A collapse can
 * legitimately overlap a cannon shot, three impacts and a fistful of rubble;
 * mixing at full volume would clip into a crackle exactly at the loudest and
 * most satisfying moment.
 */
const MASTER = 0.34;

/**
 * Minimum gap between two plays of the same sound, in milliseconds.
 *
 * This is the whole voice-management strategy, and it is doing more work than
 * it looks. A shell landing in a wall damages every block in its radius, a
 * collapsing tower lands a dozen pieces of rubble in the same second, and six
 * knights swing at roughly the same time — played faithfully, each of those is
 * a burst of noise that reads as a glitch rather than as an event. Collapsing
 * them to one sound is both kinder to the ear and more legible: one crash means
 * one thing happened.
 *
 * It also quietly fixes a problem with the fixed timestep. `update` can run up
 * to fifteen simulation steps in a single frame after a stall, and those steps
 * share a wall clock, so a throttle measured in real milliseconds folds the
 * whole catch-up burst into one play.
 */
const GAP: Record<SoundId, number> = {
  cannon: 70,
  hitWood: 55,
  hitStone: 55,
  hitIron: 55,
  hitThrone: 120,
  hitGround: 90,
  collapse: 320,
  rubble: 80,
  melee: 110,
  oil: 200,
  repair: 200,
  whoosh: 60,
  gold: 90,
  place: 40,
  erase: 40,
  fanfare: 1000,
  chime: 1000,
  defeat: 1000,
};

export interface PlayOpts {
  /** Scales this one play, 0..1-ish. Used for "how big was that collapse". */
  gain?: number;
  /** Pitch multiplier. Small random values are what stop repeats sounding cloned. */
  rate?: number;
}

class AudioEngine {
  private ctx: Ctx = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastAt: Partial<Record<SoundId, number>> = {};

  /** User mute, persisted. Separate from `enabled` so tests can differ from players. */
  muted = false;
  /**
   * Off switch for headless runs. The balance harness steps the simulation
   * thousands of times as fast as it can; it has no use for the noise.
   */
  enabled = true;

  /**
   * How many voices have actually been started. Purely a diagnostic — nothing
   * in the game may read it — and it exists so a test can prove a run really
   * made noise rather than merely having an audio context lying around.
   */
  played = 0;

  /** Whether the audio clock is live. Diagnostic, same rules as `played`. */
  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // Private-mode browsers refuse reads; default to audible.
    }
  }

  /**
   * Starts the audio clock. Must be called from a real user gesture — every
   * browser blocks audio until then, and constructing the context earlier just
   * produces a suspended one and a console warning.
   *
   * Safe to call on every tap: after the first it only nudges a context that
   * iOS has suspended behind the player's back.
   */
  unlock(): void {
    if (!this.enabled) return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return; // No audio available. The game is fully playable without it.
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER;
    this.master.connect(this.ctx.destination);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : MASTER, this.ctx.currentTime, 0.02);
    }
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Nothing to do; the setting simply will not survive a reload.
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  play(id: SoundId, opts: PlayOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || !this.enabled) return;

    const now = performance.now();
    const last = this.lastAt[id] ?? -Infinity;
    if (now - last < GAP[id]) return;
    this.lastAt[id] = now;

    const t = ctx.currentTime;
    const gain = opts.gain ?? 1;
    const rate = opts.rate ?? 1;
    try {
      VOICES[id](this, t, gain, rate);
      this.played++;
    } catch {
      // A synthesis failure must never take the game down with it.
    }
  }

  // ------------------------------------------------------------ synthesis

  /**
   * One second of white noise, made once and replayed at different rates
   * through different filters. Every percussive sound in the pack — impacts,
   * rubble, the rumble, the whoosh — is this buffer wearing a different filter.
   */
  private noise(): AudioBuffer {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) {
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  /**
   * A filtered burst of noise: the percussive half of the pack.
   *
   * `freq`/`toFreq` sweep the filter rather than the source, which is what
   * makes one buffer able to be a wooden thunk, a stone crack and a low rumble.
   */
  burst(
    t: number,
    o: {
      dur: number;
      gain: number;
      type: BiquadFilterType;
      freq: number;
      toFreq?: number;
      q?: number;
      attack?: number;
    },
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.Q.value = o.q ?? 1;
    filter.frequency.setValueAtTime(o.freq, t);
    if (o.toFreq) filter.frequency.exponentialRampToValueAtTime(o.toFreq, t + o.dur);

    const env = ctx.createGain();
    const attack = o.attack ?? 0.004;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

    src.connect(filter).connect(env).connect(this.master!);
    src.start(t);
    src.stop(t + o.dur + 0.02);
  }

  /** A pitched voice with an optional glide: the tonal half of the pack. */
  tone(
    t: number,
    o: {
      freq: number;
      toFreq?: number;
      dur: number;
      gain: number;
      type?: OscillatorType;
      delay?: number;
      attack?: number;
    },
  ): void {
    const ctx = this.ctx!;
    const at = t + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, at);
    if (o.toFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.toFreq), at + o.dur);

    const env = ctx.createGain();
    const attack = o.attack ?? 0.006;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);

    osc.connect(env).connect(this.master!);
    osc.start(at);
    osc.stop(at + o.dur + 0.02);
  }
}

/** A touch of pitch wobble, so a repeated sound is never bit-identical. */
const wobble = (spread = 0.08) => 1 + (Math.random() * 2 - 1) * spread;

/**
 * The recipes.
 *
 * Deliberately short and a little cartoonish — this is aimed at a six-year-old,
 * and a realistic masonry impact is both duller and harder to tell apart from
 * its neighbours than a caricature of one. Each material gets a shape you can
 * name: timber thunks, stone cracks, iron rings.
 */
const VOICES: Record<SoundId, (a: AudioEngine, t: number, g: number, r: number) => void> = {
  cannon: (a, t, g, r) => {
    a.burst(t, { dur: 0.2, gain: 0.9 * g, type: 'lowpass', freq: 1400, toFreq: 300 });
    a.tone(t, { freq: 170 * r, toFreq: 44, dur: 0.24, gain: 0.75 * g, type: 'sine' });
  },

  // Hollow and soft. A low triangle under a mid-band knock.
  hitWood: (a, t, g, r) => {
    const w = wobble();
    a.burst(t, { dur: 0.1, gain: 0.85 * g, type: 'bandpass', freq: 430 * r * w, q: 2.4 });
    a.tone(t, { freq: 190 * r * w, toFreq: 105, dur: 0.1, gain: 0.55 * g, type: 'triangle' });
  },

  // Two layers: a bright snap on top of a dull body, which is what a crack is.
  hitStone: (a, t, g, r) => {
    const w = wobble();
    a.burst(t, { dur: 0.055, gain: 0.5 * g, type: 'highpass', freq: 1500 * w });
    a.burst(t, { dur: 0.13, gain: 0.45 * g, type: 'lowpass', freq: 620 * r * w });
  },

  // Inharmonic partials are what separates a bell from a note. 2.76 is roughly
  // the ratio a struck bar gives, and it is why this reads as metal.
  hitIron: (a, t, g, r) => {
    const w = wobble(0.05);
    const f = 520 * r * w;
    a.burst(t, { dur: 0.04, gain: 0.35 * g, type: 'bandpass', freq: 3200, q: 1.4 });
    a.tone(t, { freq: f, dur: 0.42, gain: 0.45 * g, type: 'triangle' });
    a.tone(t, { freq: f * 2.76, dur: 0.3, gain: 0.16 * g, type: 'sine' });
  },

  // The throne is the thing you are all here about, so it gets its own voice:
  // the same bell, an octave and a half down and twice as long.
  hitThrone: (a, t, g, r) => {
    const f = 150 * r;
    a.burst(t, { dur: 0.05, gain: 0.3 * g, type: 'bandpass', freq: 1800, q: 1.2 });
    a.tone(t, { freq: f, dur: 0.85, gain: 0.45 * g, type: 'triangle' });
    a.tone(t, { freq: f * 1.5, dur: 0.6, gain: 0.2 * g, type: 'sine' });
    a.tone(t, { freq: f * 2.76, dur: 0.45, gain: 0.12 * g, type: 'sine' });
  },

  hitGround: (a, t, g, r) => {
    a.burst(t, { dur: 0.16, gain: 0.5 * g, type: 'lowpass', freq: 420 * wobble() });
    a.tone(t, { freq: 95 * r, toFreq: 48, dur: 0.16, gain: 0.4 * g, type: 'sine' });
  },

  // The big one. A slow attack is the whole trick — an instant rumble sounds
  // like a click, a rumble that takes 60ms to arrive sounds like mass moving.
  collapse: (a, t, g) => {
    a.burst(t, {
      dur: 0.95,
      gain: 0.8 * g,
      type: 'lowpass',
      freq: 520,
      toFreq: 90,
      attack: 0.06,
    });
    a.tone(t, { freq: 78, toFreq: 32, dur: 0.85, gain: 0.5 * g, type: 'sine', attack: 0.05 });
  },

  rubble: (a, t, g, r) => {
    a.burst(t, { dur: 0.07, gain: 0.95 * g, type: 'bandpass', freq: 900 * r * wobble(0.25), q: 1.8 });
  },

  melee: (a, t, g, r) => {
    a.burst(t, { dur: 0.06, gain: 0.9 * g, type: 'bandpass', freq: 2600 * r * wobble(0.15), q: 5 });
  },

  // Rising hiss, like something coming to the boil.
  oil: (a, t, g) => {
    a.burst(t, { dur: 0.5, gain: 0.85 * g, type: 'bandpass', freq: 700, toFreq: 2400, q: 1.1 });
  },

  // Two quick taps of a trowel.
  repair: (a, t, g) => {
    a.tone(t, { freq: 780, dur: 0.09, gain: 0.28 * g, type: 'triangle' });
    a.tone(t, { freq: 1040, dur: 0.11, gain: 0.24 * g, type: 'triangle', delay: 0.08 });
  },

  whoosh: (a, t, g) => {
    a.burst(t, {
      dur: 0.24,
      gain: 0.85 * g,
      type: 'bandpass',
      freq: 480,
      toFreq: 3000,
      q: 1.2,
      attack: 0.05,
    });
  },

  gold: (a, t, g, r) => {
    a.tone(t, { freq: 1180 * r, toFreq: 1720, dur: 0.13, gain: 0.3 * g, type: 'sine' });
  },

  place: (a, t, g) => {
    a.tone(t, { freq: 560 * wobble(0.06), dur: 0.07, gain: 0.3 * g, type: 'triangle' });
    a.burst(t, { dur: 0.05, gain: 0.2 * g, type: 'bandpass', freq: 1600, q: 1.5 });
  },

  erase: (a, t, g) => {
    a.tone(t, { freq: 340, toFreq: 190, dur: 0.11, gain: 0.28 * g, type: 'triangle' });
  },

  // Throne destroyed: a plain major arpeggio, because a six-year-old should be
  // in no doubt at all that the loud thing that just happened was good.
  fanfare: (a, t, g) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      a.tone(t, {
        freq: f,
        dur: i === notes.length - 1 ? 0.6 : 0.24,
        gain: 0.5 * g,
        type: 'triangle',
        delay: i * 0.1,
      });
    });
  },

  // Castle holds: warm, settled, and not a fanfare. Relief, not triumph.
  chime: (a, t, g) => {
    a.tone(t, { freq: 392, dur: 0.9, gain: 0.38 * g, type: 'sine' });
    a.tone(t, { freq: 587.33, dur: 0.9, gain: 0.3 * g, type: 'sine', delay: 0.05 });
    a.tone(t, { freq: 783.99, dur: 0.7, gain: 0.18 * g, type: 'sine', delay: 0.22 });
  },

  // Losing is soft on purpose. A harsh buzzer is the sound a child stops
  // playing to, and this game wants the next thing to be another go.
  defeat: (a, t, g) => {
    a.tone(t, { freq: 392, dur: 0.4, gain: 0.45 * g, type: 'triangle' });
    a.tone(t, { freq: 311.13, dur: 0.7, gain: 0.42 * g, type: 'triangle', delay: 0.18 });
  },
};

export const audio = new AudioEngine();

/**
 * Wires the first touch anywhere to starting the audio clock. Stays registered
 * rather than firing once: iOS suspends the context whenever the page loses
 * focus, and the next tap is the natural place to bring it back.
 */
export function installAudioUnlock(): void {
  const wake = () => audio.unlock();
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake, { passive: true });
}
