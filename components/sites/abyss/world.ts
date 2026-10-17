import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* Depth → world mapping                                               */
/* ------------------------------------------------------------------ */

/**
 * The dive is described in metres (0 → 4000) by the page; the scene turns
 * that into a camera path. Shallow water gets more world space per metre so
 * the kelp and fish have room, the long midnight zone is compressed.
 */
const DEPTH_KNOTS: [number, number][] = [
  [0, -2],
  [120, -13],
  [250, -40],
  [1000, -110],
  [4000, -262],
];

export const SHELF_Y = -24;
export const SHELF_EDGE_Z = -45;
export const PLAIN_Y = -272;
const SLOPE = 3;

function piecewise(x: number, knots: [number, number][]) {
  if (x <= knots[0][0]) return knots[0][1];
  for (let i = 0; i < knots.length - 1; i++) {
    const [x0, y0] = knots[i];
    const [x1, y1] = knots[i + 1];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return knots[knots.length - 1][1];
}

/** Camera height (world units) at a given depth in metres. */
export const camY = (m: number) => piecewise(m, DEPTH_KNOTS);

/** Inverse of camY: metres at a given world height. */
export const metresAt = (y: number) =>
  piecewise(
    -y,
    DEPTH_KNOTS.map(([m, wy]) => [-wy, m] as [number, number]),
  );

/**
 * The camera glides forward over the kelp forest, past the edge of the
 * continental shelf, then keeps drifting out so the slope stays behind it.
 */
export function camZ(y: number) {
  if (y >= -2) return 40;
  if (y >= -14) {
    const t = (-2 - y) / 12;
    return 40 - 95 * t * t * (3 - 2 * t);
  }
  return -55 - ((-14 - y) / 248) * 95;
}

/* ------------------------------------------------------------------ */
/* Seafloor                                                            */
/* ------------------------------------------------------------------ */

function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm(x: number, y: number) {
  return valueNoise(x, y) * 0.55 + valueNoise(x * 2.1, y * 2.1) * 0.3 + valueNoise(x * 4.3, y * 4.3) * 0.15;
}

/** Height of the sea floor: flat shelf, steep continental slope, abyssal plain. */
export function floorY(x: number, z: number) {
  const past = SHELF_EDGE_Z - z; // > 0 beyond the shelf edge
  const edge = past <= 0 ? 0 : past < 6 ? (past * past) / 12 : past - 3;
  let base = SHELF_Y - edge * SLOPE;
  base = Math.max(base, PLAIN_Y);
  const n = fbm(x * 0.06 + 11, z * 0.06 - 3);
  const steep = base < SHELF_Y - 1 && base > PLAIN_Y + 1 ? 1 : 0;
  const rough = base >= SHELF_Y - 0.5 ? 1.8 : steep ? 7 : 1.4;
  return base + (n - 0.5) * rough * 2;
}

/* ------------------------------------------------------------------ */
/* Water colour by depth                                               */
/* ------------------------------------------------------------------ */

type WaterStop = { m: number; up: string; mid: string; down: string; fog: number };

const WATER: WaterStop[] = [
  { m: 0, up: "#bff3ff", mid: "#1ba6c9", down: "#0a5a84", fog: 0.021 },
  { m: 120, up: "#56c3e0", mid: "#0f7aa6", down: "#063d63", fog: 0.022 },
  { m: 400, up: "#14608c", mid: "#073557", down: "#021a30", fog: 0.024 },
  { m: 1000, up: "#05223b", mid: "#021120", down: "#010812", fog: 0.026 },
  { m: 2400, up: "#020d1a", mid: "#01070f", down: "#000308", fog: 0.027 },
  { m: 4000, up: "#030b14", mid: "#01050a", down: "#000204", fog: 0.025 },
];

const waterCols = WATER.map((s) => ({
  m: s.m,
  up: new THREE.Color(s.up),
  mid: new THREE.Color(s.mid),
  down: new THREE.Color(s.down),
  fog: s.fog,
}));

/** Writes the water palette for depth `m` into the shared uniforms. */
export function waterAt(m: number, up: THREE.Color, mid: THREE.Color, down: THREE.Color) {
  let i = 0;
  while (i < waterCols.length - 2 && m > waterCols[i + 1].m) i++;
  const a = waterCols[i];
  const b = waterCols[i + 1];
  const t = THREE.MathUtils.clamp((m - a.m) / (b.m - a.m), 0, 1);
  up.copy(a.up).lerp(b.up, t);
  mid.copy(a.mid).lerp(b.mid, t);
  down.copy(a.down).lerp(b.down, t);
  return a.fog + (b.fog - a.fog) * t;
}

/* ------------------------------------------------------------------ */
/* Shared uniforms                                                     */
/* ------------------------------------------------------------------ */

export const TRAIL = 8;

/** One set of uniform objects shared by every material, updated once per frame by the camera rig. */
export const U = {
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color("#1ba6c9") },
  uFogDensity: { value: 0.021 },
  uWaterUp: { value: new THREE.Color("#bff3ff") },
  uWaterDown: { value: new THREE.Color("#0a5a84") },
  /** Daylight left around the camera, 1 at the surface → 0 in the midnight zone. */
  uDay: { value: 1 },
  /** Pointer ray, in world space. */
  uRayOrigin: { value: new THREE.Vector3() },
  uRayDir: { value: new THREE.Vector3(0, 0, -1) },
  /** 0 when the pointer is idle / absent, 1 while it is moving. */
  uStir: { value: 0 },
  /** Recent pointer positions (xyz) and the time they were laid down (w). */
  uTrail: { value: Array.from({ length: TRAIL }, () => new THREE.Vector4(0, 0, 0, -100)) },
  uPixelRatio: { value: 1 },
};

/** The sun as seen from under water (pointing towards it). */
export const SUN_DIR = new THREE.Vector3(0, 0.743, -0.669).normalize();

/* ------------------------------------------------------------------ */
/* GLSL                                                                */
/* ------------------------------------------------------------------ */

export const commonGLSL = /* glsl */ `
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uDay;
  uniform vec3 uRayOrigin;
  uniform vec3 uRayDir;
  uniform float uStir;
  uniform vec3 uWaterUp;
  uniform vec3 uWaterDown;

  // Colour of open water seen along direction d (matches the background dome).
  vec3 waterColor(vec3 d) {
    return d.y > 0.0
      ? mix(uFogColor, uWaterUp, smoothstep(0.0, 0.95, d.y))
      : mix(uFogColor, uWaterDown, smoothstep(0.0, -0.6, d.y));
  }

  float fogFactor(float dist) {
    float f = uFogDensity * dist;
    return clamp(1.0 - exp(-f * f), 0.0, 1.0);
  }

  // Daylight reaching a point at world height y.
  float daylight(float y) {
    return exp(min(y, 0.0) / 24.0);
  }

  // Distance from p to the pointer ray (and how far along the ray it sits).
  vec3 rayOffset(vec3 p, out float along) {
    vec3 v = p - uRayOrigin;
    along = max(dot(v, uRayDir), 0.0);
    return v - uRayDir * along;
  }

  // Tileable water caustic (after Dave Hoskins / joltz0r).
  float caustic(vec2 uv, float time) {
    vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
    vec2 i = p;
    float c = 1.0;
    float inten = 0.005;
    for (int n = 0; n < 4; n++) {
      float t = time * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.0);
  }
`;

/**
 * Shading for solid things (rock, whales, the submarine): daylight from above
 * that fades with depth, caustics in the shallows and a soft "headlamp" from
 * the viewer so the deep isn't pitch black.
 */
export const litGLSL = /* glsl */ `
  vec3 shade(vec3 albedo, vec3 wp, vec3 n, float causticAmt) {
    vec3 V = cameraPosition - wp;
    float dist = length(V);
    V /= dist;
    float day = daylight(wp.y);
    float sky = 0.35 + 0.65 * max(n.y, 0.0);
    vec3 col = albedo * (vec3(0.62, 0.9, 1.0) * sky * day * 1.25 + vec3(0.012, 0.03, 0.05));
    if (causticAmt > 0.0) {
      float c = caustic(wp.xz * 0.07, uTime * 0.55) * smoothstep(0.2, 0.9, n.y);
      col += vec3(0.75, 0.95, 1.0) * c * day * causticAmt * 1.4;
    }
    // Headlamp: the viewer's submersible lighting what is close.
    float lamp = max(dot(n, V), 0.0) * exp(-dist * 0.05) * (1.0 - uDay * 0.85);
    col += albedo * vec3(0.85, 0.92, 1.0) * lamp * 0.9;
    // Rim of scattered light.
    float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    col += uFogColor * rim * 0.35;
    return mix(col, waterColor(-V), fogFactor(dist));
  }
`;

export const litVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;
  void main() {
    vec4 lp = vec4(position, 1.0);
    vec3 n = normal;
    vLocal = position;
    #ifdef USE_INSTANCING
      lp = instanceMatrix * lp;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 wp = modelMatrix * lp;
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/** A plain lit material (optional caustics) sharing the global uniforms. */
export function litMaterial(color: THREE.ColorRepresentation, caustics = 0, side: THREE.Side = THREE.FrontSide) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uAlbedo: { value: new THREE.Color(color) }, uCaustic: { value: caustics } },
    vertexShader: litVertex,
    fragmentShader: /* glsl */ `
      uniform vec3 uAlbedo;
      uniform float uCaustic;
      varying vec3 vWorld;
      varying vec3 vNormal;
      ${commonGLSL}
      ${litGLSL}
      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        gl_FragColor = vec4(shade(uAlbedo, vWorld, n, uCaustic), 1.0);
        #include <colorspace_fragment>
      }
    `,
    side,
  });
}

/** Soft additive glow sprite, used for lures, lamps and running lights. */
export function glowMaterial(color: THREE.ColorRepresentation, strength = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDist;
      void main() {
        vUv = uv;
        // Billboard: keep the quad facing the camera.
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(modelMatrix[0].xyz);
        mv.xy += position.xy * s;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec2 vUv;
      varying float vDist;
      ${commonGLSL}
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float g = exp(-d * d * 5.0) * (1.0 - smoothstep(0.7, 1.0, d));
        float fog = fogFactor(vDist) * 0.6;
        gl_FragColor = vec4(uColor * g * uStrength * (1.0 - fog), 1.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/**
 * Distance from p to the pointer ray (Infinity when behind the camera or the
 * pointer is idle). `out` receives the unit direction pointing away from the ray.
 */
export function rayPush(p: THREE.Vector3, out: THREE.Vector3) {
  if (U.uStir.value < 0.02) return Infinity;
  const o = U.uRayOrigin.value;
  const d = U.uRayDir.value;
  out.copy(p).sub(o);
  const along = out.dot(d);
  if (along < 0) return Infinity;
  out.addScaledVector(d, -along);
  const dist = out.length();
  if (dist > 1e-4) out.multiplyScalar(1 / dist);
  else out.set(0, 1, 0);
  return dist;
}
