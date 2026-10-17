import type { RefObject } from "react";
import * as THREE from "three";

/** 0 = golden afternoon, 0.5 = sunset, 1 = moonlit night. Shared by every animated part. */
export type Mix = RefObject<number>;

/** "high" on capable desktops, "low" on phones or once the frame rate dips. */
export type Quality = "high" | "low";

export const PALETTE = {
  grass: "#86c95f",
  grassDark: "#5fae55",
  grassLight: "#a4d96c",
  sand: "#f0d9a4",
  rock: "#a48b74",
  rockDark: "#76604f",
  rockDeep: "#4f4256",
  wood: "#cf9055",
  roof: "#b4473a",
  pine: "#3f9160",
  pineDark: "#2f7a52",
  leaf: "#93d36a",
  leafWarm: "#c9d65a",
  blossom: "#f6a6b8",
  trunk: "#7a5236",
  stone: "#ebe2cf",
  water: "#53d6cf",
};

/* Island positions (island-local; the whole island bobs gently on y). */
export const CABIN = new THREE.Vector3(1.4, 0.4, -1.4);
export const POOL = new THREE.Vector3(1.2, 0.4, 1.6);
export const TIER = new THREE.Vector3(-1.6, 0.4, -1.2);
export const FALLS = new THREE.Vector3(-3.6, 0.4, 1.8);
export const DOCK = new THREE.Vector3(2.75, 0.4, 2.75);
export const STREAM_START = new THREE.Vector3(-2.1, 0.41, 0.45);

/* Sky directions. The sun sits low over the left of the opening shot. */
export const SUN_DIR_DAY = new THREE.Vector3(-0.85, 0.005, -0.5).normalize();
export const SUN_DIR_SET = new THREE.Vector3(-0.86, -0.08, -0.5).normalize();
export const MOON_DIR = new THREE.Vector3(-0.574, 0.06, -0.819).normalize();

/**
 * Uniform values shared by every custom shader (sky, cloud sea, cloud puffs,
 * particles). AtmosphereDriver writes them once per frame; materials hold the
 * same objects so nothing has to be copied around.
 */
export const ATMOS = {
  uTime: { value: 0 },
  uMix: { value: 0 },
  uSunDir: { value: SUN_DIR_DAY.clone() },
  uMoonDir: { value: MOON_DIR.clone() },
  uZenith: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uGlow: { value: new THREE.Color() },
  uCloudLit: { value: new THREE.Color() },
  uCloudShade: { value: new THREE.Color() },
  uFogColor: { value: new THREE.Color() },
  uFogNear: { value: 34 },
  uFogFar: { value: 190 },
  uPixelRatio: { value: 1 },
};

const c = (hex: string) => new THREE.Color(hex);

/** Three key frames of the day: golden afternoon, sunset, night. */
export const SKY_KEYS = {
  zenith: [c("#3f86d6"), c("#33397e"), c("#040a22")],
  horizon: [c("#f9c896"), c("#ff8c5a"), c("#1a2a5c")],
  glow: [c("#ffae55"), c("#ff6236"), c("#8ea8ff")],
  cloudLit: [c("#fff4e2"), c("#ffbb8e"), c("#5d6eb0")],
  cloudShade: [c("#8f9bd0"), c("#6d4f8f"), c("#0c1236")],
  fog: [c("#f7cfa6"), c("#e98571"), c("#17244f")],
  sun: [c("#ffe2b0"), c("#ffa36a"), c("#a9bcff")],
  hemiSky: [c("#dceeff"), c("#ffb08a"), c("#33448a")],
  hemiGround: [c("#7b8f52"), c("#6a4a5a"), c("#0e1424")],
};

/** Blends three keys: 0 -> a, 0.5 -> b, 1 -> c. */
export function tri(keys: THREE.Color[], m: number, out: THREE.Color) {
  if (m < 0.5) return out.lerpColors(keys[0], keys[1], m * 2);
  return out.lerpColors(keys[1], keys[2], (m - 0.5) * 2);
}

/** Bell curve that peaks at sunset (m = 0.5). */
export const dusk = (m: number) => Math.max(0, 1 - Math.abs(m - 0.5) * 2);

export function damp(current: number, target: number, speed: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

/**
 * Pushes every vertex by a hash of its own position, so duplicated seam
 * vertices move together and the low-poly mesh stays watertight.
 */
export function jitter(geo: THREE.BufferGeometry, amount: number, seed: number, keepTop?: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const hash = (x: number, y: number, z: number, k: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 13.3 + k * 51.9) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  for (let i = 0; i < pos.count; i++) {
    const x = Math.round(pos.getX(i) * 1000) / 1000;
    const y = Math.round(pos.getY(i) * 1000) / 1000;
    const z = Math.round(pos.getZ(i) * 1000) / 1000;
    const lockY = keepTop !== undefined && y >= keepTop;
    pos.setXYZ(
      i,
      x + hash(x, y, z, 1) * amount,
      lockY ? y : y + hash(x, y, z, 2) * amount * 0.6,
      z + hash(x, y, z, 3) * amount,
    );
  }
  geo.computeVertexNormals();
  return geo;
}

/** GLSL value noise + fbm, shared by the cloud shaders. */
export const NOISE_GLSL = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < OCTAVES; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      a *= 0.5;
    }
    return v;
  }
`;

/** Soft round glowing point sprite, used by fireflies, spray and mist. */
export const SOFT_POINT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    float a = smoothstep(0.5, 0.0, r);
    a *= a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a * vAlpha);
  }
`;

/**
 * Colour of the sky right at the horizon in a given view direction. Distant
 * clouds fade into this instead of a flat fog colour, so the cloud sea melts
 * into the sky with no seam. Needs uHorizon, uGlow, uSunDir, uMoonDir and uMix.
 */
export const HORIZON_GLSL = /* glsl */ `
  vec3 horizonColor(vec3 dir) {
    vec3 sd = normalize(uSunDir);
    float sh = max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(sd.x, 0.0, sd.z))), 0.0);
    float s = max(dot(normalize(dir), sd), 0.0);
    float sunVis = 1.0 - smoothstep(0.55, 0.85, uMix);
    float ms = max(dot(normalize(dir), normalize(uMoonDir)), 0.0);
    float moonVis = smoothstep(0.55, 0.95, uMix);
    return uHorizon + uGlow * (0.08 + pow(sh, 4.0) * 0.38) * (1.0 - uMix * 0.75) + uGlow * pow(s, 8.0) * 0.35 * sunVis
      + vec3(0.72, 0.8, 1.0) * pow(ms, 40.0) * 0.3 * moonVis;
  }
`;
