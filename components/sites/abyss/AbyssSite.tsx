"use client";

import { Component, useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import MobileMenu from "@/components/sites/MobileMenu";
import type { Dive } from "./Scene";

const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gradient-to-b from-[#7fd9ef] via-[#1ba6c9] to-[#0a5a84]" />,
});

/** If WebGL is unavailable the page still works over a painted water column. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return <div className="h-full w-full bg-gradient-to-b from-[#1ba6c9] via-[#06304f] to-[#000306]" />;
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const MAX_DEPTH = 4000;

const display = "font-(family-name:--font-abyss-display)";
const mono = "font-(family-name:--font-abyss-mono)";
const wrap = "mx-auto w-full max-w-6xl 2xl:max-w-[1500px] px-4 sm:px-8 md:pr-32 lg:pr-36";

type Trip = {
  id: string;
  name: string;
  zone: string;
  depth: string;
  duration: string;
  price: number;
  blurb: string;
  includes: string[];
  accent: string;
  featured?: boolean;
};

const TRIPS: Trip[] = [
  {
    id: "kelp",
    name: "Kelp Cathedral",
    zone: "Sunlight zone",
    depth: "to 200 m",
    duration: "3 hours · 1 day",
    price: 1450,
    blurb: "Glide through a 30-metre kelp forest and ride the shelf edge as it drops away into blue.",
    includes: ["Surface briefing & suit-up", "40-minute kelp transect", "Hot chocolate debrief on deck"],
    accent: "from-cyan-300 to-teal-400",
  },
  {
    id: "twilight",
    name: "Twilight Descent",
    zone: "Twilight zone",
    depth: "to 1,000 m",
    duration: "6 hours · 1 day",
    price: 8900,
    blurb: "Sink through the last of the light alongside migrating whales and the lanternfish that rise each dusk.",
    includes: ["Hydrophone whale-song feed", "Lights-out bioluminescence stop", "4K footage of your dive"],
    accent: "from-sky-400 to-indigo-500",
    featured: true,
  },
  {
    id: "abyssal",
    name: "Abyssal Plain",
    zone: "Midnight zone",
    depth: "to 4,000 m",
    duration: "10 hours · 3-day programme",
    price: 38500,
    blurb: "Our flagship: a full descent to the sea floor, where sea pens glow and anglerfish hunt by lamplight.",
    includes: ["Pilot-for-a-day training", "Sample-arm control on the floor", "Certificate of depth"],
    accent: "from-fuchsia-400 to-violet-600",
  },
];

const SPECS = [
  ["Depth rating", "6,000 m", "1.5× our deepest dive"],
  ["Pressure hull", "2.1 m sphere", "49 mm forged titanium"],
  ["Crew", "1 + 2", "Pilot and two guests"],
  ["Viewports", "3 × 180 mm", "120° acrylic field of view"],
  ["Life support", "96 h", "On top of a 10 h dive"],
  ["Lighting", "220,000 lm", "14 LED arrays, tunable"],
  ["Descent", "40 m/min", "≈ 100 min to 4,000 m"],
  ["Comms", "Acoustic", "Live relay to the surface ship"],
];

const STORIES = [
  {
    quote:
      "At 900 metres the pilot switched every light off. Then the water started to sparkle around us like a city seen from a plane.",
    who: "Lena K.",
    trip: "Twilight Descent · 2026",
  },
  {
    quote:
      "I waved my hand across the viewport and a whole cloud of plankton lit up blue. I have never felt so small, or so lucky.",
    who: "Tomás R.",
    trip: "Abyssal Plain · 2025",
  },
  {
    quote: "The anglerfish was the size of a teacup and the most terrifying thing I have ever fallen in love with.",
    who: "Priya N.",
    trip: "Abyssal Plain · 2026",
  },
];

const ZONES = [
  { name: "Sunlight", from: 0 },
  { name: "Twilight", from: 200 },
  { name: "Midnight", from: 1000 },
  { name: "Abyssal", from: 3900 },
];

const NAV: [string, string][] = [
  ["#sunlit", "Zones"],
  ["#expeditions", "Expeditions"],
  ["#submersible", "Submersible"],
  ["#stories", "Stories"],
  ["#book", "Book"],
];

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Gauge scale: square-root so the busy shallows get room. */
const gaugeT = (m: number) => Math.sqrt(Math.min(Math.max(m, 0), MAX_DEPTH) / MAX_DEPTH);

function zoneAt(m: number) {
  let z = ZONES[0].name;
  for (const zone of ZONES) if (m >= zone.from) z = zone.name;
  return z;
}

/* ------------------------------------------------------------------ */
/* Scroll → depth                                                      */
/* ------------------------------------------------------------------ */

type Anchor = { y: number; m: number };

function measureAnchors(): Anchor[] {
  const vh = window.innerHeight;
  const max = Math.max(1, document.documentElement.scrollHeight - vh);
  const list: Anchor[] = [{ y: 0, m: 0 }];
  document.querySelectorAll<HTMLElement>("[data-depth]").forEach((el) => {
    const r = el.getBoundingClientRect();
    const top = r.top + window.scrollY;
    const y = Math.min(Math.max(top + Math.min(r.height, vh) / 2 - vh / 2, 1), max - 1);
    list.push({ y, m: Number(el.dataset.depth) });
  });
  list.push({ y: max, m: MAX_DEPTH });
  list.sort((a, b) => a.y - b.y);
  // Keep depth increasing even if a layout squeezes two anchors together.
  for (let i = 1; i < list.length; i++) list[i].m = Math.max(list[i].m, list[i - 1].m);
  return list;
}

function depthForScroll(anchors: Anchor[], y: number) {
  if (anchors.length < 2) return 0;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (y <= b.y) {
      const t = b.y > a.y ? Math.min(Math.max((y - a.y) / (b.y - a.y), 0), 1) : 1;
      return a.m + (b.m - a.m) * t;
    }
  }
  return anchors[anchors.length - 1].m;
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const CSS = `
.abyss-reveal { opacity: 0; transform: translateY(28px); transition: opacity .9s cubic-bezier(.2,.7,.2,1), transform .9s cubic-bezier(.2,.7,.2,1) }
.abyss-reveal[data-shown="true"] { opacity: 1; transform: none }
@keyframes abyss-rise { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
.abyss-rise { opacity: 0; animation: abyss-rise 1.1s cubic-bezier(.2,.7,.2,1) forwards }
@keyframes abyss-cue { 0% { transform: scaleY(0); transform-origin: top } 45% { transform: scaleY(1); transform-origin: top } 55% { transform: scaleY(1); transform-origin: bottom } 100% { transform: scaleY(0); transform-origin: bottom } }
.abyss-cue { animation: abyss-cue 2.4s ease-in-out infinite }
@media (prefers-reduced-motion: reduce) {
  .abyss-reveal { opacity: 1; transform: none; transition: none }
  .abyss-rise { animation: none; opacity: 1 }
  .abyss-cue { animation: none }
}
`;

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.65" />
      <path d="M16 4v17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="24" r="3" fill="#5ef2ff" />
    </svg>
  );
}

function Eyebrow({ children, tone = "text-cyan-300" }: { children: ReactNode; tone?: string }) {
  return (
    <p className={`flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] sm:tracking-[0.3em] ${tone} ${mono}`}>
      <span className="h-px w-8 bg-current opacity-60" />
      {children}
    </p>
  );
}

function Glass({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-[#03182a]/60 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.07)] backdrop-blur-xl sm:p-8 ${className}`}
    >
      {children}
    </div>
  );
}

function Chapter({
  id,
  depth,
  side,
  range,
  title,
  children,
  facts,
  hint,
}: {
  id: string;
  depth: number;
  side: "left" | "right";
  range: string;
  title: ReactNode;
  children: ReactNode;
  facts: [string, string][];
  hint: string;
}) {
  return (
    <section id={id} data-depth={depth} className="relative flex min-h-[115svh] items-center py-24">
      <div className={`${wrap} flex ${side === "right" ? "md:justify-end" : ""}`}>
        <div data-reveal className="abyss-reveal w-full max-w-lg">
          <Glass>
            <Eyebrow>{range}</Eyebrow>
            <h2 className={`mt-4 text-3xl leading-[1.1] font-semibold tracking-tight sm:text-4xl ${display}`}>{title}</h2>
            <div className="mt-4 space-y-3 leading-relaxed text-slate-200/80">{children}</div>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className={`text-[10px] uppercase tracking-[0.2em] text-slate-400 ${mono}`}>{k}</dt>
                  <dd className="mt-1 text-sm font-semibold text-white">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 flex items-center gap-2 rounded-2xl bg-cyan-300/10 px-4 py-3 text-xs font-semibold text-cyan-200">
              <span aria-hidden className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-300 opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-cyan-300" />
              </span>
              {hint}
            </p>
          </Glass>
        </div>
      </div>
    </section>
  );
}

function SubSchematic() {
  return (
    <svg viewBox="0 0 360 170" className="h-auto w-full" aria-label="Side elevation of the Nautilus-7 submersible">
      <defs>
        <pattern id="abyss-grid" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M12 0H0V12" fill="none" stroke="rgba(94,242,255,0.08)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="360" height="170" fill="url(#abyss-grid)" />
      <g fill="none" stroke="#5ef2ff" strokeWidth="1.4" strokeLinejoin="round">
        <rect x="70" y="52" width="200" height="62" rx="31" />
        <path d="M80 60a31 31 0 0 0 0 46" opacity="0.6" />
        <circle cx="97" cy="83" r="22" strokeDasharray="3 3" opacity="0.7" />
        <rect x="150" y="34" width="62" height="20" rx="10" />
        <path d="M270 70h28v26h-28M298 60v46" />
        <circle cx="306" cy="83" r="14" opacity="0.7" />
        <path d="M95 114v14M245 114v14M78 128h184" />
        <path d="M80 98l-40 22M80 100l-38 34" stroke="#fde68a" opacity="0.7" />
      </g>
      <g stroke="rgba(255,255,255,0.45)" strokeWidth="1">
        <path d="M70 148h236M70 144v8M306 144v8" />
        <path d="M335 52v62M331 52h8M331 114h8" />
      </g>
      <g fill="rgba(255,255,255,0.7)" fontSize="10" fontFamily="var(--font-abyss-mono), monospace">
        <text x="168" y="162">7.6 m</text>
        <text x="318" y="86" transform="rotate(90 318 86)">2.1 m</text>
        <text x="110" y="47" fill="#5ef2ff">NAUTILUS-7</text>
        <text x="16" y="146" fill="#fde68a">LED ×14</text>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AbyssSite() {
  const dive = useRef<Dive>({ depth: 0 });
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );

  const marker = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const phoneReadout = useRef<HTMLSpanElement>(null);
  const zoneEl = useRef<HTMLSpanElement>(null);
  const pressureEl = useRef<HTMLSpanElement>(null);
  const tempEl = useRef<HTMLSpanElement>(null);
  const lightEl = useRef<HTMLSpanElement>(null);
  const header = useRef<HTMLElement>(null);

  const [trip, setTrip] = useState(TRIPS[1].id);
  const [date, setDate] = useState("");
  const [divers, setDivers] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const tripInfo = TRIPS.find((t) => t.id === trip) ?? TRIPS[0];
  const total = tripInfo.price * divers;

  // Scroll → depth, smoothed, written straight into the HUD and the scene.
  useEffect(() => {
    let anchors = measureAnchors();
    const measure = () => (anchors = measureAnchors());
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);

    let raf = 0;
    let last = performance.now();
    let current = depthForScroll(anchors, window.scrollY);
    let shown = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const target = depthForScroll(anchors, window.scrollY);
      current = reduced ? target : current + (target - current) * (1 - Math.exp(-4.5 * dt));
      if (Math.abs(target - current) < 0.05) current = target;
      dive.current.depth = current;

      const m = Math.round(current);
      if (m === shown) return;
      shown = m;
      const text = `${m.toLocaleString("en-US")} m`;
      const t = gaugeT(current);
      if (marker.current) marker.current.style.transform = `translateY(${(t * 100).toFixed(2)}cqh)`;
      if (fill.current) fill.current.style.transform = `scaleY(${t.toFixed(4)})`;
      if (readout.current) readout.current.textContent = text;
      if (phoneReadout.current) phoneReadout.current.textContent = text;
      if (zoneEl.current) zoneEl.current.textContent = `${zoneAt(current)} zone`;
      if (pressureEl.current) pressureEl.current.textContent = `${(1 + current / 10.06).toFixed(current < 100 ? 1 : 0)} atm`;
      if (tempEl.current) tempEl.current.textContent = `${(2.1 + 20.9 * Math.exp(-current / 260)).toFixed(1)} °C`;
      if (lightEl.current) {
        const light = 100 * Math.exp(-current / 43.4);
        lightEl.current.textContent =
          light >= 1 ? `${light.toFixed(0)}%` : light >= 0.001 ? `${light.toPrecision(1)}%` : "none";
      }
      header.current?.setAttribute("data-deep", current > 30 ? "true" : "false");
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [reduced]);

  // Reveal-on-scroll for content cards.
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.shown = "true";
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  function chooseTrip(id: string) {
    setTrip(id);
    setConfirmed(false);
    document.getElementById("book")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (date && name && email) setConfirmed(true);
  }

  const field =
    "rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-base font-semibold normal-case tracking-normal text-white outline-none transition focus:border-cyan-300/70 focus:bg-white/10";
  const label = `grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300/80 ${mono}`;

  return (
    <div
      className="relative min-h-screen overflow-x-clip bg-[#010812] text-slate-100 font-(family-name:--font-abyss-body)"
      style={{ colorScheme: "dark" }}
    >
      <style>{CSS}</style>

      {/* The whole page sinks through one fixed 3D water column. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <SceneBoundary>
          <Scene dive={dive} reduced={reduced} />
        </SceneBoundary>
      </div>

      {/* ---------------------------------------------------------- HEADER */}
      <header
        ref={header}
        data-deep="false"
        className="group fixed inset-x-0 top-0 z-40 bg-gradient-to-b from-[#01182c]/35 to-transparent transition-colors duration-500 data-[deep=true]:bg-[#010b16]/55 data-[deep=true]:backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-6xl 2xl:max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <a href="#top" className="flex items-center gap-2.5 text-white">
            <Logo className="size-8 shrink-0" />
            <span className={`text-base leading-none font-semibold tracking-tight sm:text-lg ${display}`}>
              Abyss<span className="ml-1.5 align-middle text-[10px] font-normal tracking-[0.25em] text-cyan-200/80 uppercase">Dive Co.</span>
            </span>
          </a>
          <nav className="hidden items-center gap-1 text-sm font-semibold text-white/80 md:flex">
            {NAV.slice(0, 4).map(([href, text]) => (
              <a key={href} href={href} className="rounded-full px-3 py-1.5 transition-colors hover:bg-white/10 hover:text-white">
                {text}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs font-semibold text-cyan-200 backdrop-blur-md md:hidden ${mono}`}
              aria-hidden
            >
              <span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#5ef2ff]" />
              <span ref={phoneReadout}>0 m</span>
            </span>
            <a
              href="#book"
              className="hidden rounded-full bg-cyan-300 px-4 py-2 text-sm font-bold text-[#021526] shadow-[0_0_30px_-6px_rgba(94,242,255,0.8)] transition-transform hover:-translate-y-0.5 sm:inline-flex"
            >
              Book a dive
            </a>
            <MobileMenu links={NAV} />
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------- DEPTH GAUGE */}
      <div
        aria-hidden
        className="pointer-events-none fixed right-3 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-end md:flex lg:right-6"
      >
        <div className="relative h-[46vh] w-[92px] [container-type:size]">
          {/* Scale */}
          {[0, 200, 1000, 2000, 3000, 4000].map((m) => (
            <div
              key={m}
              className="absolute right-0 flex -translate-y-1/2 items-center gap-2"
              style={{ top: `${gaugeT(m) * 100}%` }}
            >
              <span className={`text-[10px] text-white/45 ${mono}`}>{m >= 1000 ? `${m / 1000}k` : m}</span>
              <span className="h-px w-2.5 bg-white/40" />
            </div>
          ))}
          <div className="absolute right-[3px] top-0 h-full w-[3px] overflow-hidden rounded-full bg-white/10">
            <div
              ref={fill}
              className="h-full w-full origin-top bg-gradient-to-b from-cyan-200 via-sky-500 to-violet-500"
              style={{ transform: "scaleY(0)" }}
            />
          </div>
          {/* Moving marker */}
          <div ref={marker} className="absolute right-0 top-0 h-0 w-full" style={{ transform: "translateY(0)" }}>
            <div className="absolute right-[-3px] top-0 size-[13px] -translate-y-1/2 rounded-full border-2 border-cyan-200 bg-[#021526] shadow-[0_0_14px_rgba(94,242,255,0.9)]" />
            <div
              className={`absolute right-5 top-0 -translate-y-1/2 whitespace-nowrap rounded-full border border-cyan-200/30 bg-[#021526]/85 px-2.5 py-1 text-xs font-bold text-cyan-100 backdrop-blur ${mono}`}
            >
              <span ref={readout}>0 m</span>
            </div>
          </div>
        </div>
        <dl className={`mt-6 grid w-[124px] gap-1.5 rounded-2xl border border-white/10 bg-[#021526]/70 p-3 text-[10px] text-white/55 backdrop-blur-md ${mono}`}>
          <dd className="text-[11px] font-bold tracking-wide text-cyan-200">
            <span ref={zoneEl}>Sunlight zone</span>
          </dd>
          <div className="flex justify-between gap-2">
            <dt>PRESS</dt>
            <dd className="text-white/85">
              <span ref={pressureEl}>1.0 atm</span>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>TEMP</dt>
            <dd className="text-white/85">
              <span ref={tempEl}>23.0 °C</span>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>LIGHT</dt>
            <dd className="text-white/85">
              <span ref={lightEl}>100%</span>
            </dd>
          </div>
        </dl>
      </div>

      <main className="relative z-10">
        {/* ------------------------------------------------------------ HERO */}
        <section id="top" className="relative flex min-h-svh items-end pb-28 pt-28 sm:items-center sm:pb-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_65%,rgba(1,24,44,0.6),transparent_62%)] max-sm:bg-[linear-gradient(to_top,rgba(1,20,38,0.75),transparent_70%)]"
          />
          <div className={`${wrap} relative`}>
            <div className="max-w-2xl">
              <div className="abyss-rise" style={{ animationDelay: "0.2s" }}>
                <Eyebrow tone="text-cyan-100">Deep-sea expeditions · since 2009</Eyebrow>
              </div>
              <h1
                className={`abyss-rise mt-5 text-[2.5rem] leading-[1.02] font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl ${display}`}
                style={{ animationDelay: "0.4s", textShadow: "0 4px 40px rgba(1,24,44,0.55)" }}
              >
                Go deeper
                <br />
                than <span className="bg-gradient-to-r from-cyan-200 to-teal-200 bg-clip-text text-transparent">daylight.</span>
              </h1>
              <p
                className="abyss-rise mt-5 max-w-md text-base leading-relaxed text-white/85 sm:text-lg"
                style={{ animationDelay: "0.6s", textShadow: "0 2px 20px rgba(1,24,44,0.6)" }}
              >
                Three-seat submersible dives from the kelp canopy to the abyssal plain, four kilometres down. Scroll to
                start your descent.
              </p>
              <div className="abyss-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "0.8s" }}>
                <a
                  href="#expeditions"
                  className="rounded-full bg-white px-6 py-3 text-sm font-bold text-[#021526] shadow-[0_14px_40px_-10px_rgba(255,255,255,0.6)] transition-transform hover:-translate-y-0.5"
                >
                  Choose your dive
                </a>
                <a
                  href="#sunlit"
                  className="rounded-full border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20"
                >
                  Begin descent ↓
                </a>
              </div>
              <dl className="abyss-rise mt-12 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4" style={{ animationDelay: "1s" }}>
                {[
                  ["4,000 m", "deepest dive"],
                  ["1,900+", "dives flown"],
                  ["0", "incidents"],
                  ["4.97★", "guest rating"],
                ].map(([v, l]) => (
                  <div key={l}>
                    <dt className={`whitespace-nowrap text-xl font-semibold text-white sm:text-2xl ${display}`}>{v}</dt>
                    <dd className="mt-1 text-xs text-white/70">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div aria-hidden className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 sm:flex">
            <span className={`text-[10px] uppercase tracking-[0.3em] text-white/70 ${mono}`}>Scroll to dive</span>
            <span className="h-10 w-px overflow-hidden bg-white/20">
              <span className="abyss-cue block h-full w-full bg-white" />
            </span>
          </div>
        </section>

        {/* ------------------------------------------------------ SUNLIGHT */}
        <Chapter
          id="sunlit"
          depth={60}
          side="left"
          range="Sunlight zone · 0 – 200 m"
          title={
            <>
              The kelp <em className="not-italic text-cyan-200">cathedral.</em>
            </>
          }
          facts={[
            ["Light", "100% → 1%"],
            ["Water", "14 – 22 °C"],
          ]}
          hint="Sweep your cursor through the school and watch it split."
        >
          <p>
            Up here the sun still wins. Giant kelp climbs thirty metres towards the shimmer while silversides turn as
            one, and the shelf drops away beneath you into blue.
          </p>
        </Chapter>

        {/* ------------------------------------------------------ TWILIGHT */}
        <Chapter
          id="twilight"
          depth={450}
          side="right"
          range="Twilight zone · 200 – 1,000 m"
          title={
            <>
              Where whales <em className="not-italic text-sky-300">come to hunt.</em>
            </>
          }
          facts={[
            ["Light", "1% → none"],
            ["Pressure", "21 – 100 atm"],
          ]}
          hint="Keep sinking: the lanternfish switch their lights on below 600 m."
        >
          <p>
            Blue fades to ink. Humpbacks pass as slow silhouettes, and lanternfish glow along their bellies, part of the
            largest migration on Earth, every single night.
          </p>
        </Chapter>

        {/* --------------------------------------------------- EXPEDITIONS */}
        <section id="expeditions" data-depth={800} className="relative py-24 sm:py-32">
          <div className={wrap}>
            <div data-reveal className="abyss-reveal flex flex-wrap items-end justify-between gap-6">
              <div>
                <Eyebrow>Expeditions</Eyebrow>
                <h2 className={`mt-4 max-w-xl text-3xl leading-[1.1] font-semibold tracking-tight sm:text-5xl ${display}`}>
                  Pick how far down you go.
                </h2>
              </div>
              <p className="max-w-sm text-slate-200/75">
                Every dive is piloted, every seat has a viewport, and every price includes the ship, the suit and the
                footage.
              </p>
            </div>
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {TRIPS.map((t, i) => (
                <article
                  key={t.id}
                  data-reveal
                  className={`abyss-reveal relative flex flex-col overflow-hidden rounded-3xl border bg-[#03182a]/70 p-6 backdrop-blur-xl sm:p-7 ${
                    t.featured
                      ? "border-cyan-300/40 shadow-[0_0_80px_-30px_rgba(94,242,255,0.7)]"
                      : "border-white/10"
                  }`}
                  style={{ transitionDelay: `${i * 0.1}s` }}
                >
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.accent}`} />
                  <div className="flex items-start justify-between gap-3">
                    <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/90 ${mono}`}>
                      {t.zone}
                    </p>
                    {t.featured && (
                      <span className="rounded-full bg-cyan-300 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#021526]">
                        Most booked
                      </span>
                    )}
                  </div>
                  <h3 className={`mt-3 text-2xl font-semibold ${display}`}>{t.name}</h3>
                  <p className={`mt-1 text-sm text-white/55 ${mono}`}>
                    {t.depth} · {t.duration}
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-slate-200/80">{t.blurb}</p>
                  <ul className="mt-5 flex-1 space-y-2 text-sm">
                    {t.includes.map((x) => (
                      <li key={x} className="flex gap-2 text-slate-100/90">
                        <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cyan-300" />
                        {x}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-7 flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-5">
                    <p>
                      <span className={`text-3xl font-semibold ${display}`}>{usd(t.price)}</span>
                      <span className="text-sm text-white/55"> / diver</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => chooseTrip(t.id)}
                      className={`rounded-full px-5 py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5 ${
                        t.featured ? "bg-cyan-300 text-[#021526]" : "bg-white/10 text-white hover:bg-white/15"
                      }`}
                    >
                      Reserve a seat
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- SUBMERSIBLE */}
        <section id="submersible" data-depth={1600} className="relative flex min-h-[120svh] items-center py-24">
          <div className={wrap}>
            <div data-reveal className="abyss-reveal max-w-xl">
              <Glass>
                <Eyebrow tone="text-amber-200">The submersible</Eyebrow>
                <h2 className={`mt-4 text-3xl leading-[1.1] font-semibold tracking-tight sm:text-4xl ${display}`}>
                  Meet <span className="text-amber-300">Nautilus-7.</span>
                </h2>
                <p className="mt-4 leading-relaxed text-slate-200/80">
                  A titanium sphere built to twice the depth we dive, wrapped in a hull you can see from a kilometre
                  away. That glow off to the right is her, holding station at 1,600 metres.
                </p>
                <div className="mt-6 overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#010d18]/70 p-3">
                  <SubSchematic />
                </div>
                <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
                  {SPECS.map(([k, v, note]) => (
                    <div key={k} className="border-t border-white/10 pt-3">
                      <dt className={`text-[10px] uppercase tracking-[0.18em] text-slate-400 ${mono}`}>{k}</dt>
                      <dd className={`mt-1 text-base font-semibold text-white ${display}`}>{v}</dd>
                      <dd className="mt-0.5 text-[11px] leading-snug text-white/50">{note}</dd>
                    </div>
                  ))}
                </dl>
              </Glass>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ MIDNIGHT */}
        <Chapter
          id="midnight"
          depth={2300}
          side="left"
          range="Midnight zone · 1,000 – 4,000 m"
          title={
            <>
              Every light down here <em className="not-italic text-fuchsia-300">is alive.</em>
            </>
          }
          facts={[
            ["Light", "none, ever"],
            ["Water", "2 – 4 °C"],
          ]}
          hint="Stir the dark: plankton flare, jellyfish drift away, the anglerfish turns."
        >
          <p>
            No sunlight has reached this water in millions of years. Jellyfish pulse in neon, an anglerfish dangles its
            lure, and every speck of plankton blazes blue the moment something disturbs it.
          </p>
        </Chapter>

        {/* ------------------------------------------------------- STORIES */}
        <section id="stories" data-depth={3000} className="relative py-24 sm:py-32">
          <div className={wrap}>
            <div data-reveal className="abyss-reveal">
              <Eyebrow tone="text-fuchsia-200">Dive logs</Eyebrow>
              <h2 className={`mt-4 max-w-2xl text-3xl leading-[1.1] font-semibold tracking-tight sm:text-5xl ${display}`}>
                What people say on the way back up.
              </h2>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {STORIES.map((s, i) => (
                <figure
                  key={s.who}
                  data-reveal
                  className="abyss-reveal flex flex-col rounded-3xl border border-white/10 bg-[#050d1c]/65 p-6 backdrop-blur-xl sm:p-7"
                  style={{ transitionDelay: `${i * 0.1}s` }}
                >
                  <span className={`text-4xl leading-none text-fuchsia-300 ${display}`}>“</span>
                  <blockquote className="mt-3 flex-1 text-lg leading-relaxed text-white/90">{s.quote}</blockquote>
                  <figcaption className="mt-6 border-t border-white/10 pt-4 text-sm">
                    <span className="font-bold">{s.who}</span>
                    <span className={`block text-xs text-white/50 ${mono}`}>{s.trip}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- BOOK */}
        <section id="book" data-depth={3650} className="relative py-24 sm:py-32">
          <div className={wrap}>
            <div
              data-reveal
              className="abyss-reveal overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[#020f1d]/75 p-6 shadow-[0_0_120px_-40px_rgba(94,242,255,0.55)] backdrop-blur-xl sm:p-10"
            >
              <div className="grid gap-10 lg:grid-cols-[1fr_1.25fr]">
                <div>
                  <Eyebrow>Book a dive</Eyebrow>
                  <h2 className={`mt-4 text-3xl leading-[1.1] font-semibold tracking-tight sm:text-5xl ${display}`}>
                    Your seat is <span className="text-cyan-300">waiting.</span>
                  </h2>
                  <p className="mt-4 max-w-sm text-slate-200/75">
                    Two guest seats per dive, departures from April to October. Hold a date today and pay nothing
                    until your medical clears.
                  </p>
                  <ul className="mt-8 space-y-3 text-sm text-white/75">
                    {["No diving experience needed", "Full refund up to 30 days out", "Weather-day reschedules free"].map(
                      (x) => (
                        <li key={x} className="flex items-center gap-3">
                          <span aria-hidden className="grid size-5 place-items-center rounded-full bg-cyan-300/15 text-[11px] text-cyan-200">
                            ✓
                          </span>
                          {x}
                        </li>
                      ),
                    )}
                  </ul>
                </div>

                <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                  <fieldset className="grid gap-2 sm:col-span-2">
                    <legend className={`${label} mb-1.5`}>Expedition</legend>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {TRIPS.map((t) => (
                        <label
                          key={t.id}
                          className={`cursor-pointer rounded-2xl border p-3 transition-colors ${
                            trip === t.id ? "border-cyan-300/70 bg-cyan-300/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                          }`}
                        >
                          <input
                            type="radio"
                            name="trip"
                            value={t.id}
                            checked={trip === t.id}
                            onChange={() => {
                              setTrip(t.id);
                              setConfirmed(false);
                            }}
                            className="sr-only"
                          />
                          <span className="block text-sm font-bold">{t.name}</span>
                          <span className={`block text-[11px] text-white/55 ${mono}`}>
                            {t.depth} · {usd(t.price)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className={label}>
                    Dive date
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value);
                        setConfirmed(false);
                      }}
                      className={field}
                    />
                  </label>
                  <label className={label}>
                    Guests
                    <select value={divers} onChange={(e) => setDivers(Number(e.target.value))} className={field}>
                      <option value={1} className="bg-[#021526]">
                        1 guest
                      </option>
                      <option value={2} className="bg-[#021526]">
                        2 guests (whole sub)
                      </option>
                    </select>
                  </label>
                  <label className={label}>
                    Name
                    <input
                      type="text"
                      required
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Sylvia Earle"
                      className={`${field} placeholder:text-white/30`}
                    />
                  </label>
                  <label className={label}>
                    Email
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className={`${field} placeholder:text-white/30`}
                    />
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5 sm:col-span-2">
                    <p className="text-sm text-white/60">
                      {tripInfo.name} · {divers} {divers === 1 ? "guest" : "guests"}
                      <span className={`ml-3 text-2xl font-semibold text-white ${display}`}>{usd(total)}</span>
                    </p>
                    <button
                      type="submit"
                      className="rounded-full bg-cyan-300 px-6 py-3 text-sm font-bold text-[#021526] shadow-[0_0_40px_-8px_rgba(94,242,255,0.9)] transition-transform hover:-translate-y-0.5"
                    >
                      Hold my seat
                    </button>
                  </div>
                  {confirmed && (
                    <p
                      role="status"
                      className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100 sm:col-span-2"
                    >
                      ✓ {tripInfo.name} on {date} is held for {name.split(" ")[0] || "you"}. We&apos;ll email {email} within
                      a day. This is a demo, so nothing was sent.
                    </p>
                  )}
                </form>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- FOOTER */}
        <footer className="relative px-0 pb-32 pt-[40svh]">
          <div className={`${wrap}`}>
            <div className="flex flex-wrap items-end justify-between gap-8 border-t border-white/10 pt-10">
              <div>
                <p className={`flex items-center gap-2.5 text-2xl font-semibold ${display}`}>
                  <Logo className="size-8 text-white" /> Abyss Dive Co.
                </p>
                <p className="mt-3 max-w-xs text-sm text-white/55">
                  You have reached the abyssal plain, 4,000 metres down. The sea pens say hello.
                </p>
              </div>
              <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-white/65">
                {NAV.map(([href, text]) => (
                  <a key={href} href={href} className="hover:text-white">
                    {text}
                  </a>
                ))}
                <a href="#top" className="text-cyan-200 hover:text-white">
                  Surface ↑
                </a>
              </nav>
            </div>
            <p className={`mt-10 text-xs text-white/40 ${mono}`}>
              © Abyss Dive Co. A MeshUI demo: fictional outfitter, real Three.js.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
