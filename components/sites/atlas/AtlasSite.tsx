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
  type ReactNode,
} from "react";
import { HUBS, SAMPLE_CODES, lookupShipment, type Hub, type Shipment } from "./geo";
import type { TrackRequest } from "./Scene";

const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="animate-pulse font-(family-name:--font-atlas-mono) text-xs uppercase tracking-[0.3em] text-cyan-300/70">
        Plotting routes…
      </span>
    </div>
  ),
});

const display = "font-(family-name:--font-atlas-display)";
const mono = "font-(family-name:--font-atlas-mono)";

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const services = [
  {
    title: "Ocean freight",
    body: "FCL and LCL on 40 weekly loops, with guaranteed space allocations on the Asia–Europe and transpacific trades.",
    stat: "40 loops / week",
    icon: "M2 17 l2 4 h16 l2-4 Z M5 17 V11 h14 v6 M9 11 V7 h6 v4 M12 3 v4",
  },
  {
    title: "Air cargo",
    body: "Charter and scheduled capacity out of 60 gateways. Temperature-controlled lanes for pharma and perishables.",
    stat: "48 h door to door",
    icon: "M2 16 l20-6 -2-3 -7 2 -5-6 -2 1 3 6 -5 1.5 -2-2 -1.5 .5 1.5 4 Z",
  },
  {
    title: "Road & rail",
    body: "Inland drayage, European block trains and cross-border trucking stitched into one booking and one invoice.",
    stat: "14 rail corridors",
    icon: "M4 15 V6 a2 2 0 0 1 2-2 h12 a2 2 0 0 1 2 2 v9 Z M4 11 h16 M7 19 l-2 2 M17 19 l2 2 M8 15 v.01 M16 15 v.01",
  },
  {
    title: "Customs & warehousing",
    body: "Licensed brokers in 120 countries, bonded warehouses at every hub and pre-clearance before your box lands.",
    stat: "2.1 h avg clearance",
    icon: "M3 21 V9 l9-6 9 6 v12 Z M7 21 v-8 h10 v8 M7 17 h10",
  },
];

const stats = [
  { value: 168, label: "Countries served", suffix: "", decimals: 0 },
  { value: 1240, label: "Ports & airports", suffix: "", decimals: 0 },
  { value: 14.2, label: "TEU moved last year", suffix: "M", decimals: 1 },
  { value: 98.4, label: "On-time delivery", suffix: "%", decimals: 1 },
];

const plans = [
  {
    name: "Spot",
    price: 0,
    blurb: "Book single shipments at live market rates. No commitment.",
    features: ["Instant online quotes", "Live tracking on the globe", "Standard customs filing", "Email support"],
    cta: "Get a spot rate",
    featured: false,
  },
  {
    name: "Growth",
    price: 490,
    blurb: "For shippers moving 10+ containers a month who want locked-in rates.",
    features: ["Contract rates on 40 trades", "Priority space allocation", "API + EDI integrations", "Dedicated account desk", "Carbon reporting"],
    cta: "Start a 30-day trial",
    featured: true,
  },
  {
    name: "Enterprise",
    price: -1,
    blurb: "Control-tower visibility and a team on the ground at every hub you ship through.",
    features: ["Multi-modal control tower", "Bonded warehousing & 3PL", "Custom SLAs & insurance", "On-site staff at your DCs", "SSO & audit logs"],
    cta: "Talk to sales",
    featured: false,
  },
];

const testimonials = [
  {
    quote:
      "We used to chase forwarders on four continents by email. Now the whole network is one screen, and the arrival times are actually right.",
    name: "Mara Lindqvist",
    role: "VP Supply Chain, Nordhavn Outdoor",
  },
  {
    quote:
      "Atlas rebooked 60 reefers around a port strike in Santos before we even heard about it. Not one box of fruit lost.",
    name: "Rafael Okafor",
    role: "Head of Logistics, Verdeluz Produce",
  },
  {
    quote:
      "The sea-air product out of Dubai cut our launch lead time from five weeks to nine days. It changed how we plan product drops.",
    name: "Aiko Tanabe",
    role: "COO, Kumo Electronics",
  },
];

const VESSELS = ["Atlas Meridian", "Atlas Horizon", "Northern Tide", "Cape Lumen", "Atlas Corvus", "Pacific Ember", "Sea Lantern", "Atlas Vega"];

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
const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = subscribeMedia(REDUCED);

function useReducedMotion() {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
}

/** Wall-clock time that ticks every second; null until mounted so SSR markup stays stable. */
function useNow(interval = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = requestAnimationFrame(tick);
    const id = setInterval(tick, interval);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(id);
    };
  }, [interval]);
  return now;
}

function useInView<T extends HTMLElement>(rootMargin = "0px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return [ref, seen] as const;
}

/** Smooth, deterministic "live" wobble for a stat: same value for everyone at the same second. */
function live(base: number, now: number | null, seed: number, spread: number) {
  if (now === null) return base;
  const t = now / 1000;
  return base + Math.sin(t * 0.21 + seed) * spread * 0.6 + Math.sin(t * 0.057 + seed * 3.1) * spread * 0.4;
}

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

function localTime(now: number | null, utc: number) {
  if (now === null) return "--:--";
  const d = new Date(now + utc * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function distanceKm(a: Hub, b: Hub) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/* ------------------------------------------------------------------ */
/* Small components                                                    */
/* ------------------------------------------------------------------ */

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <defs>
        <linearGradient id="atlas-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="13" fill="none" stroke="url(#atlas-logo)" strokeWidth="2.2" />
      <ellipse cx="16" cy="16" rx="6" ry="13" fill="none" stroke="url(#atlas-logo)" strokeWidth="1.4" opacity="0.7" />
      <path d="M3.5 12 h25 M3.5 20 h25" stroke="url(#atlas-logo)" strokeWidth="1.2" opacity="0.6" />
      <path d="M6 22 Q16 2 27 10" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <circle cx="27" cy="10" r="2.2" fill="#fbbf24" />
    </svg>
  );
}

function Counter({ value, decimals, suffix, start, reduced }: { value: number; decimals: number; suffix: string; start: boolean; reduced: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    const t0 = performance.now();
    const dur = reduced ? 0 : 1800;
    const step = (t: number) => {
      const k = dur === 0 ? 1 : Math.min(1, (t - t0) / dur);
      setShown(value * (1 - Math.pow(1 - k, 4)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [start, value, reduced]);
  return (
    <span className="tabular-nums">
      {fmt(shown, decimals)}
      {suffix}
    </span>
  );
}

/** Keeps the landing page alive if WebGL is unavailable. */
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
        "radial-gradient(circle at 68% 50%, #0b3a8a 0, #06205a 22%, rgba(34,211,238,0.25) 27%, transparent 34%), radial-gradient(circle at 70% 50%, #020617 0, #02040b 70%)",
    }}
  />
);

/* ------------------------------------------------------------------ */
/* Hero panels                                                         */
/* ------------------------------------------------------------------ */

function HubPanel({ hub, now, onClose, onNext }: { hub: Hub; now: number | null; onClose: () => void; onNext: () => void }) {
  const seed = hub.lon * 0.13 + hub.lat;
  const vessels = Math.round(live(hub.vessels, now, seed, 4));
  const teu = live(hub.teu, now, seed + 1, hub.teu * 0.04);
  const onTime = Math.min(99.9, live(hub.onTime, now, seed + 2, 0.4));
  const berth = Math.min(98, live(72, now, seed + 3, 14));
  const minuteNow = now === null ? 0 : Math.floor(now / 60_000);
  const others = HUBS.filter((h) => h.id !== hub.id);
  const departures = [0, 1, 2].map((i) => {
    const slot = Math.floor((minuteNow + i * 47 + hub.vessels) / 140);
    const to = others[(slot + i) % others.length];
    const etd = 140 - ((minuteNow + i * 47 + hub.vessels) % 140);
    return { vessel: VESSELS[(slot * 3 + i + hub.cranes) % VESSELS.length], to, etd };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`${mono} text-[10px] uppercase tracking-[0.3em]`} style={{ color: hub.color }}>
            Hub · {hub.code}
          </p>
          <h3 className={`${display} mt-1 text-2xl font-semibold leading-tight sm:text-3xl`}>{hub.name}</h3>
          <p className="text-xs text-slate-400">
            {hub.country} · local time <span className={`${mono} text-slate-200`}>{localTime(now, hub.utc)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close hub panel"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-white/15 text-lg leading-none text-slate-300 transition-colors hover:bg-white/10"
        >
          ×
        </button>
      </div>
      <p className="hidden text-sm leading-relaxed text-slate-300 sm:block">{hub.blurb}</p>
      <dl className="grid grid-cols-3 gap-2">
        {[
          ["Vessels", fmt(vessels)],
          ["TEU / day", fmt(teu)],
          ["On time", `${fmt(onTime, 1)}%`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className={`${mono} text-[9px] uppercase tracking-[0.2em] text-slate-500`}>{k}</dt>
            <dd className={`${mono} mt-0.5 text-base tabular-nums text-white sm:text-lg`}>{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <div className={`${mono} mb-1 flex justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400`}>
          <span>Berth occupancy</span>
          <span className="tabular-nums text-slate-200">{fmt(berth)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-1000"
            style={{ width: `${berth}%`, background: `linear-gradient(90deg, #2563eb, ${hub.color})` }}
          />
        </div>
        <p className={`${mono} mt-2 text-[10px] uppercase tracking-[0.2em] text-slate-500`}>
          Avg dwell {hub.dwell} d · {hub.cranes} cranes
        </p>
      </div>
      <div className="hidden sm:block">
        <p className={`${mono} mb-2 text-[10px] uppercase tracking-[0.3em] text-slate-500`}>Next departures</p>
        <ul className="divide-y divide-white/5 text-sm">
          {departures.map((d) => (
            <li key={d.vessel + d.to.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="truncate text-slate-200">{d.vessel}</span>
              <span className="shrink-0 text-xs text-slate-400">
                → {d.to.name}{" "}
                <span className={`${mono} ml-1 tabular-nums text-cyan-300`}>
                  {now === null ? "--" : `${Math.floor(d.etd / 60)}h ${String(d.etd % 60).padStart(2, "0")}m`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex gap-2">
        <a
          href="#quote"
          className="flex-1 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-4 py-2.5 text-center text-sm font-semibold text-slate-950 transition-transform hover:scale-[1.02] active:scale-95"
        >
          Ship from {hub.name}
        </a>
        <button
          type="button"
          onClick={onNext}
          className="rounded-full border border-white/15 px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-white/10"
        >
          Next hub →
        </button>
      </div>
    </div>
  );
}

const MILESTONES = [
  { at: 0, label: "Booked" },
  { at: 0.06, label: "Picked up" },
  { at: 0.14, label: "Departed origin" },
  { at: 0.5, label: "Mid-route checkpoint" },
  { at: 0.88, label: "Arrived at destination" },
  { at: 0.96, label: "Customs cleared" },
  { at: 1, label: "Delivered" },
];

function TrackPanel({ shipment, now, onClose }: { shipment: Shipment; now: number | null; onClose: () => void }) {
  const from = HUBS.find((h) => h.id === shipment.from) as Hub;
  const to = HUBS.find((h) => h.id === shipment.to) as Hub;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(shipment.progress));
    return () => cancelAnimationFrame(id);
  }, [shipment]);
  const remaining = shipment.days * (1 - shipment.progress);
  const eta = now === null ? "--" : new Date(now + remaining * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const km = distanceKm(from, to);
  const status = (MILESTONES.filter((m) => m.at <= shipment.progress).at(-1)?.label ?? "Booked").replace("origin", from.name);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`${mono} text-[10px] uppercase tracking-[0.3em] text-amber-300`}>
            {shipment.mode} freight · {shipment.code}
          </p>
          <h3 className={`${display} mt-1 text-xl font-semibold leading-tight sm:text-2xl`}>
            {from.name} <span className="text-slate-500">→</span> {to.name}
          </h3>
          <p className="truncate text-xs text-slate-400">{shipment.cargo}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tracking panel"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-white/15 text-lg leading-none text-slate-300 transition-colors hover:bg-white/10"
        >
          ×
        </button>
      </div>
      <div>
        <div className={`${mono} mb-1.5 flex justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400`}>
          <span>{from.code}</span>
          <span className="tabular-nums text-amber-300">{Math.round(shipment.progress * 100)}%</span>
          <span>{to.code}</span>
        </div>
        <div className="relative h-2 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 shadow-[0_0_14px_rgba(245,158,11,0.6)] transition-[width] duration-[2200ms] ease-out motion-reduce:duration-0"
            style={{ width: `${shown * 100}%` }}
          />
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {[
          ["Status", status],
          ["ETA", eta],
          ["Distance", `${fmt(km)} km`],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <dt className={`${mono} text-[9px] uppercase tracking-[0.2em] text-slate-500`}>{k}</dt>
            <dd className="mt-0.5 text-[13px] leading-snug text-white">{v}</dd>
          </div>
        ))}
      </dl>
      <ol className="hidden grid-cols-1 gap-1.5 text-sm sm:grid">
        {MILESTONES.map((m) => {
          const done = m.at <= shipment.progress;
          return (
            <li key={m.label} className={`flex items-center gap-3 ${done ? "text-slate-200" : "text-slate-500"}`}>
              <span
                className={`grid size-4 place-items-center rounded-full border text-[9px] ${
                  done ? "border-amber-300 bg-amber-400 text-slate-950" : "border-white/20"
                }`}
              >
                {done ? "✓" : ""}
              </span>
              {m.label.replace("origin", from.name)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TrackForm({ onTrack, error }: { onTrack: (code: string) => void; error: string | null }) {
  const [code, setCode] = useState("");
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onTrack(code);
    (document.activeElement as HTMLElement | null)?.blur();
  };
  return (
    <div className="pointer-events-auto w-full max-w-md">
      <form onSubmit={submit} className="flex gap-2 rounded-full border border-white/15 bg-[#030712]/70 p-1.5 shadow-[0_10px_40px_rgba(2,6,23,0.6)] backdrop-blur-md focus-within:border-cyan-400/60">
        <label htmlFor="atlas-track" className="sr-only">
          Tracking number
        </label>
        <input
          id="atlas-track"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Tracking no. e.g. ATL-4471-RTM"
          autoComplete="off"
          spellCheck={false}
          className={`${mono} min-w-0 flex-1 bg-transparent px-3 text-sm uppercase text-white outline-none placeholder:normal-case placeholder:text-slate-500`}
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition-transform hover:scale-[1.03] active:scale-95 sm:px-5"
        >
          Track
        </button>
      </form>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-slate-400">
        {error ? (
          <span className="text-rose-300">{error}</span>
        ) : (
          <>
            <span>Try</span>
            {SAMPLE_CODES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCode(c);
                  onTrack(c);
                }}
                className={`${mono} rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-300 transition-colors hover:border-cyan-400/50 hover:text-white`}
              >
                {c}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Ticker({ now }: { now: number | null }) {
  const items = [
    ["Vessels at sea", fmt(live(1284, now, 1, 9))],
    ["Flights airborne", fmt(live(312, now, 2, 6))],
    ["Boxes tracked today", fmt(now === null ? 418_220 : 418_220 + Math.floor((now / 1000) % 86_400) * 3)],
    ["On time (30d)", `${fmt(live(98.4, now, 3, 0.15), 1)}%`],
  ];
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <div className={`${mono} text-[9px] uppercase tracking-[0.25em] text-slate-500`}>{k}</div>
          <div className={`${mono} text-sm tabular-nums text-slate-100`}>{v}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lower sections                                                      */
/* ------------------------------------------------------------------ */

function Pricing() {
  const [annual, setAnnual] = useState(true);
  return (
    <section id="pricing" className="relative px-4 py-24 sm:px-8">
      <div className="mx-auto max-w-6xl 2xl:max-w-[1600px]">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className={`${mono} text-xs uppercase tracking-[0.35em] text-cyan-300`}>03 · Plans</p>
            <h2 className={`${display} mt-3 text-3xl font-semibold tracking-tight sm:text-5xl`}>Pay for the lanes you use</h2>
          </div>
          <div role="group" aria-label="Billing period" className="flex rounded-full border border-white/10 bg-white/5 p-1 text-sm">
            {[
              [false, "Monthly"],
              [true, "Annual −15%"],
            ].map(([val, label]) => (
              <button
                key={String(label)}
                type="button"
                aria-pressed={annual === val}
                onClick={() => setAnnual(val as boolean)}
                className={`rounded-full px-4 py-1.5 transition-colors ${annual === val ? "bg-white text-slate-950" : "text-slate-300 hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((p) => {
            const price = p.price > 0 ? Math.round(annual ? p.price * 0.85 : p.price) : p.price;
            return (
              <article
                key={p.name}
                className={`relative flex flex-col rounded-3xl border p-7 ${
                  p.featured
                    ? "border-cyan-400/40 bg-gradient-to-b from-[#0b2350] to-[#060d22] shadow-[0_30px_80px_-30px_rgba(34,211,238,0.45)]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                {p.featured && (
                  <span className={`${mono} absolute -top-3 left-7 rounded-full bg-cyan-400 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-950`}>
                    Most popular
                  </span>
                )}
                <h3 className={`${display} text-xl font-semibold`}>{p.name}</h3>
                <p className="mt-2 min-h-[3rem] text-sm text-slate-400">{p.blurb}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  {price < 0 ? (
                    <span className={`${display} text-4xl font-semibold`}>Custom</span>
                  ) : (
                    <>
                      <span className={`${display} text-5xl font-semibold tabular-nums`}>${fmt(price)}</span>
                      <span className="text-sm text-slate-400">/ month</span>
                    </>
                  )}
                </div>
                <p className="mt-1 h-4 text-xs text-slate-500">
                  {p.price === 0 ? "plus per-shipment rates" : p.price > 0 && annual ? "billed annually" : ""}
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm text-slate-300">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M3 8.5 6.5 12 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="#quote"
                  className={`mt-8 rounded-full px-5 py-3 text-center text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-95 ${
                    p.featured ? "bg-gradient-to-r from-blue-600 to-cyan-400 text-slate-950" : "border border-white/15 text-white hover:bg-white/5"
                  }`}
                >
                  {p.cta}
                </a>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function QuoteForm() {
  const [from, setFrom] = useState("shanghai");
  const [to, setTo] = useState("rotterdam");
  const [mode, setMode] = useState<"fcl" | "lcl" | "air">("fcl");
  const [units, setUnits] = useState(2);
  const [sent, setSent] = useState<string | null>(null);
  const a = HUBS.find((h) => h.id === from) as Hub;
  const b = HUBS.find((h) => h.id === to) as Hub;
  const km = from === to ? 0 : distanceKm(a, b);
  const rate = mode === "air" ? 1.9 : mode === "lcl" ? 0.09 : 0.16; // per km per unit
  const unitLabel = mode === "air" ? "100 kg" : mode === "lcl" ? "m³" : "40' box";
  const price = Math.round((km * rate * units + (mode === "air" ? 180 : 420)) / 10) * 10;
  const days = mode === "air" ? Math.max(2, Math.round(km / 4500)) : Math.max(6, Math.round(km / 620));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    let h = 0;
    for (const c of from + to + mode + units) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    setSent(`ATQ-${String(h % 100000).padStart(5, "0")}`);
  };

  const field = "w-full rounded-xl border border-white/10 bg-[#030712]/60 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60";

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-white/10 bg-[#050b1c]/80 p-5 backdrop-blur sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs text-slate-400">
          Origin
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={field}>
            {HUBS.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.code})
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs text-slate-400">
          Destination
          <select value={to} onChange={(e) => setTo(e.target.value)} className={field}>
            {HUBS.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.code})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div role="group" aria-label="Mode" className="grid grid-cols-3 gap-2">
        {(
          [
            ["fcl", "Ocean FCL"],
            ["lcl", "Ocean LCL"],
            ["air", "Air"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
            className={`rounded-xl border px-2 py-2.5 text-sm transition-colors ${
              mode === id ? "border-cyan-400/60 bg-cyan-400/10 text-white" : "border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="grid gap-1.5 text-xs text-slate-400">
        Quantity ({unitLabel})
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={20}
            value={units}
            onChange={(e) => setUnits(Number(e.target.value))}
            className="flex-1 accent-cyan-400"
          />
          <span className={`${mono} w-8 text-right text-sm tabular-nums text-white`}>{units}</span>
        </div>
      </label>
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
        {from === to ? (
          <p className="text-sm text-slate-400">Pick two different hubs to see a rate.</p>
        ) : (
          <div className="flex gap-6">
            <div>
              <div className={`${mono} text-[10px] uppercase tracking-[0.2em] text-slate-500`}>Estimate</div>
              <div className={`${display} text-2xl font-semibold tabular-nums sm:text-3xl`}>${fmt(price)}</div>
            </div>
            <div>
              <div className={`${mono} text-[10px] uppercase tracking-[0.2em] text-slate-500`}>Transit</div>
              <div className={`${display} text-2xl font-semibold tabular-nums sm:text-3xl`}>{days} d</div>
            </div>
            <div className="hidden sm:block">
              <div className={`${mono} text-[10px] uppercase tracking-[0.2em] text-slate-500`}>Distance</div>
              <div className={`${display} text-2xl font-semibold tabular-nums sm:text-3xl`}>{fmt(km)} km</div>
            </div>
          </div>
        )}
        <button
          type="submit"
          disabled={from === to}
          className="rounded-full bg-gradient-to-r from-amber-500 to-amber-300 px-6 py-3 text-sm font-semibold text-slate-950 transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-40"
        >
          Lock this rate
        </button>
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-cyan-300">
        {sent && `Quote ${sent} held for 72 hours. A rate desk specialist will email you shortly.`}
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AtlasSite() {
  const reducedMotion = useReducedMotion();
  const now = useNow();
  const [selected, setSelected] = useState<string | null>(null);
  const [track, setTrack] = useState<TrackRequest | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  const heroRef = useRef<HTMLElement>(null);
  const [statsRef, statsSeen] = useInView<HTMLDivElement>("-80px");

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!selected && !track) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelected(null);
      setTrack(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, track]);

  const onSelect = useCallback((id: string | null) => {
    setSelected(id);
    if (id) setTrack(null);
  }, []);

  const onTrack = (code: string) => {
    const shipment = lookupShipment(code);
    if (!shipment) {
      setTrackError("Enter at least four characters, e.g. ATL-4471-RTM.");
      return;
    }
    setTrackError(null);
    setSelected(null);
    setTrack((t) => ({ shipment, seq: (t?.seq ?? 0) + 1 }));
  };

  const flyTo = (id: string) => {
    onSelect(id);
    heroRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
  };

  const hub = selected ? HUBS.find((h) => h.id === selected) ?? null : null;
  const panelOpen = Boolean(hub || track);
  const nextHub = () => {
    const i = HUBS.findIndex((h) => h.id === selected);
    onSelect(HUBS[(i + 1) % HUBS.length].id);
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-[#02040b] text-slate-100 selection:bg-cyan-400 selection:text-slate-950">
      {/* ---------- Hero / globe ---------- */}
      <section
        ref={heroRef}
        aria-label="Interactive globe of the Atlas Freight network: drag to spin, choose a hub to fly there"
        className="relative h-[100svh] min-h-[640px] overflow-hidden"
      >
        <WebGLBoundary fallback={heroFallback}>
          <Scene
            active={heroVisible}
            reducedMotion={reducedMotion}
            selected={selected}
            onSelect={onSelect}
            track={track}
            panelOpen={panelOpen}
          />
        </WebGLBoundary>

        {/* Legibility washes */}
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[55%] bg-gradient-to-r from-[#02040b]/90 via-[#02040b]/40 to-transparent lg:block" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[55%] bg-gradient-to-b from-[#02040b]/85 via-[#02040b]/40 to-transparent lg:hidden" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#02040b] to-transparent" />

        <nav className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-4 sm:px-8 sm:py-6">
          <a href="#top" className="flex items-center gap-2.5">
            <Logo />
            <span className={`${display} text-lg font-semibold tracking-tight`}>
              Atlas<span className="text-cyan-300"> Freight</span>
            </span>
          </a>
          <div className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
            <a href="#services" className="transition-colors hover:text-white">Services</a>
            <a href="#network" className="transition-colors hover:text-white">Network</a>
            <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
            <a href="#stories" className="transition-colors hover:text-white">Customers</a>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="#quote"
              className="rounded-full border border-cyan-400/50 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-200 backdrop-blur transition-colors hover:bg-cyan-400 hover:text-slate-950 sm:text-sm"
            >
              Get a quote
            </a>
            <MobileMenu
              links={[
                ["#services", "Services"],
                ["#network", "Network"],
                ["#pricing", "Pricing"],
                ["#stories", "Customers"],
                ["#quote", "Get a quote"],
              ]}
            />
          </div>
        </nav>

        {/* Hero copy */}
        <div
          id="top"
          className={`pointer-events-none absolute inset-x-0 top-[5.5rem] z-20 px-4 transition-all duration-500 sm:top-28 sm:px-8 lg:top-1/2 lg:-translate-y-1/2 ${
            panelOpen ? "max-lg:pointer-events-none max-lg:-translate-y-4 max-lg:opacity-0" : "opacity-100"
          }`}
        >
          <div className="mx-auto max-w-6xl 2xl:max-w-[1600px]">
            <div className="max-w-xl">
              <p className={`${mono} text-[10px] uppercase tracking-[0.35em] text-cyan-300 sm:text-xs`}>
                Ocean · Air · Road · Customs
              </p>
              <h1 className={`${display} mt-3 text-[2.6rem] font-semibold leading-[0.95] tracking-tight min-[400px]:text-5xl sm:text-6xl lg:text-7xl`}>
                Every route,
                <br />
                <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">in flight.</span>
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300 sm:mt-5 sm:text-base">
                Atlas moves 14 million containers a year across 168 countries, and you can watch every one of them. Spin the
                globe, pick a hub, or track your shipment live.
              </p>
              <div className={`mt-6 ${panelOpen ? "max-lg:hidden" : ""}`}>
                <TrackForm onTrack={onTrack} error={trackError} />
              </div>
            </div>
          </div>
        </div>

        {/* Live ticker */}
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-20 hidden px-8 lg:block">
          <div className="mx-auto max-w-6xl 2xl:max-w-[1600px]">
            <Ticker now={now} />
          </div>
        </div>

        {/* Hint */}
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-4 transition-opacity duration-500 sm:bottom-20 lg:justify-end lg:pr-10 ${
            panelOpen ? "opacity-0" : "opacity-100"
          }`}
        >
          <span className={`${mono} rounded-full border border-white/10 bg-[#02040b]/60 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-slate-300 backdrop-blur`}>
            <span className="hidden sm:inline">Drag to spin · click a hub to fly there</span>
            <span className="sm:hidden">Swipe sideways to spin · tap a hub</span>
          </span>
        </div>

        {/* Hub / shipment panel: bottom sheet on phones, floating card on desktop */}
        <div
          className={`absolute inset-x-0 bottom-0 z-30 transition-all duration-500 lg:inset-x-auto lg:bottom-24 lg:right-8 lg:w-[380px] ${
            panelOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
          }`}
          aria-live="polite"
        >
          <div className="max-h-[52svh] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#050b1c]/85 p-5 pb-20 shadow-[0_-20px_60px_rgba(2,6,23,0.7)] backdrop-blur-xl lg:max-h-none lg:rounded-3xl lg:pb-5">
            {hub && <HubPanel hub={hub} now={now} onClose={() => setSelected(null)} onNext={nextHub} />}
            {!hub && track && <TrackPanel shipment={track.shipment} now={now} onClose={() => setTrack(null)} />}
          </div>
        </div>
      </section>

      {/* ---------- Services ---------- */}
      <section id="services" className="relative px-4 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl 2xl:max-w-[1600px]">
          <p className={`${mono} text-xs uppercase tracking-[0.35em] text-cyan-300`}>01 · Services</p>
          <h2 className={`${display} mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl`}>
            One booking. <span className="text-slate-400">Every mode between the factory and the shelf.</span>
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((s, i) => (
              <article
                key={s.title}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-6 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/30"
              >
                <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-cyan-400/10 blur-2xl transition-opacity group-hover:opacity-100 sm:opacity-0" />
                <div className="grid size-12 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
                  <Icon d={s.icon} />
                </div>
                <p className={`${mono} mt-6 text-[10px] uppercase tracking-[0.3em] text-slate-500`}>0{i + 1}</p>
                <h3 className={`${display} mt-1 text-xl font-semibold`}>{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
                <p className={`${mono} mt-5 text-xs text-amber-300`}>{s.stat}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Network / coverage ---------- */}
      <section id="network" className="relative overflow-hidden px-4 py-24 sm:px-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: "radial-gradient(rgba(56,189,248,0.25) 1px, transparent 1.4px)",
            backgroundSize: "22px 22px",
            maskImage: "radial-gradient(ellipse at 50% 40%, black, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, black, transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl 2xl:max-w-[1600px]">
          <p className={`${mono} text-xs uppercase tracking-[0.35em] text-cyan-300`}>02 · Coverage</p>
          <h2 className={`${display} mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl`}>
            Six hubs. <span className="text-slate-400">A network that never sleeps.</span>
          </h2>
          <div ref={statsRef} className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="bg-[#030714] p-5 sm:p-8">
                <div className={`${display} bg-gradient-to-br from-white to-cyan-300 bg-clip-text text-3xl font-semibold text-transparent sm:text-5xl`}>
                  <Counter value={s.value} decimals={s.decimals} suffix={s.suffix} start={statsSeen} reduced={reducedMotion} />
                </div>
                <p className="mt-2 text-xs text-slate-400 sm:text-sm">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {HUBS.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => flyTo(h.id)}
                className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-white/25"
              >
                <span className="relative grid size-11 shrink-0 place-items-center rounded-full border border-white/10">
                  <span className="size-3 rounded-full" style={{ background: h.color, boxShadow: `0 0 14px ${h.color}` }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`${display} truncate text-lg font-semibold`}>{h.name}</span>
                    <span className={`${mono} shrink-0 text-[10px] text-slate-500`}>{h.code}</span>
                  </span>
                  <span className="block text-xs text-slate-400">
                    {fmt(h.teu)} TEU / day · {h.onTime}% on time
                  </span>
                </span>
                <span className="text-slate-500 transition-colors group-hover:text-cyan-300" aria-hidden>
                  ↗
                </span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">Choose a hub to fly the globe there.</p>
        </div>
      </section>

      <Pricing />

      {/* ---------- Testimonials ---------- */}
      <section id="stories" className="px-4 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl 2xl:max-w-[1600px]">
          <p className={`${mono} text-xs uppercase tracking-[0.35em] text-cyan-300`}>04 · Customers</p>
          <h2 className={`${display} mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl`}>Shippers who stopped chasing email</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <figure key={t.name} className="flex flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.03] p-7">
                <blockquote className="text-base leading-relaxed text-slate-200">“{t.quote}”</blockquote>
                <figcaption className="mt-8 flex items-center gap-3">
                  <span
                    className={`${display} grid size-10 place-items-center rounded-full text-sm font-semibold text-slate-950`}
                    style={{ background: ["#22d3ee", "#f59e0b", "#a78bfa"][i] }}
                  >
                    {t.name
                      .split(" ")
                      .map((p) => p[0])
                      .join("")}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{t.name}</span>
                    <span className="block text-xs text-slate-400">{t.role}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CTA / quote ---------- */}
      <section id="quote" className="px-4 pb-24 pt-8 sm:px-8">
        <div className="relative mx-auto grid max-w-6xl gap-10 overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-gradient-to-br from-[#0a1d45] via-[#050b1c] to-[#02040b] px-5 py-12 sm:px-12 lg:grid-cols-2 lg:items-center 2xl:max-w-[1600px]">
          <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-16 size-72 rounded-full bg-blue-600/25 blur-3xl" />
          <div className="relative">
            <p className={`${mono} text-xs uppercase tracking-[0.35em] text-amber-300`}>05 · Get moving</p>
            <h2 className={`${display} mt-3 text-3xl font-semibold tracking-tight sm:text-5xl`}>A real rate in under a minute</h2>
            <p className="mt-4 max-w-md text-slate-300">
              Pick two hubs and a mode. The estimate updates as you go, and locking it holds the space for 72 hours with no
              commitment.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-slate-400">
              <li>• All-in pricing: freight, fuel, terminal handling</li>
              <li>• Cargo insurance from 0.18% of value</li>
              <li>• Carbon-neutral options on every lane</li>
            </ul>
          </div>
          <div className="relative">
            <QuoteForm />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 pb-24 pt-14 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-5 2xl:max-w-[1600px]">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <Logo />
              <span className={`${display} text-lg font-semibold`}>Atlas Freight</span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-slate-400">
              Global freight forwarding with the whole network on one live globe.
            </p>
          </div>
          {[
            ["Services", ["Ocean freight", "Air cargo", "Road & rail", "Customs"]],
            ["Company", ["About", "Careers", "Sustainability", "Press"]],
            ["Support", ["Track a shipment", "Help centre", "API docs", "Status"]],
          ].map(([title, links]) => (
            <div key={title as string}>
              <p className={`${mono} text-[10px] uppercase tracking-[0.3em] text-slate-500`}>{title as string}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-300">
                {(links as string[]).map((l) => (
                  <li key={l}>
                    <a href={l === "Track a shipment" ? "#top" : "#services"} className="transition-colors hover:text-white">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-12 flex max-w-6xl flex-col items-center justify-between gap-3 border-t border-white/5 pt-6 text-xs text-slate-500 sm:flex-row 2xl:max-w-[1600px]">
          <span>© 2026 Atlas Freight Ltd. A MeshUI demo, all names fictional.</span>
          <a href="#top" className="hover:text-white">
            Back to the globe ↑
          </a>
        </div>
      </footer>
    </div>
  );
}
