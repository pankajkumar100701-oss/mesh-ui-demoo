"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import Galaxy, { Sky } from "./Galaxy";
import Warp from "./Warp";
import RingedPlanet from "./RingedPlanet";
import NebulaCloud from "./NebulaCloud";
import BlackHole from "./BlackHole";
import { flight, shots } from "./journey";

/* ------------------------------------------------------------------ */
/* Camera: warp intro, then a scroll-driven flight between chapters     */
/* ------------------------------------------------------------------ */

const posCurve = new THREE.CatmullRomCurve3(
  shots.map((s) => s.pos),
  false,
  "centripetal",
);
const lookCurve = new THREE.CatmullRomCurve3(
  shots.map((s) => s.look),
  false,
  "centripetal",
);

const INTRO = 3.2; // seconds
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Scroll position (px) at which each chapter section is centred in the viewport. */
function measureAnchors() {
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  return shots.map((s, i) => {
    if (i === 0) return 0;
    const el = document.getElementById(s.id);
    if (!el) return (max * i) / (shots.length - 1);
    const r = el.getBoundingClientRect();
    const top = r.top + window.scrollY;
    const anchor = top + Math.min(r.height, window.innerHeight) / 2 - window.innerHeight / 2;
    return THREE.MathUtils.clamp(anchor, 0, max);
  });
}

function CameraRig({ reduced }: { reduced: boolean }) {
  const pointer = useRef({ x: 0, y: 0 });
  const smoothPointer = useRef({ x: 0, y: 0 });
  const chapter = useRef(0);
  const anchors = useRef<number[]>([]);
  const elapsed = useRef(0);
  const v = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      offset: new THREE.Vector2(),
    }),
    [],
  );

  useEffect(() => {
    flight.intro = reduced ? 1 : 0;
    flight.warp = reduced ? 0 : 1;
    elapsed.current = reduced ? INTRO : 0;
    const measure = () => (anchors.current = measureAnchors());
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("pointermove", onMove);
    };
  }, [reduced]);

  useFrame((state, rawDelta) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const size = state.size;
    const delta = Math.min(rawDelta, 1 / 10);
    elapsed.current += delta;
    const t = elapsed.current;

    // Intro timeline.
    const k = Math.min(t / INTRO, 1);
    flight.warp = reduced ? 0 : 1 - smooth(Math.min(t / 2.1, 1));
    flight.intro = reduced ? 1 : smooth(THREE.MathUtils.clamp((t - 0.55) / 1.9, 0, 1));

    // Which chapter are we at? Ease within each segment so set-pieces "settle".
    const a = anchors.current;
    const y = window.scrollY;
    let target = 0;
    for (let i = 0; i < a.length - 1; i++) {
      if (y >= a[i]) {
        const span = Math.max(1, a[i + 1] - a[i]);
        target = i + smooth(THREE.MathUtils.clamp((y - a[i]) / span, 0, 1));
      }
    }
    chapter.current = reduced
      ? target
      : THREE.MathUtils.damp(chapter.current, target, 2.2, delta);
    flight.chapter = chapter.current;
    const u = chapter.current / (shots.length - 1);

    posCurve.getPoint(u, v.pos);
    lookCurve.getPoint(u, v.look);

    // Portrait screens: back the camera off so the subject still fits.
    const aspect = size.width / size.height;
    const fit = aspect < 1 ? THREE.MathUtils.clamp(0.7 / aspect, 1, 1.6) : 1;
    // Warp arrival: start far out along the same line and decelerate in.
    const arrive = reduced ? 1 : easeOutQuint(Math.min(t / 2.6, 1));
    const pull = fit * (1 + (1 - arrive) * 2.6);
    v.pos.sub(v.look).multiplyScalar(pull).add(v.look);

    // Mouse parallax + slow idle drift, applied in the camera's own axes.
    smoothPointer.current.x = THREE.MathUtils.damp(smoothPointer.current.x, pointer.current.x, 2.5, delta);
    smoothPointer.current.y = THREE.MathUtils.damp(smoothPointer.current.y, pointer.current.y, 2.5, delta);
    const drift = reduced ? 0 : 1;
    const time = state.clock.elapsedTime;
    v.right.setFromMatrixColumn(camera.matrixWorld, 0);
    v.up.setFromMatrixColumn(camera.matrixWorld, 1);
    const dist = v.pos.distanceTo(v.look);
    const px = (smoothPointer.current.x * 0.05 + Math.sin(time * 0.13) * 0.015) * drift * dist;
    const py = (-smoothPointer.current.y * 0.035 + Math.sin(time * 0.17 + 1) * 0.01) * drift * dist;
    v.pos.addScaledVector(v.right, px).addScaledVector(v.up, py);

    camera.position.copy(v.pos);
    camera.lookAt(v.look);
    // A gentle roll during the warp sells the speed.
    camera.rotateZ((1 - k) * (1 - k) * 0.35 + Math.sin(time * 0.1) * 0.01 * drift);

    // Frame the subject beside / above the copy rather than under it.
    const i0 = Math.floor(chapter.current);
    const i1 = Math.min(i0 + 1, shots.length - 1);
    const f = chapter.current - i0;
    const portrait = aspect < 0.9;
    const o0 = portrait ? shots[i0].mOffset : shots[i0].offset;
    const o1 = portrait ? shots[i1].mOffset : shots[i1].offset;
    v.offset.set(THREE.MathUtils.lerp(o0[0], o1[0], f), THREE.MathUtils.lerp(o0[1], o1[1], f));
    const w = size.width;
    const h = size.height;
    camera.setViewOffset(w, h, -v.offset.x * w, -v.offset.y * h, w, h);

    // Field of view punches wide during the warp.
    camera.fov = 52 + (1 - easeOutCubic(Math.min(t / 2.4, 1))) * 38 * (reduced ? 0 : 1);
    camera.updateProjectionMatrix();
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

type Tier = "high" | "mid" | "low";

function World({ tier, reduced }: { tier: Tier; reduced: boolean }) {
  const size = useThree((s) => s.size);
  const small = size.width < 768;
  const level = small && tier === "high" ? "mid" : tier;
  const counts = {
    high: { galaxy: 90000, sky: 7000, warp: 900, cloud: 80, steps: 120 },
    mid: { galaxy: 45000, sky: 4000, warp: 500, cloud: 48, steps: 80 },
    low: { galaxy: 24000, sky: 2500, warp: 300, cloud: 30, steps: 56 },
  }[level];

  return (
    <>
      <color attach="background" args={["#020108"]} />
      <ambientLight intensity={0.05} />
      <Sky count={counts.sky} />
      <Galaxy count={counts.galaxy} still={reduced} />
      <RingedPlanet />
      <NebulaCloud count={counts.cloud} />
      <BlackHole steps={counts.steps} />
      {!reduced && <Warp count={counts.warp} />}
      <CameraRig reduced={reduced} />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          mipmapBlur
          intensity={level === "low" ? 0.9 : 1.15}
          luminanceThreshold={0.18}
          luminanceSmoothing={0.35}
          radius={0.82}
          levels={level === "low" ? 5 : 7}
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette eskil={false} offset={0.22} darkness={0.7} />
      </EffectComposer>
    </>
  );
}

export default function Scene() {
  const [tier, setTier] = useState<Tier>("high");
  const [reduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const dpr: [number, number] = tier === "high" ? [1, 1.75] : tier === "mid" ? [1, 1.4] : [0.8, 1];

  return (
    <Canvas
      dpr={dpr}
      camera={{ fov: 52, near: 0.1, far: 900, position: [0, 30, 120] }}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
    >
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => setTier((t) => (t === "high" ? "mid" : "low"))}
        onFallback={() => setTier("low")}
      />
      <World tier={tier} reduced={reduced} />
    </Canvas>
  );
}
