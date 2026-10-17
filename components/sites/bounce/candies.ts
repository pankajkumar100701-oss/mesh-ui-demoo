import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRandom } from "@/lib/random";

/**
 * Procedural candy library. Every candy is baked into ONE merged geometry with
 * vertex colours, so each sweet on screen is a single draw call sharing a
 * single glossy material.
 */

export const PALETTE = ["#ff5c8a", "#ff8fc7", "#ffd23f", "#3ec5ff", "#a78bfa", "#3ddc97", "#ff9a3c"];
export const KINDS = ["wrapped", "bear", "lollipop", "gumball", "bean", "mint", "donut"] as const;
export type Kind = (typeof KINDS)[number];

export type ColliderShape =
  | { type: "ball"; r: number; pos?: [number, number, number] }
  | { type: "capsule"; hh: number; r: number; pos?: [number, number, number]; rot?: [number, number, number] }
  | { type: "cuboid"; he: [number, number, number]; pos?: [number, number, number]; rot?: [number, number, number] }
  | { type: "cylinder"; hh: number; r: number; pos?: [number, number, number]; rot?: [number, number, number] };

export const COLLIDERS: Record<Kind, ColliderShape[]> = {
  wrapped: [
    { type: "ball", r: 0.36 },
    { type: "cuboid", he: [0.8, 0.17, 0.17] },
  ],
  bear: [{ type: "capsule", hh: 0.24, r: 0.31, pos: [0, 0.02, 0] }],
  lollipop: [
    { type: "cylinder", hh: 0.11, r: 0.56, rot: [Math.PI / 2, 0, 0] },
    { type: "cuboid", he: [0.05, 0.5, 0.05], pos: [0, -1.0, 0] },
  ],
  gumball: [{ type: "ball", r: 0.38 }],
  bean: [{ type: "capsule", hh: 0.2, r: 0.22, rot: [0, 0, Math.PI / 2] }],
  mint: [{ type: "cylinder", hh: 0.1, r: 0.42, rot: [Math.PI / 2, 0, 0] }],
  donut: [{ type: "cylinder", hh: 0.22, r: 0.68, rot: [Math.PI / 2, 0, 0] }],
};

/** Relative frequency of each kind in a shower. */
const WEIGHTS: Record<Kind, number> = {
  wrapped: 3,
  bear: 3,
  lollipop: 1.4,
  gumball: 3,
  bean: 2.4,
  mint: 2,
  donut: 1.2,
};

export function pickKind(r: number): Kind {
  const total = KINDS.reduce((s, k) => s + WEIGHTS[k], 0);
  let x = r * total;
  for (const k of KINDS) {
    x -= WEIGHTS[k];
    if (x <= 0) return k;
  }
  return "gumball";
}

/* ---------- geometry helpers ---------- */

const tmpColor = new THREE.Color();

/** Non-indexed, uv-less copy of `g` painted a single colour. */
function paint(g: THREE.BufferGeometry, hex: string) {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute("uv");
  tmpColor.set(hex);
  const n = out.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) tmpColor.toArray(colors, i * 3);
  out.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return out;
}

/** Paints each triangle with `pick(centroid)` so stripes stay crisp. */
function paintFaces(g: THREE.BufferGeometry, pick: (c: THREE.Vector3) => string) {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute("uv");
  const pos = out.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    c.set(
      (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3,
      (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3,
      (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3,
    );
    tmpColor.set(pick(c));
    for (let k = 0; k < 3; k++) tmpColor.toArray(colors, (t + k) * 3);
  }
  out.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return out;
}

/** A thick disc facing +z built from rings so the faces can carry a swirl. */
function swirlDisc(radius: number, depth: number, pick: (angle: number, r: number) => string) {
  const front = new THREE.RingGeometry(0.0001, radius, 64, 8);
  front.translate(0, 0, depth / 2);
  const back = new THREE.RingGeometry(0.0001, radius, 64, 8);
  back.rotateY(Math.PI);
  back.translate(0, 0, -depth / 2);
  const side = new THREE.CylinderGeometry(radius, radius, depth, 64, 1, true);
  side.rotateX(Math.PI / 2);
  const parts = [front, back, side].map((g) =>
    paintFaces(g, (c) => pick(Math.atan2(c.y, c.x), Math.hypot(c.x, c.y))),
  );
  // Soft rounded rim so the edge catches the clearcoat.
  const rim = new THREE.TorusGeometry(radius, depth / 2, 10, 64);
  parts.push(paintFaces(rim, (c) => pick(Math.atan2(c.y, c.x), radius)));
  return parts;
}

function stripe(angle: number, count: number, twist = 0, r = 0) {
  const a = (angle + Math.PI * 2 + r * twist) / (Math.PI * 2);
  return Math.floor(a * count) % 2 === 0;
}

/* ---------- builders ---------- */

function buildWrapped(main: string, accent: string) {
  // Pole along x so the stripes run neatly along the sweet.
  const body = new THREE.SphereGeometry(0.36, 32, 20);
  body.rotateZ(Math.PI / 2);
  body.scale(1.28, 0.92, 0.92);
  const parts = [paintFaces(body, (c) => (stripe(Math.atan2(c.z, c.y), 8) ? main : accent))];
  for (const side of [-1, 1]) {
    const bow = new THREE.ConeGeometry(0.27, 0.4, 16, 1);
    bow.rotateZ((side * Math.PI) / 2);
    bow.translate(side * 0.64, 0, 0);
    parts.push(paint(bow, accent));
    const knot = new THREE.SphereGeometry(0.09, 12, 8);
    knot.translate(side * 0.47, 0, 0);
    parts.push(paint(knot, accent));
  }
  return parts;
}

function buildBear(main: string) {
  const blobs: [number, number, number, number, number, number][] = [
    // x, y, z, sx, sy, sz (radius 1 spheres)
    [0, -0.14, 0, 0.3, 0.34, 0.24], // belly
    [0, 0.27, 0, 0.24, 0.22, 0.21], // head
    [-0.17, 0.45, 0, 0.09, 0.09, 0.07], // ears
    [0.17, 0.45, 0, 0.09, 0.09, 0.07],
    [0, 0.22, 0.17, 0.1, 0.075, 0.07], // snout
    [-0.29, 0.0, 0.02, 0.1, 0.13, 0.09], // arms
    [0.29, 0.0, 0.02, 0.1, 0.13, 0.09],
    [-0.16, -0.43, 0.04, 0.12, 0.11, 0.1], // feet
    [0.16, -0.43, 0.04, 0.12, 0.11, 0.1],
  ];
  return blobs.map(([x, y, z, sx, sy, sz]) => {
    const g = new THREE.SphereGeometry(1, 20, 14);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    return paint(g, main);
  });
}

function buildLollipop(main: string, accent: string) {
  const parts = swirlDisc(0.5, 0.2, (a, r) => (stripe(a, 6, 7, r) ? main : accent));
  const stick = new THREE.CylinderGeometry(0.045, 0.045, 1.05, 10);
  stick.translate(0, -1.0, 0);
  parts.push(paint(stick, "#fff8ef"));
  return parts;
}

function buildGumball(main: string) {
  return [paint(new THREE.SphereGeometry(0.38, 36, 24), main)];
}

function buildBean(main: string) {
  const g = new THREE.CapsuleGeometry(0.21, 0.4, 10, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + 0.55 * y * y - 0.08); // kidney bend
  }
  g.computeVertexNormals();
  g.rotateZ(Math.PI / 2);
  return [paint(g, main)];
}

function buildMint(main: string) {
  return swirlDisc(0.36, 0.16, (a) => (stripe(a, 10) ? main : "#ffffff"));
}

const sprinkleCache: { geo?: THREE.BufferGeometry } = {};
function sprinkles() {
  if (sprinkleCache.geo) return sprinkleCache.geo.clone();
  const rand = createRandom(7);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 24; i++) {
    const g = new THREE.CapsuleGeometry(0.026, 0.09, 2, 6);
    const angle = rand() * Math.PI * 2;
    const r = 0.32 + rand() * 0.26;
    g.rotateZ(rand() * Math.PI);
    g.rotateX(Math.PI / 2 + (rand() - 0.5) * 0.6);
    g.translate(Math.cos(angle) * r, Math.sin(angle) * r, 0.28);
    parts.push(paint(g, ["#ffffff", "#ffd23f", "#3ec5ff", "#a78bfa", "#3ddc97"][Math.floor(rand() * 5)]));
  }
  sprinkleCache.geo = mergeGeometries(parts)!;
  return sprinkleCache.geo.clone();
}

function buildDonut(main: string) {
  const dough = new THREE.TorusGeometry(0.45, 0.22, 18, 40);
  const icing = new THREE.TorusGeometry(0.46, 0.235, 18, 40);
  icing.scale(1, 1, 0.75);
  icing.translate(0, 0, 0.06);
  return [paint(dough, "#f1c27d"), paint(icing, main), sprinkles()];
}

const cache = new Map<string, THREE.BufferGeometry>();

export function candyGeometry(kind: Kind, main: string, accent: string) {
  const key = `${kind}|${main}|${accent}`;
  let g = cache.get(key);
  if (!g) {
    let parts: THREE.BufferGeometry[];
    switch (kind) {
      case "wrapped":
        parts = buildWrapped(main, accent);
        break;
      case "bear":
        parts = buildBear(main);
        break;
      case "lollipop":
        parts = buildLollipop(main, accent);
        break;
      case "gumball":
        parts = buildGumball(main);
        break;
      case "bean":
        parts = buildBean(main);
        break;
      case "mint":
        parts = buildMint(main);
        break;
      case "donut":
        parts = buildDonut(main);
        break;
    }
    g = mergeGeometries(parts)!;
    g.computeBoundingSphere();
    cache.set(key, g);
  }
  return g;
}

let candyMaterial: THREE.MeshPhysicalMaterial | null = null;
/** One glossy, clear-coated, sheened material shared by every candy. */
export function getCandyMaterial(lite: boolean) {
  if (!candyMaterial) {
    candyMaterial = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      sheen: lite ? 0 : 0.35,
      sheenRoughness: 0.35,
      sheenColor: new THREE.Color("#ffffff"),
      envMapIntensity: 1.1,
    });
  }
  return candyMaterial;
}
