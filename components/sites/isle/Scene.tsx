"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, type RootState } from "@react-three/fiber";
import { OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { AtmosphereDriver, CLOUD_LAYERS, CloudLayer, CloudSea, SkyDome, Stars } from "./Sky";
import { ISLAND, IslandWorld } from "./Island";
import { BALLOON_POS, Balloon, Birds, Fireflies, SkyLanterns } from "./Life";
import type { Quality } from "./shared";

export type Spot = {
  id: string;
  name: string;
  position: [number, number, number];
};

type SceneProps = {
  night: boolean;
  spots: Spot[];
  active: string | null;
  onSelect: (id: string | null) => void;
  /** Stop rendering while the hero is scrolled out of view. */
  paused?: boolean;
  reducedMotion: boolean;
};

/** Seconds the opening camera dive takes. */
export const INTRO_SECONDS = 5.2;

const HOME_DIR = new THREE.Vector3(10, 3.4, 12).normalize();
const HOME_TARGET = new THREE.Vector3(0, -1.3, 0);
const UP = new THREE.Vector3(0, 1, 0);
const TMP_V = new THREE.Vector3();
const TMP_CAM = new THREE.Vector3();
const TMP_FLAT = new THREE.Vector3();

type Layout = { fov: number; distance: number; offsetX: number; offsetY: number; spotDistance: number; spotUp: number };

/** Framing per screen shape: where the island sits so the headline never fights it. */
function layoutFor(aspect: number, hasSpot: boolean): Layout {
  if (aspect < 0.8) {
    // Phone portrait: island in the upper half, headline / card below.
    return { fov: 52, distance: 27, offsetX: 0, offsetY: hasSpot ? 0.2 : 0.15, spotDistance: 12, spotUp: 4.6 };
  }
  if (aspect < 1.15) {
    return { fov: 44, distance: 24, offsetX: 0, offsetY: hasSpot ? 0.14 : 0.08, spotDistance: 10, spotUp: 3.8 };
  }
  // Desktop: island right of centre, headline left; card on the right when a spot is open.
  return { fov: 38, distance: 22, offsetX: hasSpot ? 0.13 : -0.16, offsetY: 0, spotDistance: 8.4, spotUp: 3.4 };
}

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function spotWorld(spot: Spot, out: THREE.Vector3) {
  if (spot.id === "balloon") return out.copy(BALLOON_POS).add({ x: 0, y: 1.1, z: 0 });
  return out.set(spot.position[0], spot.position[1] + ISLAND.bob, spot.position[2]);
}

/* ------------------------------------------------------------------ */
/* Camera: cinematic intro dive, hotspot flights, idle orbit           */
/* ------------------------------------------------------------------ */

function CameraRig({
  spots,
  active,
  reducedMotion,
  introRef,
}: {
  spots: Spot[];
  active: string | null;
  reducedMotion: boolean;
  introRef: React.RefObject<{ done: boolean; t: number }>;
}) {
  const flying = useRef(true);
  const lastInteraction = useRef(-10);
  const interacting = useRef(false);
  const justReleased = useRef(false);
  const offset = useRef({ x: 0, y: 0, ready: false });
  const goalCam = useMemo(() => new THREE.Vector3(), []);
  const goalTarget = useMemo(() => new THREE.Vector3(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    flying.current = true;
  }, [active]);

  useFrame((state: RootState, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const controls = state.controls as OrbitControlsImpl | null;
    if (!controls) return;
    const camera = state.camera as THREE.PerspectiveCamera;
    const { width, height } = state.size;
    const aspect = width / height;
    const spot = spots.find((s) => s.id === active);
    const L = layoutFor(aspect, Boolean(spot));

    // Smoothly re-frame (view offset + fov) as the layout changes.
    const k = offset.current.ready ? 1 - Math.exp(-dt * 2.5) : 1;
    offset.current.x += (L.offsetX - offset.current.x) * k;
    offset.current.y += (L.offsetY - offset.current.y) * k;
    offset.current.ready = true;
    camera.fov += (L.fov - camera.fov) * k;
    camera.setViewOffset(width, height, offset.current.x * width, offset.current.y * height, width, height);
    camera.updateProjectionMatrix();

    const home = tmp.copy(HOME_DIR).multiplyScalar(L.distance).add(HOME_TARGET);
    const intro = introRef.current;

    if (!intro.done) {
      // Real time (not the capped dt) so slow devices don't get a longer dive.
      intro.t += Math.min(rawDt, 0.5);
      controls.enabled = false;
      const p = reducedMotion ? 1 : Math.min(intro.t / INTRO_SECONDS, 1);
      const e = easeInOut(p);
      const homeAz = Math.atan2(home.z, home.x);
      const homeR = Math.hypot(home.x, home.z);
      const az = homeAz - (1 - e) * 1.5;
      const r = THREE.MathUtils.lerp(3.5, homeR, Math.pow(e, 0.8));
      const y = THREE.MathUtils.lerp(34, home.y, e);
      camera.position.set(Math.cos(az) * r, y, Math.sin(az) * r);
      controls.target.set(0, THREE.MathUtils.lerp(6, HOME_TARGET.y, Math.pow(e, 0.6)), 0);
      camera.lookAt(controls.target);
      if (p >= 1) {
        intro.done = true;
        controls.enabled = true;
        flying.current = false;
        lastInteraction.current = state.clock.elapsedTime;
        controls.update();
      }
      return;
    }

    if (flying.current) {
      if (spot) {
        spotWorld(spot, goalTarget);
        // Markers float above their spot; aim the camera at the spot itself.
        goalTarget.setY(goalTarget.y - 0.9);
        const out = tmp.set(goalTarget.x, 0, goalTarget.z);
        if (out.lengthSq() < 0.01) out.set(1, 0, 1);
        out.normalize().multiplyScalar(L.spotDistance);
        // Swing a little to the side so the spot is seen in three-quarter view.
        out.applyAxisAngle(UP, 0.35);
        goalCam.copy(goalTarget).add(out).add({ x: 0, y: L.spotUp, z: 0 });
      } else {
        goalTarget.copy(HOME_TARGET);
        // Return home along the current orbit angle, just at the home height + distance.
        const az = Math.atan2(camera.position.z, camera.position.x);
        const homeR = Math.hypot(home.x, home.z);
        goalCam.set(Math.cos(az) * homeR, home.y, Math.sin(az) * homeR);
      }
      const f = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.2);
      // Swoop around the island (cylindrical interpolation) instead of cutting
      // straight through it.
      const p = camera.position;
      const az = Math.atan2(p.z, p.x);
      const gaz = Math.atan2(goalCam.z, goalCam.x);
      let dAz = gaz - az;
      dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz));
      const r = Math.hypot(p.x, p.z);
      const gr = Math.hypot(goalCam.x, goalCam.z);
      const nAz = az + dAz * f;
      // Lift a little mid-flight so the camera clears the treetops.
      const lift = Math.abs(dAz) > 0.2 ? Math.min(Math.abs(dAz), 1) * 1.2 * f : 0;
      const nr = r + (gr - r) * f;
      p.set(Math.cos(nAz) * nr, p.y + (goalCam.y - p.y) * f + lift, Math.sin(nAz) * nr);
      controls.target.lerp(goalTarget, f);
      // The balloon keeps moving, so keep following it while it's selected.
      if (camera.position.distanceTo(goalCam) < 0.03 && spot?.id !== "balloon") flying.current = false;
    }

    const now = state.clock.elapsedTime;
    if (justReleased.current) {
      lastInteraction.current = now;
      justReleased.current = false;
    }
    controls.autoRotate =
      !reducedMotion && !spot && !flying.current && !interacting.current && now - lastInteraction.current > 3;
  });

  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={7}
      maxDistance={34}
      minPolarAngle={0.35}
      maxPolarAngle={1.62}
      autoRotateSpeed={0.35}
      onStart={() => {
        flying.current = false;
        interacting.current = true;
      }}
      onEnd={() => {
        interacting.current = false;
        justReleased.current = true;
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Hotspots: plain DOM buttons, positioned by projecting each frame    */
/* ------------------------------------------------------------------ */

function HotspotTracker({
  spots,
  buttonsRef,
  introRef,
}: {
  spots: Spot[];
  buttonsRef: React.RefObject<Record<string, HTMLButtonElement | null>>;
  introRef: React.RefObject<{ done: boolean; t: number }>;
}) {
  useFrame(({ camera, size }) => {
    const v = TMP_V;
    const camFlat = TMP_CAM;
    const show = introRef.current.done;
    camFlat.set(camera.position.x, 0, camera.position.z).normalize();
    for (const spot of spots) {
      const el = buttonsRef.current[spot.id];
      if (!el) continue;
      spotWorld(spot, v);
      // Spots on the far side of the island fade back so they don't float through it.
      const facing = spot.id === "balloon" ? 1 : camFlat.dot(TMP_FLAT.set(v.x, 0, v.z).normalize());
      v.project(camera);
      const visible = show && v.z < 1;
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.opacity = visible ? (facing < -0.3 ? "0.35" : "1") : "0";
      el.style.pointerEvents = visible ? "auto" : "none";
    }
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function World({
  night,
  spots,
  active,
  quality,
  reducedMotion,
  buttonsRef,
  introRef,
}: Omit<SceneProps, "onSelect" | "paused"> & {
  quality: Quality;
  buttonsRef: React.RefObject<Record<string, HTMLButtonElement | null>>;
  introRef: React.RefObject<{ done: boolean; t: number }>;
}) {
  const mixRef = useRef(night ? 1 : 0);

  return (
    <>
      <AtmosphereDriver night={night} mixRef={mixRef} quality={quality} reducedMotion={reducedMotion} />
      <SkyDome />
      <Stars quality={quality} />
      <CloudSea quality={quality} />
      <CloudLayer spec={CLOUD_LAYERS.sea} quality={quality} />
      <CloudLayer spec={CLOUD_LAYERS.low} quality={quality} />
      <CloudLayer spec={CLOUD_LAYERS.mid} quality={quality} />
      <CloudLayer spec={CLOUD_LAYERS.high} quality={quality} />
      <CloudLayer spec={CLOUD_LAYERS.intro} quality={quality} />
      <IslandWorld mixRef={mixRef} quality={quality} reducedMotion={reducedMotion}>
        <Fireflies quality={quality} />
      </IslandWorld>
      <Balloon mixRef={mixRef} reducedMotion={reducedMotion} />
      <Birds quality={quality} reducedMotion={reducedMotion} />
      <SkyLanterns quality={quality} reducedMotion={reducedMotion} />
      <HotspotTracker spots={spots} buttonsRef={buttonsRef} introRef={introRef} />
      <CameraRig spots={spots} active={active} reducedMotion={reducedMotion} introRef={introRef} />
      <NightBloom night={night} quality={quality} />
    </>
  );
}

function NightBloom({ night, quality }: { night: boolean; quality: Quality }) {
  return (
    <EffectComposer multisampling={quality === "high" ? 4 : 2}>
      <Bloom mipmapBlur luminanceThreshold={1.05} luminanceSmoothing={0.25} intensity={night ? 1.2 : 0.55} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.32} darkness={night ? 0.55 : 0.35} />
    </EffectComposer>
  );
}

function initialQuality(): Quality {
  if (typeof window === "undefined") return "low";
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  return small || coarse || weak ? "low" : "high";
}

export default function Scene({ night, spots, active, onSelect, paused = false, reducedMotion }: SceneProps) {
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const [coarse] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const introRef = useRef({ done: false, t: 0 });

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows="percentage"
        dpr={quality === "high" ? [1, 1.75] : [1, 1.25]}
        frameloop={paused ? "never" : "always"}
        camera={{ position: [3, 34, 1], fov: 38, near: 0.1, far: 420 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        onPointerMissed={() => onSelect(null)}
        onPointerDown={() => {
          // Any touch during the dive skips straight to the island.
          if (!introRef.current.done) introRef.current.t = Math.max(introRef.current.t, INTRO_SECONDS * 0.82);
        }}
        onCreated={({ gl }) => {
          // Let one-finger vertical swipes scroll the page on phones; spin uses two fingers there.
          if (coarse) gl.domElement.style.touchAction = "pan-y";
        }}
      >
        <PerformanceMonitor onDecline={() => setQuality("low")} flipflops={1}>
          <World
            night={night}
            spots={spots}
            active={active}
            quality={quality}
            reducedMotion={reducedMotion}
            buttonsRef={buttonsRef}
            introRef={introRef}
          />
        </PerformanceMonitor>
        <TouchConfig coarse={coarse} />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {spots.map((spot, i) => {
          const isActive = spot.id === active;
          return (
            <button
              key={spot.id}
              ref={(el) => {
                buttonsRef.current[spot.id] = el;
              }}
              type="button"
              onClick={() => onSelect(isActive ? null : spot.id)}
              aria-label={`Explore ${spot.name}`}
              aria-pressed={isActive}
              style={{ opacity: 0, transform: "translate3d(-200px,-200px,0)" }}
              className="group absolute left-0 top-0 flex size-11 cursor-pointer items-center justify-center transition-opacity duration-500"
            >
              <span
                className="absolute inline-flex size-7 animate-ping rounded-full bg-amber-200/60 motion-reduce:animate-none"
                style={{ animationDelay: `${i * 0.35}s`, animationDuration: "2.4s" }}
              />
              <span
                className={`relative flex size-5 items-center justify-center rounded-full border-2 border-white text-[9px] font-black shadow-[0_0_22px_rgba(251,191,36,0.95)] transition-all duration-300 group-hover:scale-125 ${
                  isActive ? "scale-125 bg-white text-amber-600" : "bg-amber-400 text-amber-950"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-emerald-950 shadow-md backdrop-blur transition-all duration-300 ${
                  isActive ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100"
                }`}
              >
                {spot.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** On touch screens, rotate with two fingers so a single finger can still scroll. */
function TouchConfig({ coarse }: { coarse: boolean }) {
  useFrame((state) => {
    const controls = state.controls as OrbitControlsImpl | null;
    if (!controls || !coarse) return;
    if (controls.touches.ONE !== undefined) {
      controls.touches = { ONE: undefined, TWO: THREE.TOUCH.DOLLY_ROTATE };
    }
    const el = controls.domElement as HTMLElement | undefined;
    if (el && el.style.touchAction !== "pan-y") el.style.touchAction = "pan-y";
  });
  return null;
}
