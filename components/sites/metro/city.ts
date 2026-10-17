import * as THREE from "three";
import { createRandom } from "@/lib/random";
import { PROJECTS, type Project } from "./data";

/*
 * The whole city is laid out once, deterministically, from a seeded PRNG. Units are arbitrary
 * "model" units: blocks are 4 x 4, roads 1 wide, a floor is 0.17 tall.
 */

export const X_ROADS = [-17.5, -12.5, -7.5, -2.5, 2.5, 7.5, 12.5, 17.5];
export const Z_ROADS = [-15, -10, -5, 0, 6, 11, 16];
/** Pairs of road lines that enclose a row of blocks (none across the river). */
const Z_ROWS: [number, number][] = [
  [-15, -10],
  [-10, -5],
  [-5, 0],
  [6, 11],
  [11, 16],
];
export const RIVER = { z0: 0.9, z1: 5.1, mid: 3 };
export const BRIDGES_X = [-12.5, 2.5, 12.5];
export const SLAB = { x0: -20.6, x1: 20.6, z0: -18.2, z1: 19.2, depth: 0.5 };
export const ROADS = { x0: -18, x1: 18, z0: -15.5, z1: 16.5 };
export const ROAD_W = 1;
export const KERB_H = 0.08;
export const BRIDGE_TOP = 0.16;
export const DOWNTOWN = new THREE.Vector2(0, -6);

export type BlockKind = "build" | "park" | "plaza" | "featured";

export type Block = {
  x: number;
  z: number;
  size: number;
  kind: BlockKind;
  delay: number;
  project?: Project;
};

export type Building = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** Index of the building this one sits on (a set-back tier), or -1. */
  parent: number;
  color: THREE.Color;
  delay: number;
  /** Neon crown colour, if this roof gets one. */
  crown: THREE.Color | null;
};

export type Tree = { x: number; z: number; s: number; delay: number; tint: THREE.Color };
export type Lamp = { x: number; z: number };
export type Dash = { x: number; z: number; along: "x" | "z" };

const FACADES = ["#ece4d6", "#ddd0bd", "#cdbca9", "#bcc6cc", "#e6d8c3", "#d3cbc2", "#aeb9b1", "#dcbca4", "#f4efe6", "#c4c9d8"];
const NEON = ["#ff3fb4", "#22d3ee", "#f97316", "#a78bfa", "#facc15"];
const LEAVES = ["#6fae5b", "#83bd62", "#5e9e57", "#94c56a", "#7fb06a"];

const PARKS: [number, number][] = [
  [5, -12.5],
  [-15, 13.5],
  [15, 8.5],
  [-15, -2.5],
];
const PLAZAS: [number, number][] = [[0, 8.5]];

const same = (a: [number, number], x: number, z: number) => Math.abs(a[0] - x) < 0.01 && Math.abs(a[1] - z) < 0.01;

/** How long each element takes to spring up, in seconds. */
export const RISE = 0.95;

function delayFor(x: number, z: number, jitter: number) {
  const d = Math.hypot(x - DOWNTOWN.x, z - DOWNTOWN.y);
  return 0.35 + (d / 26) * 2.3 + jitter * 0.45;
}

export type CityLayout = {
  blocks: Block[];
  buildings: Building[];
  trees: Tree[];
  lamps: Lamp[];
  dashes: Dash[];
};

export function buildCity(): CityLayout {
  const random = createRandom(2031);
  const blocks: Block[] = [];
  const buildings: Building[] = [];
  const trees: Tree[] = [];
  const lamps: Lamp[] = [];
  const dashes: Dash[] = [];

  const leaf = () => new THREE.Color(LEAVES[Math.floor(random() * LEAVES.length)]);

  for (let i = 0; i < X_ROADS.length - 1; i++) {
    for (const [za, zb] of Z_ROWS) {
      const x = (X_ROADS[i] + X_ROADS[i + 1]) / 2;
      const z = (za + zb) / 2;
      const size = 5 - ROAD_W;
      const project = PROJECTS.find((p) => same(p.block, x, z));
      const kind: BlockKind = project
        ? "featured"
        : PARKS.some((p) => same(p, x, z))
          ? "park"
          : PLAZAS.some((p) => same(p, x, z))
            ? "plaza"
            : "build";
      const delay = delayFor(x, z, random()) - 0.3;
      blocks.push({ x, z, size, kind, delay, project });

      // Street lamps on every block corner.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) lamps.push({ x: x + sx * (size / 2 - 0.12), z: z + sz * (size / 2 - 0.12) });

      if (kind === "park") {
        const n = 16;
        for (let k = 0; k < n; k++) {
          const tx = x + (random() - 0.5) * (size - 0.7);
          const tz = z + (random() - 0.5) * (size - 0.7);
          // Leave the crossing paths clear.
          if (Math.abs(tx - x) < 0.28 || Math.abs(tz - z) < 0.28) continue;
          trees.push({ x: tx, z: tz, s: 0.75 + random() * 0.55, delay: delay + 0.4 + random() * 0.5, tint: leaf() });
        }
        continue;
      }
      if (kind === "plaza") {
        for (const sx of [-1, 1])
          for (const sz of [-1, 1])
            trees.push({ x: x + sx * 1.45, z: z + sz * 1.45, s: 0.8, delay: delay + 0.5, tint: leaf() });
        continue;
      }
      if (kind === "featured") {
        for (const sx of [-1, 1])
          for (const sz of [-1, 1])
            trees.push({ x: x + sx * 1.6, z: z + sz * 1.6, s: 0.6 + random() * 0.2, delay: delay + 0.6, tint: leaf() });
        continue;
      }

      // Split the block into lots. Downtown favours single towers, the edges favour terraces of four.
      const dist = Math.hypot(x - DOWNTOWN.x, z - DOWNTOWN.y);
      const tall = Math.exp(-(dist * dist) / 140);
      const r = random();
      const split = tall > 0.45 && r < 0.45 ? 1 : r < 0.75 ? 2 : 3;
      const inner = size - 0.5;
      const lots: { x: number; z: number; w: number; d: number }[] = [];
      if (split === 1) lots.push({ x, z, w: inner, d: inner });
      else if (split === 2) {
        const alongX = random() < 0.5;
        for (const s of [-1, 1])
          lots.push(
            alongX
              ? { x: x + (s * inner) / 4, z, w: inner / 2, d: inner }
              : { x, z: z + (s * inner) / 4, w: inner, d: inner / 2 },
          );
      } else {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) lots.push({ x: x + (sx * inner) / 4, z: z + (sz * inner) / 4, w: inner / 2, d: inner / 2 });
      }

      for (const lot of lots) {
        const gap = 0.16;
        const w = (lot.w - gap) * (0.78 + random() * 0.22);
        const d = (lot.d - gap) * (0.78 + random() * 0.22);
        const lx = lot.x + (lot.w - gap - w) * (random() - 0.5);
        const lz = lot.z + (lot.d - gap - d) * (random() - 0.5);
        const base = 0.34 + random() * 0.75;
        const towerish = split === 1 ? 1.35 : split === 2 ? 1 : 0.55;
        const h = base + tall * (1.2 + random() * 4.6) * towerish;
        const bDelay = delayFor(lx, lz, random());
        const idx = buildings.length;
        const crown = h > 1.5 && random() < 0.5 ? new THREE.Color(NEON[Math.floor(random() * NEON.length)]) : null;
        buildings.push({
          x: lx,
          z: lz,
          w,
          d,
          h,
          parent: -1,
          color: new THREE.Color(FACADES[Math.floor(random() * FACADES.length)]),
          delay: bDelay,
          crown: null,
        });
        if (h > 2 && random() < 0.6) {
          // A set-back tier on top, like the stepped towers of an old downtown.
          const k = 0.55 + random() * 0.2;
          buildings.push({
            x: lx,
            z: lz,
            w: w * k,
            d: d * k,
            h: h * (0.18 + random() * 0.22),
            parent: idx,
            color: buildings[idx].color.clone().offsetHSL(0, 0, random() < 0.5 ? 0.04 : -0.05),
            delay: bDelay + 0.3,
            crown,
          });
        } else {
          buildings[idx].crown = crown;
        }
      }
    }
  }

  // Promenade trees along both river banks (skipping the bridges).
  for (let x = -19.6; x <= 19.6; x += 1.15) {
    if (BRIDGES_X.some((b) => Math.abs(b - x) < 0.9)) continue;
    for (const z of [RIVER.z0 - 0.2, RIVER.z1 + 0.2]) {
      trees.push({ x, z, s: 0.5 + random() * 0.15, delay: delayFor(x, z, random()), tint: leaf() });
    }
  }

  // Green verge trees around the edge of the model, outside the train loop.
  for (let k = 0; k < 70; k++) {
    const side = Math.floor(random() * 4);
    const u = random();
    const inset = 0.25 + random() * 0.35;
    let x = 0;
    let z = 0;
    if (side === 0) [x, z] = [THREE.MathUtils.lerp(SLAB.x0 + 0.4, SLAB.x1 - 0.4, u), SLAB.z0 + inset];
    else if (side === 1) [x, z] = [THREE.MathUtils.lerp(SLAB.x0 + 0.4, SLAB.x1 - 0.4, u), SLAB.z1 - inset];
    else if (side === 2) [x, z] = [SLAB.x0 + inset, THREE.MathUtils.lerp(SLAB.z0 + 0.4, SLAB.z1 - 0.4, u)];
    else [x, z] = [SLAB.x1 - inset, THREE.MathUtils.lerp(SLAB.z0 + 0.4, SLAB.z1 - 0.4, u)];
    if (z > RIVER.z0 - 0.3 && z < RIVER.z1 + 0.3) continue;
    trees.push({ x, z, s: 0.55 + random() * 0.35, delay: delayFor(x, z, random()), tint: leaf() });
  }

  // Centre-line dashes, skipping junctions and the river.
  for (const x of X_ROADS) {
    for (let z = ROADS.z0 + 0.4; z < ROADS.z1 - 0.3; z += 0.6) {
      if (Z_ROADS.some((zr) => Math.abs(zr - z) < 0.65)) continue;
      if (z > RIVER.z0 - 0.5 && z < RIVER.z1 + 0.5) continue;
      dashes.push({ x, z, along: "z" });
    }
  }
  for (const z of Z_ROADS) {
    for (let x = ROADS.x0 + 0.4; x < ROADS.x1 - 0.3; x += 0.6) {
      if (X_ROADS.some((xr) => Math.abs(xr - x) < 0.65)) continue;
      dashes.push({ x, z, along: "x" });
    }
  }

  return { blocks, buildings, trees, lamps, dashes };
}

/** Where a featured tower stands, how tall it is, and the point its label floats over. */
export function projectAnchor(p: Project, out: THREE.Vector3) {
  return out.set(p.block[0], KERB_H + 0.3 + p.towerH + 0.55, p.block[1]);
}

/* ------------------------------------------------------------------ */
/* Traffic lanes                                                       */
/* ------------------------------------------------------------------ */

export type Lane = {
  pts: THREE.Vector2[];
  /** Cumulative length at each point (pts[0] = 0), closed loop. */
  cum: number[];
  length: number;
  speed: number;
};

const LOOPS: [number, number, number, number][] = [
  [-12.5, -10, 2.5, 11],
  [2.5, -15, 12.5, 16],
  [-17.5, -5, 17.5, 0],
  [-7.5, -15, 7.5, -5],
  [-17.5, 6, -2.5, 16],
  [7.5, 6, 17.5, 11],
  [-17.5, -15, -7.5, -5],
  [-12.5, 6, 12.5, 11],
];

const LANE_OFFSET = 0.23;
const CHAMFER = 0.35;

function makeLane(x0: number, z0: number, x1: number, z1: number, ccw: boolean, speed: number): Lane {
  // Driving on the right: one direction is inset, the other outset.
  const o = ccw ? LANE_OFFSET : -LANE_OFFSET;
  const a = x0 - o;
  const b = x1 + o;
  const c = z0 - o;
  const d = z1 + o;
  let corners = [
    new THREE.Vector2(a, c),
    new THREE.Vector2(b, c),
    new THREE.Vector2(b, d),
    new THREE.Vector2(a, d),
  ];
  if (ccw) corners = corners.reverse();
  // Chamfer corners so cars swing round instead of snapping.
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < corners.length; i++) {
    const prev = corners[(i + corners.length - 1) % corners.length];
    const cur = corners[i];
    const next = corners[(i + 1) % corners.length];
    pts.push(cur.clone().add(prev.clone().sub(cur).normalize().multiplyScalar(CHAMFER)));
    pts.push(cur.clone().add(next.clone().sub(cur).normalize().multiplyScalar(CHAMFER)));
  }
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) cum.push(cum[i - 1] + pts[i % pts.length].distanceTo(pts[i - 1]));
  return { pts, cum, length: cum[pts.length], speed };
}

export function buildLanes(): Lane[] {
  const random = createRandom(77);
  const lanes: Lane[] = [];
  for (const [x0, z0, x1, z1] of LOOPS) {
    lanes.push(makeLane(x0, z0, x1, z1, false, 1.5 + random() * 0.7));
    lanes.push(makeLane(x0, z0, x1, z1, true, 1.5 + random() * 0.7));
  }
  return lanes;
}

/** Position (x, z) and heading along a lane at distance s. */
export function lanePoint(lane: Lane, s: number, out: THREE.Vector3) {
  const L = lane.length;
  const d = ((s % L) + L) % L;
  let i = 0;
  while (i < lane.pts.length - 1 && lane.cum[i + 1] < d) i++;
  const a = lane.pts[i];
  const b = lane.pts[(i + 1) % lane.pts.length];
  const seg = lane.cum[i + 1] - lane.cum[i];
  const k = seg > 0 ? (d - lane.cum[i]) / seg : 0;
  out.set(a.x + (b.x - a.x) * k, 0, a.y + (b.y - a.y) * k);
  return Math.atan2(b.x - a.x, b.y - a.y);
}

/** Cars ride up onto the bridge decks over the river. */
export function roadLift(z: number) {
  return BRIDGE_TOP * (1 - THREE.MathUtils.smoothstep(Math.abs(z - RIVER.mid), 2.3, 2.75));
}

/* ------------------------------------------------------------------ */
/* Elevated train loop                                                 */
/* ------------------------------------------------------------------ */

export const TRACK = { hx: 19.2, hz: 17.1, cz: 0.5, r: 3.6, y: 2.05 };

export function buildTrackCurve() {
  const { hx, hz, cz, r, y } = TRACK;
  const pts: THREE.Vector3[] = [];
  const corners: [number, number, number][] = [
    [hx - r, cz + hz - r, 0],
    [-(hx - r), cz + hz - r, Math.PI / 2],
    [-(hx - r), cz - (hz - r), Math.PI],
    [hx - r, cz - (hz - r), (Math.PI * 3) / 2],
  ];
  for (const [cx, cz2, a0] of corners) {
    for (let k = 0; k <= 8; k++) {
      const a = a0 + (k / 8) * (Math.PI / 2);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz2 + Math.sin(a) * r));
    }
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
  curve.arcLengthDivisions = 400;
  return curve;
}

/** Station on the east side of the loop, as a fraction along the curve (found once). */
export function stationU(curve: THREE.CatmullRomCurve3, x: number, z: number) {
  let best = 0;
  let bestD = Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i < 400; i++) {
    curve.getPointAt(i / 400, p);
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i / 400;
    }
  }
  return best;
}
