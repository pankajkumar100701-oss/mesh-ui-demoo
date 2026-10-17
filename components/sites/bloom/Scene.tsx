"use client";

import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { createRandom } from "@/lib/random";
import {
  KINDS,
  makeFlower,
  makeLeafGeometry,
  makePetalGeometry,
  makePetalMaterial,
  seg,
  type Flower,
  type Kind,
} from "./flora";
import { FlowerField, useCanvasWind, useReducedMotion, type Wind } from "./Field";

export const CREAM = "#f7f1e8";

/* ------------------------------------------------------------------ */
/* The meadow: who grows where                                          */
/* ------------------------------------------------------------------ */

type Plant = Flower & { delay: number };

const HERO_COLORS: Record<Kind, string[]> = {
  rose: ["#ee8fa6", "#f6c1b0", "#e9748f"],
  peony: ["#f6b8c6", "#fbd9df", "#f3a5b8"],
  tulip: ["#f7a26b", "#f4c3d2", "#f08f7a"],
  daisy: ["#fffaf0", "#fff6e6"],
};

/** [kind, x, z, head height, sprout delay] — the front bouquet sits right of the copy. */
const FRONT: [Kind, number, number, number, number][] = [
  ["peony", 2.2, 0.1, 0.95, 0.0],
  ["rose", 1.2, 0.9, 0.2, 0.04],
  ["tulip", 3.1, -0.5, 1.55, 0.07],
  ["daisy", 3.7, 0.9, -0.05, 0.11],
  ["rose", 2.95, 0.6, 0.55, 0.09],
  ["tulip", 0.55, -0.4, 1.1, 0.14],
  ["daisy", 1.75, 1.4, -0.55, 0.17],
  ["peony", 4.4, -0.6, 1.05, 0.2],
  ["daisy", 0.2, 0.7, -0.15, 0.22],
  ["rose", 4.0, 1.3, -0.35, 0.25],
  ["tulip", 1.75, -1.1, 1.75, 0.23],
  ["daisy", 2.5, 1.7, -0.85, 0.28],
  ["rose", 5.2, 0.2, 0.4, 0.3],
];

function buildMeadow(): Plant[] {
  const rnd = createRandom(1307);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const out: Plant[] = [];
  const baseY = -3.1;
  for (const [kind, x, z, hy, delay] of FRONT) {
    const f = makeFlower(
      {
        kind,
        base: new THREE.Vector3(x + (rnd() - 0.5) * 0.4, baseY, z),
        height: hy - baseY,
        lean: new THREE.Vector2((rnd() - 0.5) * 0.5, (rnd() - 0.3) * 0.3),
        face: new THREE.Vector3((rnd() - 0.5) * 0.3, 0.1, 0.8 + rnd() * 0.3),
        headScale: (kind === "peony" ? 0.54 : kind === "rose" ? 0.5 : kind === "tulip" ? 0.42 : 0.46) * (0.9 + rnd() * 0.2),
      },
      rnd,
    );
    f.color.set(pick(HERO_COLORS[kind]));
    out.push(Object.assign(f, { delay }));
  }
  // A softer field behind, across the whole width, fading into the haze.
  for (let i = 0; i < 16; i++) {
    const kind: Kind = rnd() < 0.5 ? "daisy" : rnd() < 0.6 ? "tulip" : rnd() < 0.5 ? "rose" : "peony";
    const x = -6.5 + (i / 15) * 13.5 + (rnd() - 0.5) * 0.8;
    const z = -2.6 - rnd() * 3.2;
    const hy = -0.7 + rnd() * 1.8;
    const f = makeFlower(
      {
        kind,
        base: new THREE.Vector3(x, baseY - 0.4, z),
        height: hy - baseY + 0.4,
        lean: new THREE.Vector2((rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.3),
        face: new THREE.Vector3((rnd() - 0.5) * 0.4, 0.15, 0.6),
        headScale: (kind === "daisy" ? 0.4 : 0.42) * (0.85 + rnd() * 0.3),
      },
      rnd,
    );
    f.color.set(pick(HERO_COLORS[kind]));
    out.push(Object.assign(f, { delay: 0.02 + rnd() * 0.3 }));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Drifting petals                                                      */
/* ------------------------------------------------------------------ */

const DRIFT_COLORS = ["#f6b8c6", "#ee8fa6", "#fbd9df", "#f7a26b", "#fff6ea", "#f4c3d2"];

function DriftingPetals({
  count,
  plantsRef,
  windRef,
  reduced,
}: {
  count: number;
  plantsRef: React.RefObject<Plant[] | null>;
  windRef: React.RefObject<Wind>;
  reduced: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { geometry, material } = useMemo(() => {
    const geometry = makePetalGeometry("rose");
    geometry.setAttribute(
      "aOpen",
      new THREE.InstancedBufferAttribute(new Float32Array(count).fill(0.85), 1),
    );
    return { geometry, material: makePetalMaterial(0.32) };
  }, [count]);

  const sim = useRef<{
    p: Float32Array;
    v: Float32Array;
    r: Float32Array;
    spin: Float32Array;
    s: Float32Array;
    next: number;
    cool: Float32Array;
    pointer: THREE.Vector3;
    pointerPrev: THREE.Vector3;
    pVel: THREE.Vector3;
    ready: boolean;
  } | null>(null);
  const tmp = useRef({
    m: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
    e: new THREE.Euler(),
    v: new THREE.Vector3(),
    s: new THREE.Vector3(),
    c: new THREE.Color(),
    ray: new THREE.Raycaster(),
    plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    ndc: new THREE.Vector2(),
    inv: new THREE.Matrix4(),
  });

  useFrame((state, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(rawDt, 1 / 30);
    const T = tmp.current;
    const t = state.clock.elapsedTime;
    const w = windRef.current;

    if (!sim.current) {
      const rnd = createRandom(4242 + count);
      const S = {
        p: new Float32Array(count * 3),
        v: new Float32Array(count * 3),
        r: new Float32Array(count * 3),
        spin: new Float32Array(count * 3),
        s: new Float32Array(count),
        next: 0,
        cool: new Float32Array(64),
        pointer: new THREE.Vector3(99, 99, 0),
        pointerPrev: new THREE.Vector3(99, 99, 0),
        pVel: new THREE.Vector3(),
        ready: false,
      };
      for (let i = 0; i < count; i++) {
        S.p[i * 3] = -7 + rnd() * 14;
        S.p[i * 3 + 1] = -2.5 + rnd() * 6;
        S.p[i * 3 + 2] = -3 + rnd() * 5;
        S.r[i * 3] = rnd() * 6;
        S.r[i * 3 + 1] = rnd() * 6;
        S.r[i * 3 + 2] = rnd() * 6;
        S.spin[i * 3] = (rnd() - 0.5) * 3;
        S.spin[i * 3 + 1] = (rnd() - 0.5) * 2;
        S.spin[i * 3 + 2] = (rnd() - 0.5) * 3;
        S.s[i] = 0.1 + rnd() * 0.09;
        T.c.set(DRIFT_COLORS[Math.floor(rnd() * DRIFT_COLORS.length)]);
        m.setColorAt(i, T.c);
      }
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      sim.current = S;
    }
    const S = sim.current;

    // Cursor on the z = 0 plane, in this group's space; its velocity is the gust.
    const parent = m.parent;
    if (parent && w.idle < 5) {
      T.ndc.set(w.x, w.y);
      T.ray.setFromCamera(T.ndc, state.camera);
      if (T.ray.ray.intersectPlane(T.plane, T.v)) {
        T.inv.copy(parent.matrixWorld).invert();
        T.v.applyMatrix4(T.inv);
        S.pointerPrev.copy(S.pointer);
        S.pointer.copy(T.v);
        if (S.ready) {
          T.v.subVectors(S.pointer, S.pointerPrev).divideScalar(Math.max(dt, 1 / 120));
          if (T.v.length() < 60) S.pVel.lerp(T.v, Math.min(1, dt * 12));
        }
        S.ready = true;
      }
    }
    S.pVel.multiplyScalar(Math.exp(-4 * dt));

    // A strong gust over a bloom shakes a petal loose.
    const plants = plantsRef.current;
    if (plants && !reduced) {
      for (let j = 0; j < plants.length && j < S.cool.length; j++) {
        S.cool[j] -= dt;
        const f = plants[j];
        if (f.gust > 2.2 && f.open > 0.55 && S.cool[j] <= 0) {
          S.cool[j] = 0.35;
          const i = S.next;
          S.next = (S.next + 1) % count;
          S.p[i * 3] = f.head.x;
          S.p[i * 3 + 1] = f.head.y + 0.05;
          S.p[i * 3 + 2] = f.head.z + 0.1;
          S.v[i * 3] = w.vx * 0.8;
          S.v[i * 3 + 1] = 0.4;
          S.v[i * 3 + 2] = 0.3;
          T.c.copy(f.color);
          m.setColorAt(i, T.c);
          if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
      }
    }

    const speed = reduced ? 0.25 : 1;
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const x = S.p[ix];
      const y = S.p[ix + 1];
      const dx = x - S.pointer.x;
      const dy = y - S.pointer.y;
      const near = Math.exp(-(dx * dx + dy * dy) / 1.4) * (reduced ? 0.3 : 1);
      // ambient drift: a slow breeze to the right, a lazy fall, a little swirl
      const ax =
        0.32 + Math.sin(t * 0.5 + y * 0.8 + i) * 0.25 + S.pVel.x * near * 2.6 - S.v[ix] * 1.1;
      const ay =
        -0.2 + Math.cos(t * 0.7 + x * 0.6 + i * 0.3) * 0.18 + S.pVel.y * near * 2.6 - S.v[ix + 1] * 1.1;
      const az = Math.sin(t * 0.4 + i) * 0.1 - S.v[ix + 2] * 1.1;
      S.v[ix] += ax * dt;
      S.v[ix + 1] += ay * dt;
      S.v[ix + 2] += az * dt;
      S.p[ix] += S.v[ix] * dt * speed;
      S.p[ix + 1] += S.v[ix + 1] * dt * speed;
      S.p[ix + 2] += S.v[ix + 2] * dt * speed;
      const turb = 1 + Math.hypot(S.v[ix], S.v[ix + 1]) * 1.5;
      S.r[ix] += S.spin[ix] * dt * turb * speed;
      S.r[ix + 1] += S.spin[ix + 1] * dt * turb * speed;
      S.r[ix + 2] += S.spin[ix + 2] * dt * turb * speed;

      // wrap: leave right/bottom, come back top/left
      if (S.p[ix] > 8 || S.p[ix + 1] < -3.2) {
        const h = Math.sin(i * 12.9898 + t) * 43758.5453;
        const fr = h - Math.floor(h);
        if (fr < 0.5) {
          S.p[ix] = -8;
          S.p[ix + 1] = -1 + fr * 9;
        } else {
          S.p[ix] = -7 + fr * 14;
          S.p[ix + 1] = 4.2;
        }
        S.v[ix] = 0;
        S.v[ix + 1] = 0;
      }

      T.e.set(S.r[ix], S.r[ix + 1], S.r[ix + 2]);
      T.q.setFromEuler(T.e);
      T.v.set(S.p[ix], S.p[ix + 1], S.p[ix + 2]);
      T.s.setScalar(S.s[i]);
      T.m.compose(T.v, T.q, T.s);
      m.setMatrixAt(i, T.m);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, count]}
      frustumCulled={false}
      onUpdate={(self) => self.instanceMatrix.setUsage(THREE.DynamicDrawUsage)}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Grass and pollen                                                     */
/* ------------------------------------------------------------------ */

function Grass({ count, windRef, reduced }: { count: number; windRef: React.RefObject<Wind>; reduced: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { geometry, material, matrices, colors } = useMemo(() => {
    const geometry = makeLeafGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: "#8aa865",
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.75,
    });
    const uniforms = { uTime: { value: 0 }, uWind: { value: 0 } };
    material.userData.uniforms = uniforms;
    material.onBeforeCompile = (s) => {
      s.uniforms.uTime = uniforms.uTime;
      s.uniforms.uWind = uniforms.uWind;
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;")
        .replace(
          "#include <begin_vertex>",
          `vec3 transformed = vec3(position);
          #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 1.3 + instanceMatrix[3].z * 2.1;
          #else
          float ph = 0.0;
          #endif
          float h = position.y * position.y;
          transformed.x += (sin(uTime * 1.4 + ph) * 0.07 + uWind) * h;
          transformed.z += cos(uTime * 1.1 + ph) * 0.04 * h;`,
        );
      s.fragmentShader = s.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.12;",
      );
    };
    material.customProgramCacheKey = () => "bloom-grass";

    const rnd = createRandom(88);
    const matrices: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < count; i++) {
      const x = -8 + rnd() * 16;
      const z = -4 + rnd() * 4.6;
      e.set((rnd() - 0.5) * 0.5, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.4);
      q.setFromEuler(e);
      const h = 0.7 + rnd() * 0.9;
      matrices.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, -2.75 + rnd() * 0.2 + z * 0.12, z),
          q,
          new THREE.Vector3(0.3 + rnd() * 0.2, h, 0.5),
        ),
      );
      colors.push(new THREE.Color().setHSL(0.24 + rnd() * 0.06, 0.32 + rnd() * 0.15, 0.52 + rnd() * 0.12));
    }
    return { geometry, material, matrices, colors };
  }, [count]);

  useFrame((state, dt) => {
    const m = mesh.current;
    if (!m) return;
    const u = (m.material as THREE.Material).userData.uniforms as {
      uTime: { value: number };
      uWind: { value: number };
    };
    u.uTime.value = reduced ? 0 : state.clock.elapsedTime;
    const target = THREE.MathUtils.clamp(windRef.current.vx * 0.06, -0.35, 0.35) * (reduced ? 0.3 : 1);
    u.uWind.value = THREE.MathUtils.damp(u.uWind.value, target, 3, dt);
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, count]}
      frustumCulled={false}
      onUpdate={(self) => {
        matrices.forEach((mm, i) => {
          self.setMatrixAt(i, mm);
          self.setColorAt(i, colors[i]);
        });
        self.instanceMatrix.needsUpdate = true;
        if (self.instanceColor) self.instanceColor.needsUpdate = true;
      }}
    />
  );
}

function Pollen({ count, reduced }: { count: number; reduced: boolean }) {
  const pts = useRef<THREE.Points>(null);
  const { geometry, material } = useMemo(() => {
    const rnd = createRandom(51);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = -7 + rnd() * 14;
      pos[i * 3 + 1] = -2.5 + rnd() * 6;
      pos[i * 3 + 2] = -4 + rnd() * 5.5;
      seed[i] = rnd();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uPx;
        attribute float aSeed; varying float vA;
        void main() {
          vec3 p = position;
          float t = uTime * (0.15 + aSeed * 0.2);
          p.x += sin(t + aSeed * 30.0) * 0.6;
          p.y += mod(t * 0.8 + aSeed * 6.0, 6.0) - 3.0;
          p.z += cos(t * 0.7 + aSeed * 12.0) * 0.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.0 + aSeed * 4.0) * uPx * (8.0 / -mv.z);
          vA = 0.35 + 0.5 * sin(uTime * 1.5 + aSeed * 40.0) * 0.5 + 0.25;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA;
          gl_FragColor = vec4(1.0, 0.86, 0.55, a);
        }`,
    });
    return { geometry, material };
  }, [count]);

  useFrame((state) => {
    const p = pts.current;
    if (!p) return;
    const mat = p.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value = reduced ? 10 : state.clock.elapsedTime;
    mat.uniforms.uPx.value = state.viewport.dpr;
  });

  return <points ref={pts} args={[geometry, material]} frustumCulled={false} />;
}

/** Warm, blush haze behind everything — the light of a florist's window at 9am. */
function Backdrop() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        depthWrite: false,
        uniforms: {},
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vec3 cream = vec3(0.969, 0.945, 0.910);
            vec3 blush = vec3(0.984, 0.855, 0.855);
            vec3 sage  = vec3(0.86, 0.90, 0.82);
            float sun = smoothstep(0.55, 0.0, distance(vUv, vec2(0.68, 0.66)));
            float low = smoothstep(0.55, 0.0, vUv.y);
            vec3 c = mix(cream, blush, sun * 0.75);
            c = mix(c, sage, low * 0.35);
            c += vec3(1.0, 0.97, 0.9) * pow(sun, 3.0) * 0.12;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  );
  return (
    <mesh position={[1, 1.5, -9]} material={material}>
      <planeGeometry args={[46, 26]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Stage                                                                */
/* ------------------------------------------------------------------ */

function Meadow({ progress, reduced }: { progress: React.RefObject<number>; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const plantsRef = useRef<Plant[] | null>(null);
  if (plantsRef.current === null) {
    plantsRef.current = buildMeadow();
  }
  const windRef = useCanvasWind();
  const intro = useRef(0);
  const mobile = useThree((s) => s.size.width / Math.max(1, s.size.height) < 0.9);
  const small = useThree((s) => s.size.width < 768);

  const maxPerKind = useMemo(() => {
    const counts: Record<Kind, number> = { rose: 0, tulip: 0, peony: 0, daisy: 0 };
    for (const [kind] of FRONT) counts[kind]++;
    // back field is random; reserve generously
    for (const k of KINDS) counts[k] += 16;
    return counts;
  }, []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    intro.current = reduced ? 1 : Math.min(1, intro.current + dt / 2.6);
    const p = progress.current ?? 0;
    const T = 0.4 * (1 - Math.pow(1 - intro.current, 3)) + 0.82 * p;
    const plants = plantsRef.current;
    if (plants) {
      for (const f of plants) {
        const d = f.delay;
        f.grow = seg(T, d, d + 0.38);
        f.open = seg(T, d + 0.3, d + 0.78);
      }
    }

    // Camera: a slow dolly in as the meadow blooms, a touch of cursor parallax.
    const w = windRef.current;
    const px = w.idle < 30 ? THREE.MathUtils.clamp(w.x, -1, 1) : 0;
    const py = w.idle < 30 ? THREE.MathUtils.clamp(w.y, -1, 1) : 0;
    const cam = state.camera;
    const dist = (mobile ? 11.2 : 8.6) - 0.9 * seg(p, 0.1, 1);
    const tx = px * 0.35 * (reduced ? 0 : 1);
    const ty = (mobile ? 1.15 : 0.95) + 0.35 * seg(p, 0.2, 1) + py * 0.2 * (reduced ? 0 : 1);
    cam.position.x = THREE.MathUtils.damp(cam.position.x, tx, 2.5, dt);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, ty, 2.5, dt);
    cam.position.z = THREE.MathUtils.damp(cam.position.z, dist, 2.5, dt);
    cam.lookAt(0, mobile ? 1.0 : 0.45, 0);

    const g = group.current;
    if (g) {
      g.position.set(mobile ? -2.35 : 0, mobile ? 1.0 : 0, 0);
      g.scale.setScalar(mobile ? 0.8 : 1);
    }
  });

  return (
    <group ref={group}>
      <FlowerField
        flowersRef={plantsRef}
        windRef={windRef}
        maxPerKind={maxPerKind}
        reduced={reduced}
        options={{ stiffness: 14, gustGain: 1.1, reach: 0.32 }}
      />
      <DriftingPetals count={small ? 36 : 70} plantsRef={plantsRef} windRef={windRef} reduced={reduced} />
      <Grass count={small ? 60 : 110} windRef={windRef} reduced={reduced} />
      <Pollen count={small ? 50 : 110} reduced={reduced} />
    </group>
  );
}

export function HeroCanvas({
  active,
  progress,
}: {
  active: boolean;
  progress: React.RefObject<number>;
}) {
  const reduced = useReducedMotion();
  const [dpr, setDpr] = useState(() =>
    typeof window !== "undefined" ? Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.5 : 1.75) : 1,
  );
  return (
    <Canvas
      flat
      dpr={dpr}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 1.2, 9.5], fov: 34, near: 0.1, far: 60 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} flipflops={2} />
      <color attach="background" args={[CREAM]} />
      <fog attach="fog" args={[CREAM, 9, 19]} />
      <hemisphereLight args={["#fff6ea", "#e6d6c6", 1.15]} />
      <directionalLight position={[-3, 6, 5]} intensity={1.5} color="#fff3e2" />
      <directionalLight position={[5, 2, -4]} intensity={0.6} color="#ffd9df" />
      <Backdrop />
      <Meadow progress={progress} reduced={reduced} />
    </Canvas>
  );
}

