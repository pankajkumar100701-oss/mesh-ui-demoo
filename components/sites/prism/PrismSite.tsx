"use client";

import dynamic from "next/dynamic";
import MobileMenu from "@/components/sites/MobileMenu";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import type { ShapeId } from "./Optics";
import type { SizeId } from "./Configurator";

const HeroCanvas = dynamic(() => import("./Scene").then((m) => m.HeroCanvas), {
  ssr: false,
});
const ConfiguratorCanvas = dynamic(
  () => import("./Configurator").then((m) => m.ConfiguratorCanvas),
  { ssr: false },
);

const serif = "font-(family-name:--font-prism-serif)";
const eyebrow = "text-[10px] font-medium uppercase tracking-[0.24em] text-stone-500 sm:text-[11px] sm:tracking-[0.34em]";

const SHAPES: { id: ShapeId; name: string; note: string; price: number }[] = [
  { id: "knot", name: "Trefoil", note: "Endless knot, three ridges", price: 148000 },
  { id: "gem", name: "Brilliant", note: "Fifty-four planes", price: 96000 },
  { id: "helix", name: "Helix", note: "Twisted prism column", price: 124000 },
  { id: "halo", name: "Halo", note: "Lens-ground ring", price: 82000 },
];

const TINTS = [
  { name: "Clear", hex: "#ffffff", extra: 0 },
  { name: "Lavender", hex: "#d8ccff", extra: 12000 },
  { name: "Amber", hex: "#ffe0a3", extra: 14000 },
  { name: "Rose", hex: "#ffd0d8", extra: 12000 },
  { name: "Lagoon", hex: "#c4f5ec", extra: 16000 },
];

const SIZES: { id: SizeId; label: string; cm: string; factor: number; weeks: string }[] = [
  { id: "S", label: "Petite", cm: "18 cm", factor: 0.75, weeks: "4–5 weeks" },
  { id: "M", label: "Studio", cm: "28 cm", factor: 1, weeks: "6–8 weeks" },
  { id: "L", label: "Grand", cm: "42 cm", factor: 1.6, weeks: "10–12 weeks" },
];

const COLLECTION = [
  {
    no: "04",
    name: "Tide",
    material: "Optical crystal, lavender core",
    edition: "Edition of 12",
    price: "₹2,40,000",
    art: "conic-gradient(from 200deg at 50% 55%, #c4b5fd, #f0abfc, #fdba74, #99f6e4, #c4b5fd)",
    clip: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
  },
  {
    no: "11",
    name: "Monsoon Lens",
    material: "Ground lens, lagoon tint",
    edition: "Edition of 8",
    price: "₹3,10,000",
    art: "conic-gradient(from 30deg at 50% 50%, #5eead4, #a5f3fc, #e0e7ff, #fda4af, #5eead4)",
    clip: "circle(46% at 50% 50%)",
  },
  {
    no: "02",
    name: "Ember Vessel",
    material: "Blown crystal, amber",
    edition: "Unique",
    price: "₹4,80,000",
    art: "conic-gradient(from 0deg at 50% 60%, #fcd34d, #fb923c, #fda4af, #c4b5fd, #fcd34d)",
    clip: "polygon(30% 0%, 70% 0%, 86% 40%, 72% 100%, 28% 100%, 14% 40%)",
  },
  {
    no: "17",
    name: "Quiet Orbit",
    material: "Solid ring, clear",
    edition: "Edition of 20",
    price: "₹1,65,000",
    art: "conic-gradient(from 120deg, #e7e5e4, #c4b5fd, #99f6e4, #fde68a, #e7e5e4)",
    clip: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  },
];

const CHAPTERS = [
  {
    roman: "I",
    kicker: "Hand-blown optical glass · Jaipur",
    title: (
      <>
        Light,
        <br />
        <span className="italic text-stone-500">held</span> still.
      </>
    ),
    body: "Sculptures cut from a single pour of optical crystal. Each one bends the room around it — and no two bend it the same way.",
    side: "left",
  },
  {
    roman: "II",
    kicker: "The cut",
    title: (
      <>
        Broken into
        <br />a <span className="italic text-stone-500">thousand</span> planes.
      </>
    ),
    body: "Every form is ground facet by facet on diamond wheels — each plane angled to throw the spectrum somewhere new.",
    side: "right",
  },
  {
    roman: "III",
    kicker: "The polish",
    title: (
      <>
        Made whole,
        <br />
        <span className="italic text-stone-500">made</span> of light.
      </>
    ),
    body: "Finished with cerium until the edges vanish, the piece takes one beam of daylight and returns every colour it holds.",
    side: "left",
  },
] as const;

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

/** True while the element is (nearly) on screen — used to pause offscreen canvases. */
function useInView<T extends Element>(ref: RefObject<T | null>) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      rootMargin: "120px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

/** A number that glides to its new value instead of jumping. */
function useTween(value: number, ms = 650) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      const v = a + (value - a) * e;
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export default function PrismSite() {
  const storyRef = useRef<HTMLElement>(null);
  const configRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const heroActive = useInView(storyRef);
  const configActive = useInView(configRef);
  const [chapter, setChapter] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  const [shape, setShape] = useState<ShapeId>("knot");
  const [tint, setTint] = useState(TINTS[0]);
  const [size, setSize] = useState<SizeId>("M");
  const [reserved, setReserved] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const shapeInfo = SHAPES.find((s) => s.id === shape)!;
  const sizeInfo = SIZES.find((s) => s.id === size)!;
  const price = Math.round((shapeInfo.price * sizeInfo.factor + tint.extra) / 1000) * 1000;
  const shownPrice = useTween(price);

  // Scroll progress through the pinned story drives the 3D timeline.
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
    if (!reserved) return;
    const t = setTimeout(() => setReserved(false), 2600);
    return () => clearTimeout(t);
  }, [reserved]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (email.includes("@")) setSent(true);
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-[#f3eee6] text-stone-900 selection:bg-violet-200">
      {/* Nav */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
          scrolled ? "bg-[#f3eee6]/70 backdrop-blur-md" : ""
        }`}
      >
        <nav className="mx-auto flex max-w-7xl 2xl:max-w-[1600px] items-center justify-between px-4 py-4 sm:px-8">
          <a href="#top" className={`${serif} text-[1.6rem] leading-none tracking-tight`}>
            Prism <span className="italic text-stone-500">Atelier</span>
          </a>
          <div className="hidden items-center gap-9 text-[13px] text-stone-600 md:flex">
            <a href="#collection" className="hover:text-stone-900">Collection</a>
            <a href="#configure" className="hover:text-stone-900">Configure</a>
            <a href="#craft" className="hover:text-stone-900">Craft</a>
            <a href="#contact" className="hover:text-stone-900">Contact</a>
          </div>
          <div className="flex items-center gap-2">
          <a
            href="#configure"
            className="rounded-full border border-stone-900/80 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.22em] transition-colors hover:bg-stone-900 hover:text-[#f3eee6] sm:text-[11px]"
          >
            Commission
          </a>
          <MobileMenu tone="light" links={[["#collection", "Collection"], ["#configure", "Configure"], ["#craft", "Craft"], ["#contact", "Contact"]]} />
        </div>
        </nav>
      </header>

      {/* Pinned story: the hero scene plays as you scroll */}
      <section id="top" ref={storyRef} className="relative h-[330svh]">
        <div className="sticky top-0 h-[100svh] min-h-[600px] overflow-hidden">
          <div className="prism-reveal absolute inset-0">
            <HeroCanvas active={heroActive} progress={progress} />
          </div>
          {/* Legibility veil — soft, only on the copy side */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-[#f3eee6] via-[#f3eee6]/85 to-transparent md:hidden" />

          {CHAPTERS.map((c, i) => {
            const on = chapter === i;
            const right = c.side === "right";
            const Heading = i === 0 ? "h1" : "h2";
            return (
              <div
                key={c.roman}
                aria-hidden={!on}
                className={`absolute inset-0 mx-auto flex max-w-7xl 2xl:max-w-[1600px] flex-col justify-end px-5 pb-24 transition-all duration-[900ms] ease-[cubic-bezier(.2,.7,.2,1)] sm:px-8 md:justify-center md:pb-0 ${
                  right ? "md:items-end md:text-right" : ""
                } ${on ? "opacity-100 blur-0" : "pointer-events-none translate-y-6 opacity-0 blur-[6px]"}`}
              >
                <div className={`max-w-[34rem] ${on ? "" : "pointer-events-none"}`}>
                  <p
                    className={`${eyebrow} mb-5 flex items-center gap-3 max-md:[@media(max-height:780px)]:hidden ${right ? "md:justify-end" : ""}`}
                  >
                    <span className={`${serif} text-base normal-case italic tracking-normal text-stone-400`}>{c.roman}</span>
                    <span className="h-px w-8 bg-stone-400/60" />
                    {c.kicker}
                  </p>
                  <Heading
                    className={`${serif} text-[3.1rem] leading-[0.9] min-[400px]:text-[3.4rem] tracking-[-0.02em] sm:text-7xl lg:text-[7.2rem]`}
                  >
                    {c.title}
                  </Heading>
                  <p
                    className={`mt-5 max-w-sm text-[14px] leading-relaxed sm:mt-6 sm:text-[15px] text-stone-600 ${right ? "md:ml-auto" : ""}`}
                  >
                    {c.body}
                  </p>
                  {i === 0 && (
                    <div className="pointer-events-auto mt-7 flex flex-wrap gap-2.5 sm:mt-8 sm:gap-3">
                      <a
                        href="#configure"
                        className="rounded-full bg-stone-900 px-5 py-3 sm:px-6 text-sm font-medium text-[#f3eee6] shadow-[0_10px_30px_-12px_rgba(28,25,23,0.6)] transition-transform hover:-translate-y-0.5"
                      >
                        Design your piece
                      </a>
                      <a
                        href="#collection"
                        className="rounded-full border border-stone-900/20 bg-white/50 px-5 py-3 sm:px-6 text-sm font-medium backdrop-blur transition-colors hover:bg-white/80"
                      >
                        View collection
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
              <div ref={railRef} className="absolute inset-0 origin-top bg-stone-900" style={{ transform: "scaleY(0)" }} />
            </div>
            <span className={`${serif} text-sm italic text-stone-400`}>03</span>
          </div>

          {/* Museum label */}
          <div className="pointer-events-none absolute bottom-8 right-8 hidden max-w-[15rem] text-right lg:block">
            <p className={`${serif} text-lg italic leading-tight text-stone-700`}>
              {chapter < 2 ? "Trefoil No. 07" : "Brilliant No. 01"}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.28em] text-stone-500">
              Optical crystal · 28 cm · 2026
            </p>
          </div>
          <div
            className={`pointer-events-none absolute bottom-8 left-8 hidden items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-stone-500 transition-opacity duration-700 lg:flex ${
              chapter === 0 ? "opacity-100" : "opacity-0"
            }`}
          >
            <span className="relative block h-9 w-px overflow-hidden bg-stone-900/15">
              <span className="absolute inset-x-0 top-0 h-1/2 animate-[prism-drop_1.8s_ease-in-out_infinite] bg-stone-900" />
            </span>
            Scroll — watch it break the light
          </div>
        </div>
      </section>

      {/* Press strip */}
      <div className="relative border-y border-stone-900/10 bg-[#f3eee6]">
        <div className="mx-auto flex max-w-7xl 2xl:max-w-[1600px] flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 py-7 sm:justify-between sm:px-8">
          <span className={eyebrow}>As seen in</span>
          {["Vogue Living", "Architectural Digest", "Wallpaper*", "Elle Decor", "Kinfolk"].map((p) => (
            <span key={p} className={`${serif} text-lg italic text-stone-500`}>
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* Collection */}
      <section id="collection" className="mx-auto max-w-7xl 2xl:max-w-[1600px] px-5 py-24 sm:px-8 sm:py-36">
        <div className="mb-14 grid gap-6 border-b border-stone-900/10 pb-10 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className={`${eyebrow} mb-4`}>Autumn collection · 2026</p>
            <h2 className={`${serif} text-[2.6rem] leading-[0.95] tracking-[-0.01em] sm:text-7xl`}>
              Four ways to <span className="italic text-stone-500">catch</span> the sun
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-stone-600">
            Limited editions, signed and numbered. Shipped in a hand-stitched
            linen case with a certificate of origin.
          </p>
        </div>
        <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {COLLECTION.map((c) => (
            <article key={c.name} className="group">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[6px] bg-gradient-to-b from-[#ebe4d8] to-[#e2d9cb]">
                {/* soft cast light on the wall */}
                <div
                  className="absolute left-1/2 top-[58%] h-[46%] w-[80%] -translate-x-1/2 opacity-50 blur-2xl transition-opacity duration-700 group-hover:opacity-80"
                  style={{ background: c.art }}
                />
                <div
                  className="absolute inset-[18%] transition-transform duration-[1200ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:-translate-y-2 group-hover:rotate-[8deg]"
                  style={{ clipPath: c.clip }}
                >
                  <div className="absolute inset-0 opacity-80" style={{ background: c.art }} />
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.85)_0%,rgba(255,255,255,0)_38%,rgba(255,255,255,0)_62%,rgba(255,255,255,0.55)_100%)]" />
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.0)_0_14px,rgba(255,255,255,0.35)_14px_15px)] mix-blend-overlay" />
                </div>
                <div className="absolute bottom-[12%] left-1/2 h-3 w-1/2 -translate-x-1/2 rounded-[50%] bg-stone-900/15 blur-md" />
                <span className="absolute left-4 top-4 text-[10px] uppercase tracking-[0.24em] text-stone-500">
                  No. {c.no}
                </span>
                <span className="absolute right-4 top-4 text-[10px] uppercase tracking-[0.24em] text-stone-500">
                  {c.edition}
                </span>
              </div>
              <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-stone-900/10 pt-4">
                <h3 className={`${serif} text-[1.7rem] leading-none`}>{c.name}</h3>
                <span className="text-sm tabular-nums text-stone-600">{c.price}</span>
              </div>
              <p className="mt-2 text-xs text-stone-500">{c.material}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Configurator */}
      <section id="configure" className="bg-[#ebe4d8] py-24 sm:py-32">
        <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] px-5 sm:px-8">
          <div className="mb-12 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
            <div className="max-w-3xl">
              <p className={`${eyebrow} mb-4`}>Live configurator</p>
              <h2 className={`${serif} text-[2.6rem] leading-[0.95] sm:text-6xl xl:text-7xl`}>
                Shape it. <span className="italic text-stone-500">Tint</span> it. Own it.
              </h2>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-stone-600">
              Rendered in real time with physically based glass on a turning
              plinth — drag the piece to hold it up to the light.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
            <div
              ref={configRef}
              className="relative aspect-[4/5] overflow-hidden rounded-[10px] bg-[#ece5d9] shadow-[0_40px_90px_-50px_rgba(68,64,60,0.6)] sm:aspect-[4/3] lg:aspect-auto lg:min-h-[600px]"
            >
              <ConfiguratorCanvas active={configActive} shape={shape} tint={tint.hex} size={size} />
              <div className="pointer-events-none absolute left-5 top-5 sm:left-6 sm:top-6">
                <p key={shape} className={`${serif} animate-[prism-pop_0.6s_ease] text-3xl italic`}>
                  {shapeInfo.name}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.28em] text-stone-500">
                  {tint.name} · {sizeInfo.cm}
                </p>
              </div>
              <span className="pointer-events-none absolute bottom-5 left-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.26em] text-stone-500 sm:left-6">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-stone-900/60" />
                Drag to rotate
              </span>
            </div>

            <div className="flex flex-col gap-8 rounded-[10px] bg-[#f3eee6] p-5 sm:p-8">
              <div>
                <h3 className={`${eyebrow} mb-3`}>01 — Form</h3>
                <div className="grid grid-cols-2 gap-2">
                  {SHAPES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setShape(s.id)}
                      className={`rounded-[6px] border px-3 py-3 text-left transition-all duration-300 sm:px-4 ${
                        shape === s.id
                          ? "border-stone-900 bg-stone-900 text-[#f3eee6]"
                          : "border-stone-900/15 hover:border-stone-900/40 hover:bg-white/50"
                      }`}
                    >
                      <span className={`${serif} block text-[1.35rem] leading-tight`}>{s.name}</span>
                      <span className="text-[11px] opacity-70">{s.note}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className={`${eyebrow} mb-3`}>
                  02 — Tint <span className="ml-1 normal-case tracking-normal text-stone-800">{tint.name}</span>
                </h3>
                <div className="flex flex-wrap gap-3">
                  {TINTS.map((t) => (
                    <button
                      key={t.name}
                      aria-label={t.name}
                      onClick={() => setTint(t)}
                      className={`h-11 w-11 rounded-full border border-stone-900/10 shadow-[inset_0_-6px_12px_rgba(0,0,0,0.08)] transition-transform duration-300 hover:scale-110 ${
                        tint.name === t.name ? "ring-1 ring-stone-900 ring-offset-4 ring-offset-[#f3eee6]" : ""
                      }`}
                      style={{
                        background: `radial-gradient(circle at 32% 28%, #ffffff 0 18%, ${t.hex} 55%, ${t.hex}), ${t.hex}`,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h3 className={`${eyebrow} mb-3`}>03 — Scale</h3>
                <div className="grid grid-cols-3 gap-2">
                  {SIZES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSize(s.id)}
                      className={`rounded-[6px] border px-2 py-3 text-center text-sm transition-all duration-300 ${
                        size === s.id
                          ? "border-stone-900 bg-stone-900 text-[#f3eee6]"
                          : "border-stone-900/15 hover:border-stone-900/40 hover:bg-white/50"
                      }`}
                    >
                      <span className="block font-medium">{s.label}</span>
                      <span className="text-xs opacity-70">{s.cm}</span>
                    </button>
                  ))}
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-4 border-t border-stone-900/10 pt-6 text-xs">
                <div>
                  <dt className="text-stone-500">Edition</dt>
                  <dd className="mt-1 text-stone-800">Signed, 1 of 12</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Made to order</dt>
                  <dd className="mt-1 text-stone-800">{sizeInfo.weeks}</dd>
                </div>
              </dl>

              <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-stone-900/10 pt-6">
                <div>
                  <p className="text-xs text-stone-500">
                    {shapeInfo.name} · {tint.name} · {sizeInfo.label}
                  </p>
                  <p className={`${serif} text-[2.6rem] leading-none tabular-nums sm:text-5xl`}>
                    {inr(Math.round(shownPrice / 100) * 100)}
                  </p>
                  <p className="mt-1 text-[11px] text-stone-500">Incl. insured shipping & linen case</p>
                </div>
                <button
                  onClick={() => setReserved(true)}
                  className="rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-[#f3eee6] transition-transform hover:-translate-y-0.5"
                >
                  {reserved ? "Reserved ✓" : "Reserve piece"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Craft */}
      <section id="craft" className="mx-auto max-w-7xl 2xl:max-w-[1600px] px-5 py-24 sm:px-8 sm:py-36">
        <div className="grid gap-16 lg:grid-cols-2">
          <div>
            <p className={`${eyebrow} mb-4`}>The atelier</p>
            <h2 className={`${serif} text-[2.6rem] leading-[0.95] sm:text-7xl`}>
              Nine artisans. <br />
              <span className="italic text-stone-500">One</span> breath per piece.
            </h2>
            <p className="mt-6 max-w-md leading-relaxed text-stone-600">
              Founded in 2011 in a converted haveli courtyard, Prism Atelier
              works only in lead-free optical crystal. Every sculpture is
              gathered, blown, annealed for three days and polished by hand
              until it disappears into the light.
            </p>
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-stone-900/10 pt-8">
              {[
                ["1,240°", "Furnace heat"],
                ["72 h", "Annealing"],
                ["0.02 mm", "Polish tolerance"],
              ].map(([n, l]) => (
                <div key={l}>
                  <dt className={`${serif} text-[1.7rem] sm:text-5xl`}>{n}</dt>
                  <dd className="mt-1 text-xs text-stone-500">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ol className="divide-y divide-stone-900/10 border-y border-stone-900/10">
            {[
              ["Gather", "Molten crystal is gathered on a steel pipe in three layers, each one clearer than the last."],
              ["Breathe", "The form is blown and turned by hand — the only mould is the artisan's palm and a wet pearwood block."],
              ["Rest", "Pieces cool slowly in the annealing kiln for 72 hours so they never carry hidden stress."],
              ["Polish", "Faces are ground on diamond wheels and finished with cerium until the edges vanish."],
            ].map(([title, body], i) => (
              <li key={title} className="group flex gap-6 py-7 transition-colors sm:gap-10">
                <span
                  className={`${serif} w-10 shrink-0 text-4xl italic text-stone-400 transition-colors duration-500 group-hover:text-violet-400`}
                >
                  0{i + 1}
                </span>
                <div>
                  <h3 className={`${serif} text-3xl transition-transform duration-500 group-hover:translate-x-1`}>{title}</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-600">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Quote */}
      <section className="relative overflow-hidden border-y border-stone-900/10 px-5 py-28 text-center sm:px-8 sm:py-36">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[140%] w-[34rem] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rotate-[24deg] bg-[linear-gradient(90deg,transparent,#fda4af33,#fcd34d33,#86efac33,#93c5fd33,#c4b5fd33,transparent)] blur-2xl" />
        <blockquote className={`${serif} relative mx-auto max-w-4xl text-[2rem] leading-[1.15] sm:text-6xl`}>
          “It sits on the windowsill and at four o’clock the whole room turns
          <span className="bg-gradient-to-r from-violet-500 via-rose-400 to-amber-400 bg-clip-text italic text-transparent"> violet</span>.”
        </blockquote>
        <p className={`${eyebrow} relative mt-8`}>Meera Rao — collector, Bengaluru</p>
      </section>

      {/* CTA */}
      <section id="contact" className="mx-auto max-w-7xl 2xl:max-w-[1600px] px-5 py-24 sm:px-8 sm:py-32">
        <div className="relative overflow-hidden rounded-[10px] bg-stone-900 px-6 py-16 text-[#f3eee6] sm:px-16 sm:py-24">
          <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[conic-gradient(from_0deg,#c4b5fd,#fda4af,#fcd34d,#5eead4,#c4b5fd)] opacity-50 blur-3xl" />
          <div className="relative max-w-xl">
            <p className="mb-4 text-[11px] uppercase tracking-[0.34em] text-stone-400">Commissions</p>
            <h2 className={`${serif} text-[2.6rem] leading-[0.95] sm:text-7xl`}>
              Commission a <span className="italic text-stone-400">one-off</span>.
            </h2>
            <p className="mt-5 text-stone-300">
              Tell us about your space and the light it gets. We’ll send sketches
              within a week.
            </p>
            {sent ? (
              <p className="mt-8 rounded-full bg-white/10 px-6 py-4 text-sm">
                Thank you — our studio will write to {email} shortly.
              </p>
            ) : (
              <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@studio.com"
                  className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm placeholder:text-stone-500 focus:border-white/60 focus:outline-none"
                />
                <button className="rounded-full bg-[#f3eee6] px-6 py-3 text-sm font-medium text-stone-900 transition-transform hover:-translate-y-0.5">
                  Start a commission
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto flex max-w-7xl 2xl:max-w-[1600px] flex-col gap-6 px-5 pb-28 pt-4 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className={`${serif} text-2xl text-stone-900`}>
          Prism <span className="italic text-stone-500">Atelier</span>
        </p>
        <div className="flex flex-wrap gap-6">
          <a href="#collection" className="hover:text-stone-900">Collection</a>
          <a href="#craft" className="hover:text-stone-900">Atelier</a>
          <a href="#contact" className="hover:text-stone-900">Instagram</a>
        </div>
        <p>© 2026 Prism Atelier · Jaipur</p>
      </footer>

      <style>{`
        @keyframes prism-pop { 0% { opacity: 0; transform: translateY(8px); filter: blur(4px); } 100% { opacity: 1; transform: none; filter: none; } }
        @keyframes prism-fade { 0% { opacity: 0; } 100% { opacity: 1; } }
        .prism-reveal canvas { animation: prism-fade 1.4s ease both; }
        @keyframes prism-drop { 0% { transform: translateY(-100%); } 100% { transform: translateY(200%); } }
        @media (prefers-reduced-motion: reduce) { [class*="animate-"] { animation: none !important; } }
      `}</style>
    </div>
  );
}
