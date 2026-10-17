"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import dynamic from "next/dynamic";
import MobileMenu from "@/components/sites/MobileMenu";
import type { Spot } from "./Scene";

const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#a5dfe6]">
      <span className="animate-pulse text-sm font-semibold tracking-wide text-emerald-900/70">
        Raising the island…
      </span>
    </div>
  ),
});

type SpotInfo = Spot & {
  kind: string;
  blurb: string;
  price: number;
  unit: "night" | "person";
  features: string[];
};

const SPOTS: SpotInfo[] = [
  {
    id: "cabin",
    name: "Cliff Cabin",
    kind: "Suite · sleeps 2",
    blurb:
      "A cedar cabin on the island's eastern edge, with a window seat that hangs over nine hundred metres of open air.",
    price: 18500,
    unit: "night",
    features: ["Wood stove", "Edge-side bath", "Breakfast basket"],
    position: [1.4, 2, -1.4],
  },
  {
    id: "spa",
    name: "Cloud Spa Suite",
    kind: "Suite · sleeps 2",
    blurb:
      "A heated plunge pool that glows turquoise after dark, a few steps from your own open-air pavilion.",
    price: 24900,
    unit: "night",
    features: ["Private pool", "Massage hut", "Sunset loungers"],
    position: [1.2, 1, 1.6],
  },
  {
    id: "lookout",
    name: "Lookout Loft",
    kind: "Loft · sleeps 3",
    blurb:
      "Perched on the highest tier under a lantern that burns all night. The best stargazing on the island.",
    price: 14200,
    unit: "night",
    features: ["Telescope", "Rooftop hammock", "Lantern dinners"],
    position: [-1.6, 2.2, -1.2],
  },
  {
    id: "falls",
    name: "Waterfall Deck",
    kind: "Experience",
    blurb:
      "Swim in the spring that feeds the island's waterfall, then watch it unravel into the clouds below.",
    price: 3200,
    unit: "person",
    features: ["Picnic lunch", "Guided swim", "2 hours"],
    position: [-3.6, 0.9, 1.8],
  },
  {
    id: "balloon",
    name: "Sunrise Balloon",
    kind: "Experience",
    blurb:
      "Untie from the dock at dawn and drift a slow loop around the island while the cloud sea below turns gold.",
    price: 6800,
    unit: "person",
    features: ["Dawn flight", "Hot chai", "60 minutes"],
    position: [4.4, 3.8, 4.2],
  },
];

const STAYS = SPOTS.filter((s) => s.unit === "night");
const EXTRAS = SPOTS.filter((s) => s.unit === "person");

const EXPERIENCES = [
  { n: "01", title: "Sunrise balloon", text: "A slow loop around the island at first light, chai in hand." },
  { n: "02", title: "Waterfall swim", text: "Float in the spring, then peer over the edge where the water turns to mist." },
  { n: "03", title: "Night sky supper", text: "Six courses by lantern light on the lookout, with the Milky Way for a ceiling." },
  { n: "04", title: "Cloud spa ritual", text: "Hot stones, cold plunge, and a nap on a lounger above the weather." },
];

const STORIES = [
  {
    quote: "We woke up above the clouds and didn't speak for ten minutes. Best ten minutes of the year.",
    who: "Aanya & Kabir",
    where: "Cliff Cabin, March",
  },
  {
    quote: "The pool lights up at night and the stars come down to meet it. My kids still talk about it.",
    who: "The Fernandes family",
    where: "Cloud Spa Suite, December",
  },
  {
    quote: "No cars, no signal, just birds circling the island. I finished two books and started a third.",
    who: "Meera R.",
    where: "Lookout Loft, July",
  },
];

const MOMENTS = [
  { label: "Dawn", from: "#fcd7a4", to: "#f49ac1" },
  { label: "Golden hour", from: "#ffd59a", to: "#f08a5d" },
  { label: "Dusk", from: "#f97362", to: "#6d4c9f" },
  { label: "Midnight", from: "#1e3a8a", to: "#0b1630" },
];

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function StayArt({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={id === "lookout" ? "#1e3a8a" : id === "spa" ? "#7fb2e5" : "#f6b98a"} />
          <stop offset="1" stopColor={id === "lookout" ? "#6d4c9f" : "#ffeedd"} />
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill={`url(#sky-${id})`} />
      <g fill={id === "lookout" ? "#4c4f9a" : "#ffffff"} opacity={id === "lookout" ? 0.7 : 0.85}>
        <circle cx="12" cy="112" r="14" />
        <circle cx="34" cy="116" r="12" />
        <circle cx="170" cy="114" r="15" />
        <circle cx="192" cy="110" r="12" />
      </g>
      <polygon points="30,78 170,78 140,112 60,112" fill="#9a8a78" />
      <polygon points="60,112 140,112 100,120" fill="#6f6257" />
      <polygon points="24,70 176,70 170,80 30,80" fill="#7cc46a" />
      {id === "cabin" && (
        <>
          <rect x="84" y="48" width="34" height="24" fill="#c98f5a" />
          <polygon points="78,50 101,32 124,50" fill="#a8483a" />
          <rect x="90" y="56" width="7" height="7" fill="#ffd28a" />
          <rect x="105" y="56" width="7" height="7" fill="#ffd28a" />
          <polygon points="140,70 148,48 156,70" fill="#3f8f5a" />
        </>
      )}
      {id === "spa" && (
        <>
          <ellipse cx="96" cy="70" rx="30" ry="5" fill="#4fd1c5" />
          <polygon points="128,50 146,40 164,50" fill="#f2c48d" />
          <rect x="132" y="50" width="2" height="20" fill="#f4ede0" />
          <rect x="158" y="50" width="2" height="20" fill="#f4ede0" />
          <circle cx="40" cy="26" r="9" fill="#fff1d6" />
        </>
      )}
      {id === "lookout" && (
        <>
          <polygon points="70,70 80,52 120,52 130,70" fill="#5aa957" />
          <rect x="98" y="30" width="2" height="22" fill="#e5e7eb" />
          <polygon points="100,30 116,35 100,40" fill="#f97362" />
          <circle cx="84" cy="44" r="3.5" fill="#ffc46b" />
          {[20, 50, 150, 176, 132, 36].map((x, i) => (
            <circle key={i} cx={x} cy={12 + ((i * 17) % 30)} r="1.2" fill="#fff" />
          ))}
          <circle cx="160" cy="22" r="7" fill="#dbe4ff" />
        </>
      )}
    </svg>
  );
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const INTRO_CSS = `
@keyframes isle-veil { 0% { opacity: 1 } 35% { opacity: .92 } 100% { opacity: 0; visibility: hidden } }
@keyframes isle-rise { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: none } }
.isle-veil { animation: isle-veil 2.6s cubic-bezier(.4,0,.2,1) forwards }
.isle-rise { opacity: 0; animation: isle-rise 1.1s cubic-bezier(.2,.7,.2,1) forwards }
@media (prefers-reduced-motion: reduce) {
  .isle-veil { animation: none; opacity: 0; visibility: hidden }
  .isle-rise { animation: none; opacity: 1 }
}
`;

export default function IsleSite() {
  const [night, setNight] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [stay, setStay] = useState(STAYS[0].id);
  const [extras, setExtras] = useState<string[]>([]);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const [confirmed, setConfirmed] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);
  const heroRef = useRef<HTMLElement>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const activeIndex = SPOTS.findIndex((s) => s.id === active);
  const activeSpot = activeIndex >= 0 ? SPOTS[activeIndex] : null;
  const stayInfo = STAYS.find((s) => s.id === stay) ?? STAYS[0];
  const nights =
    checkIn && checkOut
      ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000)
      : 0;
  const extrasTotal = EXTRAS.filter((e) => extras.includes(e.id)).reduce((sum, e) => sum + e.price * guests, 0);
  const total = Math.max(nights, 0) * stayInfo.price + extrasTotal;
  const datesInvalid = Boolean(checkIn && checkOut && nights <= 0);

  function planSpot(spot: SpotInfo) {
    if (spot.unit === "night") setStay(spot.id);
    else setExtras((prev) => (prev.includes(spot.id) ? prev : [...prev, spot.id]));
    setConfirmed(false);
    document.getElementById("book")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
  }

  function step(dir: 1 | -1) {
    const i = activeIndex < 0 ? 0 : (activeIndex + dir + SPOTS.length) % SPOTS.length;
    setActive(SPOTS[i].id);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (nights > 0) setConfirmed(true);
  }

  const heroText = night ? "text-white" : "text-emerald-950";

  return (
    <div
      className="min-h-screen overflow-x-clip bg-[#f6f1e7] text-emerald-950 font-(family-name:--font-isle-body)"
      style={{ colorScheme: "light" }}
    >
      <style>{INTRO_CSS}</style>
      {/* ---------------------------------------------------------- HERO */}
      <section ref={heroRef} className="relative h-svh min-h-[580px] w-full overflow-hidden bg-[#f9dcc0]">
        <Scene
          night={night}
          spots={SPOTS}
          active={active}
          onSelect={setActive}
          paused={!heroVisible}
          reducedMotion={reducedMotion}
        />

        {/* Legibility scrims: left on desktop, bottom on phones. */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 z-[5] transition-opacity duration-1000 max-md:hidden ${
            activeSpot ? "opacity-0" : "opacity-100"
          } ${
            night
              ? "bg-[linear-gradient(90deg,rgba(6,12,38,0.55),rgba(6,12,38,0.15)_38%,transparent_55%)]"
              : "bg-[linear-gradient(90deg,rgba(255,240,220,0.4),rgba(255,240,220,0.08)_35%,transparent_50%)]"
          }`}
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-[55%] transition-colors duration-1000 md:hidden ${
            night
              ? "bg-gradient-to-t from-[#0a1233]/85 via-[#0a1233]/35 to-transparent"
              : "bg-gradient-to-t from-[#fff1de]/90 via-[#fff1de]/40 to-transparent"
          }`}
        />

        {/* Cloud veil the camera dives out of. */}
        <div
          aria-hidden
          className="isle-veil pointer-events-none absolute inset-0 z-[45] bg-[radial-gradient(ellipse_at_center,#fffaf2_0%,#fde7cf_60%,#f6cfa8_100%)]"
        />

        <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <a
            href="#"
            className={`pointer-events-auto text-2xl font-semibold italic tracking-tight transition-colors duration-700 font-(family-name:--font-isle-display) ${heroText}`}
          >
            Isle<span className="text-amber-500">.</span>
          </a>
          <nav
            className={`pointer-events-auto hidden items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold backdrop-blur-md transition-colors duration-700 md:flex ${
              night ? "bg-white/10 text-white" : "bg-white/35 text-emerald-950"
            }`}
          >
            {[
              ["#stays", "Stays"],
              ["#experiences", "Experiences"],
              ["#stories", "Stories"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="rounded-full px-3 py-1.5 opacity-80 transition hover:bg-white/30 hover:opacity-100">
                {label}
              </a>
            ))}
          </nav>
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNight((n) => !n)}
              aria-label={night ? "Switch to day" : "Switch to night"}
              aria-pressed={night}
              data-isle-toggle
              className={`relative flex h-9 w-[4.6rem] items-center rounded-full border p-1 backdrop-blur-md transition-colors duration-700 ${
                night ? "border-white/25 bg-indigo-950/60" : "border-emerald-950/15 bg-white/60"
              }`}
            >
              <span
                className={`flex size-7 items-center justify-center rounded-full text-sm shadow transition-all duration-500 ${
                  night ? "translate-x-[2.2rem] bg-indigo-200 text-indigo-950" : "translate-x-0 bg-amber-300 text-amber-900"
                }`}
              >
                {night ? "☾" : "☀"}
              </span>
            </button>
            <a
              href="#book"
              className="rounded-full bg-emerald-950 px-4 py-2 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
            >
              Book
            </a>
            <MobileMenu tone={night ? "dark" : "light"} links={[["#stays", "Stays"], ["#experiences", "Experiences"], ["#stories", "Stories"], ["#book", "Book"]]} />
          </div>
        </header>

        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-20 transition-opacity duration-500 sm:px-8 sm:pb-24 md:bottom-auto md:top-1/2 md:max-w-[46rem] md:-translate-y-1/2 md:pb-0 md:pl-12 lg:pl-16 ${
            activeSpot ? "opacity-0" : "opacity-100"
          }`}
        >
          <p
            className={`isle-rise mb-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-700 sm:text-xs sm:tracking-[0.28em] ${
              night ? "text-amber-300" : "text-emerald-800"
            }`}
            style={{ animationDelay: "2.2s" }}
          >
            Boutique retreat · 6 suites · 900 m up
          </p>
          <h1
            className={`isle-rise text-[2.6rem] leading-[1.02] font-semibold tracking-tight transition-colors duration-700 sm:text-6xl lg:text-7xl font-(family-name:--font-isle-display) ${heroText}`}
            style={{ animationDelay: "2.45s", textShadow: night ? "0 2px 30px rgba(10,18,51,.6)" : "0 2px 30px rgba(255,240,220,.7)" }}
          >
            A little island,
            <br />
            <em className="font-normal">adrift above the clouds.</em>
          </h1>
          <p
            className={`isle-rise mt-4 max-w-md text-sm leading-relaxed sm:text-base max-md:hidden ${night ? "text-white/80" : "text-emerald-950/75"}`}
            style={{ animationDelay: "2.7s" }}
          >
            Three suites, one waterfall and a balloon on a slow loop. Watch the sun go down from the edge of the world.
          </p>
          <div className="isle-rise pointer-events-auto mt-6 flex flex-wrap items-center gap-3" style={{ animationDelay: "2.9s" }}>
            <a
              href="#stays"
              className="rounded-full bg-amber-400 px-5 py-3 text-sm font-bold text-emerald-950 shadow-[0_10px_30px_-8px_rgba(245,158,11,0.8)] transition-transform hover:-translate-y-0.5"
            >
              Explore stays
            </a>
            <button
              type="button"
              onClick={() => setActive(SPOTS[0].id)}
              className={`rounded-full px-4 py-2.5 text-xs font-semibold backdrop-blur-md transition-colors duration-700 ${
                night ? "bg-white/10 text-white/90 hover:bg-white/20" : "bg-white/55 text-emerald-950/85 hover:bg-white/80"
              }`}
            >
              Take the tour →<span className="max-md:hidden"> or drag to orbit</span>
            </button>
          </div>
        </div>

        {/* Info card for the selected hotspot */}
        <aside
          aria-live="polite"
          className={`absolute z-30 transition-all duration-500 max-md:inset-x-3 max-md:bottom-[4.5rem] md:right-8 md:top-1/2 md:w-[370px] md:-translate-y-1/2 ${
            activeSpot ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
          }`}
        >
          {activeSpot && (
            <div
              key={activeSpot.id}
              className="isle-rise overflow-hidden rounded-3xl border border-white/60 bg-white/85 shadow-[0_30px_80px_-30px_rgba(6,40,40,0.6)] backdrop-blur-xl"
              style={{ animationDuration: "0.6s" }}
            >
              <div className="h-1.5 bg-gradient-to-r from-amber-300 via-rose-300 to-teal-300" />
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">
                      {String(activeIndex + 1).padStart(2, "0")} / {String(SPOTS.length).padStart(2, "0")} · {activeSpot.kind}
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold font-(family-name:--font-isle-display)">{activeSpot.name}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActive(null)}
                    aria-label="Close"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-950/5 text-lg hover:bg-emerald-950/10"
                  >
                    ×
                  </button>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-emerald-950/75">{activeSpot.blurb}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {activeSpot.features.map((f) => (
                    <li key={f} className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
                  <p>
                    <span className="text-2xl font-bold">{rupees(activeSpot.price)}</span>
                    <span className="text-sm text-emerald-950/60"> / {activeSpot.unit}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => planSpot(activeSpot)}
                    className="rounded-full bg-emerald-950 px-5 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
                  >
                    {activeSpot.unit === "night" ? "Book this stay" : "Add to my trip"}
                  </button>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-emerald-950/10 pt-3 text-xs font-bold text-emerald-950/60">
                  <button type="button" onClick={() => step(-1)} className="rounded-full px-2 py-1 hover:bg-emerald-950/5 hover:text-emerald-950">
                    ← {SPOTS[(activeIndex - 1 + SPOTS.length) % SPOTS.length].name}
                  </button>
                  <button type="button" onClick={() => step(1)} className="rounded-full px-2 py-1 hover:bg-emerald-950/5 hover:text-emerald-950">
                    {SPOTS[(activeIndex + 1) % SPOTS.length].name} →
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Soft hand-off into the page below. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] h-10 bg-gradient-to-b from-transparent to-[#f6f1e7]/80" />
      </section>

      {/* ---------------------------------------------------------- STAYS */}
      <section id="stays" className="mx-auto max-w-6xl 2xl:max-w-[1600px] px-4 py-20 sm:px-8 sm:py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-700">Where you&apos;ll sleep</p>
            <h2 className="mt-3 max-w-xl text-4xl leading-tight font-semibold sm:text-5xl font-(family-name:--font-isle-display)">
              Three stays, each with its own <em className="font-normal">edge.</em>
            </h2>
          </div>
          <p className="max-w-sm text-emerald-950/70">
            Every suite faces open sky. Breakfast arrives by basket, and the only traffic is the birds.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STAYS.map((s) => (
            <article
              key={s.id}
              className="group overflow-hidden rounded-3xl bg-white shadow-[0_20px_50px_-30px_rgba(6,78,59,0.45)] transition-transform duration-300 hover:-translate-y-1.5"
            >
              <div className="aspect-[5/3] overflow-hidden">
                <div className="h-full w-full transition-transform duration-500 group-hover:scale-105">
                  <StayArt id={s.id} />
                </div>
              </div>
              <div className="p-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">{s.kind}</p>
                <h3 className="mt-1 text-2xl font-semibold font-(family-name:--font-isle-display)">{s.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-emerald-950/70">{s.blurb}</p>
                <div className="mt-5 flex items-center justify-between">
                  <p className="text-sm">
                    <span className="text-lg font-bold">{rupees(s.price)}</span>
                    <span className="text-emerald-950/60"> / night</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => planSpot(s)}
                    className="rounded-full border border-emerald-950/15 px-4 py-2 text-sm font-bold transition-colors hover:bg-emerald-950 hover:text-white"
                  >
                    Reserve
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- EXPERIENCES */}
      <section id="experiences" className="bg-emerald-950 text-[#f6f1e7]">
        <div className="mx-auto grid max-w-6xl 2xl:max-w-[1600px] gap-12 px-4 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">Days on the isle</p>
            <h2 className="mt-3 text-4xl leading-tight font-semibold sm:text-5xl font-(family-name:--font-isle-display)">
              Slow things, <em className="font-normal">done beautifully.</em>
            </h2>
            <p className="mt-5 max-w-sm text-[#f6f1e7]/70">
              There&apos;s no itinerary here, just a handful of rituals our hosts love sharing. Pick one, pick
              none.
            </p>
            <dl className="mt-10 grid grid-cols-2 gap-6 border-t border-white/10 pt-8">
              {[
                ["6", "suites, never more"],
                ["900 m", "above the sea"],
                ["0", "cars or roads"],
                ["∞", "stars after dark"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="text-3xl font-semibold text-amber-300 font-(family-name:--font-isle-display)">{v}</dt>
                  <dd className="mt-1 text-sm text-[#f6f1e7]/60">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2">
            {EXPERIENCES.map((x) => (
              <li
                key={x.n}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition-colors hover:bg-white/[0.08]"
              >
                <span className="text-sm font-bold text-amber-300">{x.n}</span>
                <h3 className="mt-6 text-2xl font-semibold font-(family-name:--font-isle-display)">{x.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#f6f1e7]/70">{x.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* -------------------------------------------------------- STORIES */}
      <section id="stories" className="mx-auto max-w-6xl 2xl:max-w-[1600px] px-4 py-20 sm:px-8 sm:py-28">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-700">One island, four moods</p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {MOMENTS.map((m) => (
            <div
              key={m.label}
              className="relative aspect-[3/4] overflow-hidden rounded-3xl"
              style={{ background: `linear-gradient(160deg, ${m.from}, ${m.to})` }}
            >
              <svg viewBox="0 0 100 60" className="absolute inset-x-0 bottom-6 mx-auto w-3/4 opacity-90" aria-hidden>
                <polygon points="10,20 90,20 70,46 30,46" fill="rgba(0,0,0,0.25)" />
                <polygon points="6,14 94,14 90,22 10,22" fill="rgba(255,255,255,0.55)" />
                <polygon points="56,14 64,0 72,14" fill="rgba(255,255,255,0.7)" />
              </svg>
              <span className="absolute left-4 top-4 rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-emerald-950">
                {m.label}
              </span>
            </div>
          ))}
        </div>

        <h2 className="mt-20 max-w-2xl text-4xl leading-tight font-semibold sm:text-5xl font-(family-name:--font-isle-display)">
          Postcards from <em className="font-normal">our guests.</em>
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STORIES.map((s) => (
            <figure key={s.who} className="flex flex-col rounded-3xl bg-white p-7 shadow-[0_20px_50px_-35px_rgba(6,78,59,0.45)]">
              <span className="text-4xl leading-none text-amber-400 font-(family-name:--font-isle-display)">“</span>
              <blockquote className="mt-2 flex-1 text-lg leading-relaxed font-(family-name:--font-isle-display)">
                {s.quote}
              </blockquote>
              <figcaption className="mt-6 border-t border-emerald-950/10 pt-4 text-sm">
                <span className="font-bold">{s.who}</span>
                <span className="block text-emerald-950/60">{s.where}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- BOOK */}
      <section id="book" className="px-4 pb-20 sm:px-8 sm:pb-28">
        <div className="mx-auto max-w-6xl 2xl:max-w-[1600px] overflow-hidden rounded-[2rem] bg-gradient-to-br from-teal-600 via-emerald-700 to-emerald-950 p-6 text-white shadow-2xl sm:p-12">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">Plan your drift</p>
              <h2 className="mt-3 text-4xl leading-tight font-semibold sm:text-5xl font-(family-name:--font-isle-display)">
                Your island is <em className="font-normal">waiting.</em>
              </h2>
              <p className="mt-4 max-w-sm text-white/75">
                Pick your dates and we&apos;ll hold the balloon. No payment needed today.
              </p>
            </div>

            <form onSubmit={submit} className="grid gap-4 rounded-3xl bg-white p-5 text-emerald-950 sm:grid-cols-2 sm:p-6">
              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-950/60 sm:col-span-2">
                Stay
                <select
                  value={stay}
                  onChange={(e) => {
                    setStay(e.target.value);
                    setConfirmed(false);
                  }}
                  className="rounded-xl border border-emerald-950/15 bg-[#f6f1e7] px-3 py-2.5 text-base font-semibold normal-case tracking-normal text-emerald-950"
                >
                  {STAYS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {rupees(s.price)} / night
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-950/60">
                Check in
                <input
                  type="date"
                  required
                  value={checkIn}
                  onChange={(e) => {
                    setCheckIn(e.target.value);
                    setConfirmed(false);
                  }}
                  className="rounded-xl border border-emerald-950/15 bg-[#f6f1e7] px-3 py-2.5 text-base font-semibold normal-case tracking-normal text-emerald-950"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-950/60">
                Check out
                <input
                  type="date"
                  required
                  min={checkIn || undefined}
                  value={checkOut}
                  onChange={(e) => {
                    setCheckOut(e.target.value);
                    setConfirmed(false);
                  }}
                  className="rounded-xl border border-emerald-950/15 bg-[#f6f1e7] px-3 py-2.5 text-base font-semibold normal-case tracking-normal text-emerald-950"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-950/60">
                Guests
                <select
                  value={guests}
                  onChange={(e) => setGuests(Number(e.target.value))}
                  className="rounded-xl border border-emerald-950/15 bg-[#f6f1e7] px-3 py-2.5 text-base font-semibold normal-case tracking-normal text-emerald-950"
                >
                  {[1, 2, 3].map((g) => (
                    <option key={g} value={g}>
                      {g} {g === 1 ? "guest" : "guests"}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="grid gap-2">
                <legend className="mb-1.5 text-xs font-bold uppercase tracking-wider text-emerald-950/60">Add-ons</legend>
                {EXTRAS.map((x) => (
                  <label key={x.id} className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={extras.includes(x.id)}
                      onChange={(e) =>
                        setExtras((prev) => (e.target.checked ? [...prev, x.id] : prev.filter((id) => id !== x.id)))
                      }
                      className="size-4 accent-teal-600"
                    />
                    {x.name}
                  </label>
                ))}
              </fieldset>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-emerald-950/10 pt-4 sm:col-span-2">
                <p className="text-sm">
                  {datesInvalid ? (
                    <span className="font-semibold text-rose-600">Check-out must be after check-in.</span>
                  ) : nights > 0 ? (
                    <>
                      <span className="text-emerald-950/60">
                        {nights} {nights === 1 ? "night" : "nights"}
                        {extrasTotal > 0 && " + add-ons"} ·{" "}
                      </span>
                      <span className="text-xl font-bold">{rupees(total)}</span>
                    </>
                  ) : (
                    <span className="text-emerald-950/60">Choose dates to see your total.</span>
                  )}
                </p>
                <button
                  type="submit"
                  disabled={nights <= 0}
                  className="rounded-full bg-amber-400 px-6 py-3 text-sm font-bold text-emerald-950 transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  Request booking
                </button>
              </div>
              {confirmed && (
                <p className="rounded-2xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800 sm:col-span-2">
                  ✓ {stayInfo.name} is on hold for {nights} {nights === 1 ? "night" : "nights"}. We&apos;ll write to you
                  within a day — this is a demo, so nothing was sent.
                </p>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- FOOTER */}
      <footer className="border-t border-emerald-950/10 px-4 pb-28 pt-12 sm:px-8">
        <div className="mx-auto flex max-w-6xl 2xl:max-w-[1600px] flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-3xl font-semibold italic font-(family-name:--font-isle-display)">
              Isle<span className="text-amber-500">.</span>
            </p>
            <p className="mt-2 max-w-xs text-sm text-emerald-950/60">
              A boutique retreat on a floating island. Reached by balloon, left reluctantly.
            </p>
          </div>
          <div className="flex gap-6 text-sm font-semibold text-emerald-950/70">
            <a href="#stays" className="hover:text-emerald-950">Stays</a>
            <a href="#experiences" className="hover:text-emerald-950">Experiences</a>
            <a href="#book" className="hover:text-emerald-950">Book</a>
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-6xl 2xl:max-w-[1600px] text-xs text-emerald-950/45">
          © Isle Retreats — a MeshUI demo. Fictional place, real Three.js.
        </p>
      </footer>
    </div>
  );
}
