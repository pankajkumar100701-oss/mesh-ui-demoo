"use client";

import dynamic from "next/dynamic";
import MobileMenu from "@/components/sites/MobileMenu";
import { createRandom } from "@/lib/random";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  BAND_COUNT,
  MAX_BPM,
  MIN_BPM,
  PRESETS,
  STEPS,
  TRACKS,
  createSignal,
  presetPattern,
  PulseEngine,
  type Pattern,
} from "./audio";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

const display = "font-(family-name:--font-pulse-display)";
const mono = "font-(family-name:--font-pulse-mono)";

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const artists = [
  { name: "Kaia Voss", genre: "Melodic techno", city: "Berlin", seed: 11, listeners: "1.2M" },
  { name: "Lowfreq Saints", genre: "UK garage · bass", city: "London", seed: 23, listeners: "860K" },
  { name: "Mira Okonkwo", genre: "Afro house", city: "Lagos", seed: 37, listeners: "2.4M" },
  { name: "Tessellate", genre: "Ambient · IDM", city: "Reykjavík", seed: 41, listeners: "390K" },
  { name: "Hollow Pines", genre: "Breakbeat", city: "Montréal", seed: 58, listeners: "540K" },
  { name: "Juno Arcade", genre: "Electro · synthpop", city: "Tokyo", seed: 64, listeners: "1.7M" },
];

const releases = [
  { title: "Warehouse Hymns", artist: "Kaia Voss", cat: "PLS-041", format: "LP", year: "2026", seed: 3, preset: 0 },
  { title: "Breakers Yard", artist: "Hollow Pines", cat: "PLS-040", format: "EP", year: "2026", seed: 8, preset: 1 },
  { title: "Night Drive FM", artist: "Juno Arcade", cat: "PLS-038", format: "Single", year: "2026", seed: 15, preset: 2 },
  { title: "Slow Bloom", artist: "Tessellate", cat: "PLS-036", format: "LP", year: "2025", seed: 21, preset: 3 },
  { title: "Lagos After Dark", artist: "Mira Okonkwo", cat: "PLS-035", format: "EP", year: "2025", seed: 29, preset: 0 },
  { title: "Sub Rosa", artist: "Lowfreq Saints", cat: "PLS-033", format: "12\"", year: "2025", seed: 34, preset: 1 },
];

const tour = [
  { date: "Nov 07", day: "Fri", city: "Berlin", venue: "Kraftwerk Halle", lineup: "Kaia Voss · Tessellate", status: "Sold out" },
  { date: "Nov 14", day: "Fri", city: "London", venue: "Printworks Dock", lineup: "Lowfreq Saints · Hollow Pines", status: "Tickets" },
  { date: "Nov 22", day: "Sat", city: "Amsterdam", venue: "Gashouder", lineup: "Pulse Records Showcase", status: "Few left" },
  { date: "Dec 05", day: "Fri", city: "Lagos", venue: "Eko Atlantic Pier", lineup: "Mira Okonkwo + guests", status: "Tickets" },
  { date: "Dec 13", day: "Sat", city: "Tokyo", venue: "Studio Coast 2", lineup: "Juno Arcade · Kaia Voss", status: "Tickets" },
  { date: "Dec 31", day: "Wed", city: "Montréal", venue: "Le Hangar", lineup: "NYE: the whole roster", status: "Waitlist" },
];

const merch = [
  { name: "Pulse Logo Tee", detail: "Heavyweight black cotton, glow ink", price: "$38", art: "tee" },
  { name: "Pulse Vol. 1", detail: "2×12\" smoke vinyl, 14 tracks", price: "$42", art: "vinyl" },
  { name: "Slipmat Pair", detail: "Felt, laser-cut waveform", price: "$24", art: "slip" },
] as const;

const PALETTE = ["#a855f7", "#22c55e", "#facc15", "#67e8f9", "#f0abfc", "#fb7185", "#4ade80", "#c084fc"];

/** Deterministic generative cover art from a seed, pure CSS gradients. */
function coverArt(seed: number): CSSProperties {
  const r = createRandom(seed * 7919);
  const pick = () => PALETTE[Math.floor(r() * PALETTE.length)];
  const a = pick();
  let b = pick();
  if (b === a) b = PALETTE[(PALETTE.indexOf(a) + 3) % PALETTE.length];
  const style = Math.floor(r() * 4);
  const ang = Math.floor(r() * 180);
  const x = 20 + Math.floor(r() * 60);
  const y = 20 + Math.floor(r() * 60);
  const s = 6 + Math.floor(r() * 10);
  switch (style) {
    case 0:
      return {
        background: `repeating-radial-gradient(circle at ${x}% ${y}%, ${a} 0 ${Math.round(s / 3)}px, transparent ${Math.round(s / 3)}px ${s}px), radial-gradient(circle at ${x}% ${y}%, ${b}, #0b0614 70%)`,
      };
    case 1:
      return {
        background: `repeating-linear-gradient(${ang}deg, ${a} 0 2px, transparent 2px ${s}px), linear-gradient(${ang + 90}deg, #0b0614, ${b})`,
      };
    case 2:
      return {
        background: `radial-gradient(circle, ${a} 0 ${18 + (s % 10)}%, transparent ${20 + (s % 10)}%) 0 0 / ${s * 2}px ${s * 2}px, linear-gradient(${ang}deg, ${b}, #0b0614 75%)`,
      };
    default:
      return {
        background: `repeating-conic-gradient(from ${ang}deg at ${x}% ${y}%, ${a} 0 ${s / 2}deg, #0b0614 ${s / 2}deg ${s}deg), radial-gradient(circle at ${x}% ${y}%, transparent 0, #0b0614 80%)`,
        backgroundBlendMode: "multiply",
      };
  }
}

function avatarArt(seed: number): CSSProperties {
  const r = createRandom(seed * 104729);
  const a = PALETTE[Math.floor(r() * PALETTE.length)];
  const b = PALETTE[Math.floor(r() * PALETTE.length)];
  const ang = Math.floor(r() * 360);
  return {
    background: `radial-gradient(circle at 30% 28%, rgba(255,255,255,0.55), transparent 32%), conic-gradient(from ${ang}deg, ${a}, ${b}, #120a1f, ${a})`,
  };
}

const covers = releases.map((rel) => coverArt(rel.seed));
const avatars = artists.map((a) => avatarArt(a.seed));

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

function subscribeMedia(query: string) {
  return (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  };
}
const subscribeReduced = subscribeMedia("(prefers-reduced-motion: reduce)");

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** Keeps the landing page alive if WebGL is unavailable or the context can't be created. */
class WebGLBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const heroFallback = (
  <div
    className="absolute inset-0"
    style={{
      background:
        "radial-gradient(circle at 50% 42%, transparent 0 22%, #a855f7 23%, transparent 25%), radial-gradient(circle at 50% 42%, rgba(168,85,247,0.45), transparent 55%), linear-gradient(#07040d, #12071f 60%, #07040d)",
    }}
  />
);

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

function TempoKnob({ bpm, onChange }: { bpm: number; onChange: (v: number) => void }) {
  const drag = useRef<{ y: number; x: number; start: number } | null>(null);
  const clamp = (v: number) => Math.round(Math.max(MIN_BPM, Math.min(MAX_BPM, v)));
  const t = (bpm - MIN_BPM) / (MAX_BPM - MIN_BPM);
  const angle = -135 + t * 270;
  // Arc: 270° sweep, radius 26 in a 64 box.
  const R = 26;
  const C = 2 * Math.PI * R;
  const sweep = C * 0.75;

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, x: e.clientX, start: bpm };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    onChange(clamp(d.start + (d.y - e.clientY) * 0.45 + (e.clientX - d.x) * 0.45));
  };
  const onUp = () => {
    drag.current = null;
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 1;
    const map: Record<string, number> = {
      ArrowUp: step,
      ArrowRight: step,
      ArrowDown: -step,
      ArrowLeft: -step,
      PageUp: 10,
      PageDown: -10,
    };
    if (e.key === "Home") onChange(MIN_BPM);
    else if (e.key === "End") onChange(MAX_BPM);
    else if (map[e.key] !== undefined) onChange(clamp(bpm + map[e.key]));
    else return;
    e.preventDefault();
  };

  return (
    <div className="flex items-center gap-3">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Tempo"
        aria-valuemin={MIN_BPM}
        aria-valuemax={MAX_BPM}
        aria-valuenow={bpm}
        aria-valuetext={`${bpm} BPM`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className="relative size-16 shrink-0 cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]"
      >
        <svg viewBox="0 0 64 64" className="absolute inset-0" aria-hidden>
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${sweep} ${C}`}
            transform="rotate(135 32 32)"
          />
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke="url(#pulse-knob)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${sweep * t} ${C}`}
            transform="rotate(135 32 32)"
            style={{ filter: "drop-shadow(0 0 4px #a855f7)" }}
          />
          <defs>
            <linearGradient id="pulse-knob" x1="0" x2="1">
              <stop offset="0" stopColor="#22c55e" />
              <stop offset="1" stopColor="#a855f7" />
            </linearGradient>
          </defs>
        </svg>
        <div
          className="absolute inset-[11px] rounded-full border border-white/15 bg-gradient-to-b from-[#2a2236] to-[#0d0a14] shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_6px_14px_rgba(0,0,0,0.6)]"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <span className="absolute left-1/2 top-1 h-3 w-[3px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_6px_#fff]" />
        </div>
      </div>
      <div>
        <div className={`${mono} text-2xl font-bold tabular-nums leading-none text-white`}>{bpm}</div>
        <div className={`${mono} mt-1 text-[10px] uppercase tracking-[0.25em] text-white/50`}>BPM</div>
      </div>
    </div>
  );
}

function Newsletter() {
  const [sent, setSent] = useState(false);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSent(true);
  };
  if (sent) {
    return (
      <p className={`${mono} text-sm uppercase tracking-[0.2em] text-[#22c55e]`} role="status">
        You&apos;re on the list. First drop lands Friday.
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
      <label htmlFor="pulse-email" className="sr-only">
        Email address
      </label>
      <input
        id="pulse-email"
        type="email"
        required
        placeholder="you@afterhours.fm"
        className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/40 px-5 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#22c55e] focus:shadow-[0_0_0_3px_rgba(34,197,94,0.2)]"
      />
      <button
        type="submit"
        className={`${mono} rounded-full bg-[#22c55e] px-6 py-3 text-xs font-bold uppercase tracking-[0.2em] text-black transition-transform hover:scale-[1.03] active:scale-95`}
      >
        Subscribe
      </button>
    </form>
  );
}

function MerchArt({ kind }: { kind: (typeof merch)[number]["art"] }) {
  if (kind === "tee") {
    return (
      <div className="relative h-40 w-36">
        <div
          className="absolute inset-0 bg-[#141019]"
          style={{
            clipPath: "polygon(30% 0, 70% 0, 100% 16%, 88% 34%, 80% 28%, 80% 100%, 20% 100%, 20% 28%, 12% 34%, 0 16%)",
          }}
        />
        <div className="absolute left-1/2 top-[38%] grid size-12 -translate-x-1/2 place-items-center rounded-full border-2 border-[#a855f7] shadow-[0_0_18px_#a855f7]">
          <span className="size-3 rounded-full bg-[#22c55e] shadow-[0_0_10px_#22c55e]" />
        </div>
      </div>
    );
  }
  if (kind === "vinyl") {
    return (
      <div className="relative size-40">
        <div
          className="absolute inset-y-2 left-0 w-[72%] rounded-sm shadow-xl"
          style={coverArt(5)}
        />
        <div
          className="absolute right-0 top-1/2 size-36 -translate-y-1/2 rounded-full motion-safe:animate-[spin_6s_linear_infinite]"
          style={{
            background:
              "radial-gradient(circle, #a855f7 0 14%, #0a070e 15% 17%, transparent 18%), repeating-radial-gradient(circle, rgba(255,255,255,0.06) 0 1px, #0e0b12 1px 3px)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08), 0 10px 30px rgba(0,0,0,0.6)",
          }}
        />
      </div>
    );
  }
  return (
    <div className="relative h-40 w-44">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="absolute top-3 size-32 rounded-full border border-white/10"
          style={{
            left: i * 44,
            background: `radial-gradient(circle, #07040d 0 6%, transparent 7%), repeating-radial-gradient(circle, ${i ? "#22c55e" : "#a855f7"} 0 1.5px, #120d19 1.5px 9px)`,
            transform: `rotate(${i * 25}deg)`,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const emptyMix = () => TRACKS.map(() => false);

export default function PulseSite() {
  const engineRef = useRef<PulseEngine | null>(null);
  const heroRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const meterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [heroVisible, setHeroVisible] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [presetIndex, setPresetIndex] = useState(0);
  const [pattern, setPattern] = useState<Pattern>(() => presetPattern(PRESETS[0]));
  const [bpm, setBpm] = useState(PRESETS[0].bpm);
  const [muted, setMuted] = useState<boolean[]>(emptyMix);
  const [soloed, setSoloed] = useState<boolean[]>(emptyMix);
  const [bag, setBag] = useState<string[]>([]);
  const reducedMotion = useReducedMotion();
  const preset = PRESETS[presetIndex];

  // Pause WebGL once the hero scrolls away (music keeps playing).
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Keep the engine in sync with the controls.
  useEffect(() => {
    engineRef.current?.configure({ pattern, bpm, preset });
  }, [pattern, bpm, preset]);
  useEffect(() => {
    engineRef.current?.setMix(muted, soloed);
  }, [muted, soloed]);

  // Tear the AudioContext down with the page.
  useEffect(() => {
    const holder = engineRef;
    return () => {
      holder.current?.dispose();
      holder.current = null;
    };
  }, []);

  // Stop when the tab is hidden: background timers throttle and the beat would stutter.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && engineRef.current?.running) {
        engineRef.current.stop();
        setPlaying(false);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Playhead + meters, written straight to the DOM (no React render per step).
  useEffect(() => {
    if (!playing || !heroVisible) return;
    const sig = createSignal();
    const meters = meterRefs.current;
    let raf = 0;
    let last = -1;
    let prevT = performance.now();
    const setCol = (col: number, on: boolean) => {
      gridRef.current?.querySelectorAll(`[data-col="${col}"]`).forEach((el) => {
        if (on) el.setAttribute("data-play", "");
        else el.removeAttribute("data-play");
      });
    };
    const loop = (now: number) => {
      const e = engineRef.current;
      if (e) {
        e.sample(sig, Math.min(0.1, (now - prevT) / 1000));
        prevT = now;
        if (sig.step !== last) {
          if (last >= 0) setCol(last, false);
          if (sig.step >= 0) setCol(sig.step, true);
          last = sig.step;
        }
        meters.forEach((el, i) => {
          if (el) el.style.transform = `scaleY(${Math.max(0.04, sig.bands[i]).toFixed(3)})`;
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (last >= 0) setCol(last, false);
      meters.forEach((el) => {
        if (el) el.style.transform = "scaleY(0.04)";
      });
    };
  }, [playing, heroVisible]);

  const start = useCallback(async () => {
    try {
      let e = engineRef.current;
      if (!e) {
        e = new PulseEngine();
        engineRef.current = e;
      }
      e.configure({ pattern, bpm, preset });
      e.setMix(muted, soloed);
      await e.start();
      setPlaying(true);
      setAudioError(false);
    } catch {
      setAudioError(true);
    }
  }, [pattern, bpm, preset, muted, soloed]);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setPlaying(false);
  }, []);

  const loadPreset = (i: number) => {
    setPresetIndex(i);
    setPattern(presetPattern(PRESETS[i]));
    setBpm(PRESETS[i].bpm);
  };

  const toggleStep = (track: number, step: number) => {
    setPattern((p) => p.map((row, r) => (r === track ? row.map((v, s) => (s === step ? !v : v)) : row)));
  };

  const shuffle = () => {
    const density = [0.3, 0.18, 0.55, 0.35, 0.14];
    setPattern(
      TRACKS.map((_, t) =>
        Array.from({ length: STEPS }, (_, s) => {
          if (t === 0) return s % 4 === 0 || Math.random() < 0.08;
          return Math.random() < density[t] * (s % 2 === 0 ? 1.2 : 0.8);
        }),
      ),
    );
  };

  const clear = () => setPattern(TRACKS.map(() => Array.from({ length: STEPS }, () => false)));

  const toggleMix = (kind: "mute" | "solo", i: number) => {
    const set = kind === "mute" ? setMuted : setSoloed;
    set((m) => m.map((v, j) => (j === i ? !v : v)));
  };

  const playRelease = async (presetI: number) => {
    loadPreset(presetI);
    heroRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
    // Apply directly so the first bar already uses the new preset.
    const p = PRESETS[presetI];
    try {
      let e = engineRef.current;
      if (!e) {
        e = new PulseEngine();
        engineRef.current = e;
      }
      e.configure({ pattern: presetPattern(p), bpm: p.bpm, preset: p });
      e.setMix(muted, soloed);
      if (!e.running) await e.start();
      setPlaying(true);
    } catch {
      setAudioError(true);
    }
  };

  const navLinks: [string, string][] = [
    ["#deck", "The deck"],
    ["#artists", "Artists"],
    ["#releases", "Releases"],
    ["#tour", "Tour"],
    ["#shop", "Shop"],
  ];
  const anySolo = soloed.some(Boolean);

  return (
    <div className="min-h-screen overflow-x-clip bg-[#07040d] text-white selection:bg-[#a855f7] selection:text-black">
      {/* ---------- Hero / live stage ---------- */}
      <section ref={heroRef} id="top" className="relative overflow-hidden" aria-label="Pulse Records live stage">
        <div className="absolute inset-x-0 top-0 h-[100svh] min-h-[620px]">
          <WebGLBoundary fallback={heroFallback}>
            <Scene engineRef={engineRef} active={heroVisible} reducedMotion={reducedMotion} />
          </WebGLBoundary>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,4,13,0.75),transparent_45%)] max-lg:bg-[linear-gradient(180deg,rgba(7,4,13,0.55),transparent_40%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#07040d] to-transparent" />
        </div>

        <div className="relative z-10 flex min-h-[100svh] flex-col">
          <nav className="flex items-center justify-between px-4 py-4 sm:px-8 sm:py-6">
            <a href="#top" className={`${display} flex items-center gap-2 text-lg font-bold tracking-tight sm:text-xl`}>
              <span className="relative grid size-6 place-items-center">
                <span className="absolute inset-0 rounded-full border-2 border-[#a855f7]" />
                <span className="size-2 rounded-full bg-[#22c55e] shadow-[0_0_10px_#22c55e] motion-safe:animate-pulse" />
              </span>
              PULSE
              <span className="hidden text-white/45 sm:inline">RECORDS</span>
            </a>
            <div className={`${mono} hidden items-center gap-7 text-[11px] uppercase tracking-[0.25em] text-white/70 md:flex`}>
              {navLinks.slice(1).map(([href, label]) => (
                <a key={href} href={href} className="transition-colors hover:text-[#22c55e]">
                  {label}
                </a>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <a
                href="#join"
                className={`${mono} rounded-full border border-[#22c55e]/60 bg-black/30 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#22c55e] backdrop-blur transition-colors hover:bg-[#22c55e] hover:text-black sm:text-[11px]`}
              >
                Join the list
              </a>
              <MobileMenu links={navLinks} />
            </div>
          </nav>

          <div className="px-4 pt-6 sm:px-8 sm:pt-8 lg:pt-6">
            <div className="mx-auto max-w-6xl 2xl:max-w-[1600px]">
              <p className={`${mono} text-[10px] uppercase tracking-[0.4em] text-[#22c55e] sm:text-xs`}>
                Independent electronic label · Est. 2019
              </p>
              <h1 className={`${display} mt-4 text-[3.1rem] font-black leading-[0.9] tracking-tight min-[400px]:text-6xl sm:text-7xl lg:text-8xl`}>
                Feel the
                <span
                  className="block bg-gradient-to-r from-[#a855f7] via-[#e9d5ff] to-[#22c55e] bg-clip-text text-transparent"
                  style={{ filter: "drop-shadow(0 0 24px rgba(168,85,247,0.45))" }}
                >
                  pulse.
                </span>
              </h1>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/75 sm:text-base">
                This stage is a live synth. Every kick, clap and chord is generated in your browser, and the speakers,
                lights and tunnel move to what you hear. Hit play, then remix the beat below.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={playing ? stop : start}
                  className={`${mono} group flex items-center gap-3 rounded-full bg-white py-2 pl-2 pr-6 text-xs font-bold uppercase tracking-[0.2em] text-black shadow-[0_0_40px_rgba(168,85,247,0.55)] transition-transform hover:scale-[1.03] active:scale-95`}
                >
                  <span className="grid size-10 place-items-center rounded-full bg-[#07040d] text-white">
                    {playing ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                        <rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                        <path d="M3 1.5 L12.5 7 L3 12.5 Z" fill="currentColor" />
                      </svg>
                    )}
                  </span>
                  {playing ? "Stop the set" : "Start the set"}
                </button>
                <span className={`${mono} text-[10px] uppercase tracking-[0.25em] text-white/50`}>
                  {playing ? `Now playing · ${preset.name}` : "Sound on · 100% synthesized"}
                </span>
              </div>
              {audioError && (
                <p className="mt-3 text-sm text-[#fb7185]" role="alert">
                  Your browser blocked Web Audio. Try another browser or check the site&apos;s sound permission.
                </p>
              )}
            </div>
          </div>

          <div className="min-h-10 flex-1 lg:min-h-6" />

          {/* ---------- The deck: sequencer console ---------- */}
          <div id="deck" className="scroll-mt-4 px-3 pb-12 sm:px-8 sm:pb-10">
            <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-[#0b0712]/80 p-3 shadow-[0_30px_80px_-30px_rgba(168,85,247,0.45)] backdrop-blur-xl sm:p-5 2xl:max-w-[1600px]">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-6">
                {/* Transport + presets + mixer */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={playing ? stop : start}
                      aria-label={playing ? "Stop" : "Play"}
                      className={`grid size-14 shrink-0 place-items-center rounded-2xl border transition-all ${
                        playing
                          ? "border-[#22c55e] bg-[#22c55e] text-black shadow-[0_0_24px_rgba(34,197,94,0.6)]"
                          : "border-white/15 bg-white/5 text-white hover:border-white/40"
                      }`}
                    >
                      {playing ? (
                        <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden>
                          <rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden>
                          <path d="M3 1.5 L12.5 7 L3 12.5 Z" fill="currentColor" />
                        </svg>
                      )}
                    </button>
                    <TempoKnob bpm={bpm} onChange={setBpm} />
                    <div className="flex h-12 flex-1 items-end gap-[2px] overflow-hidden rounded-lg border border-white/10 bg-black/40 px-1.5 py-1" aria-hidden>
                      {Array.from({ length: BAND_COUNT }, (_, i) => (
                        <span
                          key={i}
                          ref={(el) => {
                            meterRefs.current[i] = el;
                          }}
                          className="h-full flex-1 origin-bottom rounded-[1px] bg-gradient-to-t from-[#22c55e] via-[#facc15] to-[#a855f7] transition-transform duration-75"
                          style={{ transform: "scaleY(0.04)" }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className={`${mono} mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-white/45`}>
                      <span>Presets</span>
                      <span className="flex gap-3">
                        <button type="button" onClick={shuffle} className="uppercase hover:text-[#22c55e]">
                          Shuffle
                        </button>
                        <button type="button" onClick={clear} className="uppercase hover:text-[#fb7185]">
                          Clear
                        </button>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
                      {PRESETS.map((p, i) => (
                        <button
                          key={p.name}
                          type="button"
                          aria-pressed={i === presetIndex}
                          onClick={() => loadPreset(i)}
                          className={`${mono} rounded-xl border px-2 py-2 text-left text-[10px] uppercase leading-tight tracking-[0.12em] transition-colors sm:text-[11px] ${
                            i === presetIndex
                              ? "border-[#a855f7] bg-[#a855f7]/20 text-white"
                              : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/30 hover:text-white"
                          }`}
                        >
                          <span className="block truncate">{p.name}</span>
                          <span className="text-white/40">{p.bpm}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-1.5">
                    {TRACKS.map((t, i) => {
                      const audible = anySolo ? soloed[i] : !muted[i];
                      return (
                        <div
                          key={t.id}
                          className={`rounded-xl border border-white/10 bg-white/[0.03] p-1.5 text-center transition-opacity ${audible ? "" : "opacity-45"}`}
                        >
                          <div className={`${mono} text-[10px] font-bold tracking-wider`} style={{ color: t.color }}>
                            {t.short}
                          </div>
                          <div className="mt-1 flex justify-center gap-1">
                            <button
                              type="button"
                              aria-pressed={muted[i]}
                              aria-label={`Mute ${t.name}`}
                              onClick={() => toggleMix("mute", i)}
                              className={`${mono} size-6 rounded-md text-[10px] font-bold ${
                                muted[i] ? "bg-[#fb7185] text-black" : "bg-white/10 text-white/60 hover:bg-white/20"
                              }`}
                            >
                              M
                            </button>
                            <button
                              type="button"
                              aria-pressed={soloed[i]}
                              aria-label={`Solo ${t.name}`}
                              onClick={() => toggleMix("solo", i)}
                              className={`${mono} size-6 rounded-md text-[10px] font-bold ${
                                soloed[i] ? "bg-[#facc15] text-black" : "bg-white/10 text-white/60 hover:bg-white/20"
                              }`}
                            >
                              S
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Step grid */}
                <div ref={gridRef} className="min-w-0" role="group" aria-label="16-step sequencer">
                  <div className="grid grid-cols-[2.25rem_repeat(16,minmax(0,1fr))] items-center gap-[3px] sm:grid-cols-[3rem_repeat(16,minmax(0,1fr))] sm:gap-1">
                    <span />
                    {Array.from({ length: STEPS }, (_, s) => (
                      <span key={s} className="flex justify-center pb-1">
                        <span
                          data-col={s}
                          className={`size-1.5 rounded-full transition-colors duration-75 data-[play]:bg-[#22c55e] data-[play]:shadow-[0_0_8px_#22c55e] ${
                            s % 4 === 0 ? "bg-white/35" : "bg-white/12"
                          }`}
                        />
                      </span>
                    ))}
                    {TRACKS.map((t, ti) => (
                      <TrackRow
                        key={t.id}
                        name={t.name}
                        short={t.short}
                        color={t.color}
                        row={pattern[ti]}
                        dim={anySolo ? !soloed[ti] : muted[ti]}
                        onToggle={(s) => toggleStep(ti, s)}
                      />
                    ))}
                  </div>
                  <p className={`${mono} mt-3 hidden text-[10px] uppercase tracking-[0.25em] text-white/35 sm:block`}>
                    Tap steps to program · drag the knob or use arrow keys for tempo · M mutes, S solos
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Artists ---------- */}
      <section id="artists" className="scroll-mt-4 px-4 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl 2xl:max-w-[1600px]">
          <SectionHead index="01" kicker="The roster" title="Six artists, one frequency" />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {artists.map((a, i) => (
              <article
                key={a.name}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/25"
              >
                <div
                  className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full opacity-25 blur-3xl transition-opacity group-hover:opacity-50"
                  style={avatars[i]}
                />
                <div className="relative flex items-center gap-4">
                  <div className="relative size-16 shrink-0">
                    <div className="absolute inset-0 rounded-full motion-safe:transition-transform motion-safe:duration-700 group-hover:rotate-180" style={avatars[i]} />
                    <div className="absolute -inset-1.5 rounded-full border border-dashed border-white/20 motion-safe:group-hover:animate-[spin_8s_linear_infinite]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className={`${display} truncate text-lg font-bold`}>{a.name}</h3>
                    <p className={`${mono} text-[11px] uppercase tracking-[0.2em] text-white/50`}>{a.city}</p>
                  </div>
                </div>
                <div className="relative mt-6 flex items-end justify-between gap-3">
                  <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/75">{a.genre}</span>
                  <span className={`${mono} text-right text-[10px] uppercase tracking-[0.2em] text-white/45`}>
                    <span className="block text-base font-bold tracking-normal text-[#22c55e]">{a.listeners}</span>
                    monthly
                  </span>
                </div>
                <Waveform seed={a.seed} />
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Releases ---------- */}
      <section id="releases" className="relative scroll-mt-4 overflow-hidden px-4 py-24 sm:px-8">
        <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-[80%] -translate-x-1/2 rounded-full bg-[#a855f7]/15 blur-3xl" />
        <div className="relative mx-auto max-w-6xl 2xl:max-w-[1600px]">
          <SectionHead index="02" kicker="Latest releases" title="Fresh off the press" />
          <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
            {releases.map((rel, i) => (
              <article key={rel.cat} className="group">
                <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 shadow-[0_20px_50px_-25px_rgba(0,0,0,0.9)]">
                  <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-110" style={covers[i]} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <span className={`${mono} absolute left-3 top-3 rounded bg-black/60 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white/80 sm:text-[10px]`}>
                    {rel.cat}
                  </span>
                  <span className={`${display} absolute bottom-3 left-3 right-3 text-sm font-black uppercase leading-tight sm:text-xl`}>
                    {rel.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => playRelease(rel.preset)}
                    aria-label={`Play ${rel.title} on the stage`}
                    className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white text-black opacity-100 shadow-lg transition-all hover:scale-110 sm:size-11 sm:translate-y-1 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                      <path d="M3 1.5 L12.5 7 L3 12.5 Z" fill="currentColor" />
                    </svg>
                  </button>
                </div>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold sm:text-base">{rel.artist}</h3>
                    <p className={`${mono} text-[10px] uppercase tracking-[0.2em] text-white/45`}>
                      {rel.format} · {rel.year}
                    </p>
                  </div>
                  <span className={`${mono} hidden shrink-0 text-[10px] uppercase tracking-[0.2em] text-[#22c55e] sm:block`}>
                    {PRESETS[rel.preset].bpm} BPM
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Tour ---------- */}
      <section id="tour" className="scroll-mt-4 px-4 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl 2xl:max-w-[1600px]">
          <SectionHead index="03" kicker="On the road" title="Pulse Showcase Tour" />
          <ul className="mt-12 divide-y divide-white/10 border-y border-white/10">
            {tour.map((d) => {
              const soldOut = d.status === "Sold out";
              return (
                <li
                  key={d.date + d.city}
                  className="group grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 py-5 transition-colors hover:bg-white/[0.03] sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-6 sm:px-3"
                >
                  <div className={`${mono} leading-tight`}>
                    <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">{d.day}</div>
                    <div className="text-base font-bold sm:text-xl">{d.date}</div>
                  </div>
                  <div className="min-w-0">
                    <div className={`${display} truncate text-base font-bold sm:text-2xl`}>{d.city}</div>
                    <div className="truncate text-xs text-white/55 sm:hidden">{d.venue}</div>
                  </div>
                  <div className="hidden min-w-0 sm:block">
                    <div className="truncate text-sm text-white/80">{d.venue}</div>
                    <div className="truncate text-xs text-white/45">{d.lineup}</div>
                  </div>
                  <a
                    href={soldOut ? undefined : "#join"}
                    aria-disabled={soldOut}
                    className={`${mono} whitespace-nowrap rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] sm:px-5 sm:text-[11px] ${
                      soldOut
                        ? "cursor-not-allowed border border-white/15 text-white/35 line-through"
                        : d.status === "Tickets"
                          ? "bg-[#22c55e] text-black transition-transform hover:scale-105"
                          : "border border-[#a855f7] text-[#d8b4fe] transition-colors hover:bg-[#a855f7] hover:text-black"
                    }`}
                  >
                    {d.status}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ---------- Shop + newsletter ---------- */}
      <section id="shop" className="scroll-mt-4 px-4 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl 2xl:max-w-[1600px]">
          <SectionHead index="04" kicker="Merch" title="Take the night home" />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {merch.map((m) => {
              const inBag = bag.includes(m.name);
              return (
                <article key={m.name} className="flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
                  <div className="grid h-56 place-items-center bg-[radial-gradient(circle_at_50%_60%,rgba(168,85,247,0.25),transparent_65%)]">
                    <MerchArt kind={m.art} />
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className={`${display} text-base font-bold`}>{m.name}</h3>
                      <span className={`${mono} text-sm font-bold text-[#22c55e]`}>{m.price}</span>
                    </div>
                    <p className="text-sm text-white/55">{m.detail}</p>
                    <button
                      type="button"
                      onClick={() => setBag((b) => (inBag ? b.filter((n) => n !== m.name) : [...b, m.name]))}
                      aria-pressed={inBag}
                      className={`${mono} mt-4 rounded-full py-2.5 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors ${
                        inBag ? "bg-[#22c55e] text-black" : "border border-white/20 text-white hover:border-white/50"
                      }`}
                    >
                      {inBag ? "In your bag ✓" : "Add to bag"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <div
            id="join"
            className="relative mt-16 scroll-mt-4 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#1b0d2e] via-[#0d0816] to-[#0a1f12] px-6 py-14 text-center sm:px-12"
          >
            <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden>
              <div className="absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#a855f7]/30" />
              <div className="absolute left-1/2 top-1/2 size-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#22c55e]/30" />
              <div className="absolute left-1/2 top-1/2 size-[16rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#a855f7]/30" />
            </div>
            <p className={`${mono} relative text-[10px] uppercase tracking-[0.4em] text-[#22c55e]`}>
              {bag.length > 0 ? `${bag.length} in your bag · ` : ""}Pulse Mailer
            </p>
            <h2 className={`${display} relative mt-3 text-2xl font-black sm:text-4xl`}>First to the floor</h2>
            <p className="relative mx-auto mt-3 max-w-md text-white/65">
              Pre-sale codes, unreleased promos and one mix a month. No spam, only signal.
            </p>
            <div className="relative mt-8 flex justify-center">
              <Newsletter />
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 pb-24 pt-10 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs text-white/45 sm:flex-row 2xl:max-w-[1600px]">
          <span className={`${display} text-base font-bold text-white`}>
            PULSE <span className="text-white/40">RECORDS</span>
          </span>
          <span className="text-center">© 2026 Pulse Records. A MeshUI demo, all artists and events fictional.</span>
          <div className={`${mono} flex gap-4 uppercase tracking-widest`}>
            <a href="#releases" className="hover:text-white">Demos</a>
            <a href="#join" className="hover:text-white">Press</a>
            <a href="#top" className="hover:text-white">Top ↑</a>
          </div>
        </div>
      </footer>

      {/* Floating now-playing pill once the stage is off screen */}
      {playing && !heroVisible && (
        <div className="fixed right-3 top-3 z-[90] flex items-center gap-2 rounded-full border border-white/15 bg-black/75 py-1 pl-3 pr-1 text-xs backdrop-blur-md sm:right-5 sm:top-5">
          <span className="flex h-3 items-end gap-[2px]" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-[3px] rounded-sm bg-[#22c55e] motion-safe:animate-pulse"
                style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
          <a href="#deck" className={`${mono} uppercase tracking-[0.15em] text-white/80 hover:text-white`}>
            {preset.name} · {bpm}
          </a>
          <button
            type="button"
            onClick={stop}
            aria-label="Stop playback"
            className="grid size-7 place-items-center rounded-full bg-white text-black"
          >
            <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
              <rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function SectionHead({ index, kicker, title }: { index: string; kicker: string; title: string }) {
  return (
    <div>
      <p className={`${mono} text-xs uppercase tracking-[0.4em] text-[#a855f7]`}>
        {index} · {kicker}
      </p>
      <h2 className={`${display} mt-3 max-w-2xl text-3xl font-black leading-tight sm:text-5xl`}>{title}</h2>
    </div>
  );
}

function TrackRow({
  name,
  short,
  color,
  row,
  dim,
  onToggle,
}: {
  name: string;
  short: string;
  color: string;
  row: boolean[];
  dim: boolean;
  onToggle: (step: number) => void;
}) {
  return (
    <>
      <span className={`${mono} text-[10px] font-bold tracking-wider sm:text-[11px] ${dim ? "opacity-40" : ""}`} style={{ color }}>
        {short}
      </span>
      {row.map((on, s) => (
        <button
          key={s}
          type="button"
          data-col={s}
          aria-pressed={on}
          aria-label={`${name} step ${s + 1}`}
          onClick={() => onToggle(s)}
          className={`aspect-square min-h-0 w-full rounded-[4px] border transition-[transform,box-shadow,background-color] duration-75 data-[play]:scale-110 sm:rounded-md ${
            on ? "border-transparent" : s % 4 === 0 ? "border-white/15 bg-white/[0.09]" : "border-white/10 bg-white/[0.04]"
          } ${dim ? "opacity-40" : ""} ${on ? "" : "data-[play]:bg-white/25"} hover:border-white/40`}
          style={on ? { background: color, boxShadow: `0 0 12px ${color}88` } : undefined}
        />
      ))}
    </>
  );
}

function Waveform({ seed }: { seed: number }) {
  const r = createRandom(seed);
  const bars = Array.from({ length: 40 }, (_, i) => 0.2 + 0.8 * Math.abs(Math.sin(i * 0.45 + seed)) * (0.5 + r() * 0.5));
  return (
    <div className="relative mt-5 flex h-8 items-center gap-[3px]" aria-hidden>
      {bars.map((h, i) => (
        <span
          key={i}
          className="flex-1 rounded-full bg-white/20 transition-colors duration-300 group-hover:bg-[#a855f7]"
          style={{ height: `${(h * 100).toFixed(1)}%`, transitionDelay: `${i * 12}ms` }}
        />
      ))}
    </div>
  );
}
