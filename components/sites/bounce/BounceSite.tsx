"use client";

import dynamic from "next/dynamic";
import MobileMenu from "@/components/sites/MobileMenu";
import { useCallback, useEffect, useRef, useState } from "react";

const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-rose-400">
      Unwrapping candy…
    </div>
  ),
});

const display = { fontFamily: "var(--font-bounce), ui-rounded, system-ui, sans-serif" };

const flavours = [
  { name: "Strawberry Pop", note: "Bright, tangy, a little bit loud.", colors: ["#fb7185", "#fecdd3"] },
  { name: "Lemon Zing", note: "Sour first, sunshine after.", colors: ["#facc15", "#fef08a"] },
  { name: "Blue Raspberry", note: "The flavour that isn't in nature.", colors: ["#38bdf8", "#bae6fd"] },
  { name: "Grape Fizz", note: "Purple, sparkly, unapologetic.", colors: ["#a78bfa", "#ddd6fe"] },
  { name: "Mint Cloud", note: "Cool like the other side of the pillow.", colors: ["#34d399", "#bbf7d0"] },
  { name: "Mango Tango", note: "Juicy enough to need a napkin.", colors: ["#fb923c", "#fed7aa"] },
];

const steps = [
  { n: "01", title: "Real fruit, slow cooked", body: "We simmer fruit purée in copper kettles until it smells like summer." },
  { n: "02", title: "Poured & shaped", body: "Each candy is poured into tiny moulds and cooled on marble." },
  { n: "03", title: "Glazed to a shine", body: "A thin sugar glaze gives that glossy, bouncy finish." },
  { n: "04", title: "Packed with a grin", body: "Hand-packed in compostable tins and posted the same day." },
];

const reviews = [
  { quote: "I bought them for my kids. I ate them. Ordering again.", name: "Aanya R.", stars: 5 },
  { quote: "The lemon ones made my whole face scrunch up. 10/10.", name: "Marcus T.", stars: 5 },
  { quote: "Prettiest tin on my desk and the candy disappears fast.", name: "Priya S.", stars: 5 },
];

/** A glossy wrapped sweet drawn with CSS only (cheap enough for every card). */
function CandyArt({ colors, index }: { colors: string[]; index: number }) {
  const wrap = { background: `linear-gradient(135deg, ${colors[1]}, ${colors[0]})` };
  return (
    <div
      className="bounce-motion relative h-20 w-28 shrink-0 transition-transform duration-500 group-hover:scale-110"
      style={{ animation: `bounce-float ${3 + (index % 3) * 0.6}s ease-in-out ${index * 0.3}s infinite` }}
    >
      <div className="absolute top-1/2 left-0 h-12 w-9 -translate-y-1/2 [clip-path:polygon(0_0,100%_38%,100%_62%,0_100%,18%_50%)]" style={wrap} />
      <div className="absolute top-1/2 right-0 h-12 w-9 -translate-y-1/2 [clip-path:polygon(100%_0,0_38%,0_62%,100%_100%,82%_50%)]" style={wrap} />
      <div
        className="absolute top-1/2 left-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[inset_-8px_-10px_0_rgba(0,0,0,0.12),0_10px_18px_-8px_rgba(59,29,46,0.45)]"
        style={{
          background: `repeating-linear-gradient(115deg, transparent 0 9px, rgba(255,255,255,0.55) 9px 15px), radial-gradient(circle at 32% 30%, ${colors[1]}, ${colors[0]} 62%)`,
        }}
      />
      <div className="absolute top-[22%] left-[38%] h-3 w-5 -rotate-12 rounded-full bg-white/80" />
    </div>
  );
}

export default function BounceSite() {
  const [batches, setBatches] = useState(0);
  const [shake, setShake] = useState(0);
  const [count, setCount] = useState(0);
  const [full, setFull] = useState(false);
  const [copyBottom, setCopyBottom] = useState<number | null>(null);
  const [active, setActive] = useState(true);
  const heroRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const onCountChange = useCallback((n: number, isFull: boolean) => {
    setCount(n);
    setFull(isFull);
  }, []);

  // Tell the 3D scene where the headline ends so the letters and the candy
  // pile are laid out in the free space below it.
  useEffect(() => {
    const hero = heroRef.current;
    const copy = copyRef.current;
    if (!hero || !copy) return;
    const measure = () => {
      const h = hero.getBoundingClientRect();
      const c = copy.getBoundingClientRect();
      setCopyBottom(Math.round(c.bottom - h.top));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(hero);
    ro.observe(copy);
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: "80px" });
    io.observe(hero);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen overflow-x-clip bg-[#fff7f2] text-[#3b1d2e]">
      <style>{`
        @keyframes bounce-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes bounce-float { 0%,100% { transform: translateY(0) rotate(-6deg) } 50% { transform: translateY(-8px) rotate(6deg) } }
        @media (prefers-reduced-motion: reduce) { .bounce-motion { animation: none !important } }
      `}</style>

      {/* ---------- hero ---------- */}
      <section
        ref={heroRef}
        className="relative h-[100svh] min-h-[600px] overflow-hidden bg-[radial-gradient(circle_at_18%_12%,#ffd9e6,transparent_42%),radial-gradient(circle_at_85%_18%,#fff0c2,transparent_40%),radial-gradient(circle_at_50%_105%,#d6efff,transparent_55%),linear-gradient(#fff6f1,#fff1f4)]"
      >
        <div className="absolute inset-0">
          {copyBottom !== null && (
            <Scene
              batches={batches}
              shake={shake}
              copyBottom={copyBottom}
              active={active}
              onCountChange={onCountChange}
            />
          )}
        </div>

        <nav className="relative z-10 mx-auto flex max-w-6xl 2xl:max-w-[1600px] items-center justify-between px-4 pt-4 sm:px-8 sm:pt-5">
          <a href="#" className="flex items-center gap-2 text-xl font-bold" style={display}>
            <span className="inline-block h-7 w-7 rounded-full bg-[conic-gradient(#ff5c8a,#ffd23f,#3ec5ff,#a78bfa,#ff5c8a)] shadow-[inset_-3px_-3px_0_rgba(0,0,0,0.12)] ring-4 ring-white" />
            Bounce
          </a>
          <div className="hidden items-center gap-1 rounded-full bg-white/70 p-1 text-sm font-semibold shadow-sm ring-1 ring-[#3b1d2e]/5 backdrop-blur sm:flex">
            <a href="#flavours" className="rounded-full px-4 py-1.5 hover:bg-rose-50 hover:text-rose-500">Flavours</a>
            <a href="#how" className="rounded-full px-4 py-1.5 hover:bg-rose-50 hover:text-rose-500">How it&apos;s made</a>
            <a href="#reviews" className="rounded-full px-4 py-1.5 hover:bg-rose-50 hover:text-rose-500">Reviews</a>
          </div>
          <div className="flex items-center gap-2">
          <a
            href="#shop"
            className="rounded-full bg-[#3b1d2e] px-4 py-2 text-sm font-bold text-white shadow-[0_4px_0_#ff5c8a] transition-transform hover:-translate-y-0.5"
          >
            Shop
          </a>
          <MobileMenu tone="light" hideAt="sm:hidden" links={[["#flavours", "Flavours"], ["#how", "How it's made"], ["#reviews", "Reviews"], ["#shop", "Shop"]]} />
        </div>
        </nav>

        <div ref={copyRef} className="pointer-events-none relative z-10 mx-auto mt-[3svh] max-w-3xl px-4 text-center">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-rose-500 shadow-sm ring-1 ring-rose-100">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Small-batch fruit candy
          </p>
          <h1 className="text-[2.6rem] leading-[0.95] font-bold tracking-tight sm:text-6xl" style={display}>
            Sweets that <span className="text-rose-500">bounce back.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm font-medium text-[#3b1d2e]/70 sm:text-lg">
            Glossy as a gumball and twice as fun. Grab one, fling it, shake the jar.
          </p>
          <div className="pointer-events-auto mt-4 flex flex-wrap items-center justify-center gap-3 sm:mt-5">
            <button
              type="button"
              onClick={() => setShake((s) => s + 1)}
              className="rounded-full bg-rose-500 px-6 py-2.5 text-base font-bold text-white shadow-[0_5px_0_#be123c] transition-all hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#be123c]"
              style={display}
            >
              Shake it!
            </button>
            <button
              type="button"
              onClick={() => setBatches((b) => b + 1)}
              disabled={full}
              className="rounded-full bg-white px-6 py-2.5 text-base font-bold shadow-[0_5px_0_#ffd23f] ring-1 ring-[#3b1d2e]/5 transition-all hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#ffd23f] disabled:opacity-50"
              style={display}
            >
              {full ? "Jar's full!" : "More candy"}
            </button>
          </div>
        </div>

        <p className="pointer-events-none absolute right-4 bottom-4 z-10 hidden rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[#3b1d2e]/60 shadow-sm backdrop-blur sm:block">
          {count > 0 ? `${count} candies in play · ` : ""}drag · fling · click to boop
        </p>
      </section>

      {/* ---------- ribbon ---------- */}
      <div className="relative mt-2 -rotate-1 overflow-hidden bg-[#3b1d2e] py-3 text-white">
        <div className="bounce-motion flex w-max animate-[bounce-marquee_28s_linear_infinite] gap-8 whitespace-nowrap text-lg font-bold" style={display}>
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex gap-8" aria-hidden={k === 1}>
              {["Fruity", "Glossy", "Bouncy", "Small-batch", "No fake colours", "Hand-packed", "Seriously chewy"].map((w, i) => (
                <span key={w} className="flex items-center gap-8">
                  {w}
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: flavours[i % flavours.length].colors[0] }} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ---------- flavours ---------- */}
      <section id="flavours" className="mx-auto max-w-6xl 2xl:max-w-[1600px] px-4 py-20 sm:px-8 sm:py-28">
        <div className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-4xl font-bold sm:text-5xl" style={display}>
            Pick your <span className="text-sky-500">flavour</span>
          </h2>
          <p className="max-w-sm text-[#3b1d2e]/70">Six signature sweets, all natural colours, zero boring.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {flavours.map((f, i) => (
            <article
              key={f.name}
              className="group relative flex items-center gap-4 overflow-hidden rounded-[2rem] bg-white p-5 shadow-[0_6px_0_rgba(59,29,46,0.08)] ring-1 ring-[#3b1d2e]/5 transition-all hover:-translate-y-1 hover:shadow-[0_10px_0_rgba(59,29,46,0.1)]"
            >
              <div
                className="pointer-events-none absolute -top-10 -left-10 h-40 w-40 rounded-full opacity-40 blur-2xl transition-opacity group-hover:opacity-70"
                style={{ background: f.colors[1] }}
              />
              <CandyArt colors={f.colors} index={i} />
              <div className="relative min-w-0">
                <h3 className="text-xl font-bold" style={display}>{f.name}</h3>
                <p className="mt-1 text-sm text-[#3b1d2e]/65">{f.note}</p>
                <div className="mt-3 flex gap-1.5">
                  {f.colors.map((c) => (
                    <span key={c} className="h-4 w-4 rounded-full ring-2 ring-white" style={{ background: c }} />
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- how it's made ---------- */}
      <section id="how" className="bg-[#3b1d2e] px-4 py-20 text-white sm:px-8 sm:py-28">
        <div className="mx-auto max-w-6xl 2xl:max-w-[1600px]">
          <h2 className="text-4xl font-bold sm:text-5xl" style={display}>
            How it&apos;s <span className="text-yellow-300">made</span>
          </h2>
          <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.n} className="rounded-[2rem] bg-white/5 p-6 ring-1 ring-white/10">
                <span
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-[#3b1d2e]"
                  style={{ ...display, background: flavours[i].colors[0] }}
                >
                  {s.n}
                </span>
                <h3 className="mt-4 text-xl font-bold" style={display}>{s.title}</h3>
                <p className="mt-2 text-sm text-white/70">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- reviews ---------- */}
      <section id="reviews" className="mx-auto max-w-6xl 2xl:max-w-[1600px] px-4 py-20 sm:px-8 sm:py-28">
        <h2 className="text-center text-4xl font-bold sm:text-5xl" style={display}>
          Sticky <span className="text-violet-500">reviews</span>
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {reviews.map((r, i) => (
            <figure
              key={r.name}
              className="rounded-[2rem] bg-white p-6 shadow-[0_6px_0_rgba(59,29,46,0.08)] ring-1 ring-[#3b1d2e]/5"
              style={{ rotate: `${(i - 1) * 1.5}deg` }}
            >
              <div className="text-yellow-400" aria-label={`${r.stars} stars`}>
                {"★".repeat(r.stars)}
              </div>
              <blockquote className="mt-3 text-lg font-semibold leading-snug" style={display}>
                “{r.quote}”
              </blockquote>
              <figcaption className="mt-4 text-sm text-[#3b1d2e]/60">— {r.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ---------- shop CTA ---------- */}
      <section id="shop" className="px-4 pb-24 sm:px-8">
        <div className="mx-auto flex max-w-6xl 2xl:max-w-[1600px] flex-col items-center gap-6 rounded-[2.5rem] bg-gradient-to-br from-rose-400 via-pink-400 to-amber-300 px-6 py-14 text-center text-white shadow-[0_10px_0_#be123c] sm:py-20">
          <h2 className="text-4xl font-bold sm:text-6xl" style={display}>
            The Bounce Tin
          </h2>
          <p className="max-w-md text-white/90">
            All six flavours, 60 candies, one very shiny tin. Free shipping over ₹999.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="text-3xl font-bold" style={display}>₹649</span>
            <a
              href="#shop"
              className="rounded-full bg-white px-7 py-3 font-bold text-rose-500 shadow-[0_5px_0_rgba(0,0,0,0.15)] transition-transform hover:-translate-y-0.5"
              style={display}
            >
              Add to bag
            </a>
          </div>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="border-t border-[#3b1d2e]/10 px-4 pt-10 pb-24 sm:px-8">
        <div className="mx-auto flex max-w-6xl 2xl:max-w-[1600px] flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-2xl font-bold" style={display}>Bounce Candy Co.</p>
            <p className="mt-1 text-sm text-[#3b1d2e]/60">Made with sugar and gravity.</p>
          </div>
          <div className="flex flex-wrap gap-5 text-sm font-semibold text-[#3b1d2e]/70">
            <a href="#flavours" className="hover:text-rose-500">Flavours</a>
            <a href="#how" className="hover:text-rose-500">Process</a>
            <a href="#reviews" className="hover:text-rose-500">Reviews</a>
            <a href="#shop" className="hover:text-rose-500">Shop</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
