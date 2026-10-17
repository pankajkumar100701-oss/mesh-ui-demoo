"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import dynamic from "next/dynamic";
import MobileMenu from "@/components/sites/MobileMenu";
import { PHASES, PROJECTS, clockLabel, phaseLabel, type Project } from "./data";
import type { TimeControl } from "./Scene";

const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,#56609e,#f6b49c)]">
      <span className="animate-pulse font-(family-name:--font-metro-mono) text-xs uppercase tracking-[0.3em] text-white/80">
        Zoning the city…
      </span>
    </div>
  ),
});

const NAV: [string, string][] = [
  ["#studio", "Studio"],
  ["#projects", "Projects"],
  ["#process", "Process"],
  ["#team", "Team"],
];

const PILLARS = [
  {
    title: "Urban planning",
    text: "Masterplans, transit corridors and zoning codes written around walking distance, not parking ratios.",
  },
  {
    title: "Architecture",
    text: "Towers, housing and civic buildings that hand their ground floors back to the street.",
  },
  {
    title: "Public realm",
    text: "Riverfronts, plazas and parks: the rooms between buildings where a city actually lives.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Listen",
    text: "Six weeks on the ground before a single drawing. Walks, workshops and a lot of tea with the people who already live there.",
  },
  {
    n: "02",
    title: "Map",
    text: "Sun paths, flood lines, footfall, bus loads. We model the site through a full day, dawn to dusk, like the one above.",
  },
  {
    n: "03",
    title: "Model",
    text: "Physical and digital models at 1:500, iterated in public. Every resident gets a vote on the street-level design.",
  },
  {
    n: "04",
    title: "Build & stay",
    text: "We stay on through construction and for two years after opening, measuring energy, shade and how people use it.",
  },
];

const STATS = [
  { value: 142, suffix: "", label: "neighbourhoods planned" },
  { value: 38, suffix: "", label: "buildings completed" },
  { value: 2.4, suffix: "M m²", label: "of new public space", decimals: 1 },
  { value: 61, suffix: "%", label: "less operational carbon on average" },
];

const TEAM = [
  { name: "Ira Menon", role: "Founding partner · Towers", hue: "#f97316" },
  { name: "Tomás Aguirre", role: "Partner · Civic & cultural", hue: "#0ea5e9" },
  { name: "Noor Haddad", role: "Director · Housing", hue: "#22c55e" },
  { name: "Kenji Arakawa", role: "Director · Timber & markets", hue: "#eab308" },
  { name: "Abena Owusu", role: "Director · Transit planning", hue: "#a855f7" },
];

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("");

/* ------------------------------------------------------------------ */
/* Little SVG elevations for the project cards                         */
/* ------------------------------------------------------------------ */

function ProjectArt({ p }: { p: Project }) {
  const ground = 104;
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`metro-sky-${p.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6e6d6" />
          <stop offset="1" stopColor="#fbf7f1" />
        </linearGradient>
        <pattern id={`metro-win-${p.id}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#f4efe6" />
          <rect x="1.4" y="1.6" width="3.2" height="2.6" fill="#9fb3c8" />
        </pattern>
      </defs>
      <rect width="200" height="120" fill={`url(#metro-sky-${p.id})`} />
      {/* Neighbouring skyline */}
      <g fill="#e2d8ca">
        <rect x="8" y="70" width="22" height="34" />
        <rect x="32" y="82" width="16" height="22" />
        <rect x="150" y="76" width="18" height="28" />
        <rect x="170" y="60" width="22" height="44" />
      </g>
      {p.shape === "helix" &&
        Array.from({ length: 14 }, (_, i) => (
          <rect
            key={i}
            x={78 + Math.sin(i * 0.5) * 6}
            y={ground - (i + 1) * 6.4}
            width={44 - i * 0.6}
            height="5.6"
            fill={`url(#metro-win-${p.id})`}
            stroke="#c7cfd8"
            strokeWidth="0.6"
          />
        ))}
      {p.shape === "lantern" && (
        <>
          <rect x="74" y="34" width="52" height="70" rx="3" fill={`url(#metro-win-${p.id})`} />
          <rect x="78" y="22" width="44" height="14" rx="3" fill={p.accent} />
          <rect x="70" y="32" width="60" height="4" fill="#cdd9e1" />
        </>
      )}
      {p.shape === "terraces" &&
        [0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x={60 + i * 18} y={ground - (i + 1) * 16} width={80 - i * 18} height="16" fill={`url(#metro-win-${p.id})`} stroke="#d8c7b0" strokeWidth="0.6" />
            <rect x={60 + i * 18} y={ground - (i + 1) * 16 - 3} width="18" height="4" rx="2" fill={p.accent} />
          </g>
        ))}
      {p.shape === "canopy" && (
        <>
          <rect x="62" y="72" width="76" height="32" fill={`url(#metro-win-${p.id})`} />
          <rect x="72" y="58" width="40" height="14" fill="#e8d6bb" />
          <polygon points="50,58 150,46 150,50 50,62" fill="#25355e" />
          <rect x="56" y="60" width="2.5" height="44" fill="#b98a55" />
          <rect x="142" y="50" width="2.5" height="54" fill="#b98a55" />
          <rect x="120" y="80" width="10" height="3" fill={p.accent} />
        </>
      )}
      {p.shape === "spire" && (
        <>
          <polygon points="74,104 126,104 112,26 88,26" fill={`url(#metro-win-${p.id})`} stroke="#cdc8e6" strokeWidth="0.8" />
          <rect x="99" y="8" width="2" height="18" fill="#9ca3af" />
          <circle cx="100" cy="8" r="2.4" fill={p.accent} />
          <rect x="0" y="92" width="200" height="4" fill="#d8d0c0" />
          <rect x="20" y="86" width="26" height="6" rx="2" fill="#f97316" />
        </>
      )}
      <rect y={ground} width="200" height="16" fill="#cfc6b6" />
      <rect y={ground} width="200" height="2" fill="#b8ad9b" />
    </svg>
  );
}

function Leaves({ score, className = "" }: { score: number; className?: string }) {
  return (
    <span className={`inline-flex gap-0.5 ${className}`} aria-label={`${score} of 5 sustainability leaves`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width="13" height="13" viewBox="0 0 16 16" aria-hidden>
          <path
            d="M3 13C3 6 8 3 14 2c0 6-3 11-10 11zm0 0 6-6"
            fill={i < score ? "#22c55e" : "none"}
            stroke={i < score ? "#15803d" : "#c7c1b5"}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Stat counter: counts up once when scrolled into view                */
/* ------------------------------------------------------------------ */

function Counter({ value, decimals = 0, suffix, reduced }: { value: number; decimals?: number; suffix: string; reduced: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (v: number) => `${v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
    if (reduced) {
      el.textContent = fmt(value);
      return;
    }
    el.textContent = fmt(0);
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - t0) / 1600, 1);
          el.textContent = fmt(value * (1 - Math.pow(1 - p, 4)));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, decimals, suffix, reduced]);
  return (
    <span ref={ref}>
      {value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const PAGE_CSS = `
@keyframes metro-rise { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
.metro-rise { opacity: 0; animation: metro-rise 1s cubic-bezier(.2,.7,.2,1) forwards }
.metro-range { -webkit-appearance: none; appearance: none; background: transparent; height: 28px; }
.metro-range::-webkit-slider-runnable-track { height: 6px; border-radius: 999px; background: linear-gradient(90deg,#f6b49c,#8fc3ee 30%,#6aa7e0 50%,#ffc58a 70%,#ff7a5c 84%,#6d2c8c 94%,#120c30); }
.metro-range::-moz-range-track { height: 6px; border-radius: 999px; background: linear-gradient(90deg,#f6b49c,#8fc3ee 30%,#6aa7e0 50%,#ffc58a 70%,#ff7a5c 84%,#6d2c8c 94%,#120c30); }
.metro-range::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; margin-top: -7px; border-radius: 999px; background: #fff; border: 3px solid #f97316; box-shadow: 0 2px 10px rgba(0,0,0,.35); cursor: grab; }
.metro-range::-moz-range-thumb { width: 14px; height: 14px; border-radius: 999px; background: #fff; border: 3px solid #f97316; box-shadow: 0 2px 10px rgba(0,0,0,.35); cursor: grab; }
.metro-range:focus-visible { outline: 2px solid #0ea5e9; outline-offset: 2px; border-radius: 999px; }
@media (prefers-reduced-motion: reduce) { .metro-rise { animation: none; opacity: 1 } }
`;

export default function MetroSite() {
  const [active, setActive] = useState<string | null>(null);
  const [userAuto, setUserAuto] = useState<boolean | null>(null);
  const [dark, setDark] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);
  const [sent, setSent] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const phaseRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<TimeControl>({ t: 0.04, goal: null });
  const lastT = useRef(-1);
  const darkRef = useRef(false);
  const reducedMotion = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
  const auto = userAuto ?? !reducedMotion;

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // With reduced motion there is no auto cycle, so open on the most flattering hour instead of dawn.
  useEffect(() => {
    if (reducedMotion && timeRef.current.t < 0.1) timeRef.current.goal = 0.74;
  }, [reducedMotion]);

  /** Called by the scene every frame; touches the DOM directly so the slider never re-renders React. */
  const onTick = useCallback((t: number) => {
    if (Math.abs(t - lastT.current) < 0.0005) return;
    lastT.current = t;
    if (sliderRef.current && document.activeElement !== sliderRef.current) sliderRef.current.value = String(Math.round(t * 1000));
    if (clockRef.current) clockRef.current.textContent = clockLabel(t);
    if (phaseRef.current) phaseRef.current.textContent = phaseLabel(t);
    const d = t > 0.82;
    if (d !== darkRef.current) {
      darkRef.current = d;
      setDark(d);
    }
  }, []);

  const activeIndex = PROJECTS.findIndex((p) => p.id === active);
  const project = activeIndex >= 0 ? PROJECTS[activeIndex] : null;

  function step(dir: 1 | -1) {
    const i = activeIndex < 0 ? 0 : (activeIndex + dir + PROJECTS.length) % PROJECTS.length;
    setActive(PROJECTS[i].id);
  }

  function viewInModel(id: string) {
    setActive(id);
    document.getElementById("top")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
  }

  function jumpTo(t: number) {
    timeRef.current.goal = t;
    setUserAuto(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setSent(true);
  }

  const ink = dark ? "text-white" : "text-[#15171c]";
  const glass = dark ? "border-white/15 bg-[#120c30]/55 text-white" : "border-black/10 bg-white/65 text-[#15171c]";

  return (
    <div
      id="top"
      className="min-h-screen overflow-x-clip bg-[#f3efe7] text-[#15171c] font-(family-name:--font-metro-body)"
      style={{ colorScheme: "light" }}
    >
      <style>{PAGE_CSS}</style>

      {/* ------------------------------------------------------------ HERO */}
      <section ref={heroRef} className="relative h-svh min-h-[600px] w-full overflow-hidden bg-[#56609e]">
        <Scene
          active={active}
          onSelect={setActive}
          timeRef={timeRef}
          auto={auto}
          onTick={onTick}
          paused={!heroVisible}
          reducedMotion={reducedMotion}
        />

        {/* Legibility scrims */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 z-[5] transition-opacity duration-1000 max-md:hidden ${project ? "opacity-0" : "opacity-100"} ${
            dark
              ? "bg-[linear-gradient(90deg,rgba(10,8,34,0.6),rgba(10,8,34,0.18)_38%,transparent_55%)]"
              : "bg-[linear-gradient(90deg,rgba(250,244,234,0.62),rgba(250,244,234,0.15)_36%,transparent_52%)]"
          }`}
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 top-0 z-[5] h-[46%] transition-colors duration-1000 md:hidden ${
            dark ? "bg-gradient-to-b from-[#0a0822]/85 via-[#0a0822]/40 to-transparent" : "bg-gradient-to-b from-[#faf4ea]/90 via-[#faf4ea]/45 to-transparent"
          }`}
        />

        <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <a href="#top" className={`pointer-events-auto flex items-center gap-2.5 transition-colors duration-700 ${ink}`}>
            <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
              <rect x="1" y="11" width="6" height="14" rx="1" fill="#f97316" />
              <rect x="10" y="3" width="6" height="22" rx="1" fill="currentColor" />
              <rect x="19" y="8" width="6" height="17" rx="1" fill="#0ea5e9" />
            </svg>
            <span className="text-lg font-bold tracking-tight font-(family-name:--font-metro-display)">
              Metro<span className="font-normal opacity-70"> Habitat</span>
            </span>
          </a>
          <nav
            className={`pointer-events-auto hidden items-center gap-1 rounded-full border px-2 py-1 text-sm font-semibold backdrop-blur-md transition-colors duration-700 md:flex ${glass}`}
          >
            {NAV.map(([href, label]) => (
              <a key={href} href={href} className="rounded-full px-3 py-1.5 opacity-80 transition hover:bg-black/5 hover:opacity-100">
                {label}
              </a>
            ))}
          </nav>
          <div className="pointer-events-auto flex items-center gap-2">
            <a
              href="#contact"
              className="rounded-full bg-[#f97316] px-4 py-2 text-sm font-bold text-white shadow-[0_10px_30px_-10px_rgba(249,115,22,0.9)] transition-transform hover:-translate-y-0.5 max-sm:hidden"
            >
              Start a project
            </a>
            <MobileMenu tone={dark ? "dark" : "light"} links={[...NAV, ["#contact", "Contact"]]} />
          </div>
        </header>

        {/* Headline: top on phones, left-centre on desktop */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-20 transition-opacity duration-500 sm:px-8 md:top-1/2 md:max-w-[44rem] md:-translate-y-[58%] md:pl-12 md:pt-0 lg:pl-16 ${
            project ? "opacity-0" : "opacity-100"
          }`}
        >
          <p
            className={`metro-rise mb-3 font-(family-name:--font-metro-mono) text-[10px] uppercase tracking-[0.22em] transition-colors duration-700 sm:text-xs ${
              dark ? "text-orange-300" : "text-[#c2410c]"
            }`}
            style={{ animationDelay: "1.2s" }}
          >
            City planning · Architecture · Est. 2009
          </p>
          <h1
            className={`metro-rise text-[2.4rem] leading-[1] font-bold tracking-[-0.03em] transition-colors duration-700 sm:text-6xl lg:text-7xl font-(family-name:--font-metro-display) ${ink}`}
            style={{ animationDelay: "1.4s" }}
          >
            We design cities
            <br />
            <span className="text-[#f97316]">at the scale</span> of a footstep.
          </h1>
          <p
            className={`metro-rise mt-4 max-w-md text-sm leading-relaxed transition-colors duration-700 sm:text-base max-md:hidden ${
              dark ? "text-white/80" : "text-[#15171c]/75"
            }`}
            style={{ animationDelay: "1.6s" }}
          >
            Masterplans, towers and riverfronts for growing cities. Drag the model, scrub the sun, and tap a numbered tower to see
            one of our projects.
          </p>
          <div className="metro-rise pointer-events-auto mt-5 flex flex-wrap items-center gap-3" style={{ animationDelay: "1.8s" }}>
            <a
              href="#projects"
              className={`rounded-full px-5 py-3 text-sm font-bold shadow-lg transition-transform hover:-translate-y-0.5 ${
                dark ? "bg-white text-[#15171c]" : "bg-[#15171c] text-white"
              }`}
            >
              Featured projects
            </a>
            <button
              type="button"
              onClick={() => setActive(PROJECTS[0].id)}
              className={`rounded-full border px-4 py-2.5 text-xs font-semibold backdrop-blur-md transition-colors duration-700 ${glass}`}
            >
              Tour the model →
            </button>
          </div>
        </div>

        {/* Time of day */}
        <div
          className={`absolute z-30 rounded-2xl border p-3 shadow-xl backdrop-blur-xl transition-all duration-500 max-md:inset-x-3 max-md:bottom-16 md:bottom-20 md:left-12 md:w-[380px] lg:left-16 ${glass} ${
            project ? "max-md:pointer-events-none max-md:translate-y-4 max-md:opacity-0" : ""
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (!auto) timeRef.current.goal = null;
                setUserAuto(!auto);
              }}
              aria-label={auto ? "Pause the day cycle" : "Play the day cycle"}
              aria-pressed={auto}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f97316] text-white shadow-md transition-transform hover:scale-105"
            >
              {auto ? (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                  <rect x="2" y="1.5" width="2.8" height="9" rx="0.8" fill="currentColor" />
                  <rect x="7.2" y="1.5" width="2.8" height="9" rx="0.8" fill="currentColor" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                  <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
                </svg>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span ref={clockRef} className="font-(family-name:--font-metro-mono) text-lg font-medium tabular-nums">
                  {clockLabel(0.04)}
                </span>
                <span ref={phaseRef} className="truncate font-(family-name:--font-metro-mono) text-[10px] uppercase tracking-[0.2em] opacity-70">
                  {phaseLabel(0.04)}
                </span>
              </div>
              <input
                ref={sliderRef}
                type="range"
                min={0}
                max={1000}
                defaultValue={40}
                aria-label="Time of day"
                className="metro-range block w-full"
                onChange={(e) => {
                  timeRef.current.t = Number(e.target.value) / 1000;
                  timeRef.current.goal = null;
                  setUserAuto(false);
                }}
              />
            </div>
          </div>
          <div className="mt-1 flex gap-1.5 max-sm:hidden">
            {PHASES.map((ph) => (
              <button
                key={ph.label}
                type="button"
                onClick={() => jumpTo(ph.t)}
                className={`flex-1 rounded-full px-2 py-1 font-(family-name:--font-metro-mono) text-[10px] uppercase tracking-wider transition-colors ${
                  dark ? "bg-white/10 hover:bg-white/20" : "bg-black/5 hover:bg-black/10"
                }`}
              >
                {ph.label}
              </button>
            ))}
          </div>
        </div>

        {/* Project card */}
        <aside
          aria-live="polite"
          className={`absolute z-30 transition-all duration-500 max-md:inset-x-3 max-md:bottom-16 md:right-8 md:top-1/2 md:w-[380px] md:-translate-y-1/2 ${
            project ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
          }`}
        >
          {project && (
            <div
              key={project.id}
              className="metro-rise max-h-[calc(100svh-9rem)] overflow-y-auto rounded-3xl border border-white/60 bg-white/90 text-[#15171c] shadow-[0_30px_80px_-30px_rgba(20,10,40,0.6)] backdrop-blur-xl"
              style={{ animationDuration: "0.55s" }}
            >
              <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${project.accent}, #0ea5e9)` }} />
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-(family-name:--font-metro-mono) text-[10px] uppercase tracking-[0.2em]" style={{ color: project.accent }}>
                      {String(activeIndex + 1).padStart(2, "0")} / {String(PROJECTS.length).padStart(2, "0")} · {project.kind}
                    </p>
                    <h2 className="mt-1 text-2xl font-bold tracking-tight font-(family-name:--font-metro-display)">{project.name}</h2>
                    <p className="mt-0.5 text-sm text-black/60">
                      by {project.architect} · {project.district}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActive(null)}
                    aria-label="Close project"
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-black/5 text-lg hover:bg-black/10"
                  >
                    ×
                  </button>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Floors", String(project.floors)],
                    ["Height", `${project.height} m`],
                    ["Complete", project.year],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-[#f3efe7] px-2 py-2.5">
                      <dt className="font-(family-name:--font-metro-mono) text-[9px] uppercase tracking-[0.18em] text-black/50">{k}</dt>
                      <dd className="mt-0.5 text-lg font-bold font-(family-name:--font-metro-display)">{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-green-600/20 bg-green-50 px-3 py-2">
                  <span className="text-xs font-bold text-green-800">{project.rating}</span>
                  <Leaves score={project.score} />
                </div>

                <p className="mt-3 text-sm leading-relaxed text-black/70">{project.blurb}</p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {project.facts.map((f) => (
                    <li key={f} className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold text-black/70">
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="#contact"
                  className="mt-4 block rounded-full bg-[#15171c] px-5 py-2.5 text-center text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
                >
                  Plan something like this
                </a>
                <div className="mt-3 flex items-center justify-between border-t border-black/10 pt-3 text-xs font-bold text-black/55">
                  <button type="button" onClick={() => step(-1)} className="truncate rounded-full px-2 py-1 hover:bg-black/5 hover:text-black">
                    ← {PROJECTS[(activeIndex - 1 + PROJECTS.length) % PROJECTS.length].name}
                  </button>
                  <button type="button" onClick={() => step(1)} className="truncate rounded-full px-2 py-1 hover:bg-black/5 hover:text-black">
                    {PROJECTS[(activeIndex + 1) % PROJECTS.length].name} →
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>

        <p
          className={`pointer-events-none absolute bottom-20 right-8 z-20 font-(family-name:--font-metro-mono) text-[10px] uppercase tracking-[0.2em] transition-opacity duration-500 max-md:hidden ${
            project ? "opacity-0" : "opacity-60"
          } ${dark ? "text-white" : "text-black"}`}
        >
          Drag to orbit · Scroll to zoom
        </p>
      </section>

      {/* ----------------------------------------------------------- STUDIO */}
      <section id="studio" className="mx-auto max-w-6xl px-4 py-20 sm:px-8 sm:py-28 2xl:max-w-[1600px]">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <div>
            <p className="font-(family-name:--font-metro-mono) text-xs uppercase tracking-[0.25em] text-[#c2410c]">The studio</p>
            <h2 className="mt-4 text-4xl leading-[1.05] font-bold tracking-[-0.02em] sm:text-5xl font-(family-name:--font-metro-display)">
              Forty planners, architects and landscape designers who still walk every site.
            </h2>
          </div>
          <div className="space-y-5 text-[#15171c]/75 lg:pt-10">
            <p>
              Metro Habitat started as three friends drawing bus routes on napkins. Fifteen years later we plan whole districts, but
              the brief hasn&apos;t changed: a city should work for a child walking to school and a grandmother walking to the market.
            </p>
            <p>
              We work at every scale at once. The zoning code, the tower, the bench by the river: they&apos;re one design, so we draw
              them together.
            </p>
          </div>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <div key={p.title} className="rounded-3xl border border-black/10 bg-white p-6 transition-transform duration-300 hover:-translate-y-1">
              <div className="flex items-center gap-3">
                <span
                  className="grid size-10 place-items-center rounded-xl text-sm font-bold text-white"
                  style={{ background: ["#f97316", "#15171c", "#0ea5e9"][i] }}
                >
                  0{i + 1}
                </span>
                <h3 className="text-xl font-bold font-(family-name:--font-metro-display)">{p.title}</h3>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-black/65">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- PROJECTS */}
      <section id="projects" className="border-y border-black/10 bg-[#ebe5d9]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-8 sm:py-28 2xl:max-w-[1600px]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-(family-name:--font-metro-mono) text-xs uppercase tracking-[0.25em] text-[#c2410c]">Featured projects</p>
              <h2 className="mt-4 max-w-xl text-4xl leading-[1.05] font-bold tracking-[-0.02em] sm:text-5xl font-(family-name:--font-metro-display)">
                Five buildings, one skyline.
              </h2>
            </div>
            <p className="max-w-sm text-black/65">Every project here stands in the model above. Open one and the camera flies straight to it.</p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PROJECTS.map((p, i) => (
              <article
                key={p.id}
                className={`group flex flex-col overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-40px_rgba(20,20,30,0.5)] transition-transform duration-300 hover:-translate-y-1.5 ${
                  i === 0 ? "lg:col-span-2 lg:row-span-1" : ""
                }`}
              >
                <div className={`overflow-hidden ${i === 0 ? "aspect-[5/3] lg:aspect-[2.4/1]" : "aspect-[5/3]"}`}>
                  <div className="h-full w-full transition-transform duration-500 group-hover:scale-105">
                    <ProjectArt p={p} />
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-(family-name:--font-metro-mono) text-[10px] uppercase tracking-[0.2em]" style={{ color: p.accent }}>
                      {p.kind}
                    </p>
                    <Leaves score={p.score} />
                  </div>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight font-(family-name:--font-metro-display)">{p.name}</h3>
                  <p className="mt-1 text-sm text-black/55">
                    {p.architect} · {p.floors} floors · {p.year}
                  </p>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-black/70">{p.blurb}</p>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-800">{p.rating}</span>
                    <button
                      type="button"
                      onClick={() => viewInModel(p.id)}
                      className="rounded-full border border-black/15 px-4 py-2 text-sm font-bold transition-colors hover:bg-[#15171c] hover:text-white"
                    >
                      View in model
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- PROCESS */}
      <section id="process" className="bg-[#15171c] text-[#f3efe7]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-8 sm:py-28 2xl:max-w-[1600px]">
          <p className="font-(family-name:--font-metro-mono) text-xs uppercase tracking-[0.25em] text-orange-300">How we work</p>
          <h2 className="mt-4 max-w-2xl text-4xl leading-[1.05] font-bold tracking-[-0.02em] sm:text-5xl font-(family-name:--font-metro-display)">
            Slow at the start, so the city can move fast later.
          </h2>
          <ol className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="bg-[#15171c] p-6 transition-colors hover:bg-[#1c1f26] sm:p-8">
                <span className="font-(family-name:--font-metro-mono) text-sm text-orange-300">{s.n}</span>
                <h3 className="mt-8 text-2xl font-bold font-(family-name:--font-metro-display)">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/65">{s.text}</p>
              </li>
            ))}
          </ol>

          <dl className="mt-16 grid grid-cols-2 gap-x-6 gap-y-10 border-t border-white/10 pt-12 lg:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <dt className="text-4xl font-bold tracking-tight text-white sm:text-5xl font-(family-name:--font-metro-display)">
                  <Counter value={s.value} decimals={s.decimals} suffix={s.suffix} reduced={reducedMotion} />
                </dt>
                <dd className="mt-2 max-w-[14rem] text-sm text-white/60">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------------- TEAM */}
      <section id="team" className="mx-auto max-w-6xl px-4 py-20 sm:px-8 sm:py-28 2xl:max-w-[1600px]">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-(family-name:--font-metro-mono) text-xs uppercase tracking-[0.25em] text-[#c2410c]">Partners</p>
            <h2 className="mt-4 max-w-xl text-4xl leading-[1.05] font-bold tracking-[-0.02em] sm:text-5xl font-(family-name:--font-metro-display)">
              The people behind the model.
            </h2>
          </div>
          <p className="max-w-sm text-black/65">Five partners, five disciplines, one long table in an old print works by the river.</p>
        </div>
        <ul className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {TEAM.map((m) => (
            <li key={m.name} className="group rounded-3xl border border-black/10 bg-white p-4 transition-transform duration-300 hover:-translate-y-1">
              <div
                className="relative grid aspect-square place-items-center overflow-hidden rounded-2xl"
                style={{ background: `linear-gradient(150deg, ${m.hue}, #15171c)` }}
              >
                <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full opacity-25" aria-hidden>
                  {[16, 34, 52, 70].map((x, i) => (
                    <rect key={x} x={x} y={100 - (30 + ((i * 37) % 50))} width="14" height={30 + ((i * 37) % 50)} fill="#fff" />
                  ))}
                </svg>
                <span className="relative text-3xl font-bold text-white font-(family-name:--font-metro-display)">{initials(m.name)}</span>
              </div>
              <p className="mt-3 font-bold leading-tight">{m.name}</p>
              <p className="mt-0.5 text-xs text-black/55">{m.role}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------- CONTACT */}
      <section id="contact" className="px-4 pb-20 sm:px-8 sm:pb-28">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#f97316,#c2410c_45%,#3b1d5c)] p-6 text-white shadow-2xl sm:p-12 2xl:max-w-[1600px]">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr]">
            <div>
              <p className="font-(family-name:--font-metro-mono) text-xs uppercase tracking-[0.25em] text-white/75">Start a project</p>
              <h2 className="mt-4 text-4xl leading-[1.05] font-bold tracking-[-0.02em] sm:text-5xl font-(family-name:--font-metro-display)">
                Got a site, a street or a whole district?
              </h2>
              <p className="mt-4 max-w-sm text-white/80">
                Tell us where it is and what keeps you up at night. A partner replies within two working days.
              </p>
              <p className="mt-8 font-(family-name:--font-metro-mono) text-sm text-white/80">
                studio@metrohabitat.example
                <br />
                +91 80 4000 2009
              </p>
            </div>

            <form onSubmit={submit} className="grid gap-4 rounded-3xl bg-white p-5 text-[#15171c] sm:grid-cols-2 sm:p-6">
              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-black/55">
                Name
                <input
                  required
                  name="name"
                  autoComplete="name"
                  className="rounded-xl border border-black/15 bg-[#f3efe7] px-3 py-2.5 text-base font-semibold normal-case tracking-normal text-[#15171c]"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-black/55">
                Email
                <input
                  required
                  type="email"
                  name="email"
                  autoComplete="email"
                  className="rounded-xl border border-black/15 bg-[#f3efe7] px-3 py-2.5 text-base font-semibold normal-case tracking-normal text-[#15171c]"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-black/55 sm:col-span-2">
                Project type
                <select
                  name="type"
                  defaultValue="masterplan"
                  className="rounded-xl border border-black/15 bg-[#f3efe7] px-3 py-2.5 text-base font-semibold normal-case tracking-normal text-[#15171c]"
                >
                  <option value="masterplan">District masterplan</option>
                  <option value="tower">Tower or mixed-use building</option>
                  <option value="housing">Housing</option>
                  <option value="public">Park, plaza or riverfront</option>
                  <option value="transit">Transit corridor</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-black/55 sm:col-span-2">
                Tell us about it
                <textarea
                  name="message"
                  rows={4}
                  className="resize-none rounded-xl border border-black/15 bg-[#f3efe7] px-3 py-2.5 text-base normal-case tracking-normal text-[#15171c]"
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                <p className="text-xs text-black/50">No spam. We only write back about your project.</p>
                <button
                  type="submit"
                  className="rounded-full bg-[#15171c] px-6 py-3 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
                >
                  Send brief
                </button>
              </div>
              {sent && (
                <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800 sm:col-span-2">
                  ✓ Brief received. A partner will be in touch within two working days. (This is a demo, so nothing was sent.)
                </p>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- FOOTER */}
      <footer className="border-t border-black/10 px-4 pb-28 pt-12 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 2xl:max-w-[1600px]">
          <div>
            <p className="text-2xl font-bold tracking-tight font-(family-name:--font-metro-display)">
              Metro<span className="font-normal opacity-60"> Habitat</span>
            </p>
            <p className="mt-2 max-w-xs text-sm text-black/55">City planning and architecture. Drawing streets people want to walk down since 2009.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-black/65">
            {[...NAV, ["#contact", "Contact"] as [string, string]].map(([href, label]) => (
              <a key={href} href={href} className="hover:text-black">
                {label}
              </a>
            ))}
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-6xl text-xs text-black/45 2xl:max-w-[1600px]">
          © Metro Habitat, a MeshUI demo. Fictional studio and projects, real Three.js.
        </p>
      </footer>
    </div>
  );
}
