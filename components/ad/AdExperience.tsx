"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { sites } from "@/lib/sites";
import { BEATS, DURATION, galleryIndex, range, smooth, timeline, windowed } from "./timeline";

const AdScene = dynamic(() => import("./AdScene"), { ssr: false });

const INSTALL = "npm i three @react-three/fiber @react-three/drei";

type Phase = "idle" | "arming" | "playing" | "done";

/**
 * Animates every overlay element tagged with data-from / data-to (seconds): fade + rise in, fade + lift out,
 * and a gentle parallax drift while on screen. Elements with data-type also type out their text.
 */
function animateOverlay(root: HTMLElement, t: number) {
  root.querySelectorAll<HTMLElement>("[data-from]").forEach((el) => {
    const from = Number(el.dataset.from);
    const to = Number(el.dataset.to ?? 99);
    const f = Number(el.dataset.fade ?? 0.45);
    const o = windowed(t, from, to, f);
    const y = (1 - smooth((t - from) / f)) * 36 - smooth((t - (to - f)) / f) * 36 + (0.5 - range(t, from, to)) * 24;
    el.style.opacity = String(o);
    el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
    el.style.filter = o < 0.999 ? `blur(${((1 - o) * 10).toFixed(2)}px)` : "";
    el.style.visibility = o <= 0.001 ? "hidden" : "visible";
  });
  root.querySelectorAll<HTMLElement>("[data-type]").forEach((el) => {
    const full = el.dataset.type ?? "";
    const [a, b] = (el.dataset.typeRange ?? "0,1").split(",").map(Number);
    const n = Math.round(range(t, a, b) * full.length);
    if (el.textContent !== full.slice(0, n)) el.textContent = full.slice(0, n);
  });
  root.style.setProperty("--progress", String(t / DURATION));
}

export default function AdExperience() {
  const overlay = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const [card, setCard] = useState(0);
  const [showReplay, setShowReplay] = useState(false);
  // Once the viewer scrolls to preview, the start panel shrinks into a corner so it doesn't cover the copy.
  const [scrubbed, setScrubbed] = useState(false);
  const target = useRef(0);
  const wentFullscreen = useRef(false);
  const startedAt = useRef(0);

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // One loop drives everything: the auto-play clock (and scroll), or smoothing towards manual scroll.
  useEffect(() => {
    history.scrollRestoration = "manual";
    document.documentElement.classList.add("ad-mode");
    const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
    const onScroll = () => {
      if (phaseRef.current === "playing" || phaseRef.current === "arming") return;
      target.current = (window.scrollY / Math.max(1, maxScroll())) * DURATION;
      setScrubbed(target.current > 0.3);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    let raf = 0;
    let last = performance.now();
    let lastCard = -1;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (phaseRef.current === "playing") {
        // rAF's timestamp can be slightly older than startedAt, so clamp at 0 too.
        const t = Math.min(DURATION, Math.max(0, (now - startedAt.current) / 1000));
        timeline.t = t;
        target.current = t;
        window.scrollTo(0, (t / DURATION) * maxScroll());
        if (t >= DURATION) go("done");
      } else {
        timeline.t += (target.current - timeline.t) * (1 - Math.exp(-dt * 8));
      }
      if (overlay.current) animateOverlay(overlay.current, timeline.t);
      const c = galleryIndex(timeline.t, sites.length).index;
      if (c !== lastCard) setCard((lastCard = c));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      document.documentElement.classList.remove("ad-mode", "ad-playing");
    };
  }, [go]);

  const stop = useCallback(() => {
    if (phaseRef.current !== "playing" && phaseRef.current !== "arming") return;
    document.documentElement.classList.remove("ad-playing");
    setScrubbed(timeline.t > 0.3);
    go("idle");
  }, [go]);

  const start = useCallback(async () => {
    go("arming");
    setShowReplay(false);
    document.documentElement.classList.add("ad-playing");
    window.scrollTo(0, 0);
    timeline.t = 0;
    target.current = 0;
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        wentFullscreen.current = true;
      }
    } catch {
      wentFullscreen.current = false;
    }
    // Give the fullscreen transition and the first frames a moment to settle, so the recording starts clean.
    setTimeout(() => {
      if (phaseRef.current !== "arming") return;
      window.scrollTo(0, 0);
      startedAt.current = performance.now();
      go("playing");
    }, 1200);
  }, [go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
      if ((e.key === "Enter" || e.key === " ") && (phaseRef.current === "idle" || phaseRef.current === "done")) {
        e.preventDefault();
        start();
      }
    };
    const onFs = () => {
      if (!document.fullscreenElement && wentFullscreen.current) {
        wentFullscreen.current = false;
        stop();
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [start, stop]);

  // After the ad ends, only reveal "Replay" once the mouse moves, so the last frame records clean.
  useEffect(() => {
    if (phase !== "done") return;
    document.documentElement.classList.remove("ad-playing");
    const onMove = () => setShowReplay(true);
    window.addEventListener("pointermove", onMove, { once: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [phase]);

  const site = sites[card];

  return (
    <main className="relative">
      <div className="fixed inset-0">
        <AdScene />
      </div>

      {/* Legibility shading: darker at the left (landscape) or bottom (portrait). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_top,rgba(7,7,10,0.9),transparent_45%)] md:bg-[linear-gradient(90deg,rgba(7,7,10,0.75),transparent_55%),linear-gradient(to_top,rgba(7,7,10,0.6),transparent_35%)]"
      />

      <div ref={overlay} className="pointer-events-none fixed inset-0 overflow-hidden text-white">
        {/* Intro */}
        <div className="absolute inset-x-0 bottom-[12%] px-6 md:inset-x-auto md:bottom-auto md:left-[7vw] md:top-1/2 md:-translate-y-1/2 md:px-0">
          <div data-from="0.3" data-to={BEATS.intro[1] - 0.1}>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-sm text-white/80 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Introducing
            </span>
          </div>
          <div data-from="0.7" data-to={BEATS.intro[1] - 0.1} className="mt-4 flex items-center gap-4">
            <span className="grid h-[clamp(3rem,7vw,6.5rem)] w-[clamp(3rem,7vw,6.5rem)] place-items-center rounded-[22%] bg-gradient-to-br from-violet-500 to-cyan-400 text-[clamp(1.6rem,3.8vw,3.5rem)] font-bold text-black shadow-[0_0_60px_rgba(139,92,246,0.6)]">
              M
            </span>
            <h1 className="text-[clamp(3.5rem,10vw,10rem)] font-semibold leading-none tracking-tighter">MeshUI</h1>
          </div>
          <p
            data-from="1.4"
            data-to={BEATS.intro[1] - 0.1}
            className="mt-5 text-[clamp(1.4rem,3vw,2.8rem)] font-medium tracking-tight"
          >
            3D websites,{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
              ready to copy.
            </span>
          </p>
        </div>

        {/* Features */}
        {(
          [
            ["01", "Shaders.", "Custom GLSL, glow and bloom.", BEATS.shaders],
            ["02", "Physics.", "Drop it, throw it, watch it bounce.", BEATS.physics],
            ["03", "Glass.", "Real refraction, real light.", BEATS.glass],
          ] as const
        ).map(([n, word, sub, [a, b]]) => (
          <div
            key={word}
            className="absolute inset-x-0 bottom-[12%] px-6 md:inset-x-auto md:bottom-auto md:left-[7vw] md:top-1/2 md:-translate-y-1/2 md:px-0"
          >
            <p data-from={a + 0.15} data-to={b} className="font-mono text-sm tracking-widest text-cyan-300 md:text-base">
              {n} / 03
            </p>
            <h2
              data-from={a + 0.3}
              data-to={b}
              className="mt-2 text-[clamp(4rem,11vw,11rem)] font-semibold leading-[0.95] tracking-tighter"
            >
              {word}
            </h2>
            <p data-from={a + 0.6} data-to={b} className="mt-3 text-[clamp(1.1rem,2vw,1.9rem)] text-white/75">
              {sub}
            </p>
          </div>
        ))}

        {/* Gallery */}
        <div className="absolute inset-x-0 top-[8%] text-center">
          <h2
            data-from={BEATS.gallery[0] + 0.2}
            data-to={BEATS.gallery[1] - 0.2}
            className="text-[clamp(2rem,4.6vw,4.5rem)] font-semibold tracking-tight"
          >
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
              {sites.length}
            </span>{" "}
            complete 3D websites
          </h2>
        </div>
        <div
          data-from={BEATS.gallery[0] + 0.6}
          data-to={BEATS.gallery[1] - 0.3}
          className="absolute inset-x-0 bottom-[9%] px-6 text-center"
        >
          <div key={site.slug} className="ad-swap">
            <p className="font-mono text-sm tracking-widest text-white/60">
              {String(card + 1).padStart(2, "0")} / {sites.length}
            </p>
            <p className="mt-1 text-[clamp(1.6rem,3.4vw,3.2rem)] font-semibold tracking-tight">{site.name}</p>
            <p className="mt-1 text-[clamp(0.95rem,1.5vw,1.35rem)] text-white/70">{site.tagline}</p>
          </div>
          <div className="mx-auto mt-5 flex w-fit gap-1.5">
            {sites.map((s, i) => (
              <span
                key={s.slug}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === card ? "w-6 bg-white" : "w-1.5 bg-white/30"}`}
              />
            ))}
          </div>
        </div>

        {/* Copy. Paste. Ship. */}
        <div className="absolute inset-x-0 bottom-[10%] px-6 md:inset-x-auto md:bottom-auto md:left-[7vw] md:top-1/2 md:-translate-y-1/2 md:px-0">
          {(
            [
              ["Copy.", 22.2],
              ["Paste.", 23.3],
              ["Ship.", 24.4],
            ] as const
          ).map(([w, from], i) => (
            <h2
              key={w}
              data-from={from}
              data-to={BEATS.ship[1]}
              className={`text-[clamp(3.5rem,9vw,9rem)] font-semibold leading-[0.95] tracking-tighter ${i === 2 ? "bg-gradient-to-r from-violet-400 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent" : ""}`}
            >
              {w}
            </h2>
          ))}
          <div
            data-from="22.5"
            data-to={BEATS.ship[1]}
            className="mt-7 w-full max-w-xl rounded-xl border border-white/15 bg-black/65 p-4 font-mono text-[clamp(0.75rem,1.15vw,1rem)] shadow-2xl backdrop-blur-md"
          >
            <div className="mb-3 flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            </div>
            <p className="break-all">
              <span className="text-violet-300">$ </span>
              <span data-type={INSTALL} data-type-range="22.7,24.0" />
              <span className="ad-caret">▍</span>
            </p>
            <p data-from="24.6" data-to={BEATS.ship[1]} className="mt-2 text-emerald-300">
              ✓ {sites.length} sites ready · live demo + full source
            </p>
          </div>
        </div>

        {/* Outro */}
        <div className="absolute inset-x-0 bottom-[8%] px-6 text-center">
          <h2
            data-from={BEATS.outro[0] + 0.7}
            className="text-[clamp(3rem,7.5vw,7.5rem)] font-semibold leading-none tracking-tighter"
          >
            MeshUI
          </h2>
          <p data-from={BEATS.outro[0] + 1.1} className="mt-3 text-[clamp(1.2rem,2.4vw,2.2rem)] font-medium tracking-tight">
            3D websites,{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
              ready to copy.
            </span>
          </p>
          <div data-from={BEATS.outro[0] + 1.6} className="mt-5 flex flex-wrap justify-center gap-2 text-sm md:text-base">
            {["Live demos", "Full source", "Free to copy"].map((x) => (
              <span key={x} className="rounded-full border border-white/15 bg-black/50 px-4 py-1.5 text-white/85 backdrop-blur">
                {x}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll track: 30 seconds of scroll. Also scrubbable by hand to preview any moment. */}
      <div style={{ height: `${DURATION * 40}vh` }} />

      {phase === "idle" && scrubbed && (
        <button
          onClick={start}
          className="fixed right-4 top-4 z-20 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-[0_0_40px_rgba(139,92,246,0.5)] transition-transform hover:scale-105"
        >
          <span className="grid h-5 w-5 place-items-center rounded-full bg-black text-[10px] text-white">▶</span>
          Start 30s ad
        </button>
      )}

      {((phase === "idle" && !scrubbed) || (phase === "done" && showReplay)) && (
        <div className="fixed inset-x-0 bottom-8 z-20 grid place-items-center px-4">
          <div className="rounded-3xl border border-white/10 bg-black/60 px-6 py-5 text-center backdrop-blur-md">
            <button
              onClick={start}
              className="group inline-flex items-center gap-3 rounded-full bg-white px-8 py-4 text-lg font-semibold text-black shadow-[0_0_60px_rgba(139,92,246,0.55)] transition-transform hover:scale-105"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-black text-sm text-white">▶</span>
              {phase === "done" ? "Replay ad" : "Start 30s ad"}
            </button>
            <p className="mt-3 max-w-sm text-sm text-white/60">
              Goes fullscreen and auto-scrolls for 30 seconds. Esc stops. Scroll by hand to preview.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
