"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import MobileMenu from "@/components/sites/MobileMenu";
import { Posy } from "./Art";
import type { Counts, WrapStyle } from "./Bouquet";
import type { Kind } from "./flora";

const HeroCanvas = dynamic(() => import("./Scene").then((m) => m.HeroCanvas), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#f7f1e8]" />,
});
const BouquetCanvas = dynamic(() => import("./Bouquet").then((m) => m.BouquetCanvas), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-[#efe6da]">
      <span className="animate-pulse text-xs uppercase tracking-[0.3em] text-stone-500">Gathering stems…</span>
    </div>
  ),
});

const serif = "font-(family-name:--font-bloom-serif)";
const eyebrow =
  "text-[10px] font-medium uppercase tracking-[0.26em] text-[#8a7a6b] sm:text-[11px] sm:tracking-[0.32em]";
const MAX = 12;

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/* ------------------------------------------------------------------ */
/* Data                                                                 */
/* ------------------------------------------------------------------ */

const STEMS: { kind: Kind; name: string; note: string; price: number }[] = [
  { kind: "rose", name: "Garden rose", note: "Spiral-petalled, scented", price: 180 },
  { kind: "peony", name: "Peony", note: "Sarah Bernhardt, in season", price: 320 },
  { kind: "tulip", name: "Tulip", note: "Dutch, long-stemmed", price: 140 },
  { kind: "daisy", name: "Field daisy", note: "Chamomile-sweet filler", price: 90 },
];

const PALETTES: { name: string; colors: Record<Kind, string> }[] = [
  { name: "Blush", colors: { rose: "#f2a3b5", tulip: "#f7c6d0", peony: "#f9cfd9", daisy: "#fffaf2" } },
  { name: "Garden", colors: { rose: "#e65f78", tulip: "#f39a4e", peony: "#f5b3c5", daisy: "#fff4dc" } },
  { name: "Ivory", colors: { rose: "#fbf1e2", tulip: "#f4ead6", peony: "#fff6ec", daisy: "#ffffff" } },
  { name: "Berry", colors: { rose: "#a3264c", tulip: "#c8406c", peony: "#dc7aa0", daisy: "#f5e2ea" } },
  { name: "Lilac", colors: { rose: "#c5aee6", tulip: "#a48ad6", peony: "#e3d3f6", daisy: "#f8f2ff" } },
];

const WRAPS: (WrapStyle & { name: string; note: string; extra: number })[] = [
  { name: "Kraft", note: "Recycled brown paper & twine", extra: 0, paper: "#c79d70", tissue: "#f4ece0", ribbon: "#8b6a48" },
  { name: "Blush tissue", note: "Double-layer crêpe", extra: 150, paper: "#f1c2c7", tissue: "#fff3f1", ribbon: "#d27486" },
  { name: "Ivory linen", note: "Reusable linen wrap", extra: 250, paper: "#efe6d6", tissue: "#fbf8f2", ribbon: "#b7a58a" },
  { name: "Sage", note: "Matte florist paper", extra: 200, paper: "#a9b99a", tissue: "#eef2e6", ribbon: "#f3e8d8" },
  { name: "Noir", note: "Black kraft, satin bow", extra: 300, paper: "#2d2b2a", tissue: "#e9e2d8", ribbon: "#e2c58f" },
];

const HAND_TIE = 450;

const CHAPTERS = [
  {
    roman: "I",
    kicker: "Artisan florist · Indiranagar, Bengaluru",
    title: (
      <>
        Flowers,
        <br />
        <span className="italic text-[#c46b7c]">slowly</span> grown.
      </>
    ),
    body: "Seasonal stems from our own beds in Nandi Hills, cut at dawn and hand-tied the same morning. Move your cursor — the meadow feels it.",
  },
  {
    roman: "II",
    kicker: "The unfurling",
    title: (
      <>
        Every petal
        <br />
        opens in <span className="italic text-[#c46b7c]">its own</span> time.
      </>
    ),
    body: "We never force a bloom. Buds are conditioned for a day in cool water, so they open in your home, not in our van.",
  },
  {
    roman: "III",
    kicker: "Gathered for you",
    title: (
      <>
        Tied at dawn,
        <br />
        at your <span className="italic text-[#c46b7c]">door</span> by noon.
      </>
    ),
    body: "Same-day delivery across the city in electric vans, wrapped in paper that goes straight into the compost.",
  },
] as const;

const COLLECTIONS = [
  {
    season: "Spring",
    name: "First Light",
    note: "Tulips, ranunculus & sweet pea",
    price: 2400,
    bg: "linear-gradient(160deg,#fbe9e4 0%,#f7d9d9 55%,#f3e7d6 100%)",
    colors: ["#f7c6d0", "#f39a4e", "#fff4dc", "#f2a3b5"],
    kinds: ["tulip", "daisy", "tulip", "rose"] as const,
    seed: 11,
  },
  {
    season: "Summer",
    name: "Peony Hour",
    note: "Sarah Bernhardt peonies, garden roses",
    price: 3600,
    bg: "linear-gradient(160deg,#fde5ea 0%,#f9d3dc 50%,#f6e6db 100%)",
    colors: ["#f9cfd9", "#f5b3c5", "#e65f78", "#fffaf2"],
    kinds: ["peony", "rose", "peony", "daisy"] as const,
    seed: 23,
  },
  {
    season: "Monsoon",
    name: "Wild Meadow",
    note: "Chamomile, cosmos, field grasses",
    price: 1800,
    bg: "linear-gradient(160deg,#eef1e4 0%,#e3ead6 55%,#f2ecdc 100%)",
    colors: ["#ffffff", "#fff4dc", "#c5aee6", "#f7c6d0"],
    kinds: ["daisy", "daisy", "tulip", "rose"] as const,
    seed: 37,
  },
  {
    season: "Winter",
    name: "Velvet Dusk",
    note: "Burgundy roses & dried bunny-tail",
    price: 2900,
    bg: "linear-gradient(160deg,#f1e1e4 0%,#e8cdd6 50%,#efe3da 100%)",
    colors: ["#a3264c", "#c8406c", "#dc7aa0", "#f5e2ea"],
    kinds: ["rose", "peony", "rose", "daisy"] as const,
    seed: 53,
  },
];

const PLANS = [
  { name: "The Posy", stems: "8–10 stems", weekly: 1100, note: "A jam-jar bunch for the kitchen table." },
  { name: "The Bunch", stems: "15–18 stems", weekly: 1900, note: "Our signature hand-tied, wrapped in kraft.", featured: true },
  { name: "The Grand", stems: "30+ stems", weekly: 3600, note: "A statement arrangement for the hallway." },
];

const WORKSHOPS = [
  { date: "Sat 24 Oct", time: "10:00", title: "Hand-tied bouquets", level: "Beginner", price: 3200, seats: 4 },
  { date: "Sun 1 Nov", time: "11:00", title: "Wreaths from the dry garden", level: "All levels", price: 3800, seats: 6 },
  { date: "Sat 14 Nov", time: "16:00", title: "Ikebana & quiet forms", level: "Intermediate", price: 4200, seats: 2 },
  { date: "Sun 22 Nov", time: "10:30", title: "Wedding florals masterclass", level: "Advanced", price: 7600, seats: 5 },
];

const QUOTES = [
  {
    q: "The peonies opened over four days, one petal at a time. My whole flat smelled of them.",
    who: "Ananya R.",
    where: "Koramangala",
  },
  {
    q: "I've had the fortnightly bunch for two years. It is the one subscription I will never cancel.",
    who: "David M.",
    where: "Whitefield",
  },
  {
    q: "They did our wedding with flowers grown an hour away. Nothing in plastic, nothing flown in.",
    who: "Priya & Karan",
    where: "Nandi Hills",
  },
];

/* ------------------------------------------------------------------ */
/* Hooks                                                                */
/* ------------------------------------------------------------------ */

function useInView<T extends Element>(ref: RefObject<T | null>) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

function useTween(value: number, ms = 600) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const v = a + (value - a) * (1 - Math.pow(1 - t, 3));
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/* ------------------------------------------------------------------ */
/* Bits                                                                 */
/* ------------------------------------------------------------------ */

function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`${serif} inline-flex items-baseline gap-1.5 leading-none tracking-tight ${className}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="translate-y-0.5 self-center">
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="12" cy="6.5" rx="3.6" ry="5.5" fill="#e9a3b2" opacity="0.85" transform={`rotate(${a} 12 12)`} />
        ))}
        <circle cx="12" cy="12" r="2.6" fill="#f2b632" />
      </svg>
      Bloom <span className="italic text-[#c46b7c]">Botanica</span>
    </span>
  );
}

function Stepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center rounded-full border border-stone-900/15 bg-white/60">
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="grid size-9 place-items-center rounded-full text-lg leading-none transition-colors hover:bg-stone-900/5 disabled:opacity-30"
      >
        −
      </button>
      <span className="w-7 text-center text-sm tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`More ${label}`}
        disabled={value >= MAX}
        onClick={() => onChange(Math.min(MAX, value + 1))}
        className="grid size-9 place-items-center rounded-full text-lg leading-none transition-colors hover:bg-stone-900/5 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function BloomSite() {
  const storyRef = useRef<HTMLElement>(null);
  const builderRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const heroActive = useInView(storyRef);
  const builderActive = useInView(builderRef);
  const [chapter, setChapter] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  // builder
  const [counts, setCounts] = useState<Counts>({ rose: 5, peony: 3, tulip: 4, daisy: 6 });
  const [palette, setPalette] = useState(PALETTES[0]);
  const [wrap, setWrap] = useState(WRAPS[0]);
  const [message, setMessage] = useState("");
  const [basket, setBasket] = useState(0);
  const [added, setAdded] = useState(false);

  // elsewhere
  const [fortnightly, setFortnightly] = useState(false);
  const [booked, setBooked] = useState<Record<string, boolean>>({});
  const [pin, setPin] = useState("");
  const [pinResult, setPinResult] = useState<null | { ok: boolean; text: string }>(null);
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);

  const totalStems = STEMS.reduce((s, x) => s + counts[x.kind], 0);
  const price = STEMS.reduce((s, x) => s + counts[x.kind] * x.price, 0) + wrap.extra + (totalStems > 0 ? HAND_TIE : 0);
  const shownPrice = useTween(price);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = storyRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = Math.max(1, r.height - window.innerHeight);
      const p = Math.min(1, Math.max(0, -r.top / span));
      progress.current = p;
      setChapter(p < 0.3 ? 0 : p < 0.66 ? 1 : 2);
      setScrolled(r.bottom < 80);
      if (railRef.current) railRef.current.style.transform = `scaleY(${p})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 2400);
    return () => clearTimeout(t);
  }, [added]);

  const setCount = (kind: Kind, v: number) => setCounts((c) => ({ ...c, [kind]: v }));

  const surprise = () => {
    const r = () => Math.random();
    const next: Counts = {
      rose: Math.floor(r() * 7),
      peony: Math.floor(r() * 5),
      tulip: Math.floor(r() * 7),
      daisy: Math.floor(r() * 8),
    };
    if (next.rose + next.peony + next.tulip + next.daisy < 4) next.rose += 4;
    setCounts(next);
    setPalette(PALETTES[Math.floor(r() * PALETTES.length)]);
    setWrap(WRAPS[Math.floor(r() * WRAPS.length)]);
  };

  const checkPin = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(pin)) {
      setPinResult({ ok: false, text: "Please enter a 6-digit PIN code." });
    } else if (pin.startsWith("560") || pin.startsWith("562")) {
      setPinResult({ ok: true, text: `Lovely — ${pin} gets same-day delivery. Order by 2 pm, at your door by 6.` });
    } else {
      setPinResult({ ok: true, text: `We reach ${pin} by next-day chilled courier, buds still closed.` });
    }
  };

  const navLinks: [string, string][] = [
    ["#collections", "Collections"],
    ["#builder", "Build a bouquet"],
    ["#subscriptions", "Subscriptions"],
    ["#workshops", "Workshops"],
    ["#delivery", "Delivery"],
  ];

  return (
    <div
      className="min-h-screen overflow-x-clip bg-[#f7f1e8] font-(family-name:--font-bloom-sans) text-[#2f2a26] selection:bg-[#f6c9d2]"
    >
      {/* Nav */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
          scrolled ? "border-b border-stone-900/5 bg-[#f7f1e8]/80 backdrop-blur-md" : ""
        }`}
      >
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-8 2xl:max-w-[1600px]">
          <a href="#top" className="text-[1.45rem] sm:text-[1.7rem]">
            <Logo />
          </a>
          <div className="hidden items-center gap-8 text-[13px] text-stone-600 lg:flex">
            {navLinks.map(([href, label]) => (
              <a key={href} href={href} className="transition-colors hover:text-stone-900">
                {label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <a
              href="#builder"
              className="flex items-center gap-2 rounded-full border border-stone-900/80 px-3.5 py-2 text-[10px] font-medium uppercase tracking-[0.2em] transition-colors hover:bg-stone-900 hover:text-[#f7f1e8] sm:px-4 sm:text-[11px]"
            >
              Basket
              <span
                key={basket}
                className={`grid size-5 place-items-center rounded-full bg-[#c46b7c] text-[10px] tracking-normal text-white ${
                  basket ? "animate-[bloom-pop_0.5s_ease]" : ""
                }`}
              >
                {basket}
              </span>
            </a>
            <MobileMenu tone="light" hideAt="lg:hidden" links={navLinks} />
          </div>
        </nav>
      </header>

      {/* Pinned story: the meadow grows as you scroll */}
      <section id="top" ref={storyRef} className="relative h-[320svh]">
        <div className="sticky top-0 h-[100svh] min-h-[560px] overflow-hidden">
          <div className="bloom-reveal absolute inset-0">
            <HeroCanvas active={heroActive} progress={progress} />
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[55%] bg-gradient-to-r from-[#f7f1e8]/80 via-[#f7f1e8]/40 to-transparent md:block" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-[#f7f1e8] via-[#f7f1e8]/85 to-transparent md:hidden" />

          {CHAPTERS.map((c, i) => {
            const on = chapter === i;
            const Heading = i === 0 ? "h1" : "h2";
            return (
              <div
                key={c.roman}
                aria-hidden={!on}
                className={`pointer-events-none absolute inset-0 mx-auto flex max-w-7xl flex-col justify-end px-5 pb-24 transition-all duration-[900ms] ease-[cubic-bezier(.2,.7,.2,1)] sm:px-8 md:justify-center md:pb-0 2xl:max-w-[1600px] ${
                  on ? "opacity-100 blur-0" : "translate-y-6 opacity-0 blur-[6px]"
                }`}
              >
                <div className="max-w-[34rem]">
                  <p className={`${eyebrow} mb-5 flex items-center gap-3 max-md:[@media(max-height:760px)]:hidden`}>
                    <span className={`${serif} text-base normal-case italic tracking-normal text-[#c46b7c]`}>{c.roman}</span>
                    <span className="h-px w-8 bg-[#8a7a6b]/50" />
                    {c.kicker}
                  </p>
                  <Heading
                    className={`${serif} text-[3rem] leading-[0.92] tracking-[-0.015em] min-[400px]:text-[3.4rem] sm:text-7xl lg:text-[6.6rem]`}
                  >
                    {c.title}
                  </Heading>
                  <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-stone-600 sm:mt-6 sm:text-[15px]">{c.body}</p>
                  {i === 0 && (
                    <div className={`mt-7 flex flex-wrap gap-2.5 sm:mt-8 sm:gap-3 ${on ? "pointer-events-auto" : ""}`}>
                      <a
                        href="#builder"
                        className="rounded-full bg-[#2f2a26] px-5 py-3 text-sm font-medium text-[#f7f1e8] shadow-[0_12px_30px_-14px_rgba(47,42,38,0.7)] transition-transform hover:-translate-y-0.5 sm:px-6"
                      >
                        Build your bouquet
                      </a>
                      <a
                        href="#collections"
                        className="rounded-full border border-stone-900/15 bg-white/60 px-5 py-3 text-sm font-medium backdrop-blur transition-colors hover:bg-white/90 sm:px-6"
                      >
                        This season
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Chapter rail */}
          <div className="pointer-events-none absolute right-5 top-1/2 hidden -translate-y-1/2 flex-col items-center gap-3 md:flex lg:right-8">
            <span className={`${serif} text-sm italic text-stone-500`}>0{chapter + 1}</span>
            <div className="relative h-28 w-px bg-stone-900/15">
              <div ref={railRef} className="absolute inset-0 origin-top bg-[#c46b7c]" style={{ transform: "scaleY(0)" }} />
            </div>
            <span className={`${serif} text-sm italic text-stone-400`}>03</span>
          </div>

          <div
            className={`pointer-events-none absolute bottom-8 left-8 hidden items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-stone-500 transition-opacity duration-700 lg:flex ${
              chapter === 0 ? "opacity-100" : "opacity-0"
            }`}
          >
            <span className="relative block h-9 w-px overflow-hidden bg-stone-900/15">
              <span className="absolute inset-x-0 top-0 h-1/2 animate-[bloom-drop_1.8s_ease-in-out_infinite] bg-stone-900" />
            </span>
            Scroll to bloom · sweep to make a breeze
          </div>
        </div>
      </section>

      {/* Marquee */}
      <div className="relative overflow-hidden border-y border-stone-900/10 bg-[#f3ebdf] py-5" aria-hidden>
        <div className="flex w-max animate-[bloom-marquee_38s_linear_infinite] whitespace-nowrap">
          {[0, 1].map((k) => (
            <div key={k} className="flex gap-10 pr-10">
              {[
                "Garden rose",
                "Ranunculus",
                "Sweet pea",
                "Peony",
                "Cosmos",
                "Chamomile",
                "Lisianthus",
                "Tulip",
                "Anemone",
                "Dahlia",
              ].map((f) => (
                <span key={f} className={`${serif} flex items-center gap-10 text-2xl italic text-stone-500 sm:text-3xl`}>
                  {f}
                  <span className="text-sm not-italic text-[#c46b7c]">✿</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Collections */}
      <section id="collections" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32 2xl:max-w-[1600px]">
        <div className="mb-14 grid gap-6 border-b border-stone-900/10 pb-10 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className={`${eyebrow} mb-4`}>Seasonal collections · 2026</p>
            <h2 className={`${serif} text-[2.6rem] leading-[0.95] tracking-[-0.01em] sm:text-7xl`}>
              Four seasons, <span className="italic text-[#c46b7c]">four</span> bouquets
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-stone-600">
            Each collection is built around what our beds give us that month — so it changes, and it never repeats.
          </p>
        </div>
        <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {COLLECTIONS.map((c) => (
            <article key={c.name} className="group">
              <div
                className="relative aspect-[4/5] overflow-hidden rounded-[14px] shadow-[0_30px_60px_-45px_rgba(80,50,40,0.6)]"
                style={{ background: c.bg }}
              >
                <div className="absolute inset-x-[8%] top-[6%] bottom-0 transition-transform duration-[1200ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:-translate-y-2 group-hover:rotate-[-2deg]">
                  <Posy seed={c.seed} colors={c.colors} kinds={[...c.kinds]} className="h-full w-full" />
                </div>
                <span className="absolute left-4 top-4 rounded-full bg-white/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-stone-600 backdrop-blur">
                  {c.season}
                </span>
              </div>
              <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-stone-900/10 pt-4">
                <h3 className={`${serif} text-[1.7rem] leading-none`}>{c.name}</h3>
                <span className="text-sm tabular-nums text-stone-600">from {inr(c.price)}</span>
              </div>
              <p className="mt-2 text-xs text-stone-500">{c.note}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Builder */}
      <section id="builder" className="bg-[#efe6da] py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 2xl:max-w-[1600px]">
          <div className="mb-12 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
            <div className="max-w-3xl">
              <p className={`${eyebrow} mb-4`}>Bouquet builder</p>
              <h2 className={`${serif} text-[2.6rem] leading-[0.95] sm:text-6xl xl:text-7xl`}>
                Pick it. <span className="italic text-[#c46b7c]">Wrap</span> it. Send it.
              </h2>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-stone-600">
              Every stem is grown live in 3D — add one and watch it sprout into place. Drag to turn the bouquet; brush
              past it to make it sway.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <div
              ref={builderRef}
              className="relative aspect-[4/5] overflow-hidden rounded-[14px] bg-[#efe6da] shadow-[0_40px_90px_-50px_rgba(80,60,50,0.55)] ring-1 ring-stone-900/5 sm:aspect-[4/3] lg:aspect-auto lg:min-h-[640px]"
            >
              <BouquetCanvas active={builderActive} counts={counts} palette={palette.colors} wrap={wrap} />
              <div className="pointer-events-none absolute left-5 top-5 sm:left-6 sm:top-6">
                <p key={palette.name + wrap.name} className={`${serif} animate-[bloom-pop_0.6s_ease] text-3xl italic`}>
                  {palette.name} in {wrap.name.toLowerCase()}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.28em] text-stone-500">
                  {totalStems} stems · hand-tied
                </p>
              </div>
              <span className="pointer-events-none absolute bottom-5 left-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.26em] text-stone-500 sm:left-6">
                <span className="inline-block size-1.5 animate-pulse rounded-full bg-[#c46b7c]" />
                Drag to turn
              </span>
            </div>

            <div className="flex min-w-0 flex-col gap-7 rounded-[14px] bg-[#f7f1e8] p-5 sm:p-8">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className={eyebrow}>01 — Stems</h3>
                  <button
                    type="button"
                    onClick={surprise}
                    className="rounded-full border border-stone-900/15 px-3 py-1.5 text-[11px] text-stone-600 transition-colors hover:border-stone-900/40 hover:text-stone-900"
                  >
                    ✿ Surprise me
                  </button>
                </div>
                <ul className="divide-y divide-stone-900/10 border-y border-stone-900/10">
                  {STEMS.map((s) => (
                    <li key={s.kind} className="flex items-center gap-3 py-3">
                      <span
                        className="size-7 shrink-0 rounded-full shadow-[inset_0_-4px_8px_rgba(0,0,0,0.1)] ring-1 ring-stone-900/10 transition-colors duration-500"
                        style={{ background: `radial-gradient(circle at 35% 30%, #fff 0 12%, ${palette.colors[s.kind]} 60%)` }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`${serif} truncate text-[1.3rem] leading-tight`}>{s.name}</p>
                        <p className="truncate text-[11px] text-stone-500">
                          {s.note} · {inr(s.price)}
                        </p>
                      </div>
                      <Stepper label={s.name} value={counts[s.kind]} onChange={(v) => setCount(s.kind, v)} />
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className={`${eyebrow} mb-3`}>
                  02 — Colour <span className="ml-1 normal-case tracking-normal text-stone-800">{palette.name}</span>
                </h3>
                <div className="flex flex-wrap gap-3">
                  {PALETTES.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      aria-label={p.name}
                      aria-pressed={palette.name === p.name}
                      onClick={() => setPalette(p)}
                      className={`relative size-11 overflow-hidden rounded-full ring-1 ring-stone-900/10 transition-transform duration-300 hover:scale-110 ${
                        palette.name === p.name ? "ring-2 ring-stone-900 ring-offset-4 ring-offset-[#f7f1e8]" : ""
                      }`}
                      style={{
                        background: `conic-gradient(${p.colors.rose} 0 25%, ${p.colors.peony} 0 50%, ${p.colors.tulip} 0 75%, ${p.colors.daisy} 0)`,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h3 className={`${eyebrow} mb-3`}>03 — Wrapping</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {WRAPS.map((w) => (
                    <button
                      key={w.name}
                      type="button"
                      aria-pressed={wrap.name === w.name}
                      onClick={() => setWrap(w)}
                      className={`flex items-center gap-2.5 rounded-[10px] border px-2.5 py-2.5 text-left transition-all duration-300 ${
                        wrap.name === w.name
                          ? "border-stone-900 bg-white"
                          : "border-stone-900/12 hover:border-stone-900/40 hover:bg-white/60"
                      }`}
                    >
                      <span
                        className="h-8 w-6 shrink-0 rounded-[3px] shadow-sm"
                        style={{
                          background: `linear-gradient(135deg, ${w.paper} 0 60%, ${w.tissue} 60% 80%, ${w.ribbon} 80%)`,
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">{w.name}</span>
                        <span className="block text-[11px] text-stone-500">{w.extra ? `+${inr(w.extra)}` : "Included"}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className={`${eyebrow} mb-2 block`}>04 — Card message</span>
                <textarea
                  value={message}
                  maxLength={140}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  placeholder="Happy birthday, love — these reminded me of you."
                  className={`${serif} w-full resize-none rounded-[10px] border border-stone-900/12 bg-white/60 px-4 py-3 text-lg italic placeholder:text-stone-400 focus:border-stone-900/40 focus:outline-none`}
                />
                <span className="mt-1 block text-right text-[10px] text-stone-400">{message.length}/140 · handwritten</span>
              </label>

              <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-stone-900/10 pt-6">
                <div className="min-w-0">
                  <p className="text-xs text-stone-500">
                    {totalStems} stems · {palette.name} · {wrap.name}
                  </p>
                  <p className={`${serif} text-[2.6rem] leading-none tabular-nums sm:text-5xl`}>{inr(Math.round(shownPrice / 10) * 10)}</p>
                  <p className="mt-1 text-[11px] text-stone-500">Incl. hand-tying ({inr(HAND_TIE)}) & card</p>
                </div>
                <button
                  type="button"
                  disabled={totalStems === 0}
                  onClick={() => {
                    setBasket((b) => b + 1);
                    setAdded(true);
                  }}
                  className="rounded-full bg-[#2f2a26] px-6 py-3 text-sm font-medium text-[#f7f1e8] transition-transform hover:-translate-y-0.5 disabled:opacity-40"
                >
                  {added ? "Added ✓" : totalStems === 0 ? "Add a stem" : "Add to basket"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Subscriptions */}
      <section id="subscriptions" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32 2xl:max-w-[1600px]">
        <div className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className={`${eyebrow} mb-4`}>Flower subscriptions</p>
            <h2 className={`${serif} text-[2.6rem] leading-[0.95] sm:text-7xl`}>
              Fresh, <span className="italic text-[#c46b7c]">without</span> asking.
            </h2>
          </div>
          <div className="inline-flex self-start rounded-full border border-stone-900/15 bg-white/60 p-1 text-sm md:self-auto">
            {["Weekly", "Fortnightly"].map((l, i) => (
              <button
                key={l}
                type="button"
                aria-pressed={fortnightly === (i === 1)}
                onClick={() => setFortnightly(i === 1)}
                className={`rounded-full px-4 py-2 transition-colors ${
                  fortnightly === (i === 1) ? "bg-[#2f2a26] text-[#f7f1e8]" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {PLANS.map((p) => (
            <article
              key={p.name}
              className={`relative flex flex-col rounded-[16px] p-7 sm:p-8 ${
                p.featured ? "bg-[#2f2a26] text-[#f7f1e8]" : "border border-stone-900/10 bg-white/50"
              }`}
            >
              {p.featured && (
                <span className="absolute right-6 top-6 rounded-full bg-[#c46b7c] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-white">
                  Most loved
                </span>
              )}
              <h3 className={`${serif} text-4xl`}>{p.name}</h3>
              <p className={`mt-1 text-xs uppercase tracking-[0.22em] ${p.featured ? "text-stone-400" : "text-stone-500"}`}>{p.stems}</p>
              <p className={`mt-5 text-sm leading-relaxed ${p.featured ? "text-stone-300" : "text-stone-600"}`}>{p.note}</p>
              <p className={`${serif} mt-8 text-5xl tabular-nums`}>
                {inr(fortnightly ? p.weekly * 1.08 : p.weekly)}
                <span className={`ml-1 font-(family-name:--font-bloom-sans) text-sm ${p.featured ? "text-stone-400" : "text-stone-500"}`}>
                  / delivery
                </span>
              </p>
              <ul className={`mt-6 space-y-2 text-sm ${p.featured ? "text-stone-300" : "text-stone-600"}`}>
                {["Free delivery, any day you pick", "Skip or pause anytime", "Vase on your first box"].map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-[#c46b7c]">✿</span>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="#delivery"
                className={`mt-8 rounded-full px-5 py-3 text-center text-sm font-medium transition-transform hover:-translate-y-0.5 ${
                  p.featured ? "bg-[#f7f1e8] text-[#2f2a26]" : "border border-stone-900/80"
                }`}
              >
                Start {fortnightly ? "fortnightly" : "weekly"}
              </a>
            </article>
          ))}
        </div>
      </section>

      {/* Workshops */}
      <section id="workshops" className="border-y border-stone-900/10 bg-[#eef0e6]">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[0.9fr_1.1fr] 2xl:max-w-[1600px]">
          <div>
            <p className={`${eyebrow} mb-4`}>Workshops in the studio</p>
            <h2 className={`${serif} text-[2.6rem] leading-[0.95] sm:text-7xl`}>
              Learn to <span className="italic text-[#7d9c5a]">arrange</span>, slowly.
            </h2>
            <p className="mt-6 max-w-md leading-relaxed text-stone-600">
              Small tables of eight under the skylight of our Indiranagar studio. Every seat comes with an armful of
              seasonal stems, chai, and the arrangement you make — to take home.
            </p>
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-stone-900/10 pt-8">
              {[
                ["8", "Seats a table"],
                ["2.5 h", "Per session"],
                ["40+", "Stems each"],
              ].map(([n, l]) => (
                <div key={l}>
                  <dt className={`${serif} text-[1.9rem] sm:text-5xl`}>{n}</dt>
                  <dd className="mt-1 text-xs text-stone-500">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ol className="divide-y divide-stone-900/10 border-y border-stone-900/10">
            {WORKSHOPS.map((w) => {
              const isBooked = !!booked[w.title];
              const left = w.seats - (isBooked ? 1 : 0);
              return (
                <li key={w.title} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-6">
                  <div className="w-24 shrink-0">
                    <p className={`${serif} text-2xl leading-none`}>{w.date.split(" ").slice(1).join(" ")}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-stone-500">
                      {w.date.split(" ")[0]} · {w.time}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className={`${serif} text-[1.6rem] leading-tight`}>{w.title}</h3>
                    <p className="mt-1 text-xs text-stone-500">
                      {w.level} · {inr(w.price)} ·{" "}
                      <span className={left <= 2 ? "text-[#c46b7c]" : ""}>
                        {left} seat{left === 1 ? "" : "s"} left
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBooked((b) => ({ ...b, [w.title]: !b[w.title] }))}
                    className={`rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${
                      isBooked ? "bg-[#7d9c5a] text-white" : "border border-stone-900/70 hover:bg-[#2f2a26] hover:text-[#f7f1e8]"
                    }`}
                  >
                    {isBooked ? "Seat held ✓" : "Reserve"}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative overflow-hidden px-5 py-24 sm:px-8 sm:py-32">
        <div className="pointer-events-none absolute -left-24 top-10 size-80 rounded-full bg-[#f6c9d2]/50 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-0 size-80 rounded-full bg-[#dfe8cf]/70 blur-3xl" />
        <div className="relative mx-auto max-w-7xl 2xl:max-w-[1600px]">
          <p className={`${eyebrow} mb-10 text-center`}>Kind words</p>
          <div className="grid gap-10 md:grid-cols-3 md:gap-8">
            {QUOTES.map((q, i) => (
              <figure key={q.who} className={`flex flex-col ${i === 1 ? "md:translate-y-10" : ""}`}>
                <span className={`${serif} text-6xl leading-none text-[#c46b7c]`}>“</span>
                <blockquote className={`${serif} -mt-4 text-[1.7rem] leading-[1.2] sm:text-3xl`}>{q.q}</blockquote>
                <figcaption className="mt-5 text-xs uppercase tracking-[0.24em] text-stone-500">
                  {q.who} · {q.where}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Delivery CTA */}
      <section id="delivery" className="mx-auto max-w-7xl px-5 pb-24 pt-8 sm:px-8 sm:pb-32 2xl:max-w-[1600px]">
        <div className="relative overflow-hidden rounded-[18px] bg-[#2f2a26] px-6 py-16 text-[#f7f1e8] sm:px-16 sm:py-24">
          <div className="pointer-events-none absolute -right-20 -top-24 hidden opacity-90 sm:block">
            <Posy seed={77} colors={["#f2a3b5", "#f9cfd9", "#fffaf2", "#f39a4e"]} kinds={["peony", "rose", "daisy", "tulip"]} className="h-[30rem] w-[24rem] rotate-[-12deg]" />
          </div>
          <div className="relative max-w-xl">
            <p className="mb-4 text-[11px] uppercase tracking-[0.34em] text-stone-400">Same-day delivery</p>
            <h2 className={`${serif} text-[2.6rem] leading-[0.95] sm:text-7xl`}>
              Order by two, <span className="italic text-[#f2a3b5]">blooming</span> by six.
            </h2>
            <p className="mt-5 text-stone-300">
              Electric vans across Bengaluru, seven days a week. Check your PIN code to see when we can reach you.
            </p>
            <form onSubmit={checkPin} className="mt-8 flex flex-col gap-3 sm:flex-row">
              <input
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, ""));
                  setPinResult(null);
                }}
                aria-label="PIN code"
                placeholder="560038"
                className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm tracking-[0.2em] placeholder:text-stone-500 focus:border-white/60 focus:outline-none"
              />
              <button className="rounded-full bg-[#f7f1e8] px-6 py-3 text-sm font-medium text-[#2f2a26] transition-transform hover:-translate-y-0.5">
                Check delivery
              </button>
            </form>
            {pinResult && (
              <p
                role="status"
                className={`mt-4 animate-[bloom-pop_0.5s_ease] rounded-2xl px-5 py-3 text-sm ${
                  pinResult.ok ? "bg-white/10 text-[#f7f1e8]" : "bg-[#c46b7c]/25 text-[#ffd9df]"
                }`}
              >
                {pinResult.text}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-900/10">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 pb-28 pt-16 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1.4fr] 2xl:max-w-[1600px]">
          <div>
            <Logo className="text-3xl" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-stone-500">
              12 Defence Colony, 100 Feet Road, Indiranagar, Bengaluru 560038. Studio open 8 am – 7 pm, every day.
            </p>
          </div>
          <div className="text-sm">
            <p className={`${eyebrow} mb-4`}>Shop</p>
            <ul className="space-y-2 text-stone-600">
              <li><a href="#collections" className="hover:text-stone-900">Collections</a></li>
              <li><a href="#builder" className="hover:text-stone-900">Build a bouquet</a></li>
              <li><a href="#subscriptions" className="hover:text-stone-900">Subscriptions</a></li>
            </ul>
          </div>
          <div className="text-sm">
            <p className={`${eyebrow} mb-4`}>Studio</p>
            <ul className="space-y-2 text-stone-600">
              <li><a href="#workshops" className="hover:text-stone-900">Workshops</a></li>
              <li><a href="#delivery" className="hover:text-stone-900">Weddings & events</a></li>
              <li><a href="#delivery" className="hover:text-stone-900">Delivery</a></li>
            </ul>
          </div>
          <div>
            <p className={`${eyebrow} mb-4`}>The Sunday letter</p>
            {joined ? (
              <p className={`${serif} text-xl italic text-stone-700`}>Thank you — the first letter arrives this Sunday.</p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (email.includes("@")) setJoined(true);
                }}
                className="flex gap-2"
              >
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@garden.com"
                  aria-label="Email"
                  className="min-w-0 flex-1 rounded-full border border-stone-900/15 bg-white/60 px-4 py-2.5 text-sm placeholder:text-stone-400 focus:border-stone-900/40 focus:outline-none"
                />
                <button className="rounded-full bg-[#2f2a26] px-4 py-2.5 text-sm text-[#f7f1e8]">Join</button>
              </form>
            )}
            <p className="mt-3 text-xs text-stone-500">What&apos;s in bloom this week, once a week.</p>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-stone-900/10 px-5 py-6 pb-24 text-xs text-stone-500 sm:flex-row sm:justify-between sm:px-8 2xl:max-w-[1600px]">
          <p>© 2026 Bloom Botanica · Grown in Nandi Hills</p>
          <p>Compostable wrapping · Electric delivery · No floral foam</p>
        </div>
      </footer>

      <style>{`
        @keyframes bloom-pop { 0% { opacity: 0; transform: translateY(8px); filter: blur(4px); } 100% { opacity: 1; transform: none; filter: none; } }
        @keyframes bloom-fade { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes bloom-drop { 0% { transform: translateY(-100%); } 100% { transform: translateY(200%); } }
        @keyframes bloom-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .bloom-reveal canvas { animation: bloom-fade 1.4s ease both; }
        @media (prefers-reduced-motion: reduce) { [class*="animate-"] { animation: none !important; } }
      `}</style>
    </div>
  );
}
