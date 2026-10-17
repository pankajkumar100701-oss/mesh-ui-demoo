import * as THREE from "three";
import { createRandom } from "@/lib/random";

/**
 * Procedural botany shared by the hero meadow and the bouquet builder: petal / leaf / stem geometry,
 * the petal layouts of each flower kind, and the materials that morph a petal from bud to bloom on
 * the GPU. Everything here is plain three.js — no React.
 */

export type Kind = "rose" | "tulip" | "peony" | "daisy";
export const KINDS: Kind[] = ["rose", "tulip", "peony", "daisy"];

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Smootherstep progress of `p` between a and b. */
export const seg = (p: number, a: number, b: number) => {
  const t = clamp01((p - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ------------------------------------------------------------------ */
/* Petal geometry                                                       */
/* ------------------------------------------------------------------ */

type PetalShape = {
  /** Length along the midrib. */
  length: number;
  /** Full width at v (0 = base, 1 = tip). */
  width: (v: number) => number;
  /** How much the edges cup in towards the flower's heart. */
  cup: number;
  /** Curvature along the midrib, radians per unit length (+ rolls the tip outwards). */
  curl: number;
  /** Wavy edge amplitude (peonies). */
  ruffle?: number;
};

const P = new THREE.Vector3();

function shapePoint(u: number, v: number, s: PetalShape, out: THREE.Vector3) {
  const w = s.width(v);
  const arc = v * s.length;
  const k = s.curl;
  let y: number;
  let z: number;
  if (Math.abs(k) < 1e-4) {
    y = arc;
    z = 0;
  } else {
    y = Math.sin(k * arc) / k;
    z = (1 - Math.cos(k * arc)) / k;
  }
  // Unit normal of the midrib curve (points away from the flower's centre for k = 0).
  const ny = -Math.sin(k * arc);
  const nz = Math.cos(k * arc);
  const x = u * w * 0.5;
  let off = -s.cup * u * u * w * 0.5;
  if (s.ruffle) off += s.ruffle * Math.sin(u * 7.5 + v * 9) * v * (0.4 + Math.abs(u));
  return out.set(x, y + ny * off, z + nz * off);
}

function buildShape(s: PetalShape, segU: number, segV: number) {
  const g = new THREE.PlaneGeometry(1, 1, segU, segV);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i) * 2 - 1;
    const v = uv.getY(i);
    shapePoint(u, v, s, P);
    pos.setXYZ(i, P.x, P.y, P.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A petal with two poses baked in: `position`/`normal` is the closed bud pose and
 * `position2`/`normal2` the open one. The material blends them by the per-instance `aOpen`.
 */
function morphPetal(
  closed: PetalShape,
  open: PetalShape,
  tint: { base: [number, number, number]; tip: [number, number, number] },
  segU = 6,
  segV = 9,
) {
  const a = buildShape(closed, segU, segV);
  const b = buildShape(open, segU, segV);
  a.setAttribute("position2", b.attributes.position);
  a.setAttribute("normal2", b.attributes.normal);
  const uv = a.attributes.uv as THREE.BufferAttribute;
  const col = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) {
    const v = uv.getY(i);
    const edge = Math.abs(uv.getX(i) * 2 - 1);
    const t = Math.pow(v, 0.7);
    const lift = 1 + 0.06 * edge * v;
    col[i * 3] = lerp(tint.base[0], tint.tip[0], t) * lift;
    col[i * 3 + 1] = lerp(tint.base[1], tint.tip[1], t) * lift;
    col[i * 3 + 2] = lerp(tint.base[2], tint.tip[2], t) * lift;
  }
  a.setAttribute("color", new THREE.BufferAttribute(col, 3));
  b.dispose();
  return a;
}

const roseWidth = (v: number) => 0.18 + 0.86 * Math.pow(Math.sin(Math.PI * (0.1 + 0.78 * Math.pow(v, 0.8))), 0.8);
const tulipWidth = (v: number) => 0.78 * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * v)), 0.55);
const peonyWidth = (v: number) => 0.2 + 1.0 * Math.pow(Math.sin(Math.PI * (0.08 + 0.8 * Math.pow(v, 0.75))), 0.7);
const daisyWidth = (v: number) => 0.17 * Math.pow(Math.sin(Math.PI * (0.04 + 0.9 * v)), 0.45);

export function makePetalGeometry(kind: Kind): THREE.BufferGeometry {
  switch (kind) {
    case "rose":
      return morphPetal(
        { length: 1, width: roseWidth, cup: 1.05, curl: -0.7 },
        { length: 1, width: roseWidth, cup: 0.75, curl: 0.75 },
        { base: [0.8, 0.74, 0.7], tip: [1.04, 1.02, 1.02] },
        8,
        10,
      );
    case "tulip":
      return morphPetal(
        { length: 1.3, width: tulipWidth, cup: 1.25, curl: -0.42 },
        { length: 1.3, width: tulipWidth, cup: 1.0, curl: 0.06 },
        { base: [0.86, 0.85, 0.62], tip: [1.03, 1.0, 1.0] },
        6,
        10,
      );
    case "peony":
      return morphPetal(
        { length: 0.92, width: peonyWidth, cup: 1.1, curl: -0.9, ruffle: 0.04 },
        { length: 0.92, width: peonyWidth, cup: 0.75, curl: 0.3, ruffle: 0.06 },
        { base: [0.74, 0.66, 0.68], tip: [1.05, 1.03, 1.03] },
        8,
        8,
      );
    case "daisy":
      return morphPetal(
        { length: 1, width: daisyWidth, cup: 0.3, curl: -0.9 },
        { length: 1, width: daisyWidth, cup: 0.42, curl: 0.3 },
        { base: [0.95, 0.93, 0.78], tip: [1.02, 1.02, 1.02] },
        2,
        8,
      );
  }
}

/** Lanceolate leaf folded along its midrib and arched. Also used, small, for sepals and grass. */
export function makeLeafGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1, 4, 10);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const k = 0.9;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i) * 2 - 1;
    const v = uv.getY(i);
    const w = 0.36 * Math.pow(Math.sin(Math.PI * (0.03 + 0.95 * v)), 0.85);
    const y = Math.sin(k * v) / k;
    const z0 = (1 - Math.cos(k * v)) / k;
    const fold = -Math.abs(u) * w * 0.32;
    pos.setXYZ(i, u * w * 0.5, y - Math.sin(k * v) * fold, z0 + Math.cos(k * v) * fold);
    const t = 0.72 + 0.28 * v + 0.12 * Math.abs(u);
    col[i * 3] = t * 0.92;
    col[i * 3 + 1] = t;
    col[i * 3 + 2] = t * 0.88;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Unit-height stem, base at y = 0. The vertex shader bends it by `aBend * y²`. */
export function makeStemGeometry(radius = 0.018): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius * 0.85, radius * 1.15, 1, 7, 14, true);
  g.translate(0, 0.5, 0);
  return g;
}

/** Domed flower heart (daisy disc / peony stamens). */
export function makeCenterGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) * 2;
    const r = Math.hypot(pos.getX(i), pos.getZ(i)) * 2;
    // tiny florets: bumpy surface
    const bump = 1 + 0.06 * Math.sin(pos.getX(i) * 60) * Math.sin(pos.getZ(i) * 60);
    pos.setXYZ(i, pos.getX(i) * bump, pos.getY(i) * bump, pos.getZ(i) * bump);
    const c = 0.72 + 0.28 * r + 0.05 * y;
    col[i * 3] = c;
    col[i * 3 + 1] = c * (0.82 + 0.18 * r);
    col[i * 3 + 2] = c * 0.75;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ */
/* Layouts                                                              */
/* ------------------------------------------------------------------ */

export type PetalSlot = {
  az: number;
  tiltClosed: number;
  tiltOpen: number;
  scale: number;
  radius: number;
  lift: number;
  /** 0 = outermost (opens first), 1 = innermost. */
  order: number;
  shade: number;
};

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function layoutFor(kind: Kind): PetalSlot[] {
  const rnd = createRandom(kind.length * 977 + kind.charCodeAt(0));
  const out: PetalSlot[] = [];
  if (kind === "rose") {
    const n = 26;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1); // 0 = heart, 1 = outer
      out.push({
        az: i * GOLDEN * 1.02,
        tiltClosed: 0.04 + 0.22 * f,
        tiltOpen: 0.1 + 1.08 * Math.pow(f, 2) + (rnd() - 0.5) * 0.05,
        scale: 0.3 + 0.7 * Math.pow(f, 0.65),
        radius: 0.015 + 0.09 * f,
        lift: -0.06 * f,
        order: 1 - f,
        shade: 0.82 + 0.18 * f,
      });
    }
  } else if (kind === "peony") {
    const n = 46;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      out.push({
        az: i * GOLDEN + (rnd() - 0.5) * 0.3,
        tiltClosed: 0.12 + 0.32 * f,
        tiltOpen: 0.22 + 0.98 * Math.pow(f, 1.6) + (rnd() - 0.5) * 0.1,
        scale: 0.42 + 0.58 * Math.pow(f, 0.6) + (rnd() - 0.5) * 0.08,
        radius: 0.03 + 0.13 * f,
        lift: -0.09 * f,
        order: 1 - f,
        shade: 0.8 + 0.2 * f,
      });
    }
  } else if (kind === "tulip") {
    for (let i = 0; i < 6; i++) {
      const outer = i < 3;
      out.push({
        az: (i % 3) * ((Math.PI * 2) / 3) + (outer ? 0 : Math.PI / 3),
        tiltClosed: outer ? 0.13 : 0.08,
        tiltOpen: outer ? 0.4 : 0.26,
        scale: outer ? 1 : 0.94,
        radius: 0.035,
        lift: 0,
        order: outer ? 0 : 0.5,
        shade: outer ? 1 : 0.9,
      });
    }
  } else {
    const n = 24;
    for (let i = 0; i < n; i++) {
      const inner = i % 2 === 1;
      out.push({
        az: (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.12,
        tiltClosed: inner ? 0.18 : 0.28,
        tiltOpen: (inner ? 1.32 : 1.5) + (rnd() - 0.5) * 0.12,
        scale: (inner ? 0.9 : 1) + (rnd() - 0.5) * 0.1,
        radius: 0.1,
        lift: inner ? 0.012 : 0,
        order: inner ? 0.35 : 0,
        shade: 1,
      });
    }
  }
  return out;
}

export const LAYOUT: Record<Kind, PetalSlot[]> = {
  rose: layoutFor("rose"),
  tulip: layoutFor("tulip"),
  peony: layoutFor("peony"),
  daisy: layoutFor("daisy"),
};

/** Head scale (petal length in world units) per kind, before any per-flower variation. */
export const HEAD_SCALE: Record<Kind, number> = { rose: 0.36, tulip: 0.3, peony: 0.4, daisy: 0.34 };

/* ------------------------------------------------------------------ */
/* Materials                                                            */
/* ------------------------------------------------------------------ */

/** Petals: blend closed→open pose per instance, and glow softly so they never go muddy. */
export function makePetalMaterial(glow = 0.24) {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.62,
    metalness: 0,
  });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec3 position2;\nattribute vec3 normal2;\nattribute float aOpen;",
      )
      .replace(
        "#include <beginnormal_vertex>",
        "vec3 objectNormal = normalize(mix(normal, normal2, aOpen));\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif",
      )
      .replace("#include <begin_vertex>", "vec3 transformed = mix(position, position2, aOpen);");
    s.fragmentShader = s.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ${glow.toFixed(3)};`,
    );
  };
  m.customProgramCacheKey = () => `bloom-petal-${glow}`;
  return m;
}

/** Stems: bend each instance by its `aBend` (x, z offset at the tip) along a y² curve. */
export function makeStemMaterial(color = "#88a862") {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aBend;")
      .replace(
        "#include <begin_vertex>",
        "vec3 transformed = vec3(position);\ntransformed.xz += aBend * position.y * position.y;",
      );
  };
  m.customProgramCacheKey = () => "bloom-stem";
  return m;
}

export function makeLeafMaterial(glow = 0.1, color = "#ffffff") {
  const m = new THREE.MeshStandardMaterial({
    color,
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.66,
  });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ${glow.toFixed(3)};`,
    );
  };
  m.customProgramCacheKey = () => `bloom-leaf-${glow}`;
  return m;
}

/* ------------------------------------------------------------------ */
/* Flower state                                                         */
/* ------------------------------------------------------------------ */

export type Leaf = { t: number; az: number; tilt: number; size: number };

/** One living flower. Owners set the inputs; the field integrates sway and writes `head`/`gust`. */
export type Flower = {
  kind: Kind;
  color: THREE.Color;
  base: THREE.Vector3;
  height: number;
  /** Static bend of the stem tip (x, z), world units. */
  lean: THREE.Vector2;
  /** Extra direction the head turns towards (added to the stem tangent). */
  face: THREE.Vector3;
  headScale: number;
  spin: number;
  phase: number;
  leaves: Leaf[];
  /** 0..1, stem growth (and bud swelling past ~0.4). */
  grow: number;
  /** 0..1, petals unfurling. */
  open: number;
  // dynamics, owned by the field
  sway: THREE.Vector2;
  swayV: THREE.Vector2;
  head: THREE.Vector3;
  gust: number;
};

export function makeFlower(
  init: Pick<Flower, "kind" | "base" | "height"> & Partial<Omit<Flower, "kind" | "base" | "height">>,
  rnd: () => number,
): Flower {
  const nLeaves = init.kind === "daisy" ? 1 : 2;
  const leaves: Leaf[] =
    init.leaves ??
    Array.from({ length: nLeaves }, (_, i) => ({
      t: 0.22 + i * 0.22 + rnd() * 0.1,
      az: i * Math.PI + rnd() * 1.2,
      tilt: 0.75 + rnd() * 0.35,
      size: (init.kind === "tulip" ? 0.85 : 0.55) + rnd() * 0.2,
    }));
  return {
    color: new THREE.Color("#f4a7b9"),
    lean: new THREE.Vector2(),
    face: new THREE.Vector3(),
    headScale: HEAD_SCALE[init.kind],
    spin: rnd() * Math.PI * 2,
    phase: rnd() * Math.PI * 2,
    grow: 0,
    open: 0,
    ...init,
    leaves,
    sway: new THREE.Vector2(),
    swayV: new THREE.Vector2(),
    head: init.base.clone(),
    gust: 0,
  };
}
