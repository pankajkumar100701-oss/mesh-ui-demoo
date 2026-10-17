"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import MobileMenu from "@/components/sites/MobileMenu";
import dynamic from "next/dynamic";
import { chapters } from "./journey";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

const display = "font-(family-name:--font-nebula)";

/** If WebGL is unavailable the page still works, over a painted nebula backdrop. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="h-full w-full bg-[radial-gradient(ellipse_at_70%_40%,rgba(168,85,247,0.35),transparent_55%),radial-gradient(ellipse_at_20%_80%,rgba(14,165,233,0.2),transparent_50%),#020108]" />
      );
    return this.props.children;
  }
}

const destinations = [
  {
    name: "Kepler Blue",
    kind: "Ocean world · 3 nights",
    body: "Skim the cloud tops of a planet that is 90% ocean, then watch twin sunsets from the observation ring.",
    color: "from-sky-400/50 to-cyan-300/0",
    dist: "1.2 ly",
  },
  {
    name: "Saturnine Rings",
    kind: "Ring cruise · 5 nights",
    body: "Thread the Cassini gap in a glass-bottomed cruiser while ice crystals glitter a few hundred metres below.",
    color: "from-amber-400/50 to-orange-300/0",
    dist: "0.8 ly",
  },
  {
    name: "The Core",
    kind: "Deep voyage · 11 nights",
    body: "Our flagship route to the galactic heart, where light itself bends around a sleeping giant.",
    color: "from-fuchsia-500/50 to-violet-400/0",
    dist: "2.4 ly",
  },
];

const stats = [
  { value: "2.4 ly", label: "Furthest route flown" },
  { value: "0 g", label: "Float time on demand" },
  { value: "6", label: "Guests per craft" },
  { value: "98%", label: "Guests who book again" },
];

const tiers = [
  {
    name: "Orbit",
    price: "$24k",
    note: "Weekend",
    perks: ["2 nights in low orbit", "Panoramic sleep pod", "Spacewalk simulator"],
  },
  {
    name: "Voyager",
    price: "$180k",
    note: "Most booked",
    perks: ["Ringworld + Nebula crossing", "Private cabin with view-dome", "Guided EVA", "Chef's zero-g tasting"],
    featured: true,
  },
  {
    name: "Odyssey",
    price: "$1.2M",
    note: "Once in a lifetime",
    perks: ["Full Core voyage", "Event-horizon flyby", "Captain's table", "Lifetime return pass"],
  },
];

const quotes = [
  {
    text: "I cried at the first sunrise. Then I cried at the second one eight minutes later.",
    who: "Amara O.",
    trip: "Voyager · 2026",
  },
  {
    text: "You don't look at the black hole. It looks at you, and the light curls around your window.",
    who: "Ravi S.",
    trip: "Odyssey · 2025",
  },
];

function Glass({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-[#0b0718]/55 p-6 shadow-[0_0_80px_-30px_rgba(168,85,247,0.6),inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

function Eyebrow({ n, children, tone }: { n: string; children: React.ReactNode; tone: string }) {
  return (
    <p className={`flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.35em] ${tone}`}>
      <span className="font-mono text-white/40">{n}</span>
      <span className="h-px w-8 bg-current opacity-50" />
      {children}
    </p>
  );
}

/** Vertical flight log on the right edge: which set-piece you are passing. */
function FlightRail() {
  const [active, setActive] = useState("top");
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      let current = chapters[0].id;
      for (const c of chapters) {
        const el = document.getElementById(c.id);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.5) current = c.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  const index = chapters.findIndex((c) => c.id === active);
  return (
    <nav
      aria-label="Flight log"
      className="fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-4 lg:flex"
    >
      {chapters.map((c, i) => (
        <a key={c.id} href={`#${c.id}`} className="group flex items-center justify-end gap-3">
          <span
            className={`text-[10px] uppercase tracking-[0.3em] transition ${
              i === index ? "text-white" : "text-white/0 group-hover:text-white/60"
            }`}
          >
            {c.label}
          </span>
          <span
            className={`block h-1.5 rounded-full transition-all duration-500 ${
              i === index
                ? "w-6 bg-gradient-to-r from-amber-200 to-fuchsia-400"
                : i < index
                  ? "w-1.5 bg-white/60"
                  : "w-1.5 bg-white/20"
            }`}
          />
        </a>
      ))}
    </nav>
  );
}

export default function NebulaSite({ fontClassName = "" }: { fontClassName?: string }) {
  const [email, setEmail] = useState("");
  const [booked, setBooked] = useState(false);

  return (
    <div className={`${fontClassName} relative min-h-screen overflow-x-clip bg-[#020108] text-white selection:bg-fuchsia-500/40`}>
      <style>{`
        @keyframes nebula-rise { from { opacity: 0; transform: translateY(18px); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
        @keyframes nebula-fade { from { opacity: 0; } to { opacity: 1; } }
        .nebula-rise { animation: nebula-rise 1.1s cubic-bezier(.2,.7,.2,1) both; }
        .nebula-fade { animation: nebula-fade 1.4s ease both; }
        @keyframes nebula-shine { to { background-position: 200% center; } }
        .nebula-shine { background-size: 200% auto; animation: nebula-shine 6s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .nebula-rise, .nebula-fade, .nebula-shine { animation: none; }
        }
      `}</style>

      <div className="fixed inset-0" aria-hidden>
        <SceneBoundary>
          <Scene />
        </SceneBoundary>
      </div>
      {/* Soft scrims keep copy legible over the brightest parts of the scene. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 left-0 w-full bg-gradient-to-r from-[#020108]/70 via-[#020108]/15 to-transparent md:w-2/3"
      />

      <div className="relative z-10">
        {/* Nav */}
        <header className="nebula-fade fixed inset-x-0 top-0 z-50 [animation-delay:1.6s]">
          <nav className="mx-auto mt-3 flex max-w-6xl 2xl:max-w-[1600px] items-center justify-between gap-3 rounded-full border border-white/10 bg-black/35 px-4 py-2.5 backdrop-blur-xl max-[1180px]:mx-3 sm:px-5">
            <a href="#top" className={`${display} flex items-center gap-2 text-sm font-bold tracking-[0.3em] sm:text-base`}>
              <span className="relative grid h-6 w-6 place-items-center">
                <span className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200 via-fuchsia-400 to-sky-400 blur-[6px]" />
                <span className="relative h-2 w-2 rounded-full bg-white" />
              </span>
              NEBULA
            </a>
            <div className="hidden items-center gap-7 text-sm text-white/65 md:flex">
              <a href="#destinations" className="transition hover:text-white">Destinations</a>
              <a href="#voyage" className="transition hover:text-white">The voyage</a>
              <a href="#pricing" className="transition hover:text-white">Pricing</a>
              <a href="#stories" className="transition hover:text-white">Stories</a>
            </div>
            <div className="flex items-center gap-2">
            <a
              href="#book"
              className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-fuchsia-200 sm:text-sm"
            >
              Book a seat
            </a>
            <MobileMenu links={[["#destinations", "Destinations"], ["#voyage", "The voyage"], ["#pricing", "Pricing"], ["#stories", "Stories"]]} />
          </div>
          </nav>
        </header>

        <FlightRail />

        {/* Hero */}
        <section
          id="top"
          className="flex min-h-[100svh] items-start px-4 pt-28 sm:px-6 md:items-center md:pt-0"
        >
          <div className="mx-auto w-full max-w-6xl 2xl:max-w-[1600px]">
            <div className="max-w-3xl">
              <p className="nebula-rise mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/75 backdrop-blur [animation-delay:1.5s] sm:text-[11px]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400 shadow-[0_0_10px_2px_rgba(232,121,249,0.8)]" />
                Now boarding · Season 07
              </p>
              <h1
                className={`${display} nebula-rise text-[clamp(2.6rem,6.2vw,5.4rem)] font-bold leading-[0.95] tracking-[-0.045em] [animation-delay:1.65s]`}
              >
                Leave the planet.
                <br />
                <span className="nebula-shine bg-gradient-to-r from-amber-200 via-fuchsia-400 via-60% to-sky-300 bg-clip-text text-transparent">
                  Keep the view.
                </span>
              </h1>
              <p className="nebula-rise mt-6 max-w-md text-base leading-relaxed text-white/70 [animation-delay:1.85s] sm:text-lg">
                Small crews. Real starlight. A six-day flight past ringed giants, through a
                living nebula, to the edge of a black hole.
              </p>
              <div className="nebula-rise mt-9 flex flex-wrap gap-3 [animation-delay:2s]">
                <a
                  href="#pricing"
                  className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-[0_0_40px_-6px_rgba(255,255,255,0.6)] transition hover:scale-[1.03]"
                >
                  Choose your voyage
                </a>
                <a
                  href="#destinations"
                  className="rounded-full border border-white/25 bg-white/5 px-6 py-3 text-sm font-semibold backdrop-blur transition hover:bg-white/15"
                >
                  See the route
                </a>
              </div>
            </div>
            <div className="nebula-fade mt-16 hidden items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-white/50 [animation-delay:2.6s] md:flex">
              <span className="block h-10 w-px animate-pulse bg-gradient-to-b from-white/80 to-transparent" />
              Scroll to engage
            </div>
          </div>
        </section>

        {/* Destinations — ringed planet fly-by */}
        <section id="destinations" className="flex min-h-[110vh] items-end px-4 pb-24 pt-32 sm:px-6">
          <div className="mx-auto w-full max-w-6xl 2xl:max-w-[1600px]">
            <Eyebrow n="01" tone="text-amber-200/90">Destinations</Eyebrow>
            <h2 className={`${display} mt-4 max-w-xl text-[clamp(2rem,5vw,3.75rem)] font-bold leading-[1.02]`}>
              Three worlds. One unforgettable route.
            </h2>
            <p className="mt-4 max-w-md text-white/65">
              That&apos;s Saturnine on your right. Its rings are 280,000 km wide and, in places,
              only ten metres thick.
            </p>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {destinations.map((d) => (
                <Glass key={d.name} className="group relative overflow-hidden transition duration-500 hover:-translate-y-1.5 hover:border-white/25">
                  <div
                    className={`absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gradient-to-br ${d.color} blur-2xl transition duration-700 group-hover:scale-150`}
                  />
                  <div className="relative flex items-center justify-between text-[11px] uppercase tracking-[0.25em] text-white/50">
                    <span>{d.kind}</span>
                    <span className="font-mono tracking-normal text-white/40">{d.dist}</span>
                  </div>
                  <h3 className={`${display} relative mt-4 text-2xl font-bold`}>{d.name}</h3>
                  <p className="relative mt-3 text-sm leading-relaxed text-white/70">{d.body}</p>
                </Glass>
              ))}
            </div>
          </div>
        </section>

        {/* Voyage — nebula crossing */}
        <section id="voyage" className="flex min-h-[110vh] items-center px-4 py-24 sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl 2xl:max-w-[1600px] justify-end">
            <Glass className="w-full max-w-xl p-7 sm:p-10">
              <Eyebrow n="02" tone="text-fuchsia-300/90">The voyage</Eyebrow>
              <h2 className={`${display} mt-4 text-[clamp(1.9rem,4.5vw,3.25rem)] font-bold leading-[1.04]`}>
                Built for wonder. Engineered for calm.
              </h2>
              <p className="mt-4 text-white/70">
                You are inside the Lagoon Drift now: a cloud of glowing hydrogen forty light-years
                across. Every craft carries six guests, two pilots and a full-time stargazer.
              </p>
              <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-7 border-t border-white/10 pt-7">
                {stats.map((s) => (
                  <div key={s.label}>
                    <dt className={`${display} bg-gradient-to-r from-white to-fuchsia-200 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl`}>
                      {s.value}
                    </dt>
                    <dd className="mt-1 text-[11px] uppercase tracking-wider text-white/50">{s.label}</dd>
                  </div>
                ))}
              </dl>
            </Glass>
          </div>
        </section>

        {/* Pricing — deep space, black hole on the horizon */}
        <section id="pricing" className="flex min-h-screen items-end px-4 pb-24 pt-40 sm:px-6 md:pt-56">
          <div className="mx-auto w-full max-w-6xl 2xl:max-w-[1600px]">
            <div className="text-center">
              <div className="flex justify-center">
                <Eyebrow n="03" tone="text-sky-300/90">Pricing</Eyebrow>
              </div>
              <h2 className={`${display} mt-4 text-[clamp(2rem,5vw,3.75rem)] font-bold`}>Pick your altitude.</h2>
              <p className="mx-auto mt-3 max-w-md text-white/60">
                That faint spark ahead is where the Odyssey ends. Every fare includes training,
                suits and the ride home.
              </p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {tiers.map((t) => (
                <Glass
                  key={t.name}
                  className={`relative flex flex-col ${
                    t.featured
                      ? "border-fuchsia-300/50 bg-fuchsia-500/[0.1] shadow-[0_0_90px_-20px_rgba(217,70,239,0.8)] md:-translate-y-4"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className={`${display} text-2xl font-bold`}>{t.name}</h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider ${
                        t.featured ? "bg-fuchsia-300 text-black" : "bg-white/10 text-white/70"
                      }`}
                    >
                      {t.note}
                    </span>
                  </div>
                  <p className={`${display} mt-6 text-5xl font-bold`}>{t.price}</p>
                  <p className="text-xs text-white/50">per guest</p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm text-white/75">
                    {t.perks.map((p) => (
                      <li key={p} className="flex gap-2.5">
                        <span className="text-fuchsia-300">✦</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                  <a
                    href="#book"
                    className={`mt-8 block rounded-full py-3 text-center text-sm font-semibold transition ${
                      t.featured
                        ? "bg-white text-black hover:scale-[1.02]"
                        : "border border-white/20 hover:bg-white/10"
                    }`}
                  >
                    Reserve {t.name}
                  </a>
                </Glass>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials — approach */}
        <section id="stories" className="flex min-h-screen items-center px-4 py-24 sm:px-6">
          <div className="mx-auto w-full max-w-6xl 2xl:max-w-[1600px]">
            <div className="max-w-xl space-y-5">
              <Eyebrow n="04" tone="text-orange-300/90">Guest log</Eyebrow>
              {quotes.map((q) => (
                <figure key={q.who}>
                  <Glass className="p-7 sm:p-8">
                    <blockquote className={`${display} text-xl leading-snug sm:text-2xl`}>
                      &ldquo;{q.text}&rdquo;
                    </blockquote>
                    <figcaption className="mt-5 flex items-center gap-3 text-sm">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-amber-200 to-fuchsia-500 text-xs font-bold text-black">
                        {q.who[0]}
                      </span>
                      <span className="text-white/80">{q.who}</span>
                      <span className="text-white/40">{q.trip}</span>
                    </figcaption>
                  </Glass>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* CTA — event horizon */}
        <section id="book" className="flex min-h-[100svh] items-end px-4 pb-28 pt-40 sm:px-6">
          <div className="mx-auto w-full max-w-3xl text-center">
            <p className="text-[11px] uppercase tracking-[0.4em] text-orange-200/80">05 · Event horizon</p>
            <h2 className={`${display} mt-4 text-[clamp(2.1rem,6vw,4.5rem)] font-bold leading-[0.98] [text-shadow:0_4px_40px_rgba(0,0,0,0.8)]`}>
              Your seat among the stars is waiting.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-white/70">
              Season 08 manifests open soon. Join the list and we&apos;ll call you before launch day.
            </p>
            {booked ? (
              <p className="mx-auto mt-9 max-w-md rounded-full border border-emerald-300/40 bg-emerald-400/10 px-6 py-4 text-sm text-emerald-200 backdrop-blur">
                ✦ You&apos;re on the manifest. See you in orbit.
              </p>
            ) : (
              <form
                className="mx-auto mt-9 flex max-w-md flex-col gap-2 rounded-[1.75rem] border border-white/15 bg-black/50 p-2 backdrop-blur-xl sm:flex-row sm:rounded-full"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (email.trim()) setBooked(true);
                }}
              >
                <label htmlFor="nebula-email" className="sr-only">Email</label>
                <input
                  id="nebula-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@earth.com"
                  className="min-w-0 flex-1 rounded-full bg-transparent px-5 py-3 text-sm outline-none placeholder:text-white/40"
                />
                <button
                  type="submit"
                  className="rounded-full bg-gradient-to-r from-amber-200 via-fuchsia-400 to-sky-400 px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110"
                >
                  Join the manifest
                </button>
              </form>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 bg-black/60 px-4 pb-24 pt-10 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-6xl 2xl:max-w-[1600px] flex-col justify-between gap-6 text-sm text-white/50 sm:flex-row">
            <p className={`${display} font-bold tracking-[0.3em] text-white`}>✦ NEBULA</p>
            <p>Departures from Earth Orbital Port 3 · A fictional company built with MeshUI.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
