"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { createRandom } from "@/lib/random";
import {
  ATMOS,
  HORIZON_GLSL,
  MOON_DIR,
  NOISE_GLSL,
  SKY_KEYS,
  SUN_DIR_DAY,
  SUN_DIR_SET,
  damp,
  dusk,
  tri,
  type Mix,
  type Quality,
} from "./shared";

/* ------------------------------------------------------------------ */
/* Lights, fog and the shared sky uniforms                             */
/* ------------------------------------------------------------------ */

const LIGHT_DIR = new THREE.Vector3();
const KEY_DAY = new THREE.Vector3(-0.5, 0.62, 0.62).normalize();
const KEY_NIGHT = new THREE.Vector3(-0.2, 0.75, 0.55).normalize();

export function AtmosphereDriver({
  night,
  mixRef,
  quality,
  reducedMotion,
}: {
  night: boolean;
  mixRef: Mix;
  quality: Quality;
  reducedMotion: boolean;
}) {
  const fog = useRef<THREE.Fog>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);

  useFrame((state, dt) => {
    // Slow enough to enjoy the sunset on the way to night.
    mixRef.current = damp(mixRef.current, night ? 1 : 0, reducedMotion ? 8 : 0.9, Math.min(dt, 0.1));
    if (Math.abs(mixRef.current - (night ? 1 : 0)) < 0.002) mixRef.current = night ? 1 : 0;
    const m = mixRef.current;
    ATMOS.uTime.value = state.clock.elapsedTime;
    ATMOS.uPixelRatio.value = state.viewport.dpr;
    ATMOS.uMix.value = m;

    const set = THREE.MathUtils.smoothstep(m, 0, 0.7);
    ATMOS.uSunDir.value.lerpVectors(SUN_DIR_DAY, SUN_DIR_SET, set).normalize();
    tri(SKY_KEYS.zenith, m, ATMOS.uZenith.value);
    tri(SKY_KEYS.horizon, m, ATMOS.uHorizon.value);
    tri(SKY_KEYS.glow, m, ATMOS.uGlow.value);
    tri(SKY_KEYS.cloudLit, m, ATMOS.uCloudLit.value);
    tri(SKY_KEYS.cloudShade, m, ATMOS.uCloudShade.value);
    tri(SKY_KEYS.fog, m, ATMOS.uFogColor.value);
    fog.current?.color.copy(ATMOS.uFogColor.value);

    if (sun.current) {
      // Key light is cheated round to the camera side so the island reads warm and
      // sculpted, while the visible sun behind it supplies a golden rim (below).
      LIGHT_DIR.lerpVectors(KEY_DAY, KEY_NIGHT, THREE.MathUtils.smoothstep(m, 0.4, 0.9)).normalize();
      sun.current.position.copy(LIGHT_DIR).multiplyScalar(30);
      tri(SKY_KEYS.sun, m, sun.current.color);
      sun.current.intensity = m < 0.5 ? THREE.MathUtils.lerp(2.6, 1.5, m * 2) : THREE.MathUtils.lerp(1.5, 0.8, (m - 0.5) * 2);
    }
    if (rim.current) {
      LIGHT_DIR.lerpVectors(ATMOS.uSunDir.value, MOON_DIR, THREE.MathUtils.smoothstep(m, 0.5, 0.85));
      LIGHT_DIR.y = Math.max(LIGHT_DIR.y, 0.12);
      rim.current.position.copy(LIGHT_DIR.normalize()).multiplyScalar(30);
      rim.current.color.copy(ATMOS.uGlow.value);
      rim.current.intensity = m < 0.5 ? THREE.MathUtils.lerp(2.4, 2.8, m * 2) : THREE.MathUtils.lerp(2.8, 0.9, (m - 0.5) * 2);
    }
    if (hemi.current) {
      tri(SKY_KEYS.hemiSky, m, hemi.current.color);
      tri(SKY_KEYS.hemiGround, m, hemi.current.groundColor);
      hemi.current.intensity = THREE.MathUtils.lerp(1.05, 0.55, m) + dusk(m) * 0.1;
    }
  });

  const mapSize = quality === "high" ? 2048 : 1024;
  return (
    <>
      <fog ref={fog} attach="fog" args={["#f9dcc0", ATMOS.uFogNear.value, ATMOS.uFogFar.value]} />
      <hemisphereLight ref={hemi} args={["#dceeff", "#7b8f52", 1.05]} />
      <directionalLight
        ref={sun}
        position={KEY_DAY.clone().multiplyScalar(30)}
        intensity={2.6}
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={quality === "high" ? 4 : 2}
        shadow-camera-left={-7.5}
        shadow-camera-right={7.5}
        shadow-camera-top={7.5}
        shadow-camera-bottom={-7.5}
        shadow-camera-near={10}
        shadow-camera-far={50}
      />
      <directionalLight ref={rim} position={SUN_DIR_DAY.clone().multiplyScalar(30)} intensity={2.4} color="#ffae55" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Sky dome: gradient, sun with a slow sunburst, moon                  */
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
  uniform float uTime;
  uniform float uMix;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float t = pow(smoothstep(0.0, 0.5, h), 0.55);
    vec3 col = mix(uHorizon, uZenith, t);

    // Golden haze hugging the horizon, strongest towards the sun.
    float s = max(dot(d, uSunDir), 0.0);
    float band = exp(-abs(h + 0.01) * 10.0);
    vec3 sd = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
    float sh = max(dot(normalize(vec3(d.x, 0.0, d.z)), sd), 0.0);
    col += uGlow * band * (0.08 + pow(sh, 4.0) * 0.38) * (1.0 - uMix * 0.75);

    // Sun: soft glow, slow rotating sunburst and a hot core that blooms.
    float sunVis = 1.0 - smoothstep(0.55, 0.85, uMix);
    vec3 b1 = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)));
    vec3 b2 = cross(b1, uSunDir);
    float ang = atan(dot(d, b1), dot(d, b2));
    float rays = sin(ang * 11.0 + uTime * 0.05) * 0.5 + 0.5;
    rays *= sin(ang * 17.0 - uTime * 0.04 + 1.3) * 0.5 + 0.5;
    col += uGlow * (pow(s, 8.0) * 0.35 + pow(s, 90.0) * 0.8) * sunVis;
    col += uGlow * rays * pow(s, 14.0) * 0.35 * sunVis;
    col = mix(col, vec3(5.0, 3.9, 2.4), smoothstep(0.99952, 0.99975, s) * sunVis);

    // Moon with a cool halo.
    float mVis = smoothstep(0.55, 0.95, uMix);
    float ms = max(dot(d, uMoonDir), 0.0);
    float disc = smoothstep(0.99955, 0.99972, ms);
    vec3 mb1 = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 mb2 = cross(mb1, uMoonDir);
    vec2 mp = vec2(dot(d, mb1), dot(d, mb2)) * 1400.0;
    float crater = hash(floor(mp * 0.6)) * 0.18;
    col += vec3(0.72, 0.8, 1.0) * (pow(ms, 40.0) * 0.3 + pow(ms, 900.0) * 0.6) * mVis;
    col = mix(col, vec3(1.45, 1.45, 1.5) * (1.0 - crater), disc * mVis);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function SkyDome() {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        uniforms: ATMOS,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  useFrame(({ camera }) => mesh.current?.position.copy(camera.position));
  return (
    <mesh ref={mesh} material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[200, 32, 16]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Stars                                                               */
/* ------------------------------------------------------------------ */

const starVertex = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uMix;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.6 + 0.4 * sin(uTime * (1.2 + aPhase) + aPhase * 6.2831);
    vAlpha = smoothstep(0.55, 1.0, uMix) * tw;
    gl_PointSize = aSize * uPixelRatio;
  }
`;

const starFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(d));
    gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * 1.4, a * a * vAlpha);
  }
`;

export function Stars({ quality }: { quality: Quality }) {
  const points = useRef<THREE.Points>(null);
  const { geometry, material } = useMemo(() => {
    const random = createRandom(7);
    const count = quality === "high" ? 1400 : 700;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = random() * Math.PI * 2;
      const y = 0.01 + Math.pow(random(), 1.8) * 0.99;
      const r = Math.sqrt(1 - y * y);
      positions.set([Math.cos(theta) * r * 170, y * 170, Math.sin(theta) * r * 170], i * 3);
      sizes[i] = 1.8 + Math.pow(random(), 4) * 5;
      phases[i] = random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: starVertex,
      fragmentShader: starFragment,
      uniforms: { uTime: ATMOS.uTime, uMix: ATMOS.uMix, uPixelRatio: ATMOS.uPixelRatio },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    return { geometry: geo, material: mat };
  }, [quality]);

  useFrame(({ camera }) => {
    if (!points.current) return;
    points.current.position.copy(camera.position);
    points.current.visible = ATMOS.uMix.value > 0.5;
  });

  return <points ref={points} geometry={geometry} material={material} renderOrder={-9} frustumCulled={false} />;
}

/* ------------------------------------------------------------------ */
/* Cloud sea: a rolling, sunlit floor of cloud far below the island    */
/* ------------------------------------------------------------------ */

const seaVertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal2;
  varying float vH;
  ${NOISE_GLSL}
  float heightAt(vec2 xz) {
    vec2 drift = vec2(uTime * 0.05, uTime * 0.02);
    float h = fbm(xz * 0.045 + drift * 0.045);
    // Round the tops into billows.
    return 1.0 - pow(1.0 - clamp(h, 0.0, 1.0), 2.2);
  }
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    float amp = 9.0;
    float e = 0.9;
    float h = heightAt(w.xz);
    float hx = heightAt(w.xz + vec2(e, 0.0));
    float hz = heightAt(w.xz + vec2(0.0, e));
    w.y += (h - 0.6) * amp;
    vNormal2 = normalize(vec3(-(hx - h) * amp / e, 1.0, -(hz - h) * amp / e));
    vH = h;
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const seaFragment = /* glsl */ `
  uniform float uTime;
  uniform float uMix;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform vec3 uGlow;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform vec3 uFogColor;
  uniform vec3 uHorizon;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vWorld;
  varying vec3 vNormal2;
  varying float vH;
  ${NOISE_GLSL}
  ${HORIZON_GLSL}
  void main() {
    vec2 uv = vWorld.xz * 0.16 + vec2(uTime * 0.03, uTime * 0.012);
    // Small-scale puffiness perturbs the normal so the billows look soft, not smooth.
    float d0 = fbm(uv);
    float dx = fbm(uv + vec2(0.15, 0.0));
    float dz = fbm(uv + vec2(0.0, 0.15));
    vec3 n = normalize(vNormal2 + vec3(-(dx - d0), 0.0, -(dz - d0)) * 5.0);

    vec3 L = normalize(mix(uSunDir, uMoonDir, smoothstep(0.5, 0.9, uMix)));
    L.y = max(L.y, 0.18);
    L = normalize(L);
    float diff = dot(n, L) * 0.5 + 0.5;
    float ao = smoothstep(0.15, 0.85, vH);
    float k = smoothstep(0.2, 0.95, diff * 0.75 + ao * 0.45 + d0 * 0.15 - 0.1);
    vec3 col = mix(uCloudShade, uCloudLit, k);

    vec3 V = vWorld - cameraPosition;
    float dist = length(V);
    vec3 Vn = V / dist;
    // Forward scatter: sunward slopes glow gold.
    float toward = pow(max(dot(normalize(Vn.xz), normalize(L.xz + 1e-4)), 0.0), 4.0);
    float rim = pow(1.0 - max(dot(n, -Vn), 0.0), 3.0);
    col += uGlow * (toward * (0.25 + rim * 0.6) + rim * 0.12) * (0.6 + k * 0.4);

    float f = smoothstep(uFogNear * 0.5, uFogFar * 0.8, dist);
    col = mix(col, horizonColor(Vn), f);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function CloudSea({ quality }: { quality: Quality }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: seaVertex,
        fragmentShader: seaFragment,
        uniforms: ATMOS,
        defines: { OCTAVES: quality === "high" ? 4 : 3 },
        fog: false,
      }),
    [quality],
  );
  const segments = quality === "high" ? 200 : 110;
  return (
    <mesh position={[0, -12.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material} frustumCulled={false}>
      <planeGeometry args={[520, 520, segments, segments]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Puffy clouds: clusters of soft spheres, lit by the sun              */
/* ------------------------------------------------------------------ */

const puffVertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vWorld;
  void main() {
    mat4 im = instanceMatrix;
    float ph = im[3].x * 1.7 + im[3].z * 1.3 + im[3].y;
    vec3 p = position + normal * sin(uTime * 0.7 + ph + position.y * 2.5) * 0.035;
    vec4 w = modelMatrix * im * vec4(p, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * mat3(im) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const puffFragment = /* glsl */ `
  uniform float uMix;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform vec3 uGlow;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform vec3 uFogColor;
  uniform vec3 uHorizon;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vN;
  varying vec3 vWorld;
  ${HORIZON_GLSL}
  void main() {
    vec3 n = normalize(vN);
    vec3 L = normalize(mix(uSunDir, uMoonDir, smoothstep(0.5, 0.9, uMix)));
    L.y = max(L.y, 0.15);
    L = normalize(L);
    float wrap = dot(n, L) * 0.5 + 0.5;
    float up = n.y * 0.5 + 0.5;
    float k = smoothstep(0.12, 0.95, wrap * 0.7 + up * 0.45);
    vec3 col = mix(uCloudShade, uCloudLit, k);

    vec3 V = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
    float toward = pow(max(dot(-V, L), 0.0), 3.0);
    // Silver lining: the sun glows through cloud edges when you look towards it.
    col += uGlow * rim * (0.22 + toward * 1.1);

    float dist = length(cameraPosition - vWorld);
    col = mix(col, horizonColor(vWorld - cameraPosition), smoothstep(uFogNear * 0.5, uFogFar * 1.25, dist));
    gl_FragColor = vec4(col, 1.0);
  }
`;

type Puff = { x: number; y: number; z: number; r: number; sy: number };

function makeCluster(random: () => number, size: number): Puff[] {
  const n = 5 + Math.floor(random() * 5);
  const out: Puff[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const core = 1 - Math.abs(t);
    const r = size * (0.42 + core * 0.5) * (0.85 + random() * 0.3);
    out.push({
      x: t * size * 1.5 + (random() - 0.5) * size * 0.3,
      y: core * size * 0.25 + r * 0.15,
      z: (random() - 0.5) * size * 0.7,
      r,
      sy: 0.78 + random() * 0.12,
    });
  }
  // Crown puffs give every cloud its cauliflower top.
  const crowns = 1 + Math.floor(random() * 3);
  for (let i = 0; i < crowns; i++) {
    out.push({
      x: (random() - 0.5) * size * 0.9,
      y: size * (0.45 + random() * 0.25),
      z: (random() - 0.5) * size * 0.35,
      r: size * (0.38 + random() * 0.2),
      sy: 0.9,
    });
  }
  return out;
}

export type CloudLayerSpec = {
  seed: number;
  count: number;
  radius: [number, number];
  height: [number, number];
  size: [number, number];
  /** Radians per second the whole layer drifts around the island. */
  speed: number;
  /** Keep clouds out of this angular window (radians) — e.g. the hero sightline. */
  center?: [number, number];
};

export function CloudLayer({ spec, quality }: { spec: CloudLayerSpec; quality: Quality }) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(
    () => (quality === "high" ? new THREE.SphereGeometry(1, 22, 14) : new THREE.SphereGeometry(1, 14, 9)),
    [quality],
  );
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: puffVertex,
        fragmentShader: puffFragment,
        uniforms: ATMOS,
        fog: false,
      }),
    [],
  );

  const puffs = useMemo(() => {
    const random = createRandom(spec.seed);
    const all: Puff[] = [];
    const count = quality === "high" ? spec.count : Math.ceil(spec.count * 0.6);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + random() * 0.6;
      const radius = spec.radius[0] + random() * (spec.radius[1] - spec.radius[0]);
      const cx = spec.center ? spec.center[0] + (random() - 0.5) * radius : Math.cos(angle) * radius;
      const cz = spec.center ? spec.center[1] + (random() - 0.5) * radius : Math.sin(angle) * radius;
      const cy = spec.height[0] + random() * (spec.height[1] - spec.height[0]);
      const size = spec.size[0] + random() * (spec.size[1] - spec.size[0]);
      const rot = random() * Math.PI;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      for (const p of makeCluster(random, size)) {
        all.push({ ...p, x: cx + p.x * cos - p.z * sin, y: cy + p.y, z: cz + p.x * sin + p.z * cos });
      }
    }
    return all;
  }, [spec, quality]);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D();
    puffs.forEach((p, i) => {
      o.position.set(p.x, p.y, p.z);
      o.scale.set(p.r, p.r * p.sy, p.r);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [puffs]);

  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += spec.speed * Math.min(dt, 0.1);
  });

  return (
    <group ref={group}>
      <instancedMesh
        key={puffs.length}
        ref={mesh}
        args={[geometry, material, puffs.length]}
        frustumCulled={false}
      />
    </group>
  );
}

export const CLOUD_LAYERS: Record<"sea" | "low" | "mid" | "high" | "intro", CloudLayerSpec> = {
  // Big cumulus sitting in the cloud sea.
  sea: { seed: 31, count: 16, radius: [16, 70], height: [-10.5, -8.5], size: [3.2, 6.5], speed: 0.006 },
  // Smaller clouds just below the island, passing under it.
  low: { seed: 47, count: 7, radius: [8.5, 13], height: [-6.5, -4], size: [0.9, 1.6], speed: 0.03 },
  // Drifting at the island's height, well clear of it.
  mid: { seed: 59, count: 6, radius: [15, 24], height: [-1.5, 2.5], size: [1.2, 2.2], speed: -0.018 },
  // High fair-weather clouds in the sky.
  high: { seed: 73, count: 7, radius: [28, 55], height: [9, 18], size: [2.4, 4.5], speed: 0.008 },
  // A bank directly above the island the intro camera dives through.
  intro: { seed: 89, count: 9, radius: [10, 12], height: [15, 19], size: [1.8, 3], speed: 0.01, center: [3, 6] },
};
