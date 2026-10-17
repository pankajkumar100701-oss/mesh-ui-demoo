"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, PerformanceMonitor, PresentationControls } from "@react-three/drei";
import { createRandom } from "@/lib/random";
import { HEAD_SCALE, KINDS, makeFlower, type Flower, type Kind } from "./flora";
import { FlowerField, useCanvasWind, useReducedMotion } from "./Field";

export type Counts = Record<Kind, number>;
export type WrapStyle = { paper: string; tissue: string; ribbon: string };

export const MAX_STEMS = 12;
const MAX_PER_KIND: Counts = { rose: MAX_STEMS, tulip: MAX_STEMS, peony: MAX_STEMS, daisy: MAX_STEMS };
const BG = "#efe6da";
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const TIE_Y = -1.25;
const BASE_Y = -1.9;

type Stem = Flower & {
  key: string;
  alive: boolean;
  tBase: THREE.Vector3;
  tLean: THREE.Vector2;
  tHeight: number;
  tColor: THREE.Color;
  jitter: number;
};

/** Stable 0..1 hash of a stem key, so each stem keeps its own character between rebuilds. */
function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const RANK: Record<Kind, number> = { peony: 0, rose: 1, tulip: 2.1, daisy: 2.4 };

/** Dome radius for n stems — the bouquet widens as it fills. */
const domeRadius = (n: number) => 0.3 + 0.2 * Math.sqrt(Math.max(1, n));

/* ------------------------------------------------------------------ */
/* Wrapping paper                                                       */
/* ------------------------------------------------------------------ */

function makeWrapGeometry(kind: "paper" | "tissue") {
  const segU = 72;
  const segV = 14;
  const gap = kind === "paper" ? 0.62 : 0.0;
  const phi0 = gap;
  const phi1 = Math.PI * 2 - gap;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const rBot = 0.2;
  const yBot = TIE_Y;
  for (let j = 0; j <= segV; j++) {
    const v = j / segV;
    for (let i = 0; i <= segU; i++) {
      const u = i / segU;
      const phi = phi0 + (phi1 - phi0) * u;
      const back = 0.5 - 0.5 * Math.cos(phi); // 0 at front, 1 at back
      let yTop: number;
      let rTop: number;
      if (kind === "paper") {
        yTop = -0.25 + 0.55 * back + 0.06 * Math.sin(phi * 4);
        rTop = 0.86;
      } else {
        yTop = -0.02 + 0.4 * back + 0.09 * Math.sin(phi * 9) + 0.05 * Math.sin(phi * 23);
        rTop = 0.8;
      }
      const edge = kind === "paper" ? Math.max(Math.exp(-u * 14), Math.exp(-(1 - u) * 14)) : 0;
      const pleat = (kind === "paper" ? 0.05 : 0.08) * Math.sin(phi * (kind === "paper" ? 9 : 15)) * v;
      const r = (rBot + (rTop - rBot) * Math.pow(v, 0.85)) * (1 + pleat) + edge * 0.2 * v * v;
      const y = yBot + (yTop - yBot) * v + edge * 0.08 * v;
      pos.push(Math.sin(phi) * r, y, Math.cos(phi) * r);
      uvs.push(u, v);
    }
  }
  const row = segU + 1;
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Crinkle shading baked as vertex colour: folds catch the light differently.
  const col = new Float32Array((pos.length / 3) * 3);
  for (let k = 0; k < pos.length / 3; k++) {
    const u = uvs[k * 2];
    const v = uvs[k * 2 + 1];
    const s = 0.9 + 0.1 * Math.sin(u * 140 + v * 6) * Math.sin(u * 37) + 0.06 * v;
    col[k * 3] = s;
    col[k * 3 + 1] = s;
    col[k * 3 + 2] = s;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function Wrap({ style, radius, bump }: { style: WrapStyle; radius: React.RefObject<number>; bump: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const paperMat = useRef<THREE.MeshStandardMaterial>(null);
  const tissueMat = useRef<THREE.MeshStandardMaterial>(null);
  const ribbonMat = useRef<THREE.MeshStandardMaterial>(null);
  const geos = useMemo(() => ({ paper: makeWrapGeometry("paper"), tissue: makeWrapGeometry("tissue") }), []);
  useEffect(
    () => () => {
      geos.paper.dispose();
      geos.tissue.dispose();
    },
    [geos],
  );
  const target = useRef({ paper: new THREE.Color(), tissue: new THREE.Color(), ribbon: new THREE.Color() });

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const g = group.current;
    if (!g) return;
    const R = radius.current ?? 1;
    const s = THREE.MathUtils.damp(g.scale.x, R, 4, dt);
    const b = bump.current ?? 0;
    g.scale.set(s * (1 + b * 0.06), 1 + b * 0.05, s * (1 + b * 0.06));
    const T = target.current;
    T.paper.set(style.paper);
    T.tissue.set(style.tissue);
    T.ribbon.set(style.ribbon);
    const k = 1 - Math.exp(-6 * dt);
    for (const m of [paperMat.current, tissueMat.current]) {
      if (!m) continue;
      m.color.lerp(m === paperMat.current ? T.paper : T.tissue, k);
      m.emissive.copy(m.color).multiplyScalar(m === paperMat.current ? 0.12 : 0.3);
    }
    ribbonMat.current?.color.lerp(T.ribbon, k);
  });

  return (
    <group>
      <group ref={group}>
        <mesh geometry={geos.paper}>
          <meshStandardMaterial ref={paperMat} vertexColors side={THREE.DoubleSide} roughness={0.92} color={style.paper} />
        </mesh>
        <mesh geometry={geos.tissue} scale={[0.97, 1, 0.97]} position={[0, 0.02, -0.02]}>
          <meshStandardMaterial
            ref={tissueMat}
            vertexColors
            side={THREE.DoubleSide}
            roughness={0.85}
            color={style.tissue}
            transparent
            opacity={0.92}
          />
        </mesh>
      </group>
      {/* Ribbon: a band, a bow and two tails at the tie */}
      <group position={[0, TIE_Y + 0.02, 0]}>
        <mesh scale={[1, 0.7, 1]}>
          <torusGeometry args={[0.215, 0.04, 10, 48]} />
          <meshStandardMaterial ref={ribbonMat} color={style.ribbon} roughness={0.45} />
        </mesh>
        <RibbonBow color={style.ribbon} />
      </group>
    </group>
  );
}

function RibbonBow({ color }: { color: string }) {
  return (
    <group position={[0, 0, 0.24]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.13, 0.02, 0]} rotation={[0, s * 0.35, s * 0.35]} scale={[1.5, 0.75, 0.6]}>
          <torusGeometry args={[0.08, 0.022, 8, 28]} />
          <meshStandardMaterial color={color} roughness={0.42} />
        </mesh>
      ))}
      <mesh>
        <sphereGeometry args={[0.04, 12, 10]} />
        <meshStandardMaterial color={color} roughness={0.42} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`t${s}`} position={[s * 0.07, -0.2, 0.02]} rotation={[0.1, 0, s * 0.28]}>
          <boxGeometry args={[0.055, 0.36, 0.008]} />
          <meshStandardMaterial color={color} roughness={0.42} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The bouquet                                                          */
/* ------------------------------------------------------------------ */

function Arrangement({
  counts,
  palette,
  wrap,
  reduced,
}: {
  counts: Counts;
  palette: Record<Kind, string>;
  wrap: WrapStyle;
  reduced: boolean;
}) {
  const stemsRef = useRef<Map<string, Stem> | null>(null);
  if (stemsRef.current === null) stemsRef.current = new Map();
  const listRef = useRef<Flower[] | null>(null);
  if (listRef.current === null) listRef.current = [];
  const radius = useRef(1);
  const bump = useRef(0);
  const windRef = useCanvasWind();

  // Rebuild targets whenever the recipe changes: new stems sprout, others glide to their new places.
  useEffect(() => {
    const map = stemsRef.current;
    if (!map) return;
    const wanted: { key: string; kind: Kind; rank: number }[] = [];
    for (const kind of KINDS) {
      for (let i = 0; i < counts[kind]; i++) {
        const key = `${kind}-${i}`;
        wanted.push({ key, kind, rank: RANK[kind] + hash01(key) * 1.6 });
      }
    }
    wanted.sort((a, b) => a.rank - b.rank);
    const n = wanted.length;
    const R = domeRadius(n);
    radius.current = R;
    const keep = new Set(wanted.map((w) => w.key));
    for (const [key, s] of map) if (!keep.has(key)) s.alive = false;

    wanted.forEach((w, i) => {
      const j = hash01(w.key + "j");
      const rr = R * Math.sqrt((i + 0.5) / n) * 0.92;
      const th = i * GOLDEN + 0.4;
      const hx = Math.sin(th) * rr;
      const hz = Math.cos(th) * rr;
      const hy = 0.85 - (0.6 * rr * rr) / Math.max(0.4, R) + (j - 0.5) * 0.14 + (w.kind === "tulip" ? 0.1 : 0);
      const bx = Math.sin(j * 40) * 0.045;
      const bz = Math.cos(j * 40) * 0.045;
      let s = map.get(w.key);
      if (!s) {
        const rnd = createRandom(Math.floor(j * 1e6) + 3);
        const f = makeFlower(
          {
            kind: w.kind,
            base: new THREE.Vector3(bx, BASE_Y, bz),
            height: hy - BASE_Y,
            headScale: HEAD_SCALE[w.kind] * (w.kind === "peony" ? 1.45 : w.kind === "daisy" ? 1.2 : 1.55) * (0.92 + j * 0.16),
            face: new THREE.Vector3(0, 0.4, 0),
            leaves:
              j > 0.45
                ? [{ t: 0.8 + j * 0.06, az: j * 20, tilt: 1.05, size: w.kind === "tulip" ? 0.62 : 0.48 }]
                : [],
          },
          rnd,
        );
        s = Object.assign(f, {
          key: w.key,
          alive: true,
          tBase: new THREE.Vector3(),
          tLean: new THREE.Vector2(),
          tHeight: 0,
          tColor: new THREE.Color(),
          jitter: j,
        });
        s.lean.set(hx - bx, hz - bz);
        map.set(w.key, s);
      }
      s.alive = true;
      s.tBase.set(bx, BASE_Y, bz);
      s.tLean.set(hx - bx, hz - bz);
      s.tHeight = hy - BASE_Y;
      s.tColor.set(palette[w.kind]).offsetHSL((j - 0.5) * 0.025, 0, (j - 0.5) * 0.07);
      if (s.grow < 0.01) s.color.copy(s.tColor);
    });
  }, [counts, palette]);

  useEffect(() => {
    bump.current = 1;
  }, [wrap]);

  const group = useRef<THREE.Group>(null);
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const map = stemsRef.current;
    const list = listRef.current;
    if (!map || !list) return;
    list.length = 0;
    const kc = 1 - Math.exp(-5 * dt);
    map.forEach((s, key) => {
      const growGoal = s.alive ? 1 : 0;
      s.grow = THREE.MathUtils.damp(s.grow, growGoal, s.alive ? 2.2 + s.jitter : 6, dt);
      if (s.alive && s.grow > 0.999) s.grow = 1;
      const openGoal = s.alive && s.grow > 0.7 ? 1 : 0;
      s.open = THREE.MathUtils.damp(s.open, openGoal, s.alive ? 1.8 : 8, dt);
      s.base.lerp(s.tBase, kc);
      s.lean.lerp(s.tLean, kc);
      s.height = THREE.MathUtils.damp(s.height, s.tHeight, 5, dt);
      s.color.lerp(s.tColor, kc);
      if (!s.alive && s.grow < 0.003) {
        map.delete(key);
        return;
      }
      list.push(s);
    });
    bump.current = Math.max(0, (bump.current ?? 0) - dt * 2.2);
    const g = group.current;
    if (g && !reduced) {
      const t = state.clock.elapsedTime;
      g.rotation.y += dt * 0.12;
      g.rotation.z = Math.sin(t * 0.6) * 0.015;
      g.position.y = Math.sin(t * 0.9) * 0.03;
    }
  });

  return (
    <group ref={group}>
      <FlowerField
        flowersRef={listRef}
        windRef={windRef}
        maxPerKind={MAX_PER_KIND}
        reduced={reduced}
        glow={0.2}
        options={{ stiffness: 24, gustGain: 0.55, breeze: 0.35, reach: 0.45 }}
      />
      <Wrap style={wrap} radius={radius} bump={bump} />
    </group>
  );
}

function Rig() {
  const mobile = useThree((s) => s.size.width / Math.max(1, s.size.height) < 0.9);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(0, mobile ? 1.1 : 1.0, mobile ? 8.6 : 7.0);
    camera.lookAt(0, -0.25, 0);
  }, [camera, mobile]);
  return null;
}

export function BouquetCanvas({
  active,
  counts,
  palette,
  wrap,
}: {
  active: boolean;
  counts: Counts;
  palette: Record<Kind, string>;
  wrap: WrapStyle;
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
      camera={{ position: [0, 0.9, 7.8], fov: 34 }}
      gl={{ antialias: true }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} flipflops={2} />
      <Rig />
      <color attach="background" args={[BG]} />
      <hemisphereLight args={["#fff8ee", "#e2d6c6", 1.1]} />
      <directionalLight position={[-3, 5, 5]} intensity={1.6} color="#fff3e2" />
      <directionalLight position={[4, 2, -3]} intensity={0.55} color="#ffe1e6" />
      <PresentationControls
        global={false}
        cursor
        snap
        speed={1.3}
        polar={[-0.2, 0.25]}
        azimuth={[-Math.PI / 1.4, Math.PI / 1.4]}
      >
        <Arrangement counts={counts} palette={palette} wrap={wrap} reduced={reduced} />
      </PresentationControls>
      <ContactShadows
        position={[0, BASE_Y - 0.06, 0]}
        opacity={0.38}
        scale={4.5}
        blur={2.4}
        far={2.5}
        resolution={256}
        color="#7a6552"
      />
    </Canvas>
  );
}
