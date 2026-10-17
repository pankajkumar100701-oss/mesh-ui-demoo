"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, type RootState } from "@react-three/fiber";
import { OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, TiltShift2, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode, type BloomEffect } from "postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { createRandom } from "@/lib/random";
import { PROJECTS, type Project } from "./data";
import { buildCity, projectAnchor } from "./city";
import { City } from "./City";
import { Cars, Train } from "./Traffic";
import { ENV, U, damp, lightsFor, makeSample, sampleEnv, sunDirection, type Quality } from "./env";

/** Shared time-of-day control. The page writes `t` (slider) or `goal` (phase buttons); the scene animates it. */
export type TimeControl = { t: number; goal: number | null };

type SceneProps = {
  active: string | null;
  onSelect: (id: string | null) => void;
  timeRef: RefObject<TimeControl>;
  auto: boolean;
  onTick: (t: number) => void;
  paused?: boolean;
  reducedMotion: boolean;
};

/** Seconds the opening fly-in takes. */
export const INTRO_SECONDS = 4.6;
/** A full dawn-to-dusk sweep when the cycle is playing. */
const CYCLE_SECONDS = 42;

const HOME_TARGET = new THREE.Vector3(0, 0, 0.8);
const HOME_THETA = Math.atan2(1, 1.08);
const TMP_V = new THREE.Vector3();
/** Vertical framing offset the camera rig applies; the tilt-shift band follows it. */
const FOCUS = { y: 0 };
const SPH = new THREE.Spherical();

type Layout = { fov: number; distance: number; phi: number; offsetX: number; offsetY: number; spotDistance: number };

/** Framing per screen shape: where the city sits so the headline and cards never fight it. */
function layoutFor(aspect: number, hasSpot: boolean): Layout {
  if (aspect < 0.8) {
    return { fov: 44, distance: 86, phi: 0.8, offsetX: 0, offsetY: hasSpot ? 0.16 : -0.02, spotDistance: 30 };
  }
  if (aspect < 1.15) {
    return { fov: 36, distance: 92, phi: 0.86, offsetX: 0, offsetY: hasSpot ? 0.12 : 0.02, spotDistance: 28 };
  }
  return { fov: 30, distance: 88, phi: 0.92, offsetX: hasSpot ? 0.15 : -0.15, offsetY: 0.02, spotDistance: 24 };
}

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/* ------------------------------------------------------------------ */
/* Atmosphere: time-of-day driver, lights, fog, sky dome, stars        */
/* ------------------------------------------------------------------ */

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const skyFragment = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uNeon;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.55, h), 0.6));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    float up = smoothstep(-0.12, 0.02, uSunDir.y);
    col += uSunColor * (pow(s, 6.0) * 0.35 + pow(s, 60.0) * 0.6) * up;
    col = mix(col, uSunColor * 2.6, smoothstep(0.9993, 0.9997, s) * up);
    // Neon dusk: a magenta band glowing off the city along the horizon.
    col += vec3(0.9, 0.2, 0.75) * exp(-abs(h) * 14.0) * uNeon * 0.35;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function SkyDome() {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        uniforms: { uZenith: U.uZenith, uHorizon: U.uHorizon, uSunDir: U.uSunDir, uSunColor: U.uSunColor, uNeon: U.uNeon },
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ camera }) => mesh.current?.position.copy(camera.position));
  return (
    <mesh ref={mesh} material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[300, 32, 16]} />
    </mesh>
  );
}

function Stars() {
  const material = useMemo(
    () => new THREE.PointsMaterial({ color: "#ffffff", size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }),
    [],
  );
  const geometry = useMemo(() => {
    const random = createRandom(9);
    const pts: number[] = [];
    for (let i = 0; i < 260; i++) {
      const a = random() * Math.PI * 2;
      const y = 0.08 + random() * 0.9;
      const r = Math.sqrt(1 - y * y);
      pts.push(Math.cos(a) * r * 250, y * 250, Math.sin(a) * r * 250);
    }
    return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  }, []);
  useEffect(
    () => () => {
      material.dispose();
      geometry.dispose();
    },
    [material, geometry],
  );
  const ref = useRef<THREE.Points>(null);
  useFrame(({ camera }) => {
    material.setValues({ opacity: THREE.MathUtils.smoothstep(ENV.t, 0.86, 1) * 0.9 });
    ref.current?.position.copy(camera.position);
  });
  return <points ref={ref} geometry={geometry} material={material} renderOrder={-9} frustumCulled={false} />;
}

function Atmosphere({
  timeRef,
  auto,
  onTick,
  quality,
  reducedMotion,
  startedRef,
}: {
  timeRef: RefObject<TimeControl>;
  auto: boolean;
  onTick: (t: number) => void;
  quality: Quality;
  reducedMotion: boolean;
  startedRef: RefObject<number>;
}) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const fog = useRef<THREE.Fog>(null);
  const dir = useRef(1);
  const sample = useMemo(() => makeSample(), []);
  const sunDir = useMemo(() => new THREE.Vector3(), []);
  const lightDir = useMemo(() => new THREE.Vector3(), []);
  const deepBase = useMemo(() => new THREE.Color("#0b2a3a"), []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const ctl = timeRef.current;
    ENV.pace = reducedMotion ? 0.5 : 1;
    // Assembly clock: starts on the first rendered frame.
    if (startedRef.current < 0) startedRef.current = clock.elapsedTime;
    ENV.build = reducedMotion ? 99 : clock.elapsedTime - startedRef.current;

    if (ctl.goal !== null) {
      ctl.t = reducedMotion ? ctl.goal : damp(ctl.t, ctl.goal, 2.4, dt);
      if (Math.abs(ctl.t - ctl.goal) < 0.002) {
        ctl.t = ctl.goal;
        ctl.goal = null;
      }
    } else if (auto) {
      ctl.t += (dir.current * dt) / CYCLE_SECONDS;
      // Ping-pong so dusk eases back into day instead of snapping.
      if (ctl.t >= 1) {
        ctl.t = 1;
        dir.current = -1;
      } else if (ctl.t <= 0) {
        ctl.t = 0;
        dir.current = 1;
      }
    }
    const t = THREE.MathUtils.clamp(ctl.t, 0, 1);
    ENV.t = t;
    ENV.lights = lightsFor(t);
    onTick(t);

    sampleEnv(t, sample);
    sunDirection(t, sunDir);
    U.uTime.value = clock.elapsedTime;
    U.uLights.value = ENV.lights;
    U.uNeon.value = THREE.MathUtils.smoothstep(t, 0.82, 1);
    U.uSunDir.value.copy(sunDir);
    U.uSunColor.value.copy(sample.sun);
    U.uZenith.value.copy(sample.zenith);
    U.uHorizon.value.copy(sample.horizon);
    U.uGlass.value.copy(sample.glass);
    U.uWater.value.copy(sample.water);
    U.uWaterDeep.value.copy(sample.water).lerp(deepBase, 0.45);

    // The light never dips below the city: past sunset it becomes a high, cool moonlight.
    lightDir.copy(sunDir);
    lightDir.setY(Math.max(lightDir.y, 0.32));
    lightDir.normalize();
    if (sun.current) {
      sun.current.position.copy(lightDir).multiplyScalar(48);
      sun.current.color.copy(sample.sun);
      sun.current.intensity = sample.sunI;
    }
    if (hemi.current) {
      hemi.current.color.copy(sample.hemiSky);
      hemi.current.groundColor.copy(sample.hemiGround);
      hemi.current.intensity = sample.hemiI;
    }
    fog.current?.color.copy(sample.fog);
  });

  const mapSize = quality === "high" ? 2048 : 1024;
  return (
    <>
      <fog ref={fog} attach="fog" args={["#e9b4a7", 95, 230]} />
      <hemisphereLight ref={hemi} args={["#dceeff", "#8c906e", 1.1]} />
      <directionalLight
        ref={sun}
        position={[30, 30, 20]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0008}
        shadow-normalBias={0.06}
        shadow-camera-left={-27}
        shadow-camera-right={27}
        shadow-camera-top={27}
        shadow-camera-bottom={-27}
        shadow-camera-near={5}
        shadow-camera-far={110}
      />
      <SkyDome />
      <Stars />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Camera: intro fly-in, flights to featured towers, idle drift        */
/* ------------------------------------------------------------------ */

function CameraRig({
  active,
  reducedMotion,
  introRef,
}: {
  active: string | null;
  reducedMotion: boolean;
  introRef: RefObject<{ done: boolean; t: number }>;
}) {
  const flying = useRef(true);
  const lastInteraction = useRef(-10);
  const interacting = useRef(false);
  const justReleased = useRef(false);
  const offset = useRef({ x: 0, y: 0, ready: false });
  const goalTarget = useMemo(() => new THREE.Vector3(), []);
  const goal = useMemo(() => new THREE.Spherical(), []);

  useEffect(() => {
    flying.current = true;
  }, [active]);

  useFrame((state: RootState, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const controls = state.controls as OrbitControlsImpl | null;
    if (!controls) return;
    const camera = state.camera as THREE.PerspectiveCamera;
    const { width, height } = state.size;
    const project = PROJECTS.find((p) => p.id === active);
    const L = layoutFor(width / height, Boolean(project));

    const k = offset.current.ready ? 1 - Math.exp(-dt * 2.5) : 1;
    offset.current.x += (L.offsetX - offset.current.x) * k;
    offset.current.y += (L.offsetY - offset.current.y) * k;
    offset.current.ready = true;
    FOCUS.y = offset.current.y;
    camera.fov += (L.fov - camera.fov) * k;
    camera.setViewOffset(width, height, offset.current.x * width, offset.current.y * height, width, height);
    camera.updateProjectionMatrix();

    const intro = introRef.current;
    if (!intro.done) {
      intro.t += Math.min(rawDt, 0.5);
      controls.enabled = false;
      const p = reducedMotion ? 1 : Math.min(intro.t / INTRO_SECONDS, 1);
      const e = easeInOut(p);
      // Start high overhead and slightly turned, then settle into the three-quarter view.
      SPH.set(THREE.MathUtils.lerp(L.distance * 1.45, L.distance, e), THREE.MathUtils.lerp(0.12, L.phi, e), HOME_THETA - (1 - e) * 0.9);
      controls.target.copy(HOME_TARGET);
      camera.position.setFromSpherical(SPH).add(HOME_TARGET);
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
      const cur = SPH.setFromVector3(TMP_V.copy(camera.position).sub(controls.target));
      if (project) {
        projectAnchor(project, goalTarget);
        goalTarget.setY((goalTarget.y - 0.55) * 0.55);
        goal.set(L.spotDistance + project.towerH * 1.3, 0.95, cur.theta);
      } else {
        goalTarget.copy(HOME_TARGET);
        goal.set(L.distance, L.phi, cur.theta);
      }
      const f = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.4);
      // Interpolate in spherical coordinates around the moving target, so the camera arcs over the city.
      controls.target.lerp(goalTarget, f);
      const r = cur.radius + (goal.radius - cur.radius) * f;
      const phi = cur.phi + (goal.phi - cur.phi) * f;
      SPH.set(r, phi, cur.theta);
      camera.position.setFromSpherical(SPH).add(controls.target);
      if (Math.abs(r - goal.radius) < 0.05 && controls.target.distanceTo(goalTarget) < 0.02) flying.current = false;
    }

    const now = state.clock.elapsedTime;
    if (justReleased.current) {
      lastInteraction.current = now;
      justReleased.current = false;
    }
    controls.autoRotate = !reducedMotion && !flying.current && !interacting.current && now - lastInteraction.current > 4;
  });

  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={9}
      maxDistance={115}
      minPolarAngle={0.2}
      maxPolarAngle={1.18}
      autoRotateSpeed={0.22}
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
/* Tower markers: DOM buttons, projected every frame                   */
/* ------------------------------------------------------------------ */

function MarkerTracker({
  buttonsRef,
  showAt,
}: {
  buttonsRef: RefObject<Record<string, HTMLButtonElement | null>>;
  showAt: number;
}) {
  useFrame(({ camera, size }) => {
    const show = ENV.build > showAt;
    for (const p of PROJECTS) {
      const el = buttonsRef.current[p.id];
      if (!el) continue;
      projectAnchor(p, TMP_V);
      TMP_V.project(camera);
      const visible = show && TMP_V.z < 1;
      const x = (TMP_V.x * 0.5 + 0.5) * size.width;
      const y = (-TMP_V.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.opacity = visible ? "1" : "0";
      el.style.pointerEvents = visible ? "auto" : "none";
    }
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Post: tilt-shift, bloom for the neon, tone mapping                  */
/* ------------------------------------------------------------------ */

type TiltRef = { start: [number, number]; end: [number, number] };

function Effects({ quality }: { quality: Quality }) {
  const bloom = useRef<BloomEffect>(null);
  const tiltA = useRef<TiltRef>(null);
  const tiltB = useRef<TiltRef>(null);
  const focusY = useRef(0.5);
  useFrame(() => {
    if (bloom.current) bloom.current.intensity = 0.35 + ENV.lights * 1.25;
    // Keep the sharp band on whatever the camera is framing (it shifts up when a card is open on phones).
    const y = 0.5 + FOCUS.y;
    if (Math.abs(y - focusY.current) > 0.002) {
      focusY.current = y;
      for (const t of [tiltA.current, tiltB.current]) {
        if (!t) continue;
        t.start = [0, y];
        t.end = [1, y];
      }
    }
  });
  return (
    <EffectComposer multisampling={quality === "high" ? 4 : 0}>
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.3} intensity={0.4} radius={0.65} />
      {/* Single-pass tilt-shift: sharp along a horizontal band through the city, blur grows smoothly away from it. */}
      {/* Two crossed passes so the blur reads as lens bokeh rather than a streak. */}
      <TiltShift2 ref={tiltA as never} blur={0.3} taper={0.3} start={[0, 0.5]} end={[1, 0.5]} direction={[1, 1]} samples={quality === "high" ? 12 : 8} />
      <TiltShift2 ref={tiltB as never} blur={0.3} taper={0.3} start={[0, 0.5]} end={[1, 0.5]} direction={[1, -1]} samples={quality === "high" ? 12 : 8} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.3} darkness={0.3} />
    </EffectComposer>
  );
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function initialQuality(): Quality {
  if (typeof window === "undefined") return "low";
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  return small || coarse || weak ? "low" : "high";
}

/** Cars start rolling once most of the city has risen. */
const CARS_AT = 2.6;
/** Tower labels appear once the featured towers have settled. */
const MARKERS_AT = 3.6;

export default function Scene({ active, onSelect, timeRef, auto, onTick, paused = false, reducedMotion }: SceneProps) {
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const [coarse] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const introRef = useRef({ done: false, t: 0 });
  const started = useRef(-1);
  const layout = useMemo(() => buildCity(), []);

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows="percentage"
        dpr={quality === "high" ? [1, 1.75] : [1, 1.25]}
        frameloop={paused ? "never" : "always"}
        camera={{ position: [10, 90, 10], fov: 30, near: 0.5, far: 700 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        onPointerMissed={() => onSelect(null)}
        onPointerDown={() => {
          if (!introRef.current.done) introRef.current.t = Math.max(introRef.current.t, INTRO_SECONDS * 0.85);
        }}
        onPointerLeave={() => {
          document.body.style.cursor = "";
        }}
        onCreated={({ gl }) => {
          if (coarse) gl.domElement.style.touchAction = "pan-y";
        }}
      >
        <PerformanceMonitor onDecline={() => setQuality("low")} flipflops={1}>
          <Atmosphere
            timeRef={timeRef}
            auto={auto}
            onTick={onTick}
            quality={quality}
            reducedMotion={reducedMotion}
            startedRef={started}
          />
          <City layout={layout} quality={quality} active={active} onSelect={onSelect} />
          <Cars startAt={CARS_AT} />
          <Train />
          <MarkerTracker buttonsRef={buttonsRef} showAt={MARKERS_AT} />
          <CameraRig active={active} reducedMotion={reducedMotion} introRef={introRef} />
          <Effects quality={quality} />
        </PerformanceMonitor>
        <TouchConfig coarse={coarse} />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {PROJECTS.map((p: Project, i) => {
          const isActive = p.id === active;
          return (
            <button
              key={p.id}
              ref={(el) => {
                buttonsRef.current[p.id] = el;
              }}
              type="button"
              onClick={() => onSelect(isActive ? null : p.id)}
              aria-label={`Open project: ${p.name}`}
              aria-pressed={isActive}
              style={{ opacity: 0, transform: "translate3d(-200px,-200px,0)" }}
              className="group absolute left-0 top-0 flex size-11 cursor-pointer items-center justify-center transition-opacity duration-500"
            >
              <span
                className="absolute inline-flex size-6 animate-ping rounded-full opacity-60 motion-reduce:animate-none"
                style={{ background: p.accent, animationDelay: `${i * 0.4}s`, animationDuration: "2.6s" }}
              />
              <span
                className={`relative flex size-5 items-center justify-center rounded-[6px] border-2 border-white text-[9px] font-black text-white shadow-lg transition-transform duration-300 group-hover:scale-125 ${
                  isActive ? "scale-125" : ""
                }`}
                style={{ background: p.accent, boxShadow: `0 0 18px ${p.accent}` }}
              >
                {i + 1}
              </span>
              <span
                className={`pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap rounded-full bg-[#14161a]/85 px-2.5 py-1 text-[11px] font-semibold text-white shadow-md backdrop-blur transition-all duration-300 ${
                  isActive ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100"
                }`}
              >
                {p.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** On touch screens, rotate with two fingers so a single finger can still scroll the page. */
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
