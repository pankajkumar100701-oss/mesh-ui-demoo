"use client";

import { useFrame } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, type CollisionEnterPayload } from "@react-three/rapier";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * "BOUNCE" spelled in chunky candy-cane tubes. Each glyph is a list of strokes
 * (poly-lines in a 2-unit-tall box). The same strokes drive the tube meshes and
 * the capsule colliders, so the sweets land exactly on what you see.
 */

type P = [number, number];
const R = 0.34; // tube radius
const DEPTH = 1.75; // z-stretch of the tube cross-section (puffy letters)
const LETTER_GAP = 0.68;

function arc(cx: number, cy: number, rx: number, ry: number, d0: number, d1: number, n = 18): P[] {
  const pts: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = THREE.MathUtils.degToRad(d0 + ((d1 - d0) * i) / n);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

const GLYPHS: Record<string, P[][]> = {
  B: [
    [[0, -1], [0, 1]],
    [[0, 1], [0.38, 1], ...arc(0.38, 0.5, 0.5, 0.5, 90, -90), [0, 0]],
    [[0, 0], [0.46, 0], ...arc(0.46, -0.5, 0.52, 0.5, 90, -90), [0, -1]],
  ],
  O: [arc(0.62, 0, 0.62, 1, 90, 450, 40)],
  U: [[[0, 1], [0, -0.38], ...arc(0.6, -0.38, 0.6, 0.62, 180, 360), [1.2, 1]]],
  N: [
    [[0, -1], [0, 1]],
    [[0, 1], [1.05, -1]],
    [[1.05, -1], [1.05, 1]],
  ],
  C: [arc(0.7, 0, 0.7, 1, 48, 312, 32)],
  E: [
    [[0, -1], [0, 1]],
    [[0, 1], [0.92, 1]],
    [[0, 0], [0.72, 0]],
    [[0, -1], [0.92, -1]],
  ],
};

export const LETTER_COLORS = ["#ff5c8a", "#ffb020", "#3ec5ff", "#a78bfa", "#2fd38c", "#ff8a3c"];

function dedupe(pts: P[]) {
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-4);
}

function glyphWidth(ch: string) {
  let max = 0;
  for (const s of GLYPHS[ch]) for (const p of s) max = Math.max(max, p[0]);
  return max;
}

/** Width/height of a row of letters in world units, including tube thickness. */
export function rowSize(word: string) {
  let w = 0;
  for (const ch of word) w += glyphWidth(ch) + 2 * R;
  w += (word.length - 1) * LETTER_GAP;
  return { width: w, height: 2 + 2 * R };
}

type Built = { geometry: THREE.BufferGeometry; segments: { mid: P; len: number; angle: number }[] };

function buildGlyph(ch: string, base: string, stripeHex: string): Built {
  const geos: THREE.BufferGeometry[] = [];
  const segments: Built["segments"] = [];
  const cBase = new THREE.Color(base);
  const cStripe = new THREE.Color(stripeHex);
  let travelled = 0;

  for (const raw of GLYPHS[ch]) {
    const pts = dedupe(raw);
    const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-3;
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < pts.length; i++) {
      path.add(
        new THREE.LineCurve3(
          new THREE.Vector3(pts[i - 1][0], pts[i - 1][1], 0),
          new THREE.Vector3(pts[i][0], pts[i][1], 0),
        ),
      );
    }
    const length = path.getLength();
    const tubular = Math.max(8, Math.ceil(length / 0.05));
    const radial = 18;
    const tube = new THREE.TubeGeometry(path, tubular, R, radial, closed);
    // Candy-cane spiral stripes painted per vertex.
    const colors = new Float32Array(tube.attributes.position.count * 3);
    for (let i = 0; i <= tubular; i++) {
      for (let j = 0; j <= radial; j++) {
        const s = travelled + (i / tubular) * length;
        const v = j / radial;
        const f = (((s * 1.15 + v) % 1) + 1) % 1;
        (f < 0.36 ? cStripe : cBase).toArray(colors, (i * (radial + 1) + j) * 3);
      }
    }
    tube.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    tube.deleteAttribute("uv");
    geos.push(tube.toNonIndexed());
    travelled += length;

    if (!closed) {
      for (const end of [pts[0], pts[pts.length - 1]]) {
        const cap = new THREE.SphereGeometry(R, radial, 12);
        cap.translate(end[0], end[1], 0);
        cap.deleteAttribute("uv");
        const cc = new Float32Array(cap.attributes.position.count * 3);
        for (let i = 0; i < cap.attributes.position.count; i++) cBase.toArray(cc, i * 3);
        cap.setAttribute("color", new THREE.BufferAttribute(cc, 3));
        geos.push(cap.toNonIndexed());
      }
    }

    // Colliders: merge short arc pieces into ~0.32-long capsules.
    let start = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const len = Math.hypot(p[0] - start[0], p[1] - start[1]);
      if (len >= 0.3 || i === pts.length - 1) {
        segments.push({
          mid: [(start[0] + p[0]) / 2, (start[1] + p[1]) / 2],
          len,
          angle: Math.atan2(p[1] - start[1], p[0] - start[0]),
        });
        start = p;
      }
    }
  }

  const merged = mergeAll(geos);
  merged.scale(1, 1, DEPTH);
  // Non-uniform scale: normals transform by the inverse, then renormalise.
  const n = merged.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.set(n.getX(i), n.getY(i), n.getZ(i) / DEPTH).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  merged.computeBoundingSphere();
  return { geometry: merged, segments };
}

function mergeAll(geos: THREE.BufferGeometry[]) {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    col.set(g.attributes.color.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return out;
}

type LetterLayout = { ch: string; x: number; y: number; color: string; index: number };

export function layoutLetters(rows: string[], centerY: number): LetterLayout[] {
  const out: LetterLayout[] = [];
  const { height } = rowSize(rows[0]);
  const rowGap = 0.55;
  const total = rows.length * height + (rows.length - 1) * rowGap;
  let index = 0;
  rows.forEach((word, r) => {
    const { width } = rowSize(word);
    let x = -width / 2 + R;
    const y = centerY + total / 2 - height / 2 - r * (height + rowGap);
    for (const ch of word) {
      out.push({ ch, x, y, color: LETTER_COLORS[index % LETTER_COLORS.length], index });
      x += glyphWidth(ch) + 2 * R + LETTER_GAP;
      index++;
    }
  });
  return out;
}

let letterMaterial: THREE.MeshPhysicalMaterial | null = null;
function getLetterMaterial() {
  if (!letterMaterial) {
    letterMaterial = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    });
  }
  return letterMaterial;
}

function Letter({
  item,
  calm,
  onHit,
}: {
  item: LetterLayout;
  calm: boolean;
  onHit?: (x: number, y: number, speed: number, color: string) => void;
}) {
  const built = useMemo(() => buildGlyph(item.ch, "#fffaf5", item.color), [item.ch, item.color]);
  const group = useRef<THREE.Group>(null);
  const anim = useRef({ start: -1, t: 0, jig: 0, jigT: 10 });
  const cx = glyphWidth(item.ch) / 2;

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const a = anim.current;
    // Intro runs on wall-clock time so slow devices still finish it promptly.
    const now = state.clock.elapsedTime;
    if (a.start < 0) a.start = now;
    a.t = now - a.start - item.index * 0.09 - 0.15;
    a.jigT += Math.min(dt, 0.05);
    // Elastic pop-in.
    const t = Math.max(0, a.t);
    const intro = calm ? 1 : t <= 0 ? 0 : 1 - Math.exp(-6 * t) * Math.cos(t * 13);
    // Jelly wobble after impacts.
    const w = a.jig * Math.exp(-a.jigT * 6) * Math.sin(a.jigT * 30);
    g.scale.set(intro * (1 + w * 0.6), intro * (1 - w), intro * (1 + w * 0.6));
    g.rotation.z = calm ? 0 : Math.sin(a.t * 1.3 + item.index) * 0.025 + w * 0.15;
  });

  const handleHit = (e: CollisionEnterPayload) => {
    const v = e.other.rigidBody?.linvel();
    if (!v) return;
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed < 3) return;
    const a = anim.current;
    if (a.jigT > 0.12) {
      a.jig = Math.min(0.14, speed * 0.012);
      a.jigT = 0;
    }
    const p = e.other.rigidBody!.translation();
    onHit?.(p.x, p.y, speed, item.color);
  };

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={[item.x, item.y, 0]}
      restitution={0.6}
      friction={0.4}
      onCollisionEnter={calm ? undefined : handleHit}
    >
      {/* scale around the glyph centre */}
      <group position={[cx, 0, 0]}>
        <group ref={group}>
          <mesh
            geometry={built.geometry}
            material={getLetterMaterial()}
            position={[-cx, 0, 0]}
            castShadow
            receiveShadow
          />
        </group>
      </group>
      {built.segments.flatMap((s, i) =>
        [-0.3, 0.3].map((z) => (
          <CapsuleCollider
            key={`${i}-${z}`}
            args={[s.len / 2, R]}
            position={[s.mid[0], s.mid[1], z]}
            rotation={[0, 0, s.angle - Math.PI / 2]}
            restitution={0.6}
            friction={0.4}
          />
        )),
      )}
    </RigidBody>
  );
}

export default function Letters({
  rows,
  centerY,
  calm,
  onHit,
}: {
  rows: string[];
  centerY: number;
  calm: boolean;
  onHit?: (x: number, y: number, speed: number, color: string) => void;
}) {
  const items = useMemo(() => layoutLetters(rows, centerY), [rows, centerY]);
  return (
    <>
      {items.map((item) => (
        <Letter key={`${item.index}-${item.ch}-${item.x.toFixed(2)}-${item.y.toFixed(2)}`} item={item} calm={calm} onHit={onHit} />
      ))}
    </>
  );
}
