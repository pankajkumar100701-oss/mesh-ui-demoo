import * as THREE from "three";

/** "high" on capable desktops, "low" on phones or once the frame rate dips. */
export type Quality = "high" | "low";

/**
 * Live scene state written once per frame by the drivers in Scene.tsx and read by everything that
 * animates. Plain mutable module state keeps the 60fps loop out of React.
 */
export const ENV = {
  /** Time of day, 0 = dawn, 1 = neon dusk. */
  t: 0.05,
  /** 0..1, how many windows, lamps and headlights are on. */
  lights: 0,
  /** Seconds since the city started assembling. */
  build: 0,
  /** Traffic speed multiplier (lower with reduced motion). */
  pace: 1,
};

/** Uniform objects shared by every custom shader, so one write updates them all. */
export const U = {
  uTime: { value: 0 },
  uLights: { value: 0 },
  uSunDir: { value: new THREE.Vector3(1, 0.3, 0.4).normalize() },
  uSunColor: { value: new THREE.Color("#ffd2a8") },
  uZenith: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uGlass: { value: new THREE.Color() },
  uWater: { value: new THREE.Color() },
  uWaterDeep: { value: new THREE.Color() },
  uNeon: { value: 0 },
};

const c = (hex: string) => new THREE.Color(hex);

type Key = {
  at: number;
  zenith: THREE.Color;
  horizon: THREE.Color;
  sun: THREE.Color;
  sunI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  fog: THREE.Color;
  glass: THREE.Color;
  water: THREE.Color;
};

/** Dawn, midday, golden hour, sunset and neon dusk. */
const KEYS: Key[] = [
  {
    at: 0,
    zenith: c("#56609e"),
    horizon: c("#f6b49c"),
    sun: c("#ffb38a"),
    sunI: 1.5,
    hemiSky: c("#c9c4ec"),
    hemiGround: c("#6a5866"),
    hemiI: 1.05,
    fog: c("#e9b4a7"),
    glass: c("#7d7fb0"),
    water: c("#8a8fc0"),
  },
  {
    at: 0.34,
    zenith: c("#3b8ee2"),
    horizon: c("#cfe7f6"),
    sun: c("#fff3df"),
    sunI: 2.3,
    hemiSky: c("#d6e8fb"),
    hemiGround: c("#7f8a68"),
    hemiI: 0.85,
    fog: c("#cfe2ef"),
    glass: c("#6f9ec4"),
    water: c("#3aa2c4"),
  },
  {
    at: 0.68,
    zenith: c("#5079c4"),
    horizon: c("#ffd29c"),
    sun: c("#ffc98c"),
    sunI: 2.5,
    hemiSky: c("#f4e6d8"),
    hemiGround: c("#8a7a62"),
    hemiI: 1,
    fog: c("#f2d8b8"),
    glass: c("#c89a70"),
    water: c("#5e8fb0"),
  },
  {
    at: 0.84,
    zenith: c("#2b2d72"),
    horizon: c("#ff7a5c"),
    sun: c("#ff6a45"),
    sunI: 1.35,
    hemiSky: c("#d59ab0"),
    hemiGround: c("#4a2f45"),
    hemiI: 0.8,
    fog: c("#c76a77"),
    glass: c("#7a4f7e"),
    water: c("#6b4f8f"),
  },
  {
    at: 1,
    zenith: c("#090a2c"),
    horizon: c("#6d2c8c"),
    sun: c("#8f8cff"),
    sunI: 0.42,
    hemiSky: c("#4b4aa0"),
    hemiGround: c("#170f2c"),
    hemiI: 0.62,
    fog: c("#2f1a4f"),
    glass: c("#1b1d44"),
    water: c("#1a1846"),
  },
];

export type EnvSample = {
  zenith: THREE.Color;
  horizon: THREE.Color;
  sun: THREE.Color;
  sunI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  fog: THREE.Color;
  glass: THREE.Color;
  water: THREE.Color;
};

export function makeSample(): EnvSample {
  return {
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    sun: new THREE.Color(),
    sunI: 1,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiI: 1,
    fog: new THREE.Color(),
    glass: new THREE.Color(),
    water: new THREE.Color(),
  };
}

/** Blends the two keys around t into `out`. */
export function sampleEnv(t: number, out: EnvSample) {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].at) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = THREE.MathUtils.smootherstep(t, a.at, b.at);
  out.zenith.lerpColors(a.zenith, b.zenith, k);
  out.horizon.lerpColors(a.horizon, b.horizon, k);
  out.sun.lerpColors(a.sun, b.sun, k);
  out.hemiSky.lerpColors(a.hemiSky, b.hemiSky, k);
  out.hemiGround.lerpColors(a.hemiGround, b.hemiGround, k);
  out.fog.lerpColors(a.fog, b.fog, k);
  out.glass.lerpColors(a.glass, b.glass, k);
  out.water.lerpColors(a.water, b.water, k);
  out.sunI = THREE.MathUtils.lerp(a.sunI, b.sunI, k);
  out.hemiI = THREE.MathUtils.lerp(a.hemiI, b.hemiI, k);
  return out;
}

/** Rises in the east (+x) at dawn, peaks around midday, dips under the western horizon at neon dusk. */
export function sunDirection(t: number, out: THREE.Vector3) {
  const a = Math.PI * (0.04 + (1 - Math.pow(1 - t, 1.4)));
  return out.set(Math.cos(a), Math.sin(a) * 0.95, 0.42).normalize();
}

/** Windows, lamps and headlights: on at dusk, a few still on at dawn. */
export function lightsFor(t: number) {
  const evening = THREE.MathUtils.smoothstep(t, 0.72, 0.95);
  const morning = (1 - THREE.MathUtils.smoothstep(t, 0.02, 0.15)) * 0.55;
  return Math.max(evening, morning);
}

/** Springy rise: overshoots ~12% then settles. */
export function springy(x: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return 1 - Math.exp(-6 * x) * Math.cos(9 * x);
}

/** Writes a uniform-style `{ value }` holder (a function so React's compiler lint accepts it in frame loops). */
export function setUniform(u: { value: number }, v: number) {
  u.value = v;
  return v;
}

export function damp(current: number, target: number, speed: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

/* ------------------------------------------------------------------ */
/* Building material: facade + procedural windows that light at dusk   */
/* ------------------------------------------------------------------ */

const BUILDING_COMMON = /* glsl */ `
  varying vec3 vWPos;
  varying vec3 vWNrm;
  uniform float uLights;
  uniform vec3 uGlass;
  uniform float uHi;
  uniform vec3 uHiColor;
  uniform float uFloor;
  float bHash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
`;

/**
 * A MeshStandardMaterial with procedural windows on every vertical face. Window cells are laid out in
 * world space, so any box, cylinder or twisted stack gets floors for free. Windows read as glass by
 * day (tinted by the sky) and switch on one by one as `uLights` rises. Works on instanced meshes
 * (instance colours tint the facade) and on plain meshes.
 */
export function makeBuildingMaterial(color = "#ffffff", hiColor = "#fb923c", floorH = 0.17) {
  const hi = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0.04 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = U.uLights;
    shader.uniforms.uGlass = U.uGlass;
    shader.uniforms.uHi = hi;
    shader.uniforms.uHiColor = { value: new THREE.Color(hiColor) };
    shader.uniforms.uFloor = { value: floorH };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNrm;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 bwp = vec4(transformed, 1.0);
        vec3 bwn = objectNormal;
        #ifdef USE_INSTANCING
          bwp = instanceMatrix * bwp;
          bwn = mat3(instanceMatrix) * bwn;
        #endif
        bwp = modelMatrix * bwp;
        vWPos = bwp.xyz;
        vWNrm = normalize(mat3(modelMatrix) * bwn);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${BUILDING_COMMON}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 bn = normalize(vWNrm);
        float bSide = 1.0 - smoothstep(0.4, 0.6, abs(bn.y));
        vec2 bTan = normalize(vec2(-bn.z, bn.x) + vec2(1e-5));
        float bPlane = floor(dot(vWPos.xz, normalize(bn.xz + vec2(1e-5))) * 3.0);
        vec2 bUv = vec2(dot(vWPos.xz, bTan) / 0.19, (vWPos.y - 0.08) / uFloor);
        vec2 bCell = floor(bUv);
        vec2 bF = fract(bUv);
        vec2 bW = fwidth(bUv) * 0.8;
        float bWin = smoothstep(0.2 - bW.x, 0.2 + bW.x, bF.x) * (1.0 - smoothstep(0.8 - bW.x, 0.8 + bW.x, bF.x))
          * smoothstep(0.26 - bW.y, 0.26 + bW.y, bF.y) * (1.0 - smoothstep(0.84 - bW.y, 0.84 + bW.y, bF.y));
        // Far away the grid would shimmer, so fade it to its average coverage.
        float bFar = smoothstep(0.22, 0.45, max(bW.x, bW.y));
        bWin = mix(bWin, 0.36, bFar) * bSide * step(1.0, bUv.y);
        float bR = bHash(vec3(bCell, bPlane + dot(bn, vec3(1.0, 7.0, 13.0))));
        float bLit = step(bR, uLights * 0.5);
        vec3 bWarm = mix(vec3(1.0, 0.7, 0.4), vec3(0.72, 0.86, 1.0), step(0.78, fract(bR * 7.13)));
        bWarm = mix(bWarm, vec3(1.0, 0.45, 0.85), step(0.93, fract(bR * 13.7)) * uLights);
        float bShade = 0.75 + 0.5 * fract(bR * 3.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, uGlass * bShade, bWin * 0.85);
        diffuseColor.rgb *= mix(1.0, 1.1, step(0.6, bn.y));`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.22, bWin);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += bWarm * bWin * bLit * uLights * 1.7 * mix(1.0, 0.5, bFar);
        totalEmissiveRadiance += uHiColor * uHi * (0.25 + 0.45 * bWin + 0.3 * step(0.6, bn.y));`,
      );
  };
  return { material: mat, hi };
}
