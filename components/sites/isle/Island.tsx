"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { createRandom } from "@/lib/random";
import {
  ATMOS,
  CABIN,
  DOCK,
  FALLS,
  PALETTE,
  POOL,
  SOFT_POINT_FRAG,
  STREAM_START,
  TIER,
  jitter,
  type Mix,
  type Quality,
} from "./shared";

/** Live island state other parts of the scene read (hotspots, camera). */
export const ISLAND = { bob: 0 };

/* Shared emissive materials whose glow follows the night mix (see GlowDriver). */
const glowMaterial = (color: string, base: string) =>
  new THREE.MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: 0, toneMapped: false, flatShading: true });
const WINDOW_MAT = glowMaterial("#ffb347", "#4a3422");
const LANTERN_MAT = glowMaterial("#ffc46b", "#f6e2b3");
const PATH_MAT = glowMaterial("#ffbf5e", "#f1e3c2");
const CRYSTAL_MAT = glowMaterial("#5eead4", "#8fd8e0");
const FALLS_UNIFORMS = { uTime: ATMOS.uTime, uNight: ATMOS.uMix };

function GlowDriver({ mixRef }: { mixRef: Mix }) {
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const m = THREE.MathUtils.smoothstep(mixRef.current, 0.35, 0.9);
    const flicker = 1 + Math.sin(t * 9) * 0.04 + Math.sin(t * 23) * 0.03;
    WINDOW_MAT.emissiveIntensity = m * 3.4 * flicker;
    LANTERN_MAT.emissiveIntensity = 0.2 + m * 5 * flicker;
    PATH_MAT.emissiveIntensity = m * 4.5 * flicker;
    CRYSTAL_MAT.emissiveIntensity = 0.15 + m * (2.4 + Math.sin(t * 1.5) * 0.4);
  });
  return null;
}

function NightLight({ mixRef, position, strength = 7, color = "#ffb04a" }: { mixRef: Mix; position: [number, number, number]; strength?: number; color?: string }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (light.current) light.current.intensity = THREE.MathUtils.smoothstep(mixRef.current, 0.35, 0.9) * strength;
  });
  return <pointLight ref={light} position={position} color={color} distance={5} decay={1.6} intensity={0} />;
}

/* ------------------------------------------------------------------ */
/* The island body                                                     */
/* ------------------------------------------------------------------ */

function IslandBody() {
  const geo = useMemo(
    () => ({
      top: jitter(new THREE.CylinderGeometry(4.2, 4.15, 0.7, 16, 1), 0.12, 1, 0.34),
      beach: jitter(new THREE.CylinderGeometry(4.42, 4.3, 0.32, 16, 1), 0.1, 2),
      rock: jitter(new THREE.ConeGeometry(4.3, 3.2, 13, 3), 0.32, 3, 1.5),
      rockLow: jitter(new THREE.ConeGeometry(1.75, 3.6, 10, 3), 0.22, 6, 1.7),
      rockTail: jitter(new THREE.ConeGeometry(0.75, 2.2, 7, 2), 0.12, 4),
      spike: jitter(new THREE.ConeGeometry(0.6, 1.8, 6, 2), 0.1, 8),
      tier: jitter(new THREE.CylinderGeometry(1.3, 1.55, 0.8, 10, 1), 0.08, 5, 0.39),
    }),
    [],
  );
  const crystals = useMemo(() => {
    const random = createRandom(91);
    return Array.from({ length: 9 }, () => {
      const a = random() * Math.PI * 2;
      const r = 1.2 + random() * 1.6;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: -1.9 - random() * 1.4, s: 0.1 + random() * 0.12, rx: random() * 0.6 };
    });
  }, []);

  return (
    <group>
      <mesh geometry={geo.top} position={[0, 0.05, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={PALETTE.grass} flatShading roughness={0.9} />
      </mesh>
      <mesh geometry={geo.beach} position={[0, -0.2, 0]} receiveShadow castShadow>
        <meshStandardMaterial color={PALETTE.sand} flatShading roughness={1} />
      </mesh>
      <mesh geometry={geo.rock} position={[0, -1.95, 0]} rotation={[Math.PI, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={PALETTE.rock} flatShading roughness={1} />
      </mesh>
      <mesh geometry={geo.rockLow} position={[0.15, -4.2, 0.1]} rotation={[Math.PI, 0.5, 0]} castShadow>
        <meshStandardMaterial color={PALETTE.rockDark} flatShading roughness={1} />
      </mesh>
      <mesh geometry={geo.rockTail} position={[0.3, -6.4, 0]} rotation={[Math.PI, 0.4, 0]}>
        <meshStandardMaterial color={PALETTE.rockDeep} flatShading roughness={1} />
      </mesh>
      {/* Hanging spikes give the underside a craggy, stalactite silhouette. */}
      {[
        [2.2, -2.3, 1.0, 0.9],
        [-2.0, -2.2, -1.3, 1],
        [-0.7, -2.4, 2.3, 0.75],
        [1.2, -2.3, -2.2, 0.8],
      ].map(([x, y, z, s], i) => (
        <mesh key={i} geometry={geo.spike} position={[x, y, z]} rotation={[Math.PI, i, 0]} scale={s} castShadow>
          <meshStandardMaterial color={i % 2 ? PALETTE.rockDark : PALETTE.rock} flatShading roughness={1} />
        </mesh>
      ))}
      <mesh geometry={geo.tier} position={[TIER.x, 0.8, TIER.z]} castShadow receiveShadow>
        <meshStandardMaterial color={PALETTE.grassDark} flatShading roughness={0.9} />
      </mesh>
      {/* Crystals hanging from the underside glow softly after dark. */}
      {crystals.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]} rotation={[Math.PI + c.rx, i, 0]} scale={[c.s, c.s * 2.6, c.s]} material={CRYSTAL_MAT}>
          <octahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
    </group>
  );
}

/** Small satellite islets with their own tree, bobbing out of sync. */
function Islets() {
  const group = useRef<THREE.Group>(null);
  const islets = useMemo(
    () => [
      { p: [-6.4, -1.2, -2.6] as const, s: 0.55, ph: 0.4 },
      { p: [5.2, -2.6, -4.6] as const, s: 0.42, ph: 2.1 },
      { p: [-3.2, -3.6, 5.6] as const, s: 0.34, ph: 4.2 },
    ],
    [],
  );
  const rock = useMemo(() => jitter(new THREE.ConeGeometry(1.3, 1.9, 8, 2), 0.14, 12), []);
  const top = useMemo(() => jitter(new THREE.CylinderGeometry(1.32, 1.3, 0.3, 8, 1), 0.05, 13, 0.14), []);
  useFrame(({ clock }) => {
    group.current?.children.forEach((child, i) => {
      const it = islets[i];
      child.position.y = it.p[1] + Math.sin(clock.elapsedTime * 0.5 + it.ph) * 0.3;
      child.rotation.y = clock.elapsedTime * 0.03 + it.ph;
    });
  });
  return (
    <group ref={group}>
      {islets.map((it, i) => (
        <group key={i} position={[...it.p]} scale={it.s}>
          <mesh geometry={top} castShadow receiveShadow>
            <meshStandardMaterial color={PALETTE.grass} flatShading />
          </mesh>
          <mesh geometry={rock} position={[0, -1.1, 0]} rotation={[Math.PI, 0, 0]} castShadow>
            <meshStandardMaterial color={PALETTE.rock} flatShading />
          </mesh>
          <group position={[0.2, 0.15, 0.1]} scale={1.6}>
            <mesh position={[0, 0.2, 0]}>
              <cylinderGeometry args={[0.05, 0.08, 0.4, 5]} />
              <meshStandardMaterial color={PALETTE.trunk} flatShading />
            </mesh>
            <mesh position={[0, 0.62, 0]} castShadow>
              <icosahedronGeometry args={[0.34, 0]} />
              <meshStandardMaterial color={i === 1 ? PALETTE.blossom : PALETTE.leaf} flatShading />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Trees that sway in the breeze                                       */
/* ------------------------------------------------------------------ */

type TreeKind = "pine" | "round" | "blossom";

function Trees({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const trees = useMemo(() => {
    const random = createRandom(11);
    const avoid: [THREE.Vector3, number][] = [
      [CABIN, 1.35],
      [POOL, 1.45],
      [TIER, 1.75],
      [FALLS, 1.1],
      [DOCK, 0.8],
      [new THREE.Vector3(-2.9, 0.4, 1.15), 0.7],
      [new THREE.Vector3(1.3, 0.4, 0.1), 0.6],
    ];
    const list: { x: number; z: number; y: number; scale: number; kind: TreeKind; rot: number; phase: number }[] = [];
    let tries = 0;
    while (list.length < 24 && tries < 700) {
      tries++;
      const angle = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * 3.65;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const p = new THREE.Vector3(x, 0.4, z);
      if (avoid.some(([c, d]) => p.distanceTo(c) < d)) continue;
      if (list.some((t) => Math.hypot(t.x - x, t.z - z) < 0.6)) continue;
      const roll = random();
      list.push({
        x,
        z,
        y: 0.4,
        scale: 0.7 + random() * 0.6,
        kind: roll > 0.5 ? "pine" : roll > 0.18 ? "round" : "blossom",
        rot: random() * 6,
        phase: random() * Math.PI * 2,
      });
    }
    list.push({ x: TIER.x - 0.6, z: TIER.z - 0.5, y: 1.2, scale: 1.1, kind: "pine", rot: 0.4, phase: 1 });
    list.push({ x: TIER.x - 0.1, z: TIER.z - 0.85, y: 1.2, scale: 0.8, kind: "pine", rot: 1.2, phase: 2 });
    return list;
  }, []);

  useFrame(({ clock }) => {
    if (reducedMotion || !group.current) return;
    const t = clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      const tr = trees[i];
      const gust = 0.5 + 0.5 * Math.sin(t * 0.35 + tr.x * 0.3);
      child.rotation.z = Math.sin(t * 1.6 + tr.phase) * 0.035 * (0.5 + gust);
      child.rotation.x = Math.cos(t * 1.25 + tr.phase * 1.3) * 0.025 * (0.5 + gust);
    });
  });

  return (
    <group ref={group}>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, t.y, t.z]} scale={t.scale}>
          <group rotation={[0, t.rot, 0]}>
            <mesh position={[0, 0.2, 0]} castShadow>
              <cylinderGeometry args={[0.06, 0.09, 0.4, 5]} />
              <meshStandardMaterial color={PALETTE.trunk} flatShading />
            </mesh>
            {t.kind === "pine" ? (
              <>
                <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
                  <coneGeometry args={[0.4, 0.6, 6]} />
                  <meshStandardMaterial color={i % 3 === 0 ? PALETTE.pineDark : PALETTE.pine} flatShading />
                </mesh>
                <mesh position={[0, 0.88, 0]} castShadow>
                  <coneGeometry args={[0.29, 0.5, 6]} />
                  <meshStandardMaterial color={i % 3 === 0 ? PALETTE.pineDark : PALETTE.pine} flatShading />
                </mesh>
                <mesh position={[0, 1.13, 0]} castShadow>
                  <coneGeometry args={[0.17, 0.34, 6]} />
                  <meshStandardMaterial color={PALETTE.pine} flatShading />
                </mesh>
              </>
            ) : (
              <>
                <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
                  <icosahedronGeometry args={[0.36, 0]} />
                  <meshStandardMaterial color={t.kind === "blossom" ? PALETTE.blossom : i % 2 ? PALETTE.leaf : PALETTE.leafWarm} flatShading />
                </mesh>
                <mesh position={[0.14, 0.86, 0.06]} castShadow>
                  <icosahedronGeometry args={[0.22, 0]} />
                  <meshStandardMaterial color={t.kind === "blossom" ? "#f9c2cf" : PALETTE.leaf} flatShading />
                </mesh>
              </>
            )}
          </group>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Cabin with chimney smoke                                            */
/* ------------------------------------------------------------------ */

function ChimneySmoke({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const COUNT = 6;
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime * (reducedMotion ? 0.2 : 1);
    group.current.children.forEach((puff, i) => {
      const k = (t * 0.22 + i / COUNT) % 1;
      puff.position.set(Math.sin(k * 5 + i) * 0.08 + k * 0.35, k * 1.5, -k * 0.15);
      puff.scale.setScalar(0.06 + k * 0.2);
      const mat = (puff as THREE.Mesh).material as THREE.MeshStandardMaterial;
      mat.opacity = Math.sin(k * Math.PI) * 0.55;
    });
  });
  return (
    <group ref={group} position={[0.3, 1.45, -0.15]}>
      {Array.from({ length: COUNT }, (_, i) => (
        <mesh key={i}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color="#f3ede4" transparent opacity={0} depthWrite={false} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function Cabin({ mixRef, reducedMotion }: { mixRef: Mix; reducedMotion: boolean }) {
  const rotation = Math.atan2(CABIN.x, CABIN.z);
  return (
    <group position={CABIN} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.25, 0.14, 1.05]} />
        <meshStandardMaterial color={PALETTE.stone} flatShading />
      </mesh>
      <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.72, 0.9]} />
        <meshStandardMaterial color={PALETTE.wood} flatShading />
      </mesh>
      <mesh position={[0, 1.1, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.98, 0.62, 4]} />
        <meshStandardMaterial color={PALETTE.roof} flatShading />
      </mesh>
      <mesh position={[0.3, 1.25, -0.15]} castShadow>
        <boxGeometry args={[0.14, 0.4, 0.14]} />
        <meshStandardMaterial color={PALETTE.stone} flatShading />
      </mesh>
      <ChimneySmoke reducedMotion={reducedMotion} />
      {[-0.28, 0.28].map((x) => (
        <mesh key={x} position={[x, 0.55, 0.452]} material={WINDOW_MAT}>
          <planeGeometry args={[0.24, 0.24]} />
        </mesh>
      ))}
      <mesh position={[0.552, 0.55, 0]} rotation={[0, Math.PI / 2, 0]} material={WINDOW_MAT}>
        <planeGeometry args={[0.3, 0.24]} />
      </mesh>
      <mesh position={[-0.552, 0.55, 0]} rotation={[0, -Math.PI / 2, 0]} material={WINDOW_MAT}>
        <planeGeometry args={[0.3, 0.24]} />
      </mesh>
      <mesh position={[0, 0.33, 0.452]}>
        <planeGeometry args={[0.2, 0.4]} />
        <meshStandardMaterial color="#5b3a24" />
      </mesh>
      <mesh position={[0, 0.06, 0.66]} receiveShadow castShadow>
        <boxGeometry args={[1.2, 0.06, 0.42]} />
        <meshStandardMaterial color="#b07a4a" flatShading />
      </mesh>
      {/* Porch lantern */}
      <mesh position={[0.42, 0.62, 0.5]} material={LANTERN_MAT}>
        <octahedronGeometry args={[0.06, 0]} />
      </mesh>
      <NightLight mixRef={mixRef} position={[0, 0.7, 1]} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Spa with a koi pool                                                 */
/* ------------------------------------------------------------------ */

function Koi({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const fish = useMemo(
    () => [
      { r: 0.38, speed: 0.55, phase: 0, color: "#ff7a3d" },
      { r: 0.26, speed: -0.75, phase: 2, color: "#fff4e6" },
      { r: 0.46, speed: 0.4, phase: 4, color: "#ffb347" },
    ],
    [],
  );
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime * (reducedMotion ? 0.3 : 1);
    group.current.children.forEach((f, i) => {
      const k = fish[i];
      const a = k.phase + t * k.speed;
      f.position.set(Math.cos(a) * k.r, 0.085, Math.sin(a) * k.r);
      f.rotation.y = -a + (k.speed > 0 ? Math.PI : 0);
      f.children[1].rotation.y = Math.sin(t * 8 + i) * 0.5;
    });
  });
  return (
    <group ref={group}>
      {fish.map((f, i) => (
        <group key={i}>
          <mesh scale={[0.05, 0.03, 0.12]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color={f.color} emissive={f.color} emissiveIntensity={0.15} />
          </mesh>
          <group position={[0, 0, 0.11]}>
            <mesh position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.4]}>
              <coneGeometry args={[0.045, 0.08, 4]} />
              <meshStandardMaterial color={f.color} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

function Spa({ mixRef, reducedMotion }: { mixRef: Mix; reducedMotion: boolean }) {
  const water = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!water.current) return;
    const m = THREE.MathUtils.smoothstep(mixRef.current, 0.35, 0.9);
    water.current.emissiveIntensity = 0.12 + m * (1.4 + Math.sin(clock.elapsedTime * 2) * 0.2);
  });
  return (
    <group position={POOL}>
      {/* Stone rim, open in the middle so the koi show through the water. */}
      <mesh position={[0, 0.08, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.85, 0.88, 0.16, 10, 1, true]} />
        <meshStandardMaterial color={PALETTE.stone} flatShading side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[0.66, 0.85, 10]} />
        <meshStandardMaterial color={PALETTE.stone} flatShading />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.67, 10]} />
        <meshStandardMaterial color="#1f8f95" />
      </mesh>
      <Koi reducedMotion={reducedMotion} />
      <mesh position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.67, 10]} />
        <meshStandardMaterial
          ref={water}
          color={PALETTE.water}
          emissive="#2dd4bf"
          emissiveIntensity={0.12}
          roughness={0.08}
          metalness={0.1}
          transparent
          opacity={0.55}
          toneMapped={false}
        />
      </mesh>
      {/* Pavilion */}
      <group position={[0.95, 0, -0.75]}>
        {[
          [-0.3, -0.3],
          [0.3, -0.3],
          [-0.3, 0.3],
          [0.3, 0.3],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.32, z]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.64, 5]} />
            <meshStandardMaterial color="#f4ede0" />
          </mesh>
        ))}
        <mesh position={[0, 0.72, 0]} castShadow>
          <coneGeometry args={[0.6, 0.3, 4]} />
          <meshStandardMaterial color="#f2c48d" flatShading />
        </mesh>
        <mesh position={[0, 0.5, 0]} material={LANTERN_MAT}>
          <octahedronGeometry args={[0.07, 0]} />
        </mesh>
      </group>
      {/* Loungers + parasol */}
      {[-0.35, 0.15].map((x, i) => (
        <mesh key={i} position={[x - 0.6, 0.06, 0.95]} rotation={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.22, 0.08, 0.55]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      ))}
      <group position={[-1.05, 0, 0.5]}>
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.6, 4]} />
          <meshStandardMaterial color="#e5e7eb" />
        </mesh>
        <mesh position={[0, 0.6, 0]} castShadow>
          <coneGeometry args={[0.32, 0.14, 8]} />
          <meshStandardMaterial color="#f97362" flatShading />
        </mesh>
      </group>
      <NightLight mixRef={mixRef} position={[0, 0.6, 0]} strength={3} color="#7af0e0" />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Lookout with a fluttering flag                                      */
/* ------------------------------------------------------------------ */

function Flag({ reducedMotion }: { reducedMotion: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.46, 0.26, 12, 4);
    g.translate(0.23, 0, 0);
    return g;
  }, []);
  const base = useMemo(() => Float32Array.from(geometry.attributes.position.array), [geometry]);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const t = clock.elapsedTime * (reducedMotion ? 0.25 : 1);
    const geo = mesh.current.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const k = x / 0.46;
      pos.setZ(i, Math.sin(x * 14 - t * 7 + y * 3) * 0.05 * k);
      pos.setY(i, y - k * k * 0.03);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });
  return (
    <mesh ref={mesh} geometry={geometry} castShadow>
      <meshStandardMaterial color="#f97362" side={THREE.DoubleSide} />
    </mesh>
  );
}

function Lookout({ mixRef, reducedMotion }: { mixRef: Mix; reducedMotion: boolean }) {
  return (
    <group position={[TIER.x, 1.2, TIER.z]}>
      <mesh position={[0.5, 0.6, 0.3]} castShadow>
        <cylinderGeometry args={[0.02, 0.025, 1.2, 4]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <group position={[0.51, 1.05, 0.3]}>
        <Flag reducedMotion={reducedMotion} />
      </group>
      {/* Bench + telescope */}
      <mesh position={[0.2, 0.1, 0.7]} rotation={[0, -0.6, 0]} castShadow>
        <boxGeometry args={[0.6, 0.06, 0.18]} />
        <meshStandardMaterial color={PALETTE.trunk} />
      </mesh>
      <group position={[0.75, 0, 0.75]} rotation={[0, 0.8, 0]}>
        <mesh position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.012, 0.03, 0.32, 3]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
        <mesh position={[0, 0.34, 0]} rotation={[0, 0, 1]}>
          <cylinderGeometry args={[0.03, 0.04, 0.32, 6]} />
          <meshStandardMaterial color="#c9a227" metalness={0.6} roughness={0.35} />
        </mesh>
      </group>
      {/* Lantern post */}
      <mesh position={[-0.3, 0.35, 0.55]}>
        <cylinderGeometry args={[0.025, 0.03, 0.7, 5]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[-0.3, 0.75, 0.55]} material={LANTERN_MAT}>
        <octahedronGeometry args={[0.1, 0]} />
      </mesh>
      <NightLight mixRef={mixRef} position={[-0.3, 0.9, 0.55]} strength={6} />
    </group>
  );
}

function PathLanterns() {
  const stones = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 1; i < 7; i++) {
      const t = i / 7;
      out.push([THREE.MathUtils.lerp(CABIN.x, POOL.x, t) + Math.sin(t * 6) * 0.25, THREE.MathUtils.lerp(CABIN.z + 0.7, POOL.z - 0.9, t)]);
    }
    return out;
  }, []);
  return (
    <group>
      {stones.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.41, z]} rotation={[0, i, 0]} receiveShadow>
          <cylinderGeometry args={[0.16, 0.18, 0.04, 6]} />
          <meshStandardMaterial color={PALETTE.stone} flatShading />
        </mesh>
      ))}
      {stones
        .filter((_, i) => i % 2 === 1)
        .map(([x, z], i) => (
          <group key={i} position={[x + 0.35, 0.4, z]}>
            <mesh position={[0, 0.18, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.36, 4]} />
              <meshStandardMaterial color="#334155" />
            </mesh>
            <mesh position={[0, 0.4, 0]} material={PATH_MAT}>
              <octahedronGeometry args={[0.06, 0]} />
            </mesh>
          </group>
        ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Waterfall: shader sheet + falling spray + mist                      */
/* ------------------------------------------------------------------ */

const FALL_HEIGHT = 10.5;

const fallsVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float drop = 1.0 - uv.y;
    p.z += (1.0 - pow(1.0 - drop, 4.0)) * 0.7 - drop * 0.15;
    p.x *= 1.0 + drop * 0.9;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fallsFragment = /* glsl */ `
  uniform float uTime;
  uniform float uNight;
  varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float x = vUv.x;
    float col1 = floor(x * 9.0);
    float speed = 0.55 + h(vec2(col1, 1.0)) * 0.4;
    float stripes = sin(vUv.y * 70.0 + uTime * 12.0 * speed + h(vec2(col1, 3.0)) * 6.0) * 0.5 + 0.5;
    float streak = smoothstep(0.3, 1.0, stripes) * (0.55 + 0.45 * sin(x * 40.0 + col1));
    vec3 base = mix(vec3(0.7, 0.93, 1.0), vec3(1.15), streak * 0.7);
    base *= mix(1.0, 0.45, uNight);
    base += vec3(0.1, 0.5, 0.45) * uNight * 0.25;
    float edge = smoothstep(0.0, 0.22, x) * smoothstep(1.0, 0.78, x);
    float fade = smoothstep(0.0, 0.3, vUv.y);
    float alpha = edge * fade * (0.8 + streak * 0.2);
    gl_FragColor = vec4(base, alpha);
  }
`;

const sprayVertex = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uHeight;
  uniform float uSize;
  uniform float uMist;
  varying float vAlpha;
  void main() {
    float k = fract(uTime * (0.12 + aSeed.y * 0.08) + aSeed.z);
    vec3 p;
    if (uMist > 0.5) {
      // Mist billows around the foot of the falls.
      p = vec3((aSeed.x - 0.5) * 2.4 + sin(uTime * 0.3 + aSeed.z * 6.0) * 0.3,
               -uHeight + 0.2 + k * 1.6,
               0.6 + (aSeed.y - 0.5) * 1.6);
      vAlpha = sin(k * 3.14159) * 0.55;
    } else {
      float fall = k * k;
      p = vec3((aSeed.x - 0.5) * (0.5 + fall * 0.9),
               -fall * uHeight,
               (1.0 - pow(1.0 - fall, 4.0)) * 0.75 + (aSeed.y - 0.5) * 0.25);
      vAlpha = (1.0 - smoothstep(0.75, 1.0, k)) * 0.8;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (12.0 / -mv.z) * (uMist > 0.5 ? (0.6 + k) : 1.0);
  }
`;

function Spray({ count, mist, size, color }: { count: number; mist: boolean; size: number; color: string }) {
  const { geometry, material } = useMemo(() => {
    const random = createRandom(mist ? 401 : 402);
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: sprayVertex,
      fragmentShader: SOFT_POINT_FRAG,
      uniforms: {
        uTime: ATMOS.uTime,
        uPixelRatio: ATMOS.uPixelRatio,
        uHeight: { value: FALL_HEIGHT - 0.6 },
        uSize: { value: size },
        uMist: { value: mist ? 1 : 0 },
        uColor: { value: new THREE.Color(color) },
      },
      transparent: true,
      depthWrite: false,
    });
    return { geometry: geo, material: mat };
  }, [count, mist, size, color]);
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

function Waterfall({ quality }: { quality: Quality }) {
  const angle = Math.atan2(FALLS.x, FALLS.z);
  const dir = new THREE.Vector3(FALLS.x, 0, FALLS.z).normalize();
  const edge = dir.clone().multiplyScalar(4.42);
  const streamEnd = dir.clone().multiplyScalar(4.25).setY(0.41);
  const streamLen = STREAM_START.distanceTo(streamEnd);
  const streamMid = STREAM_START.clone().add(streamEnd).multiplyScalar(0.5);
  const streamRot = Math.atan2(streamEnd.x - STREAM_START.x, streamEnd.z - STREAM_START.z);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: fallsVertex,
        fragmentShader: fallsFragment,
        uniforms: FALLS_UNIFORMS,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  return (
    <group>
      <mesh position={[STREAM_START.x, 0.41, STREAM_START.z]} receiveShadow>
        <cylinderGeometry args={[0.45, 0.45, 0.03, 10]} />
        <meshStandardMaterial color="#5cc8d6" roughness={0.15} emissive="#1aa6b8" emissiveIntensity={0.15} flatShading />
      </mesh>
      <mesh position={streamMid} rotation={[0, streamRot, 0]} receiveShadow>
        <boxGeometry args={[0.32, 0.03, streamLen]} />
        <meshStandardMaterial color="#5cc8d6" roughness={0.15} emissive="#1aa6b8" emissiveIntensity={0.15} />
      </mesh>
      <group position={[edge.x, 0.35, edge.z]} rotation={[0, angle, 0]}>
        <mesh position={[0, -FALL_HEIGHT / 2, 0]} material={material}>
          <planeGeometry args={[0.62, FALL_HEIGHT, 6, 40]} />
        </mesh>
        <Spray count={quality === "high" ? 160 : 70} mist={false} size={2.2} color="#e9fbff" />
        <Spray count={quality === "high" ? 40 : 18} mist size={34} color="#ffffff" />
      </group>
    </group>
  );
}

/** Mooring post for the balloon (the balloon itself drifts — see Life.tsx). */
function Dock() {
  return (
    <group position={DOCK}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.5, 5]} />
        <meshStandardMaterial color={PALETTE.trunk} />
      </mesh>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[0.7, 0.05, 0.5]} />
        <meshStandardMaterial color="#b07a4a" flatShading />
      </mesh>
    </group>
  );
}

export function IslandWorld({
  mixRef,
  quality,
  reducedMotion,
  children,
}: {
  mixRef: Mix;
  quality: Quality;
  reducedMotion: boolean;
  children?: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    ISLAND.bob = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.6) * 0.1;
    if (group.current) group.current.position.y = ISLAND.bob;
  });
  return (
    <>
      <GlowDriver mixRef={mixRef} />
      <group ref={group}>
        <IslandBody />
        <Trees reducedMotion={reducedMotion} />
        <Cabin mixRef={mixRef} reducedMotion={reducedMotion} />
        <Spa mixRef={mixRef} reducedMotion={reducedMotion} />
        <Lookout mixRef={mixRef} reducedMotion={reducedMotion} />
        <PathLanterns />
        <Waterfall quality={quality} />
        <Dock />
        {children}
      </group>
      <Islets />
    </>
  );
}
