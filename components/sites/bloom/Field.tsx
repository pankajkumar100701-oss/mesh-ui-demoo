"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import {
  KINDS,
  LAYOUT,
  lerp,
  makeCenterGeometry,
  makeLeafGeometry,
  makeLeafMaterial,
  makePetalGeometry,
  makePetalMaterial,
  makeStemGeometry,
  makeStemMaterial,
  seg,
  type Flower,
  type Kind,
} from "./flora";

/* ------------------------------------------------------------------ */
/* Reduced motion                                                       */
/* ------------------------------------------------------------------ */

const RM = "(prefers-reduced-motion: reduce)";
const subscribeRM = (cb: () => void) => {
  const mq = window.matchMedia(RM);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeRM,
    () => window.matchMedia(RM).matches,
    () => false,
  );
}

/* ------------------------------------------------------------------ */
/* Wind: the cursor's motion over the canvas, in NDC                    */
/* ------------------------------------------------------------------ */

export type Wind = {
  /** Pointer in canvas NDC (-1..1); far away until the pointer arrives. */
  x: number;
  y: number;
  /** Smoothed pointer velocity, NDC per second. */
  vx: number;
  vy: number;
  /** Seconds since the last move. */
  idle: number;
};

/** Tracks the window pointer relative to this canvas. Must be used inside <Canvas>. */
export function useCanvasWind() {
  const el = useThree((s) => s.gl.domElement);
  const wind = useRef<Wind>({ x: 9, y: 9, vx: 0, vy: 0, idle: 99 });
  const last = useRef({ x: 0, y: 0, t: 0, has: false });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      const now = performance.now() / 1000;
      const w = wind.current;
      const l = last.current;
      if (l.has) {
        const dt = Math.max(1 / 240, now - l.t);
        const k = Math.min(1, dt * 14);
        w.vx = lerp(w.vx, Math.max(-12, Math.min(12, (x - l.x) / dt)), k);
        w.vy = lerp(w.vy, Math.max(-12, Math.min(12, (y - l.y) / dt)), k);
      }
      l.x = x;
      l.y = y;
      l.t = now;
      l.has = true;
      w.x = x;
      w.y = y;
      w.idle = 0;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [el]);

  useFrame((_, dt) => {
    const w = wind.current;
    const d = Math.exp(-3.2 * Math.min(dt, 0.1));
    w.vx *= d;
    w.vy *= d;
    w.idle += dt;
  });

  return wind;
}

/* ------------------------------------------------------------------ */
/* The field: every stem, leaf, petal and heart of a set of flowers,   */
/* drawn as a handful of instanced meshes.                              */
/* ------------------------------------------------------------------ */

const UP = new THREE.Vector3(0, 1, 0);
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const SEPALS = 5;

type Bundle = {
  stems: THREE.InstancedMesh;
  bend: THREE.InstancedBufferAttribute;
  leaves: THREE.InstancedMesh;
  centers: THREE.InstancedMesh;
  petals: Record<Kind, { mesh: THREE.InstancedMesh; open: THREE.InstancedBufferAttribute }>;
  dispose: () => void;
};

function createBundle(maxPerKind: Record<Kind, number>, glow: number): Bundle {
  const total = KINDS.reduce((s, k) => s + maxPerKind[k], 0);
  const disposables: { dispose: () => void }[] = [];

  const stemGeo = makeStemGeometry();
  const bend = new THREE.InstancedBufferAttribute(new Float32Array(total * 2), 2);
  bend.setUsage(THREE.DynamicDrawUsage);
  stemGeo.setAttribute("aBend", bend);
  const stemMat = makeStemMaterial();
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, Math.max(1, total));
  disposables.push(stemGeo, stemMat);

  const leafGeo = makeLeafGeometry();
  const leafMat = makeLeafMaterial(glow * 0.45, "#7d9c5a");
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, Math.max(1, total * (2 + SEPALS)));
  leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  disposables.push(leafGeo, leafMat);

  const centerGeo = makeCenterGeometry();
  const centerMat = makeLeafMaterial(glow * 0.6);
  const centers = new THREE.InstancedMesh(
    centerGeo,
    centerMat,
    Math.max(1, maxPerKind.daisy + maxPerKind.peony),
  );
  disposables.push(centerGeo, centerMat);

  const petalMat = makePetalMaterial(glow);
  disposables.push(petalMat);
  const petals = {} as Bundle["petals"];
  for (const kind of KINDS) {
    const geo = makePetalGeometry(kind);
    const cap = Math.max(1, maxPerKind[kind] * LAYOUT[kind].length);
    const open = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    open.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aOpen", open);
    const mesh = new THREE.InstancedMesh(geo, petalMat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    petals[kind] = { mesh, open };
    disposables.push(geo);
  }
  centers.setColorAt(0, new THREE.Color(1, 1, 1));
  stems.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  for (const m of [stems, leaves, centers, ...KINDS.map((k) => petals[k].mesh)]) {
    m.frustumCulled = false;
    m.count = 0;
  }
  return {
    stems,
    bend,
    leaves,
    centers,
    petals,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

export type FieldOptions = {
  /** Stiffness of the stem spring. */
  stiffness?: number;
  /** How hard a passing cursor pushes. */
  gustGain?: number;
  /** Ambient breeze amplitude. */
  breeze?: number;
  /** NDC radius of the cursor's influence. */
  reach?: number;
};

export function FlowerField({
  flowersRef,
  windRef,
  maxPerKind,
  reduced,
  glow = 0.3,
  options,
}: {
  flowersRef: React.RefObject<Flower[] | null>;
  windRef: React.RefObject<Wind>;
  maxPerKind: Record<Kind, number>;
  reduced: boolean;
  glow?: number;
  options?: FieldOptions;
}) {
  const group = useRef<THREE.Group>(null);
  const capKey = KINDS.map((k) => maxPerKind[k]).join(",");
  const bundle = useMemo(
    () => createBundle(maxPerKind, glow),
    // capKey captures maxPerKind by value
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capKey, glow],
  );
  const bundleRef = useRef(bundle);
  useEffect(() => {
    bundleRef.current = bundle;
    return () => bundle.dispose();
  }, [bundle]);
  const camera = useThree((s) => s.camera);

  const tmp = useRef({
    m: new THREE.Matrix4(),
    head: new THREE.Matrix4(),
    local: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
    q2: new THREE.Quaternion(),
    q3: new THREE.Quaternion(),
    v: new THREE.Vector3(),
    v2: new THREE.Vector3(),
    s: new THREE.Vector3(),
    c: new THREE.Color(),
  });

  useFrame((state, rawDt) => {
    const b = bundleRef.current;
    const g0 = group.current;
    const list = flowersRef.current;
    const w = windRef.current;
    if (!g0 || !list) return;
    const dt = Math.min(rawDt, 1 / 30);
    const t = state.clock.elapsedTime;
    const T = tmp.current;
    const aspect = state.size.width / Math.max(1, state.size.height);
    const k = options?.stiffness ?? 16;
    const damp = 2 * Math.sqrt(k) * 0.32;
    const gain = (options?.gustGain ?? 1) * (reduced ? 0.35 : 1);
    const breeze = (options?.breeze ?? 1) * (reduced ? 0.25 : 1);
    const reach = options?.reach ?? 0.3;

    let nStem = 0;
    let nLeaf = 0;
    let nCenter = 0;
    const nPetal: Record<Kind, number> = { rose: 0, tulip: 0, peony: 0, daisy: 0 };
    const cap: Record<Kind, number> = {
      rose: b.petals.rose.mesh.instanceMatrix.count,
      tulip: b.petals.tulip.mesh.instanceMatrix.count,
      peony: b.petals.peony.mesh.instanceMatrix.count,
      daisy: b.petals.daisy.mesh.instanceMatrix.count,
    };
    const stemCap = b.stems.instanceMatrix.count;
    const leafCap = b.leaves.instanceMatrix.count;
    const centerCap = b.centers.instanceMatrix.count;
    g0.updateWorldMatrix(true, false);

    for (let fi = 0; fi < list.length; fi++) {
      const f = list[fi];
      if (f.grow <= 0.002 || nStem >= stemCap) {
        f.gust = 0;
        continue;
      }
      const slots = LAYOUT[f.kind];
      if (nPetal[f.kind] + slots.length > cap[f.kind]) continue;

      // --- wind: how close is the cursor to this head on screen, and how fast is it moving?
      T.v.copy(f.head).applyMatrix4(g0.matrixWorld).project(camera);
      const dx = (T.v.x - w.x) * aspect;
      const dy = T.v.y - w.y;
      const near = Math.exp(-(dx * dx + dy * dy) / (reach * reach));
      const infl = 0.12 + 0.88 * near;
      const reachH = f.height / 3;
      const fx = w.vx * aspect * 1.6 * infl * gain * reachH;
      const fz = -w.vy * 0.7 * infl * gain * reachH;
      f.gust = Math.hypot(w.vx, w.vy) * near;
      const br =
        breeze *
        reachH *
        (Math.sin(t * 0.8 + f.phase) * 0.9 + Math.sin(t * 2.1 + f.phase * 1.7) * 0.35 + 0.5);
      const ax = fx * k * 0.06 + br * k * 0.012 - k * f.sway.x - damp * f.swayV.x;
      const az = fz * k * 0.06 + Math.cos(t * 0.6 + f.phase) * br * k * 0.006 - k * f.sway.y - damp * f.swayV.y;
      f.swayV.x += ax * dt;
      f.swayV.y += az * dt;
      f.sway.x += f.swayV.x * dt;
      f.sway.y += f.swayV.y * dt;
      const lim = f.height * 0.32;
      const sl = f.sway.length();
      if (sl > lim) f.sway.multiplyScalar(lim / sl);

      // --- stem
      const g = f.grow;
      const H = f.height * (1 - Math.pow(1 - g, 2.2));
      const bx = (f.lean.x + f.sway.x) * g;
      const bz = (f.lean.y + f.sway.y) * g;
      const thick = (f.kind === "daisy" ? 0.7 : f.kind === "peony" ? 1.15 : 1) * (0.55 + 0.45 * g);
      T.m.makeScale(thick, Math.max(0.001, H), thick);
      T.m.setPosition(f.base);
      b.stems.setMatrixAt(nStem, T.m);
      b.bend.setXY(nStem, bx / thick, bz / thick);
      nStem++;

      // --- head frame: top of the bent stem, facing along its tangent (+ a nudge)
      f.head.set(f.base.x + bx, f.base.y + H, f.base.z + bz);
      T.v.set(2 * bx, H, 2 * bz).normalize().add(f.face).normalize();
      T.q.setFromUnitVectors(UP, T.v);
      T.q2.setFromAxisAngle(AY, f.spin);
      T.q.multiply(T.q2);
      const bud = seg(g, 0.38, 1);
      const hs = f.headScale * bud * lerp(0.72, 1, f.open);
      T.s.setScalar(Math.max(0.0001, hs));
      T.head.compose(f.head, T.q, T.s);

      // --- petals
      if (bud > 0.001) {
        const pm = b.petals[f.kind];
        const flutter = reduced ? 0 : Math.min(0.25, f.gust * 0.05);
        for (let i = 0; i < slots.length; i++) {
          const s = slots[i];
          const o = seg(f.open, s.order * 0.5, s.order * 0.5 + 0.5);
          const tilt =
            lerp(s.tiltClosed, s.tiltOpen, o) +
            flutter * o * Math.sin(t * 9 + i * 1.7 + f.phase);
          T.q2.setFromAxisAngle(AY, s.az);
          T.q3.setFromAxisAngle(AX, tilt);
          T.q2.multiply(T.q3);
          T.v2.set(Math.sin(s.az) * s.radius, s.lift, Math.cos(s.az) * s.radius);
          T.s.setScalar(s.scale);
          T.local.compose(T.v2, T.q2, T.s);
          T.m.multiplyMatrices(T.head, T.local);
          const idx = nPetal[f.kind]++;
          pm.mesh.setMatrixAt(idx, T.m);
          pm.open.setX(idx, o);
          T.c.copy(f.color).multiplyScalar(s.shade);
          pm.mesh.setColorAt(idx, T.c);
        }

        // hearts
        if ((f.kind === "daisy" || f.kind === "peony") && nCenter < centerCap) {
          const d = f.kind === "daisy";
          const r = d ? 0.24 : 0.12;
          T.v2.set(0, d ? 0.0 : 0.02, 0);
          T.q2.identity();
          T.s.set(r, r * (d ? 0.55 + 0.25 * f.open : 0.7), r);
          T.local.compose(T.v2, T.q2, T.s);
          T.m.multiplyMatrices(T.head, T.local);
          b.centers.setMatrixAt(nCenter, T.m);
          T.c.set(d ? "#f2b632" : "#f5d27a");
          b.centers.setColorAt(nCenter, T.c);
          nCenter++;
        }

        // sepals under roses, peonies and tulips — hug the bud, then fold back
        if (f.kind !== "daisy") {
          const fold = lerp(0.35, f.kind === "tulip" ? 0.9 : 2.1, seg(f.open, 0, 0.6));
          for (let i = 0; i < SEPALS && nLeaf < leafCap; i++) {
            const a = (i / SEPALS) * Math.PI * 2 + 0.4;
            T.q2.setFromAxisAngle(AY, a);
            T.q3.setFromAxisAngle(AX, fold);
            T.q2.multiply(T.q3);
            T.v2.set(Math.sin(a) * 0.05, -0.03, Math.cos(a) * 0.05);
            T.s.set(0.32, 0.42, 0.32);
            T.local.compose(T.v2, T.q2, T.s);
            T.m.multiplyMatrices(T.head, T.local);
            b.leaves.setMatrixAt(nLeaf++, T.m);
          }
        }
      }

      // --- leaves along the stem
      for (const lf of f.leaves) {
        if (nLeaf >= leafCap) break;
        const lg = seg(g, lf.t * 0.7, lf.t * 0.7 + 0.35);
        if (lg <= 0.001) continue;
        const lt = lf.t;
        T.v2.set(f.base.x + bx * lt * lt, f.base.y + H * lt, f.base.z + bz * lt * lt);
        T.v.set(2 * bx * lt, H, 2 * bz * lt).normalize();
        T.q.setFromUnitVectors(UP, T.v);
        T.q2.setFromAxisAngle(AY, lf.az);
        T.q3.setFromAxisAngle(
          AX,
          lerp(0.15, lf.tilt, lg) + (reduced ? 0 : Math.sin(t * 1.3 + f.phase + lf.az) * 0.04),
        );
        T.q.multiply(T.q2).multiply(T.q3);
        T.s.setScalar(lf.size * lg);
        T.m.compose(T.v2, T.q, T.s);
        b.leaves.setMatrixAt(nLeaf++, T.m);
      }
    }

    b.stems.count = nStem;
    b.stems.instanceMatrix.needsUpdate = true;
    b.bend.needsUpdate = true;
    b.leaves.count = nLeaf;
    b.leaves.instanceMatrix.needsUpdate = true;
    b.centers.count = nCenter;
    b.centers.instanceMatrix.needsUpdate = true;
    if (b.centers.instanceColor) b.centers.instanceColor.needsUpdate = true;
    for (const kind of KINDS) {
      const pm = b.petals[kind];
      pm.mesh.count = nPetal[kind];
      pm.mesh.instanceMatrix.needsUpdate = true;
      pm.open.needsUpdate = true;
      if (pm.mesh.instanceColor) pm.mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group ref={group}>
      <primitive object={bundle.stems} />
      <primitive object={bundle.leaves} />
      <primitive object={bundle.centers} />
      {KINDS.map((k) => (
        <primitive key={k} object={bundle.petals[k].mesh} />
      ))}
    </group>
  );
}
