"use client";

import dynamic from "next/dynamic";
import MobileMenu from "@/components/sites/MobileMenu";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { CAR_SPECS } from "./Car";
import type { TurntableInput } from "./Garage";
import type { DriveControls, GameMode, HudRefs } from "./Scene";

const Scene = dynamic(() => import("./Scene"), { ssr: false });
const Garage = dynamic(() => import("./Garage"), { ssr: false });

const display = "font-(family-name:--font-neon-display)";
const heading = "font-(family-name:--font-neon-heading)";

const RELEASE = Date.UTC(2027, 2, 14, 18, 0, 0);

const features = [
  {
    title: "Endless highways",
    body: "Procedural roads that never repeat. Every run carves a new path through neon canyons and chrome deserts.",
    color: "#ff2a9d",
    icon: "M3 20 L10 4 M21 20 L14 4 M12 6 v2 M12 11 v2 M12 16 v3",
  },
  {
    title: "32 synthwave tracks",
    body: "An original soundtrack that shifts tempo with your speed. Hit boost and the drop hits with you.",
    color: "#ffb347",
    icon: "M9 18 V5 l11-2 v13 M9 18 a3 3 0 1 1-6 0 a3 3 0 0 1 6 0 M20 16 a3 3 0 1 1-6 0 a3 3 0 0 1 6 0",
  },
  {
    title: "Ghost racing",
    body: "Race the ghosts of your friends and the top 100 drivers worldwide, live, on the same stretch of road.",
    color: "#18e7ff",
    icon: "M5 21 V10 a7 7 0 0 1 14 0 v11 l-3-2 -2 2 -2-2 -2 2 -2-2 Z M9 10 h.01 M15 10 h.01",
  },
  {
    title: "Photo mode",
    body: "Freeze time at 300 km/h. Orbit, tilt, add film grain and VHS glitch, then share the shot in one tap.",
    color: "#b26bff",
    icon: "M4 8 h3 l2-3 h6 l2 3 h3 v11 H4 Z M12 17 a4 4 0 1 0 0-8 a4 4 0 0 0 0 8",
  },
];

const platforms = ["PC / Steam", "PlayStation 5", "Xbox Series X|S", "Switch 2", "Steam Deck"];

function Icon({ d, color }: { d: string; color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

function Countdown() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = requestAnimationFrame(tick);
    const id = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(id);
    };
  }, []);

  const left = now === null ? null : Math.max(0, RELEASE - now);
  const parts: [string, number | null][] = [
    ["Days", left === null ? null : Math.floor(left / 86_400_000)],
    ["Hours", left === null ? null : Math.floor(left / 3_600_000) % 24],
    ["Min", left === null ? null : Math.floor(left / 60_000) % 60],
    ["Sec", left === null ? null : Math.floor(left / 1000) % 60],
  ];

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-4">
      {parts.map(([label, value]) => (
        <div
          key={label}
          className="rounded-xl border border-[#ff2a9d]/30 bg-black/40 px-2 py-3 text-center sm:px-4 sm:py-5"
        >
          <div
            className={`${heading} text-2xl font-bold tabular-nums text-white sm:text-5xl`}
            style={{ textShadow: "0 0 18px #ff2a9d" }}
          >
            {value === null ? "--" : String(value).padStart(2, "0")}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-[#ffb347] sm:text-xs">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatBar({ label, value, from, to }: { label: string; value: number; from: string; to: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-1 text-[10px] uppercase tracking-wider text-white/60 sm:text-xs sm:tracking-widest">
        <span>{label}</span>
        <span className="tabular-nums text-white">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, background: `linear-gradient(90deg, ${from}, ${to})`, boxShadow: `0 0 12px ${from}` }}
        />
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
      <p className={`${heading} text-lg text-[#18e7ff]`} style={{ textShadow: "0 0 14px #18e7ff" }}>
        You&apos;re on the grid. See you at the starting line.
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
      <label htmlFor="neon-email" className="sr-only">
        Email address
      </label>
      <input
        id="neon-email"
        type="email"
        required
        placeholder="driver@grid.net"
        className="min-w-0 flex-1 rounded-full border border-[#ff2a9d]/40 bg-black/50 px-5 py-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#18e7ff] focus:shadow-[0_0_0_3px_rgba(24,231,255,0.2)]"
      />
      <button
        type="submit"
        className={`${heading} rounded-full bg-gradient-to-r from-[#ff2a9d] to-[#ffb347] px-6 py-3 text-sm font-bold uppercase tracking-widest text-black transition-transform hover:scale-[1.03] active:scale-95`}
      >
        Join the grid
      </button>
    </form>
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
        "radial-gradient(circle at 50% 46%, #ffb347 0, #ff2a9d 14%, rgba(123,44,191,0.6) 30%, transparent 55%), linear-gradient(#0b0218, #3a0a45 55%, #0b0218)",
    }}
  />
);

function subscribeMedia(query: string) {
  return (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  };
}
const subscribeReduced = subscribeMedia("(prefers-reduced-motion: reduce)");
const subscribeSmall = subscribeMedia("(max-width: 767px)");

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
function useSmallScreen() {
  return useSyncExternalStore(
    subscribeSmall,
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

/** Watches an element: `near` latches once it is close to the viewport, `visible` tracks it live. */
function useInView<T extends HTMLElement>(rootMargin = "0px") {
  const ref = useRef<T>(null);
  const [state, setState] = useState({ near: false, visible: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setState((s) => ({ near: s.near || entry.isIntersecting, visible: entry.isIntersecting }));
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return [ref, state] as const;
}

export default function NeonSite() {
  const controls = useRef<DriveControls>({ boost: false, target: 0, keySteer: 0, lastInput: 0 });
  const speedEl = useRef<HTMLSpanElement>(null);
  const boostEl = useRef<HTMLDivElement>(null);
  const scoreEl = useRef<HTMLDivElement>(null);
  const bestEl = useRef<HTMLSpanElement>(null);
  const comboEl = useRef<HTMLSpanElement>(null);
  const livesEl = useRef<HTMLDivElement>(null);
  const flashEl = useRef<HTMLDivElement>(null);
  const toastEl = useRef<HTMLDivElement>(null);
  const hud: HudRefs = {
    speed: speedEl,
    boost: boostEl,
    score: scoreEl,
    best: bestEl,
    combo: comboEl,
    lives: livesEl,
    flash: flashEl,
    toast: toastEl,
  };
  const heroRef = useRef<HTMLElement>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  const heroVisibleRef = useRef(true);
  const [mode, setMode] = useState<GameMode>("attract");
  const [carIndex, setCarIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const small = useSmallScreen();
  const turntable = useRef<TurntableInput>({ dragVelocity: 0, seq: 0 });
  const drag = useRef<{ x: number; t: number } | null>(null);
  const touchTimer = useRef<number | null>(null);
  const [garageRef, garageView] = useInView<HTMLDivElement>("300px");

  const onModeChange = useCallback((m: GameMode) => setMode(m), []);
  const engage = () => {
    controls.current.lastInput = performance.now();
  };

  // Pause the WebGL loop once the hero scrolls out of view.
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      heroVisibleRef.current = entry.isIntersecting;
      setHeroVisible(entry.isIntersecting);
      if (!entry.isIntersecting) controls.current.boost = false;
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Space = boost, arrows / A-D = steer, only while the hero is on screen.
  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    const steerFor = (key: string) =>
      key === "ArrowLeft" || key === "a" || key === "A" ? -1 : key === "ArrowRight" || key === "d" || key === "D" ? 1 : 0;

    const down = (e: KeyboardEvent) => {
      if (!heroVisibleRef.current || isTyping(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        controls.current.boost = true;
        controls.current.lastInput = performance.now();
      }
      const s = steerFor(e.key);
      if (s !== 0) {
        e.preventDefault();
        controls.current.keySteer = s;
        controls.current.lastInput = performance.now();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") controls.current.boost = false;
      if (steerFor(e.key) === controls.current.keySteer) controls.current.keySteer = 0;
    };
    const blur = () => {
      controls.current.boost = false;
      controls.current.keySteer = 0;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const clearTouchTimer = () => {
    if (touchTimer.current !== null) {
      window.clearTimeout(touchTimer.current);
      touchTimer.current = null;
    }
  };
  const steerFromPointer = (e: PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    controls.current.target = Math.max(-1, Math.min(1, x * 1.3));
    engage();
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    // Touch steers only while a finger is down; the mouse steers on hover.
    if (e.pointerType !== "mouse" && e.buttons === 0) return;
    steerFromPointer(e);
  };
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if ((e.target as Element).closest("a, button, input")) return;
    steerFromPointer(e);
    if (e.pointerType === "mouse") {
      if (e.button === 0) controls.current.boost = true;
    } else {
      // Short delay so a quick swipe to scroll doesn't fire the boost.
      clearTouchTimer();
      touchTimer.current = window.setTimeout(() => {
        controls.current.boost = true;
      }, 140);
    }
  };
  const stopBoost = () => {
    clearTouchTimer();
    controls.current.boost = false;
  };

  const driveCar = (i: number) => {
    setCarIndex(i);
    engage();
    heroRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
  };

  const onStageDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, t: performance.now() };
  };
  const onStageMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.buttons === 0) return;
    const now = performance.now();
    const dx = e.clientX - d.x;
    const dt = Math.max(16, now - d.t);
    turntable.current.dragVelocity = (dx / dt) * 6;
    turntable.current.seq += 1;
    drag.current = { x: e.clientX, t: now };
  };
  const onStageUp = () => {
    drag.current = null;
  };

  const car = CAR_SPECS[carIndex];
  const playing = mode === "play";

  return (
    <div className="min-h-screen overflow-x-clip bg-[#0b0218] text-white selection:bg-[#ff2a9d] selection:text-black">
      {/* ---------- Hero / mini-game ---------- */}
      <section
        ref={heroRef}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={stopBoost}
        onPointerCancel={stopBoost}
        onPointerLeave={stopBoost}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Neon Drive mini-game: steer with the mouse, arrow keys or by dragging; hold Space, click or touch to boost"
        className="relative h-[100svh] min-h-[560px] cursor-crosshair touch-pan-y select-none overflow-hidden"
      >
        <div className="absolute inset-0">
          <WebGLBoundary fallback={heroFallback}>
            <Scene
              controls={controls}
              hud={hud}
              active={heroVisible}
              car={car}
              reducedMotion={reducedMotion}
              onModeChange={onModeChange}
            />
          </WebGLBoundary>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0b0218] to-transparent" />
        {/* Crash flash */}
        <div
          ref={flashEl}
          className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(circle_at_50%_70%,rgba(255,255,255,0.9),rgba(255,42,109,0.6)_40%,transparent_75%)] mix-blend-screen"
          style={{ opacity: 0 }}
          aria-hidden
        />

        <nav className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-4 sm:px-8 sm:py-6">
          <a href="#top" className={`${display} text-lg text-[#ff2a9d] sm:text-2xl`} style={{ textShadow: "0 0 12px #ff2a9d" }}>
            Neon Drive
          </a>
          <div className={`${heading} hidden items-center gap-8 text-xs uppercase tracking-[0.25em] text-white/75 md:flex`}>
            <a href="#features" className="hover:text-[#18e7ff]">Features</a>
            <a href="#garage" className="hover:text-[#18e7ff]">Garage</a>
            <a href="#release" className="hover:text-[#18e7ff]">Release</a>
          </div>
          <div className="flex items-center gap-2">
          <a
            href="#join"
            className={`${heading} rounded-full border border-[#18e7ff]/70 bg-black/30 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#18e7ff] shadow-[0_0_18px_rgba(24,231,255,0.35)] transition-colors hover:bg-[#18e7ff] hover:text-black sm:text-xs`}
          >
            Wishlist
          </a>
          <MobileMenu links={[["#features", "Features"], ["#garage", "Garage"], ["#release", "Release"], ["#join", "Wishlist"]]} />
        </div>
        </nav>

        <div
          id="top"
          className={`pointer-events-none absolute inset-x-0 top-[13%] z-10 px-4 text-center transition-all duration-700 sm:top-[11%] ${
            playing ? "-translate-y-3 opacity-25" : "opacity-100"
          }`}
        >
          <p className={`${heading} mb-3 text-[10px] uppercase tracking-[0.5em] text-[#ffb347] [text-shadow:0_0_10px_rgba(0,0,0,0.9)] sm:text-xs`}>
            Arcade racer · Spring 2027
          </p>
          <h1
            className={`${display} text-[2.6rem] leading-none text-white min-[400px]:text-5xl sm:text-7xl lg:text-8xl`}
            style={{ textShadow: "0 0 10px #ff2a9d, 0 0 40px #ff2a9d, 0 0 80px #7b2cbf" }}
          >
            Neon Drive
          </h1>
          <p
            className={`mx-auto mt-4 max-w-md rounded-2xl border border-white/10 bg-[#0b0218]/65 px-4 py-2.5 text-[13px] leading-relaxed text-white shadow-[0_8px_40px_rgba(11,2,24,0.6)] backdrop-blur-md transition-opacity duration-500 sm:mt-5 sm:px-5 sm:py-3 sm:text-base ${
              playing ? "opacity-0" : "opacity-100"
            }`}
          >
            Endless midnight highways, a soundtrack that hits harder the faster you go, and one rule:{" "}
            <span className="font-semibold text-[#ffb347]">never lift.</span>
          </p>
        </div>

        {/* Toast */}
        <div
          ref={toastEl}
          className={`${heading} pointer-events-none absolute left-1/2 top-[44%] z-20 whitespace-nowrap rounded-full border border-current/40 bg-black/55 px-5 py-2 text-sm font-black uppercase tracking-[0.3em] text-[#18e7ff] backdrop-blur transition-all duration-300 data-[tone=bad]:text-[#ff3d6e] data-[tone=good]:text-[#ffb347] sm:text-lg`}
          style={{ opacity: 0, transform: "translate(-50%, 0) scale(0.9)", textShadow: "0 0 14px currentColor" }}
          aria-live="polite"
        />

        {/* Hint */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[4.75rem] z-10 flex justify-center px-4 sm:bottom-20">
          <div
            className={`${heading} rounded-full border border-white/20 bg-black/55 px-4 py-2 text-[9px] uppercase tracking-[0.25em] text-white/90 backdrop-blur sm:px-5 sm:py-2.5 sm:text-xs ${
              playing ? "" : "animate-pulse"
            }`}
          >
            {playing ? (
              <>
                <span className="hidden sm:inline">
                  Dodge traffic · grab orbs · hold <kbd className="mx-1 rounded border border-white/40 px-1.5 py-0.5 text-[#ffb347]">Space</kbd> to boost
                </span>
                <span className="sm:hidden">Drag to steer · hold to boost</span>
              </>
            ) : (
              <>
                <span className="hidden sm:inline">
                  Move the mouse or press <kbd className="mx-1 rounded border border-white/40 px-1.5 py-0.5 text-[#ffb347]">←</kbd>
                  <kbd className="mr-1 rounded border border-white/40 px-1.5 py-0.5 text-[#ffb347]">→</kbd> to take the wheel
                </span>
                <span className="sm:hidden">Touch &amp; drag to take the wheel</span>
              </>
            )}
          </div>
        </div>

        {/* Score HUD */}
        <div className="pointer-events-none absolute bottom-[7.5rem] left-4 z-10 sm:bottom-8 sm:left-8">
          <div className={`${heading} text-[9px] uppercase tracking-[0.3em] text-white/55 sm:text-[10px]`}>Score</div>
          <div
            ref={scoreEl}
            className={`${heading} text-2xl font-black tabular-nums text-white sm:text-4xl`}
            style={{ textShadow: "0 0 16px #ff2a9d" }}
          >
            DEMO
          </div>
          <div className={`${heading} mt-1 flex items-center gap-3 text-[9px] uppercase tracking-[0.2em] text-white/60 sm:text-[11px]`}>
            <span>
              Best <span ref={bestEl} className="tabular-nums text-[#ffb347]">0</span>
            </span>
            <span ref={comboEl} className="rounded border border-[#ffb347]/50 px-1 text-[#ffb347]">x1</span>
          </div>
          <div ref={livesEl} className="mt-1 text-xs tracking-[0.3em] text-[#18e7ff] [text-shadow:0_0_8px_#18e7ff] sm:text-sm" aria-label="Shields">
            ◆◆◆
          </div>
        </div>

        {/* Speed HUD */}
        <div className="pointer-events-none absolute bottom-[7.5rem] right-4 z-10 w-28 text-right sm:bottom-8 sm:right-8 sm:w-44">
          <div className={`${heading} leading-none`}>
            <span
              ref={speedEl}
              className="text-3xl font-black tabular-nums text-white sm:text-6xl"
              style={{ textShadow: "0 0 16px #18e7ff" }}
            >
              100
            </span>
            <span className="ml-1 text-[9px] uppercase tracking-widest text-[#18e7ff] sm:text-xs">km/h</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div
              ref={boostEl}
              className="h-full origin-left rounded-full bg-gradient-to-r from-[#ffb347] to-[#ff2a9d] shadow-[0_0_12px_#ff2a9d]"
              style={{ transform: "scaleX(0)" }}
            />
          </div>
          <div className={`${heading} mt-1 text-[9px] uppercase tracking-[0.3em] text-white/50 sm:text-[10px]`}>Boost</div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section
        id="features"
        className="relative px-4 py-24 sm:px-8"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,42,157,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,42,157,0.07) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      >
        <div className="mx-auto max-w-6xl 2xl:max-w-[1600px]">
          <p className={`${heading} text-xs uppercase tracking-[0.4em] text-[#18e7ff]`}>01 · The ride</p>
          <h2 className={`${heading} mt-3 max-w-2xl text-3xl font-black uppercase leading-tight sm:text-5xl`}>
            Built for the{" "}
            <span className="bg-gradient-to-r from-[#ff2a9d] to-[#ffb347] bg-clip-text text-transparent">last minute of midnight</span>
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <article
                key={f.title}
                className="group rounded-2xl border border-white/10 bg-[#140428]/80 p-6 transition-all duration-300 hover:-translate-y-1"
                style={{ boxShadow: `inset 0 1px 0 ${f.color}33` }}
              >
                <div
                  className="mb-5 grid h-12 w-12 place-items-center rounded-xl border transition-shadow group-hover:shadow-[0_0_24px_var(--c)]"
                  style={{ borderColor: `${f.color}66`, ["--c" as string]: f.color }}
                >
                  <Icon d={f.icon} color={f.color} />
                </div>
                <h3 className={`${heading} text-lg font-bold uppercase tracking-wide`}>{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Garage ---------- */}
      <section id="garage" className="relative overflow-hidden px-4 py-24 sm:px-8">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[80%] -translate-x-1/2 rounded-full bg-[#7b2cbf]/25 blur-3xl" />
        <div className="relative mx-auto max-w-6xl 2xl:max-w-[1600px]">
          <p className={`${heading} text-xs uppercase tracking-[0.4em] text-[#ffb347]`}>02 · The garage</p>
          <h2 className={`${heading} mt-3 text-3xl font-black uppercase sm:text-5xl`}>Pick your machine</h2>
          <div className="mt-12 grid gap-6 lg:grid-cols-5">
            <div
              ref={garageRef}
              onPointerDown={onStageDown}
              onPointerMove={onStageMove}
              onPointerUp={onStageUp}
              onPointerCancel={onStageUp}
              onPointerLeave={onStageUp}
              className="relative h-[300px] cursor-grab touch-pan-y select-none overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(ellipse_at_50%_80%,#2a0845,#0b0218_70%)] active:cursor-grabbing sm:h-[420px] lg:col-span-3 lg:h-[500px]"
              style={{ boxShadow: `0 30px 80px -40px ${car.from}` }}
            >
              {garageView.near && (
                <div className="absolute inset-0">
                  <WebGLBoundary fallback={null}>
                    <Garage
                      spec={car}
                      input={turntable}
                      active={garageView.visible}
                      lowPower={small}
                      reducedMotion={reducedMotion}
                    />
                  </WebGLBoundary>
                </div>
              )}
              <div className="pointer-events-none absolute left-5 top-5 sm:left-7 sm:top-7">
                <span className={`${heading} text-[10px] uppercase tracking-[0.3em] text-white/50`}>{car.class}</span>
                <h3
                  className={`${heading} mt-1 text-xl font-black uppercase sm:text-3xl`}
                  style={{ color: car.from, textShadow: `0 0 18px ${car.from}` }}
                >
                  {car.name}
                </h3>
              </div>
              <span className={`${heading} pointer-events-none absolute bottom-5 left-5 text-[10px] uppercase tracking-[0.3em] text-white/45 sm:left-7`}>
                Drag to spin
              </span>
              <button
                type="button"
                onClick={() => driveCar(carIndex)}
                className={`${heading} absolute bottom-4 right-4 rounded-full bg-gradient-to-r from-[#ff2a9d] to-[#ffb347] px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-black shadow-[0_0_24px_rgba(255,42,157,0.5)] transition-transform hover:scale-[1.04] active:scale-95 sm:bottom-6 sm:right-6 sm:px-5 sm:text-xs`}
              >
                Drive it ↑
              </button>
            </div>
            <div className="flex flex-col gap-4 lg:col-span-2">
              {CAR_SPECS.map((c, i) => {
                const selected = i === carIndex;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCarIndex(i)}
                    className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 ${
                      selected
                        ? "border-white/30 bg-gradient-to-b from-[#24084a] to-[#12032a]"
                        : "border-white/10 bg-[#140428]/70 hover:-translate-y-0.5 hover:border-white/20"
                    }`}
                    style={selected ? { boxShadow: `0 0 0 1px ${c.from}66, 0 18px 50px -24px ${c.from}` } : undefined}
                  >
                    <div
                      className={`absolute inset-y-0 left-0 w-1 transition-opacity ${selected ? "opacity-100" : "opacity-30 group-hover:opacity-70"}`}
                      style={{ background: `linear-gradient(${c.from}, ${c.to})` }}
                    />
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className={`${heading} text-base font-black uppercase sm:text-lg`} style={{ color: c.from }}>
                        {c.name}
                      </h3>
                      <span className={`${heading} shrink-0 text-[10px] uppercase tracking-[0.2em] text-white/45`}>0{i + 1}</span>
                    </div>
                    <p className={`${heading} mt-0.5 text-[10px] uppercase tracking-[0.3em] text-white/45`}>{c.class}</p>
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      {Object.entries(c.stats).map(([label, value]) => (
                        <StatBar key={label} label={label} value={value} from={c.from} to={c.to} />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Release ---------- */}
      <section id="release" className="px-4 py-24 sm:px-8">
        <div className="mx-auto grid max-w-6xl 2xl:max-w-[1600px] items-center gap-12 lg:grid-cols-2">
          <div>
            <p className={`${heading} text-xs uppercase tracking-[0.4em] text-[#18e7ff]`}>03 · Launch</p>
            <h2 className={`${heading} mt-3 text-3xl font-black uppercase sm:text-5xl`}>
              Lights out on{" "}
              <span className={`${display} block pt-2 text-4xl font-normal text-[#ffb347] sm:text-6xl`} style={{ textShadow: "0 0 20px #ff7a18" }}>
                03.14.27
              </span>
            </h2>
            <p className="mt-4 max-w-md text-white/65">
              Day-one launch on every platform with cross-play ghost races and cloud saves. Pre-order to unlock the Midnight RS on launch night.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {platforms.map((p) => (
                <span
                  key={p}
                  className={`${heading} rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[11px] uppercase tracking-widest text-white/80`}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
          <Countdown />
        </div>
      </section>

      {/* ---------- Newsletter ---------- */}
      <section id="join" className="px-4 pb-28 pt-8 sm:px-8">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-[#ff2a9d]/30 bg-gradient-to-br from-[#2a0845] via-[#140428] to-[#3a0a2a] px-6 py-14 text-center sm:px-12">
          <div className="pointer-events-none absolute -bottom-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-gradient-to-b from-[#ffb347] to-[#ff2a9d] opacity-60 blur-2xl" />
          <h2 className={`${heading} relative text-2xl font-black uppercase sm:text-4xl`}>Get on the grid</h2>
          <p className="relative mx-auto mt-3 max-w-md text-white/70">
            Beta keys, soundtrack drops and dev diaries. One email a month, no spam, no brakes.
          </p>
          <div className="relative mt-8 flex justify-center">
            <Newsletter />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 pb-24 pt-10 sm:px-8">
        <div className="mx-auto flex max-w-6xl 2xl:max-w-[1600px] flex-col items-center justify-between gap-4 text-xs text-white/45 sm:flex-row">
          <span className={`${display} text-base text-[#ff2a9d]`}>Neon Drive</span>
          <span>© 2027 Afterglow Interactive. A MeshUI demo, all names fictional.</span>
          <div className="flex gap-4 uppercase tracking-widest">
            <a href="#features" className="hover:text-white">Press kit</a>
            <a href="#join" className="hover:text-white">Discord</a>
            <a href="#top" className="hover:text-white">Top ↑</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
