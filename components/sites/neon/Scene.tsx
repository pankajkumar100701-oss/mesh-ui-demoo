"use client";

import { MeshReflectorMaterial, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer, Scanline, Vignette } from "@react-three/postprocessing";
import type { ChromaticAberrationEffect } from "postprocessing";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { createRandom } from "@/lib/random";
import { CAR_SPECS, NeonEnvironment, SportsCar, type CarMotion, type CarSpec } from "./Car";

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

/** Mutable input state written by the page (pointer, keys, touch) and read every frame here. */
export type DriveControls = {
  boost: boolean;
  /** Steering target across the road, -1 (left) … 1 (right). */
  target: number;
  /** Keyboard steer, -1 / 0 / 1: nudges the target while held. */
  keySteer: number;
  /** performance.now() of the last player input, 0 = never (attract mode). */
  lastInput: number;
};

/** DOM nodes the game writes straight into (no React re-render per frame). */
export type HudRefs = Record<
  "speed" | "boost" | "score" | "best" | "combo" | "lives" | "flash" | "toast",
  RefObject<HTMLElement | null>
>;

export type GameMode = "attract" | "play";

type SceneProps = {
  controls: RefObject<DriveControls>;
  hud: HudRefs;
  active: boolean;
  car: CarSpec;
  reducedMotion: boolean;
  onModeChange: (mode: GameMode) => void;
};

/* ------------------------------------------------------------------ */
/* Tuning                                                              */
/* ------------------------------------------------------------------ */

const BASE_SPEED = 26; // world units / second at 100 km/h
const TRAFFIC_SPEED = BASE_SPEED * 0.42;
const LOOP = 200; // terrain noise repeats every LOOP units, so travel can wrap
const ROAD_HALF = 5.2;
const LANES = [-3.1, 0, 3.1];
const STEER_RANGE = 3.6;
const PLAYER_Z = 2.2;
const SPAWN_Z = -150;
const ROW_GAP = 40;
const IDLE_MS = 20_000;
const BEST_KEY = "neon-drive-best";
const TRAFFIC_COUNT = 6;
const ORB_COUNT = 40;

type Quality = 0 | 1 | 2;

/** Shared, per-frame drive state so every object reads the same numbers. */
type Drive = {
  travel: number;
  boost: number;
  speed: number;
  carX: number;
  /** 1 right after a crash, decays to 0. */
  crash: number;
  time: number;
};

type Traffic = {
  active: boolean;
  x: number;
  z: number;
  lane: number;
  hit: boolean;
  vx: number;
  spin: number;
  age: number;
};

type Orb = { active: boolean; x: number; z: number; pop: number };

type Game = {
  mode: GameMode;
  score: number;
  best: number;
  lives: number;
  streak: number;
  combo: number;
  invuln: number;
  rowDist: number;
  lastFree: number[];
  toastT: number;
  intro: number;
  autoLane: number;
  autoThink: number;
  bestDirty: boolean;
  seeded: boolean;
  /** Steering target the car follows, -1 … 1. */
  target: number;
  /** Last pointer target seen from the page, to detect fresh pointer input. */
  seenTarget: number;
  traffic: Traffic[];
  orbs: Orb[];
};

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const noiseGLSL = /* glsl */ `
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  // Value noise whose lattice wraps every \`period\` cells along y.
  float noise(vec2 p, float period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float y0 = mod(i.y, period);
    float y1 = mod(i.y + 1.0, period);
    float a = hash(vec2(i.x, y0));
    float b = hash(vec2(i.x + 1.0, y0));
    float c = hash(vec2(i.x, y1));
    float d = hash(vec2(i.x + 1.0, y1));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
`;

const terrainVertex = /* glsl */ `
  uniform float uTravel;
  varying vec2 vWorld;
  varying float vHeight;
  varying float vDist;
  ${noiseGLSL}
  void main() {
    vec3 p = position;
    vec2 w = vec2(p.x, p.z - uTravel);
    float side = smoothstep(${(ROAD_HALF + 2.5).toFixed(1)}, 18.0, abs(p.x));
    // 0.08 * 200 = 16 cells and 0.2 * 200 = 40 cells: both octaves loop with LOOP.
    float n = noise(w * 0.08, 16.0) * 0.65 + noise(w * 0.2, 40.0) * 0.35;
    float h = pow(n, 1.5) * side * (10.0 + abs(p.x) * 0.4);
    p.y += h;
    vWorld = w;
    vHeight = h;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const terrainFragment = /* glsl */ `
  uniform vec3 uGrid;
  uniform vec3 uGrid2;
  uniform vec3 uFog;
  uniform float uBoost;
  varying vec2 vWorld;
  varying float vHeight;
  varying float vDist;

  float line(float coord, float spacing) {
    float c = coord / spacing;
    float g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
    return 1.0 - min(g, 1.0);
  }

  void main() {
    float ax = abs(vWorld.x);
    if (ax < ${(ROAD_HALF + 0.35).toFixed(2)}) discard;
    float hk = clamp(vHeight / 14.0, 0.0, 1.0);
    vec3 col = mix(vec3(0.02, 0.0, 0.06), vec3(0.1, 0.0, 0.18), hk);
    float g = max(line(vWorld.x, 2.0), line(vWorld.y, 2.0));
    vec3 gridCol = mix(uGrid, uGrid2, smoothstep(0.35, 0.95, hk));
    float glow = 1.3 + hk * 1.6 + uBoost * 0.9;
    col += gridCol * g * glow;
    float fog = smoothstep(30.0, 155.0, vDist);
    col = mix(col, uFog, fog);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Additive layer over the mirror road: lane paint, edge neon and wet glints, all scrolling. */
const roadVertex = /* glsl */ `
  uniform float uTravel;
  varying vec2 vWorld;
  varying float vDist;
  void main() {
    // Plane is rotated flat inside a group at z = -75: local y maps to world -z.
    vWorld = vec2(position.x, -position.y - 75.0 - uTravel);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const roadFragment = /* glsl */ `
  uniform vec3 uEdge;
  uniform vec3 uDash;
  uniform vec3 uLane;
  uniform float uBoost;
  varying vec2 vWorld;
  varying float vDist;
  ${noiseGLSL}
  void main() {
    float ax = abs(vWorld.x);
    float y = vWorld.y;
    vec3 col = vec3(0.0);
    // Glowing road edges with a soft bleed onto the wet asphalt.
    float e = abs(ax - ${(ROAD_HALF - 0.25).toFixed(2)});
    col += uEdge * (smoothstep(0.09, 0.0, e) * (2.4 + uBoost * 2.5) + exp(-e * 3.0) * 0.18);
    // Dashed centre line and lane dividers.
    float dash = step(0.55, fract(y / 9.0));
    col += uDash * dash * smoothstep(0.08, 0.0, ax) * 2.2;
    float lane = abs(ax - 1.55);
    col += uLane * step(0.6, fract(y / 6.0)) * smoothstep(0.05, 0.0, lane) * 1.1;
    // Wet glints: tiny streaks that scroll past and catch the neon.
    vec2 gp = vec2(vWorld.x * 3.0, y * 0.35);
    float n = hash(floor(gp));
    float streak = step(0.965, n) * smoothstep(0.5, 0.0, abs(fract(gp.x) - 0.5)) * (0.6 + uBoost);
    col += vec3(0.6, 0.5, 1.0) * streak * 0.5;
    float fade = 1.0 - smoothstep(60.0, 150.0, vDist);
    gl_FragColor = vec4(col * fade, 1.0);
  }
`;

const basicVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sunFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c);
    float R = 0.3;
    float disc = smoothstep(R, R - 0.004, d);
    float y = (c.y + R) / (2.0 * R); // 0 at disc bottom, 1 at top
    vec3 col = mix(vec3(1.0, 0.05, 0.45), vec3(1.0, 0.85, 0.3), smoothstep(0.0, 1.0, y));
    col = mix(col, vec3(1.0, 0.95, 0.7), smoothstep(0.75, 1.0, y) * 0.5);
    // Classic synthwave cut-outs, thicker toward the bottom, drifting down.
    float band = fract(y * 12.0 + uTime * 0.4);
    float cut = y < 0.6 ? step(band, (0.6 - y) * 1.4) : 0.0;
    float a = disc * (1.0 - cut);
    float halo = (exp(-max(d - R, 0.0) * 9.0) * 0.6 + exp(-max(d - R, 0.0) * 30.0) * 0.5) * (1.0 - a);
    vec3 outCol = col * 1.7 * a + vec3(1.0, 0.2, 0.55) * halo;
    gl_FragColor = vec4(outCol, max(a, halo));
    #include <colorspace_fragment>
  }
`;

const skylineFragment = /* glsl */ `
  uniform vec3 uFog;
  varying vec2 vUv;
  float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float cols = 140.0;
    float i = floor(vUv.x * cols);
    float centre = abs(vUv.x - 0.5) * 2.0;
    float r = h1(i);
    float tall = step(0.93, h1(i + 31.0));
    float h = 0.08 + pow(r, 2.2) * 0.38 + tall * (0.25 + r * 0.25);
    h *= 0.55 + centre * 0.6;
    if (vUv.y > h) discard;
    vec3 col = vec3(0.07, 0.01, 0.12);
    // Lit windows.
    vec2 wp = vec2(vUv.x * cols * 4.0, vUv.y * 90.0);
    vec2 cell = floor(wp);
    vec2 f = fract(wp);
    float win = step(0.82, h2(cell)) * step(0.3, f.x) * step(f.x, 0.7) * step(0.3, f.y) * step(f.y, 0.7);
    vec3 wc = mix(vec3(1.0, 0.25, 0.7), vec3(0.2, 0.9, 1.0), step(0.5, h2(cell + 7.0)));
    col += wc * win * 0.9;
    // Rim light on the roof tops from the sun.
    col += vec3(1.0, 0.3, 0.6) * smoothstep(0.012, 0.0, h - vUv.y) * 0.8;
    col = mix(col, uFog, 0.35);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const skyVertex = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vec3 dir = normalize(vPos);
    float h = dir.y;
    vec3 horizon = vec3(0.75, 0.1, 0.42);
    vec3 mid = vec3(0.2, 0.03, 0.34);
    vec3 top = vec3(0.01, 0.0, 0.05);
    vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.14, h));
    col = mix(col, top, smoothstep(0.14, 0.6, h));
    // Faint aurora band.
    float band = exp(-pow((h - 0.22 - sin(dir.x * 3.0) * 0.04) * 14.0, 2.0));
    col += vec3(0.1, 0.25, 0.45) * band * 0.35;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const FOG = new THREE.Color("#3a0a45");
/** Scratch object for composing instance matrices. */
const dummy = new THREE.Object3D();

/* ------------------------------------------------------------------ */
/* World pieces                                                        */
/* ------------------------------------------------------------------ */

function Terrain({ driveRef }: { driveRef: RefObject<Drive> }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(100, 170, 160, 300);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const uniforms = useMemo(
    () => ({
      uTravel: { value: 0 },
      uBoost: { value: 0 },
      uGrid: { value: new THREE.Color("#ff2a9d") },
      uGrid2: { value: new THREE.Color("#ffb347") },
      uFog: { value: new THREE.Color().setRGB(0.36, 0.04, 0.3) },
    }),
    [],
  );
  const material = useRef<THREE.ShaderMaterial>(null);
  useFrame(() => {
    if (!material.current) return;
    material.current.uniforms.uTravel.value = driveRef.current.travel;
    material.current.uniforms.uBoost.value = driveRef.current.boost;
  });
  return (
    <mesh geometry={geometry} position={[0, 0, -75]}>
      <shaderMaterial ref={material} vertexShader={terrainVertex} fragmentShader={terrainFragment} uniforms={uniforms} />
    </mesh>
  );
}

function Road({ driveRef, quality }: { driveRef: RefObject<Drive>; quality: Quality }) {
  const uniforms = useMemo(
    () => ({
      uTravel: { value: 0 },
      uBoost: { value: 0 },
      uEdge: { value: new THREE.Color("#18e7ff") },
      uDash: { value: new THREE.Color("#ffb347") },
      uLane: { value: new THREE.Color("#ff2a9d") },
    }),
    [],
  );
  const overlay = useRef<THREE.ShaderMaterial>(null);
  useFrame(() => {
    if (!overlay.current) return;
    overlay.current.uniforms.uTravel.value = driveRef.current.travel;
    overlay.current.uniforms.uBoost.value = driveRef.current.boost;
  });
  const width = ROAD_HALF * 2 + 0.8;
  return (
    <group position={[0, 0, -75]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, 170]} />
        {quality > 0 ? (
          <MeshReflectorMaterial
            key={quality}
            resolution={quality === 2 ? 512 : 256}
            blur={[90, 24]}
            mixBlur={0.35}
            mixStrength={0.45}
            mixContrast={2.0}
            mirror={0.95}
            roughness={0.45}
            metalness={0.6}
            depthScale={0.6}
            minDepthThreshold={0.3}
            maxDepthThreshold={1.3}
            color="#05010b"
            envMapIntensity={0.15}
          />
        ) : (
          <meshStandardMaterial color="#0d0418" metalness={0.85} roughness={0.32} envMapIntensity={0.6} />
        )}
      </mesh>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[width, 170, 1, 1]} />
        <shaderMaterial
          ref={overlay}
          vertexShader={roadVertex}
          fragmentShader={roadFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function Sun() {
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const material = useRef<THREE.ShaderMaterial>(null);
  useFrame((_, delta) => {
    if (material.current) material.current.uniforms.uTime.value += delta;
  });
  return (
    <mesh position={[0, 15, -178]}>
      <planeGeometry args={[120, 120]} />
      <shaderMaterial
        ref={material}
        vertexShader={basicVertex}
        fragmentShader={sunFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function Skyline() {
  const uniforms = useMemo(() => ({ uFog: { value: new THREE.Color().setRGB(0.36, 0.04, 0.3) } }), []);
  return (
    <mesh position={[0, 15, -168]}>
      <planeGeometry args={[340, 32]} />
      <shaderMaterial vertexShader={basicVertex} fragmentShader={skylineFragment} uniforms={uniforms} />
    </mesh>
  );
}

function Sky() {
  return (
    <mesh>
      <sphereGeometry args={[320, 32, 16]} />
      <shaderMaterial vertexShader={skyVertex} fragmentShader={skyFragment} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

function Stars() {
  const geometry = useMemo(() => {
    const rand = createRandom(7);
    const count = 1400;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI - Math.PI;
      const phi = 0.12 + rand() * 1.3;
      const r = 290;
      pos[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
      pos[i * 3 + 1] = Math.sin(phi) * r;
      pos[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  return (
    <points geometry={geometry}>
      <pointsMaterial color="#ffd6f5" size={1.6} sizeAttenuation={false} transparent opacity={0.85} depthWrite={false} />
    </points>
  );
}

/** Neon pylons along both road edges plus big gantry arches you drive through. */
function Roadside({ driveRef }: { driveRef: RefObject<Drive> }) {
  const PER_SIDE = 20;
  const SPACING = LOOP / PER_SIDE;
  const GATES = 4;
  const poles = useRef<THREE.InstancedMesh>(null);
  const caps = useRef<THREE.InstancedMesh>(null);
  const gates = useRef<(THREE.Group | null)[]>([]);

  useEffect(() => {
    const c = caps.current;
    if (!c) return;
    const pink = new THREE.Color(3, 0.3, 1.8);
    const cyan = new THREE.Color(0.3, 2.6, 3.2);
    for (let i = 0; i < PER_SIDE * 2; i++) c.setColorAt(i, i % 2 ? pink : cyan);
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
  }, [PER_SIDE]);

  useFrame(() => {
    if (!poles.current || !caps.current) return;
    const t = driveRef.current.travel;
    for (let i = 0; i < PER_SIDE * 2; i++) {
      const side = i < PER_SIDE ? -1 : 1;
      const k = i % PER_SIDE;
      const z = ((k * SPACING + t) % LOOP) - LOOP + 14;
      dummy.position.set(side * (ROAD_HALF + 1.2), 1.4, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poles.current.setMatrixAt(i, dummy.matrix);
      dummy.position.set(side * (ROAD_HALF + 0.95), 2.85, z);
      dummy.updateMatrix();
      caps.current.setMatrixAt(i, dummy.matrix);
    }
    poles.current.instanceMatrix.needsUpdate = true;
    caps.current.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < GATES; i++) {
      const g = gates.current[i];
      if (g) g.position.z = ((i * (LOOP / GATES) + t + 25) % LOOP) - LOOP + 14;
    }
  });

  return (
    <group>
      <instancedMesh ref={poles} args={[undefined, undefined, PER_SIDE * 2]}>
        <boxGeometry args={[0.14, 2.8, 0.14]} />
        <meshStandardMaterial color="#1a0630" metalness={0.8} roughness={0.3} />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, PER_SIDE * 2]}>
        <boxGeometry args={[0.7, 0.1, 0.1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {Array.from({ length: GATES }, (_, i) => (
        <group
          key={i}
          ref={(g) => {
            gates.current[i] = g;
          }}
        >
          {[-1, 1].map((s) => (
            <group key={s} position={[s * (ROAD_HALF + 1.6), 0, 0]}>
              <mesh position={[0, 3.4, 0]}>
                <boxGeometry args={[0.45, 6.8, 0.45]} />
                <meshStandardMaterial color="#12041f" metalness={0.8} roughness={0.35} />
              </mesh>
              <mesh position={[-s * 0.24, 3.4, 0]}>
                <boxGeometry args={[0.04, 6.6, 0.3]} />
                <meshBasicMaterial color={[0.3, 2.6, 3.2]} toneMapped={false} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 6.9, 0]}>
            <boxGeometry args={[ROAD_HALF * 2 + 3.7, 0.5, 0.5]} />
            <meshStandardMaterial color="#12041f" metalness={0.8} roughness={0.35} />
          </mesh>
          <mesh position={[0, 6.6, 0.26]}>
            <boxGeometry args={[ROAD_HALF * 2 + 3.2, 0.06, 0.04]} />
            <meshBasicMaterial color={[3.2, 0.35, 1.9]} toneMapped={false} />
          </mesh>
          <mesh position={[0, 7.18, 0.26]}>
            <boxGeometry args={[ROAD_HALF * 2 + 3.2, 0.06, 0.04]} />
            <meshBasicMaterial color={[3.2, 0.35, 1.9]} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Rain / dust streaks drifting through the headlights. */
const RAIN_MAX = 300;
const rainDrops = (() => {
  const rand = createRandom(11);
  return Array.from({ length: RAIN_MAX }, () => ({
    x: (rand() - 0.5) * 30,
    y: rand() * 12,
    z: -70 + rand() * 80,
    s: 0.6 + rand() * 0.8,
  }));
})();

function Rain({ driveRef, count }: { driveRef: RefObject<Drive>; count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(delta, 0.05);
    const { speed } = driveRef.current;
    const tilt = Math.min(1.1, speed / 60);
    for (let i = 0; i < count; i++) {
      const d = rainDrops[i];
      d.y -= 11 * dt * d.s;
      d.z += speed * dt * 0.9;
      if (d.y < 0) d.y += 12;
      if (d.z > 10) d.z -= 80;
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(-tilt, 0, 0);
      dummy.scale.set(1, d.s * (0.6 + tilt), 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[0.012, 0.7, 0.012]} />
      <meshBasicMaterial
        color={[0.9, 1.1, 1.6]}
        transparent
        opacity={0.35}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

const SPEED_LINE_COUNT = 160;

/** Streaks that rush past the camera, only visible at speed. */
const speedLines = (() => {
  const rand = createRandom(42);
  return Array.from({ length: SPEED_LINE_COUNT }, () => {
    const a = rand() * Math.PI * 2;
    const r = 3 + rand() * 8;
    return { x: Math.cos(a) * r, y: 2 + Math.sin(a) * r * 0.6, z: -70 + rand() * 80, len: 2 + rand() * 6 };
  });
})();

function SpeedLines({ driveRef }: { driveRef: RefObject<Drive> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, delta) => {
    if (!mesh.current || !material.current) return;
    const dt = Math.min(delta, 0.05);
    const { speed, boost } = driveRef.current;
    material.current.opacity = boost * 0.75;
    mesh.current.visible = boost > 0.02;
    if (!mesh.current.visible) return;
    for (let i = 0; i < SPEED_LINE_COUNT; i++) {
      const l = speedLines[i];
      l.z += speed * dt * 2.2;
      if (l.z > 10) l.z -= 80;
      dummy.position.set(l.x, l.y, l.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, l.len * (0.5 + boost));
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, SPEED_LINE_COUNT]} frustumCulled={false}>
      <boxGeometry args={[0.025, 0.025, 1]} />
      <meshBasicMaterial
        ref={material}
        color={[2.2, 1.6, 2.6]}
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ */
/* The game                                                            */
/* ------------------------------------------------------------------ */

const TRAFFIC_LOOKS = [
  { paint: "#16102a", tail: "#ff2a9d", spec: CAR_SPECS[2] },
  { paint: "#0c1a30", tail: "#18e7ff", spec: CAR_SPECS[0] },
  { paint: "#24081f", tail: "#ffb347", spec: CAR_SPECS[1] },
  { paint: "#101018", tail: "#ff2040", spec: CAR_SPECS[0] },
  { paint: "#1d0b33", tail: "#b26bff", spec: CAR_SPECS[2] },
  { paint: "#0b1420", tail: "#ff2a9d", spec: CAR_SPECS[1] },
  { paint: "#1a0a10", tail: "#18e7ff", spec: CAR_SPECS[0] },
];

function setText(el: HTMLElement | null, text: string) {
  if (el && el.textContent !== text) el.textContent = text;
}

function setStyle(el: HTMLElement | null, key: "opacity" | "transform", value: string) {
  if (el && el.style[key] !== value) el.style[key] = value;
}

function showToast(el: HTMLElement | null, text: string, tone: "good" | "bad" | "info") {
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
  el.style.opacity = "1";
  el.style.transform = "translate(-50%, 0) scale(1)";
}

function saveBestScore(g: Game) {
  if (!g.bestDirty) return;
  g.bestDirty = false;
  try {
    window.localStorage.setItem(BEST_KEY, String(Math.floor(g.best)));
  } catch {
    /* storage blocked */
  }
}

function makeGame(reducedMotion: boolean): Game {
  return {
    mode: "attract",
    score: 0,
    best: 0,
    lives: 3,
    streak: 0,
    combo: 1,
    invuln: 0,
    rowDist: ROW_GAP * 0.6,
    lastFree: [0, 1, 2],
    toastT: 0,
    intro: reducedMotion ? 1 : 0,
    autoLane: 1,
    autoThink: 0,
    bestDirty: false,
    seeded: false,
    target: 0,
    seenTarget: 0,
    traffic: Array.from({ length: TRAFFIC_COUNT }, () => ({
      active: false,
      x: 0,
      z: 0,
      lane: 0,
      hit: false,
      vx: 0,
      spin: 0,
      age: 0,
    })),
    orbs: Array.from({ length: ORB_COUNT }, () => ({ active: false, x: 0, z: 0, pop: 0 })),
  };
}

function fmt(n: number) {
  return Math.floor(n).toLocaleString("en-US");
}

function GameWorld({
  driveRef,
  controls,
  hud,
  car,
  reducedMotion,
  onModeChange,
}: {
  driveRef: RefObject<Drive>;
  controls: RefObject<DriveControls>;
  hud: HudRefs;
  car: CarSpec;
  reducedMotion: boolean;
  onModeChange: (mode: GameMode) => void;
}) {
  const player = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const glowLight = useRef<THREE.PointLight>(null);
  const motion = useRef<CarMotion>({ speed: BASE_SPEED, steer: 0, boost: 0, brake: 0 });
  const trafficGroups = useRef<(THREE.Group | null)[]>([]);
  const orbMesh = useRef<THREE.InstancedMesh>(null);
  const orbHalo = useRef<THREE.InstancedMesh>(null);

  const game = useRef<Game>(makeGame(reducedMotion));

  // Best score from a previous visit; saved again on run over, idle and page hide.
  useEffect(() => {
    const g = game.current;
    try {
      const v = Number(window.localStorage.getItem(BEST_KEY));
      if (Number.isFinite(v) && v > 0) g.best = v;
    } catch {
      /* storage blocked: best score just won't persist */
    }
    const flush = () => saveBestScore(g);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const saveBest = () => saveBestScore(game.current);

  const toast = (text: string, tone: "good" | "bad" | "info" = "info") => {
    showToast(hud.toast.current, text, tone);
    game.current.toastT = tone === "info" ? 2.2 : 1.1;
  };

  const spawnRow = (z: number) => {
    const g = game.current;
    const { traffic, orbs } = g;
    const rand = Math.random;
    // Harder the longer you survive: more double blocks.
    const doubleChance = g.mode === "play" ? Math.min(0.55, 0.25 + g.score / 40000) : 0.3;
    const lanes = [0, 1, 2].sort(() => rand() - 0.5);
    let blocked = rand() < doubleChance ? lanes.slice(0, 2) : lanes.slice(0, 1);
    // Always leave a lane that was also free in the previous row.
    if (blocked.length === 2 && g.lastFree.every((l) => blocked.includes(l))) blocked = blocked.slice(0, 1);
    for (const lane of blocked) {
      const t = traffic.find((c) => !c.active);
      if (!t) break;
      t.active = true;
      t.hit = false;
      t.lane = lane;
      t.x = LANES[lane] + (rand() - 0.5) * 0.5;
      t.z = z - rand() * 6;
      t.vx = 0;
      t.spin = 0;
      t.age = 0;
    }
    const free = [0, 1, 2].filter((l) => !blocked.includes(l));
    g.lastFree = free;
    // Orb chain in a free lane, sometimes weaving to another free lane.
    if (rand() < 0.75 && free.length) {
      const a = free[Math.floor(rand() * free.length)];
      const b = free[Math.floor(rand() * free.length)];
      const n = 5;
      for (let k = 0; k < n; k++) {
        const o = orbs.find((q) => !q.active);
        if (!o) break;
        const f = k / (n - 1);
        o.active = true;
        o.pop = 0;
        o.x = THREE.MathUtils.lerp(LANES[a], LANES[b], THREE.MathUtils.smoothstep(f, 0.2, 0.8));
        o.z = z + 10 - k * 4;
      }
    }
  };

  const resetRun = () => {
    const g = game.current;
    g.score = 0;
    g.lives = 3;
    g.streak = 0;
    g.combo = 1;
    g.invuln = 1;
  };

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const d = driveRef.current;
    const c = controls.current;
    const g = game.current;
    const { traffic, orbs } = g;
    const now = performance.now();
    const motionScale = reducedMotion ? 0.65 : 1;

    // ---- Mode: attract (autopilot) until someone touches the controls.
    const wantPlay = c.lastInput > 0 && now - c.lastInput < IDLE_MS;
    const mode: GameMode = wantPlay ? "play" : "attract";
    if (mode !== g.mode) {
      g.mode = mode;
      onModeChange(mode);
      if (mode === "play") {
        resetRun();
        toast("Player 1 · go!", "good");
      } else {
        saveBest();
      }
    }

    // ---- Steering.
    let boosting = c.boost;
    if (mode === "play") {
      if (c.target !== g.seenTarget) {
        g.seenTarget = c.target;
        g.target = c.target;
      }
      if (c.keySteer !== 0) g.target = THREE.MathUtils.clamp(g.target + c.keySteer * dt * 2.4, -1, 1);
    } else {
      // Autopilot: pick the lane with the least traffic ahead, prefer orbs.
      g.autoThink -= dt;
      if (g.autoThink <= 0) {
        g.autoThink = 0.2;
        let bestLane = g.autoLane;
        let bestCost = Infinity;
        for (let l = 0; l < 3; l++) {
          let cost = l === g.autoLane ? -0.3 : 0;
          cost += Math.abs(l - g.autoLane) * 0.15;
          for (const t of traffic) {
            if (!t.active || t.hit) continue;
            const ahead = PLAYER_Z - t.z;
            if (ahead > -5 && ahead < 70 && Math.abs(t.x - LANES[l]) < 1.9) cost += 10 * (1 - ahead / 80);
          }
          // Cutting across a lane with a car alongside is also a crash.
          if (Math.abs(l - g.autoLane) === 2) {
            for (const t of traffic) {
              if (t.active && !t.hit && t.lane === 1 && Math.abs(PLAYER_Z - t.z) < 12) cost += 20;
            }
          }
          for (const o of orbs) {
            if (o.active && o.pop === 0 && Math.abs(o.x - LANES[l]) < 0.8 && o.z < PLAYER_Z && o.z > -45) cost -= 0.5;
          }
          if (cost < bestCost) {
            bestCost = cost;
            bestLane = l;
          }
        }
        g.autoLane = bestLane;
      }
      g.target = LANES[g.autoLane] / STEER_RANGE;
      boosting = !reducedMotion && state.clock.elapsedTime % 7 > 4.6 && g.intro >= 1;
    }

    // ---- Speed.
    d.boost = THREE.MathUtils.damp(d.boost, boosting ? 1 : 0, boosting ? 2.4 : 3, dt);
    d.crash = Math.max(0, d.crash - dt * 0.7);
    const crashSlow = 1 - 0.5 * Math.min(1, d.crash * 1.4);
    d.speed = BASE_SPEED * (1 + d.boost * 1.6) * crashSlow * motionScale;
    d.travel = (d.travel + d.speed * dt) % LOOP;
    d.time += dt;

    // ---- Player car.
    const p = player.current;
    if (p && body.current) {
      const targetX = THREE.MathUtils.clamp(g.target, -1, 1) * STEER_RANGE;
      const prevX = p.position.x;
      p.position.x = THREE.MathUtils.damp(prevX, targetX, mode === "play" ? 5 : 3.2, dt);
      const vx = (p.position.x - prevX) / Math.max(dt, 1e-4);
      d.carX = p.position.x;
      body.current.rotation.z = THREE.MathUtils.damp(body.current.rotation.z, vx * 0.022, 8, dt); // body roll
      p.rotation.y = THREE.MathUtils.damp(p.rotation.y, -vx * 0.03, 8, dt);
      body.current.position.y = Math.sin(d.time * 41) * (0.004 + d.boost * 0.01) * motionScale;
      body.current.rotation.x = THREE.MathUtils.damp(body.current.rotation.x, d.boost * 0.03 - d.crash * 0.05, 4, dt);
      g.invuln = Math.max(0, g.invuln - dt);
      p.visible = g.invuln <= 0 || Math.floor(g.invuln * 14) % 2 === 0;
      motion.current.speed = d.speed;
      motion.current.steer = THREE.MathUtils.clamp(vx * 0.2, -1, 1);
      motion.current.boost = d.boost;
      motion.current.brake = d.crash;
      if (glowLight.current) glowLight.current.position.x = p.position.x;
    }

    // ---- Spawning rows of traffic (distance is measured relative to traffic).
    const rel = d.speed - TRAFFIC_SPEED;
    if (!g.seeded) {
      // Start with a populated road so there is something to dodge right away.
      g.seeded = true;
      for (const z of [-70, -110, -150]) spawnRow(z);
    }
    {
      g.rowDist -= Math.max(0, rel) * dt;
      if (g.rowDist <= 0) {
        g.rowDist += ROW_GAP + Math.random() * 14;
        spawnRow(SPAWN_Z);
      }
    }

    // ---- Traffic.
    const px = d.carX;
    for (let i = 0; i < traffic.length; i++) {
      const t = traffic[i];
      const grp = trafficGroups.current[i];
      if (!t.active) {
        if (grp) grp.visible = false;
        continue;
      }
      t.z += rel * dt;
      t.age += dt;
      if (t.hit) {
        t.x += t.vx * dt;
        t.vx *= 1 - dt * 1.5;
        t.spin += dt * 5 * Math.sign(t.vx || 1);
      }
      if (t.z > 16 || t.z < SPAWN_Z - 40 || Math.abs(t.x) > 14) {
        t.active = false;
        if (grp) grp.visible = false;
        continue;
      }
      if (!t.hit && Math.abs(t.x - px) < 1.72 && Math.abs(t.z - PLAYER_Z) < 4.2) {
        // Crash! Knock the other car aside, lose speed and a shield.
        t.hit = true;
        t.vx = (t.x >= px ? 1 : -1) * 9;
        if (g.invuln <= 0) {
          d.crash = 1;
          g.invuln = 1.4;
          g.streak = 0;
          g.combo = 1;
          if (g.mode === "play") {
            g.lives -= 1;
            if (g.lives <= 0) {
              toast(`Run over · ${fmt(g.score)}`, "bad");
              game.current.toastT = 2.4;
              saveBest();
              resetRun();
            } else {
              toast(g.lives === 1 ? "Last shield!" : "Shield down", "bad");
            }
          }
          setStyle(hud.flash.current, "opacity", "0.75");
        }
      }
      if (grp) {
        grp.visible = true;
        grp.position.set(t.x, 0, t.z);
        grp.rotation.y = t.spin;
      }
    }

    // ---- Orbs.
    const om = orbMesh.current;
    const oh = orbHalo.current;
    if (om && oh) {
      const tt = d.time;
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i];
        if (o.active) {
          o.z += rel * dt; // orbs ride with the traffic so rows never overlap
          if (o.pop > 0) {
            o.pop += dt * 4;
            if (o.pop >= 1) o.active = false;
          } else if (Math.abs(o.x - px) < 1.15 && Math.abs(o.z - PLAYER_Z) < 1.6) {
            o.pop = 0.001;
            g.streak += 1;
            const newCombo = Math.min(5, 1 + Math.floor(g.streak / 5));
            if (newCombo > g.combo && g.mode === "play") toast(`x${newCombo} combo`, "good");
            g.combo = newCombo;
            if (g.mode === "play") g.score += 100 * g.combo;
          }
          if (o.z > 14) o.active = false;
        }
        if (!o.active) {
          dummy.position.set(0, -50, 0);
          dummy.scale.setScalar(0);
        } else {
          const s = o.pop > 0 ? 1 + o.pop * 2.5 : 1;
          const fade = o.pop > 0 ? 1 - o.pop : 1;
          dummy.position.set(o.x, 0.85 + Math.sin(tt * 3 + o.z * 0.3) * 0.15 + o.pop * 1.2, o.z);
          dummy.rotation.set(tt * 1.4, tt * 2 + i, 0);
          dummy.scale.setScalar(s * fade);
        }
        dummy.updateMatrix();
        om.setMatrixAt(i, dummy.matrix);
        dummy.scale.multiplyScalar(2.1);
        dummy.updateMatrix();
        oh.setMatrixAt(i, dummy.matrix);
      }
      om.instanceMatrix.needsUpdate = true;
      oh.instanceMatrix.needsUpdate = true;
    }

    // ---- Score.
    if (g.mode === "play") {
      g.score += d.speed * dt * 0.6 * (1 + d.boost) * g.combo;
      if (g.score > g.best) {
        g.best = g.score;
        g.bestDirty = true;
      }
    }

    // ---- Intro camera sweep + chase cam with FOV kick and shake.
    // Wall-clock based so slow devices don't sit in the intro for ages.
    if (g.intro < 1) g.intro = reducedMotion ? 1 : Math.min(1, state.clock.elapsedTime / 3.2);
    const cam = state.camera as THREE.PerspectiveCamera;
    const portrait = state.viewport.aspect < 1;
    const chase = new THREE.Vector3(
      d.carX * 0.55,
      portrait ? 3.6 : 3.1,
      PLAYER_Z + (portrait ? 10.5 : 8.2),
    );
    const look = new THREE.Vector3(d.carX * 0.3, portrait ? 0.9 : 0.7, -12);
    const kick = reducedMotion ? 0 : d.boost * 16;
    let fov = (portrait ? 68 : 52) + kick;
    if (g.intro < 1) {
      const e = 1 - Math.pow(1 - g.intro, 3);
      const theta = (1 - e) * 2.7;
      const r = THREE.MathUtils.lerp(5.2, 8.2, e);
      const orbit = new THREE.Vector3(
        d.carX + Math.sin(theta) * r,
        THREE.MathUtils.lerp(0.8, chase.y, e),
        PLAYER_Z + Math.cos(theta) * r,
      );
      chase.lerp(orbit, 1 - THREE.MathUtils.smoothstep(e, 0.55, 1));
      look.lerp(new THREE.Vector3(d.carX, 0.6, PLAYER_Z), 1 - THREE.MathUtils.smoothstep(e, 0.35, 1));
      fov = THREE.MathUtils.lerp(40, fov, e);
    }
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const shake = reducedMotion ? 0 : d.boost * 0.035 + d.crash * d.crash * 0.35;
    cam.position.set(
      chase.x + Math.sin(d.time * 47) * shake,
      chase.y + Math.cos(d.time * 53) * shake,
      chase.z,
    );
    cam.lookAt(look);

    // ---- HUD (DOM writes only when something changed).
    const kmh = Math.round(((d.speed / BASE_SPEED) * 100) / motionScale);
    setText(hud.speed.current, String(kmh).padStart(3, "0"));
    setStyle(hud.boost.current, "transform", `scaleX(${d.boost.toFixed(2)})`);
    setText(hud.score.current, g.mode === "play" ? fmt(g.score) : "DEMO");
    setText(hud.best.current, fmt(g.best));
    setText(hud.combo.current, `x${g.combo}`);
    const lives = Math.max(0, g.mode === "play" ? g.lives : 3);
    setText(hud.lives.current, "◆".repeat(lives) + "◇".repeat(3 - lives));
    if (d.crash > 0) setStyle(hud.flash.current, "opacity", (Math.max(0, d.crash - 0.25) * 0.9).toFixed(3));
    if (g.toastT > 0) {
      g.toastT -= dt;
      if (g.toastT <= 0) {
        setStyle(hud.toast.current, "opacity", "0");
        setStyle(hud.toast.current, "transform", "translate(-50%, 0) scale(0.9)");
      }
    }
  });

  return (
    <group>
      <group ref={player} position={[0, 0, PLAYER_Z]}>
        <group ref={body}>
          <SportsCar spec={car} motion={motion} blendColors />
        </group>
      </group>
      <pointLight ref={glowLight} position={[0, 0.5, PLAYER_Z]} intensity={18} distance={7} color={car.accent} />
      {TRAFFIC_LOOKS.slice(0, TRAFFIC_COUNT).map((look, i) => (
        <group
          key={i}
          visible={false}
          ref={(grp) => {
            trafficGroups.current[i] = grp;
          }}
        >
          <SportsCar spec={look.spec} paint={look.paint} tail={look.tail} lowDetail />
        </group>
      ))}
      <instancedMesh ref={orbMesh} args={[undefined, undefined, ORB_COUNT]} frustumCulled={false}>
        <octahedronGeometry args={[0.3, 0]} />
        <meshBasicMaterial color={[3.2, 2.0, 0.5]} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={orbHalo} args={[undefined, undefined, ORB_COUNT]} frustumCulled={false}>
        <icosahedronGeometry args={[0.3, 1]} />
        <meshBasicMaterial
          color={[1.4, 0.3, 0.9]}
          transparent
          opacity={0.25}
          wireframe
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}

function Effects({ driveRef, quality, reducedMotion }: { driveRef: RefObject<Drive>; quality: Quality; reducedMotion: boolean }) {
  const ca = useRef<ChromaticAberrationEffect>(null);
  useFrame(() => {
    const { boost, crash } = driveRef.current;
    const k = reducedMotion ? 0 : boost * 0.0035 + crash * 0.012;
    ca.current?.offset.set(0.0005 + k, 0.0003 + k * 0.4);
  });
  if (quality === 2) {
    return (
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.62} luminanceSmoothing={0.25} />
        <ChromaticAberration ref={ca} radialModulation modulationOffset={0.15} />
        <Scanline density={1.4} opacity={0.06} />
        <Vignette offset={0.25} darkness={0.8} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={1.05} luminanceThreshold={0.62} luminanceSmoothing={0.25} />
      <ChromaticAberration ref={ca} radialModulation modulationOffset={0.15} />
      <Vignette offset={0.25} darkness={0.8} />
    </EffectComposer>
  );
}

function initialQuality(): Quality {
  if (typeof window === "undefined") return 1;
  const small = window.innerWidth < 768;
  const cores = navigator.hardwareConcurrency || 4;
  if (small || cores <= 4) return 1;
  return 2;
}

export default function Scene({ controls, hud, active, car, reducedMotion, onModeChange }: SceneProps) {
  const driveRef = useRef<Drive>({ travel: 0, boost: 0, speed: BASE_SPEED, carX: 0, crash: 0, time: 0 });
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const dpr: number | [number, number] = quality === 2 ? [1, 1.75] : quality === 1 ? [1, 1.3] : 1;

  return (
    <Canvas
      dpr={dpr}
      frameloop={active ? "always" : "never"}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      camera={{ position: [0, 2.45, 8.8], fov: 52, near: 0.1, far: 420 }}
      onCreated={({ scene }) => {
        scene.background = FOG.clone();
      }}
    >
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => setQuality((q) => (q > 0 ? ((q - 1) as Quality) : q))}
        onFallback={() => setQuality(0)}
      />
      <NeonEnvironment resolution={quality === 2 ? 128 : 64} />
      <ambientLight intensity={0.35} color="#b48cff" />
      <hemisphereLight args={["#ff4fa8", "#120326", 0.35]} />
      <directionalLight position={[0, 8, -20]} intensity={1.1} color="#ff7ab8" />
      <directionalLight position={[3, 5, 10]} intensity={1.2} color="#7fd8ff" />
      <Sky />
      <Stars />
      <Sun />
      <Skyline />
      <Terrain driveRef={driveRef} />
      <Road driveRef={driveRef} quality={quality} />
      <Roadside driveRef={driveRef} />
      <GameWorld
        driveRef={driveRef}
        controls={controls}
        hud={hud}
        car={car}
        reducedMotion={reducedMotion}
        onModeChange={onModeChange}
      />
      <Rain driveRef={driveRef} count={reducedMotion ? 0 : quality === 2 ? 260 : quality === 1 ? 140 : 0} />
      {!reducedMotion && <SpeedLines driveRef={driveRef} />}
      <Effects driveRef={driveRef} quality={quality} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
