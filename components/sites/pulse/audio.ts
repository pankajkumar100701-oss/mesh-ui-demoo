/**
 * Pulse Records synth engine. Everything is synthesized with the Web Audio API: no samples, no files.
 *
 * Graph:  voices → track gain → (duck bus for bass + pad) → master → compressor → analyser → speakers
 *                                 └── reverb send (clap + pad) ──┘
 *
 * A look-ahead scheduler (setInterval + AudioContext clock) queues 16th-note steps a little ahead of
 * time. Each scheduled step is also pushed onto a small timeline so the UI and the 3D stage can ask
 * "which step is sounding right now, and how long ago was the last kick?" with sample accuracy.
 */

export const TRACKS = [
  { id: "kick", name: "Kick", short: "KCK", color: "#a855f7" },
  { id: "clap", name: "Clap", short: "CLP", color: "#f0abfc" },
  { id: "hat", name: "Hi-hat", short: "HAT", color: "#67e8f9" },
  { id: "bass", name: "Bass", short: "BAS", color: "#22c55e" },
  { id: "pad", name: "Chords", short: "PAD", color: "#facc15" },
] as const;

export const STEPS = 16;
export const BAND_COUNT = 16;
export const MIN_BPM = 80;
export const MAX_BPM = 160;

export type Pattern = boolean[][];

export type Preset = {
  name: string;
  bpm: number;
  swing: number;
  rows: string[];
  /** Bass semitone offsets from the chord root, one per step. */
  bass: number[];
  /** One chord (MIDI notes) per bar; the progression loops. */
  chords: number[][];
};

const AM7 = [57, 60, 64, 67];
const FMAJ7 = [53, 57, 60, 64];
const CMAJ = [55, 60, 64, 67];
const G6 = [55, 59, 62, 64];
const DM9 = [50, 57, 60, 64];
const EM7 = [52, 59, 62, 67];

export const PRESETS: Preset[] = [
  {
    name: "Warehouse",
    bpm: 124,
    swing: 0.06,
    rows: [
      "x...x...x...x...",
      "....x.......x...",
      "..x...x...x...xx",
      "..x...x.x.x...x.",
      "x.....x...x.....",
    ],
    bass: [0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 7, 0],
    chords: [AM7, FMAJ7, CMAJ, G6],
  },
  {
    name: "Breaker",
    bpm: 132,
    swing: 0.0,
    rows: [
      "x.....x...x..x..",
      "....x.......x..x",
      "x.xxx.xxx.xxx.xx",
      "x..x..x...x.x...",
      "x.......x.......",
    ],
    bass: [0, 0, 0, 12, 0, 0, 7, 0, 0, 0, 10, 0, 12, 0, 0, 0],
    chords: [DM9, AM7, FMAJ7, EM7],
  },
  {
    name: "Night Drive",
    bpm: 128,
    swing: 0.0,
    rows: [
      "x...x...x...x...",
      "............x...",
      "xxx.xxx.xxx.xxxx",
      ".xx.xxx..xx.xxx.",
      "x...............",
    ],
    bass: [0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 0, 12, 0, 12],
    chords: [AM7, AM7, FMAJ7, G6],
  },
  {
    name: "Halftime",
    bpm: 86,
    swing: 0.1,
    rows: [
      "x.........x.....",
      "........x.......",
      "x.x.x.x.x.x.x.xx",
      "x.....x...x..x..",
      "x.......x.......",
    ],
    bass: [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 5, 0, 0, 7, 0, 0],
    chords: [FMAJ7, EM7, DM9, AM7],
  },
];

export function presetPattern(p: Preset): Pattern {
  return p.rows.map((r) => Array.from({ length: STEPS }, (_, i) => r[i] === "x"));
}

/** Live analysis numbers read by the 3D stage and the meters. */
export type Signal = {
  playing: boolean;
  /** Smoothed band energies, 0 … 1. */
  bass: number;
  mid: number;
  high: number;
  level: number;
  /** Envelopes that jump to 1 when the hit sounds, then decay. */
  kick: number;
  clap: number;
  hat: number;
  chord: number;
  /** Seconds since the last kick sounded (large if none). */
  kickAge: number;
  step: number;
  bands: Float32Array;
};

export function createSignal(): Signal {
  return {
    playing: false,
    bass: 0,
    mid: 0,
    high: 0,
    level: 0,
    kick: 0,
    clap: 0,
    hat: 0,
    chord: 0,
    kickAge: 99,
    step: -1,
    bands: new Float32Array(BAND_COUNT),
  };
}

type Scheduled = { time: number; step: number; hits: number };

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class PulseEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private analyser: AnalyserNode;
  private freq: Uint8Array<ArrayBuffer>;
  private trackGains: GainNode[];
  private duck: GainNode;
  private reverbSend: GainNode;
  private noise: AudioBuffer;
  private timer: number | null = null;
  private nextTime = 0;
  private stepIndex = 0;
  private stepCount = 0;
  private timeline: Scheduled[] = [];
  private lastHit = [-99, -99, -99, -99, -99];
  private current = -1;
  private bandBins: [number, number][] = [];
  private smooth = { bass: 0, mid: 0, high: 0, level: 0 };
  private disposed = false;

  pattern: Pattern = presetPattern(PRESETS[0]);
  preset: Preset = PRESETS[0];
  bpm = PRESETS[0].bpm;
  muted = [false, false, false, false, false];
  soloed = [false, false, false, false, false];

  constructor() {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: "interactive" });
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.setTargetAtTime(0.85, ctx.currentTime, 0.05);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;
    this.freq = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.duck = ctx.createGain();
    this.duck.connect(this.master);

    // Procedural reverb: a decaying stereo noise impulse.
    const reverb = ctx.createConvolver();
    reverb.buffer = this.makeImpulse(2.4, 3.2);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.32;
    this.reverbSend.connect(reverb);
    reverb.connect(this.master);

    this.trackGains = TRACKS.map((t) => {
      const g = ctx.createGain();
      g.connect(t.id === "bass" || t.id === "pad" ? this.duck : this.master);
      return g;
    });

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // 16 log-spaced analysis bands, 40 Hz … 14 kHz.
    const binHz = ctx.sampleRate / this.analyser.fftSize;
    for (let b = 0; b < BAND_COUNT; b++) {
      const lo = 40 * Math.pow(14000 / 40, b / BAND_COUNT);
      const hi = 40 * Math.pow(14000 / 40, (b + 1) / BAND_COUNT);
      const a = Math.max(1, Math.floor(lo / binHz));
      this.bandBins.push([a, Math.max(a + 1, Math.ceil(hi / binHz))]);
    }
  }

  private makeImpulse(seconds: number, decay: number) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  get running() {
    return this.timer !== null;
  }

  async start() {
    if (this.disposed) return;
    if (this.ctx.state !== "running") await this.ctx.resume();
    if (this.timer !== null || this.disposed) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(0.85, this.ctx.currentTime, 0.03);
    this.nextTime = this.ctx.currentTime + 0.06;
    this.stepIndex = 0;
    this.stepCount = 0;
    this.timeline = [];
    this.timer = window.setInterval(() => this.schedule(), LOOKAHEAD_MS);
    this.schedule();
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.timeline = [];
    this.current = -1;
    if (!this.disposed) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0, t, 0.04);
    }
  }

  dispose() {
    this.stop();
    this.disposed = true;
    void this.ctx.close().catch(() => undefined);
  }

  configure(opts: { pattern?: Pattern; bpm?: number; preset?: Preset }) {
    if (opts.pattern) this.pattern = opts.pattern;
    if (opts.bpm) this.bpm = opts.bpm;
    if (opts.preset) this.preset = opts.preset;
  }

  setMix(muted: boolean[], soloed: boolean[]) {
    this.muted = muted;
    this.soloed = soloed;
    const anySolo = soloed.some(Boolean);
    const t = this.ctx.currentTime;
    this.trackGains.forEach((g, i) => {
      const on = anySolo ? soloed[i] : !muted[i];
      g.gain.setTargetAtTime(on ? 1 : 0, t, 0.015);
    });
  }

  private audible(track: number) {
    return this.soloed.some(Boolean) ? this.soloed[track] : !this.muted[track];
  }

  /** Moves every step whose time has come off the queue, recording what sounded. */
  private advance() {
    const now = this.ctx.currentTime;
    const tl = this.timeline;
    while (tl.length && tl[0].time <= now) {
      const ev = tl.shift()!;
      this.current = ev.step;
      for (let tr = 0; tr < TRACKS.length; tr++) if (ev.hits & (1 << tr)) this.lastHit[tr] = ev.time;
    }
    return now;
  }

  private schedule() {
    this.advance();
    const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      const step = this.stepIndex;
      const swing = step % 2 === 1 ? this.preset.swing * stepDur * 2 : 0;
      const t = this.nextTime + swing;
      const bar = Math.floor(this.stepCount / STEPS);
      let hits = 0;
      for (let tr = 0; tr < TRACKS.length; tr++) {
        if (!this.pattern[tr]?.[step]) continue;
        if (this.audible(tr)) hits |= 1 << tr;
        this.trigger(tr, t, step, bar, stepDur);
      }
      this.timeline.push({ time: t, step, hits });
      this.nextTime += stepDur;
      this.stepIndex = (step + 1) % STEPS;
      this.stepCount++;
    }
  }

  private chordFor(bar: number) {
    const c = this.preset.chords;
    return c[bar % c.length];
  }

  private trigger(track: number, t: number, step: number, bar: number, stepDur: number) {
    switch (TRACKS[track].id) {
      case "kick":
        this.kick(t);
        break;
      case "clap":
        this.clap(t);
        break;
      case "hat":
        this.hat(t, step);
        break;
      case "bass": {
        const root = this.chordFor(bar)[0] - 24;
        this.bass(t, root + (this.preset.bass[step] ?? 0), stepDur);
        break;
      }
      case "pad":
        this.pad(t, this.chordFor(bar), stepDur);
        break;
    }
  }

  private kick(t: number) {
    const ctx = this.ctx;
    const out = this.trackGains[0];
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(165, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.11);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.45);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.1, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.5);

    // Beater click.
    const n = this.noiseSource(t, 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    n.connect(hp).connect(ng).connect(out);

    // Sidechain: duck the bass and chords under every kick that is heard.
    if (this.audible(0)) {
      const d = this.duck.gain;
      d.cancelScheduledValues(t);
      d.setValueAtTime(0.25, t);
      d.linearRampToValueAtTime(1, t + 0.22);
    }
  }

  private clap(t: number) {
    const ctx = this.ctx;
    const n = this.noiseSource(t, 0.4);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1350;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 3; i++) {
      const s = t + i * 0.011;
      g.gain.setValueAtTime(0.8, s);
      g.gain.exponentialRampToValueAtTime(0.12, s + 0.009);
    }
    g.gain.setValueAtTime(0.75, t + 0.034);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    n.connect(bp).connect(g);
    g.connect(this.trackGains[1]);
    const send = ctx.createGain();
    send.gain.value = 0.7;
    g.connect(send).connect(this.reverbSend);
    // Reverb send bypasses the track gain, so gate it on mute/solo too.
    if (!this.audible(1)) send.gain.value = 0;
  }

  private hat(t: number, step: number) {
    const ctx = this.ctx;
    const open = this.preset.swing > 0.05 && step % 4 === 2;
    const dur = open ? 0.22 : 0.05;
    const n = this.noiseSource(t, dur + 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7200;
    const peak = ctx.createBiquadFilter();
    peak.type = "peaking";
    peak.frequency.value = 10500;
    peak.gain.value = 6;
    const g = ctx.createGain();
    const vel = step % 4 === 2 ? 0.34 : step % 2 === 1 ? 0.16 : 0.24;
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(hp).connect(peak).connect(g).connect(this.trackGains[2]);
  }

  private bass(t: number, note: number, stepDur: number) {
    const ctx = this.ctx;
    const f = mtof(note);
    const len = Math.max(0.09, stepDur * 1.6);
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = f;
    const sub = ctx.createOscillator();
    sub.type = "square";
    sub.frequency.value = f / 2;
    const subG = ctx.createGain();
    subG.gain.value = 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 9;
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + 0.012);
    lp.frequency.exponentialRampToValueAtTime(160, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.006);
    g.gain.setTargetAtTime(0.0001, t + len * 0.55, len * 0.2);
    saw.connect(lp);
    sub.connect(subG).connect(lp);
    lp.connect(g).connect(this.trackGains[3]);
    saw.start(t);
    sub.start(t);
    saw.stop(t + len + 0.2);
    sub.stop(t + len + 0.2);
  }

  private pad(t: number, chord: number[], stepDur: number) {
    const ctx = this.ctx;
    const len = Math.min(1.6, stepDur * 7);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    lp.connect(g);
    g.connect(this.trackGains[4]);
    const send = ctx.createGain();
    send.gain.value = this.audible(4) ? 0.9 : 0;
    g.connect(send).connect(this.reverbSend);
    for (const note of chord) {
      for (const detune of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = mtof(note);
        o.detune.value = detune;
        o.connect(lp);
        o.start(t);
        o.stop(t + len + 0.05);
      }
    }
  }

  private noiseSource(t: number, dur: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(t, (t * 7.31) % 0.5);
    src.stop(t + dur);
    return src;
  }

  /** Advances the playback timeline to the audio clock and fills `out` with fresh analysis. */
  sample(out: Signal, dt: number) {
    const now = this.advance();
    out.playing = this.running;
    out.step = this.running ? this.current : -1;

    const age = (i: number) => Math.max(0, now - this.lastHit[i]);
    out.kickAge = age(0);
    out.kick = Math.exp(-age(0) * 7);
    out.clap = Math.exp(-age(1) * 6);
    out.hat = Math.exp(-age(2) * 18);
    out.chord = Math.exp(-age(4) * 2.2);

    this.analyser.getByteFrequencyData(this.freq);
    let bass = 0;
    let mid = 0;
    let high = 0;
    let level = 0;
    for (let b = 0; b < BAND_COUNT; b++) {
      const [a, z] = this.bandBins[b];
      let sum = 0;
      for (let i = a; i < z; i++) sum += this.freq[i];
      // Lift the treble bands, which carry less energy.
      const v = Math.min(1, (sum / (z - a) / 255) * (1 + b * 0.06));
      out.bands[b] = v;
      level += v;
      if (b < 4) bass += v;
      else if (b < 11) mid += v;
      else high += v;
    }
    const k = 1 - Math.exp(-dt * 18);
    const s = this.smooth;
    s.bass += (bass / 4 - s.bass) * k;
    s.mid += (mid / 7 - s.mid) * k;
    s.high += (high / 5 - s.high) * k;
    s.level += (level / BAND_COUNT - s.level) * k;
    out.bass = s.bass;
    out.mid = s.mid;
    out.high = s.high;
    out.level = s.level;
  }

  /** Current step without analysis, for the sequencer playhead. */
  currentStep() {
    this.advance();
    return this.running ? this.current : -1;
  }
}

/** A gentle, beat-free "heartbeat" so the stage still breathes before anyone presses play. */
export function idleSignal(out: Signal, time: number, dt: number) {
  const beat = 60 / 100;
  const phase = (time % (beat * 2)) / (beat * 2);
  const breath = 0.5 + 0.5 * Math.sin(time * 0.6);
  const k = 1 - Math.exp(-dt * 4);
  const target = (v: number, to: number) => v + (to - v) * k;
  out.playing = false;
  out.step = -1;
  out.kickAge = phase * beat * 2;
  out.kick = target(out.kick, Math.exp(-phase * 7) * 0.45);
  out.clap = target(out.clap, 0);
  out.hat = target(out.hat, 0);
  out.chord = target(out.chord, 0.25 + breath * 0.2);
  out.bass = target(out.bass, 0.18 + breath * 0.12 + out.kick * 0.2);
  out.mid = target(out.mid, 0.14 + 0.08 * Math.sin(time * 0.9 + 1));
  out.high = target(out.high, 0.1 + 0.06 * Math.sin(time * 1.3 + 2));
  out.level = target(out.level, 0.16 + breath * 0.1);
  for (let b = 0; b < BAND_COUNT; b++) {
    const v = 0.12 + 0.1 * Math.sin(time * 1.1 + b * 0.55) * Math.sin(time * 0.37 + b) + (b < 4 ? out.kick * 0.25 : 0);
    out.bands[b] = target(out.bands[b], Math.max(0, v));
  }
}
