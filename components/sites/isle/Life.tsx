"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { createRandom } from "@/lib/random";
import { ATMOS, SOFT_POINT_FRAG, type Mix, type Quality } from "./shared";

/** Where the balloon is right now (world space) — read by hotspots + camera. */
export const BALLOON_POS = new THREE.Vector3(-7, 3, 1);

const BALLOON_ORBIT = { radius: 7.4, start: 2.95, speed: 0.035 };

function balloonAt(t: number, out: THREE.Vector3) {
  const a = BALLOON_ORBIT.start + t * BALLOON_ORBIT.speed;
  return out.set(Math.cos(a) * BALLOON_ORBIT.radius, 2.7 + Math.sin(t * 0.35) * 0.45, Math.sin(a) * BALLOON_ORBIT.radius);
}

/* ------------------------------------------------------------------ */
/* Hot-air balloon drifting a slow loop around the island              */
/* ------------------------------------------------------------------ */

export function Balloon({ mixRef, reducedMotion }: { mixRef: Mix; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const flame = useRef<THREE.MeshBasicMaterial>(null);
  const envelope = useMemo(() => {
    // Teardrop lathe, split into coloured gores.
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = t * 2.1;
      const r = Math.sin(Math.pow(t, 0.75) * Math.PI) * 0.95 * (t < 0.3 ? 0.55 + t * 1.5 : 1) + (t < 0.05 ? 0.18 : 0);
      pts.push(new THREE.Vector2(Math.max(r, 0.001), y));
    }
    const lathe = new THREE.LatheGeometry(pts, 14).toNonIndexed();
    const pos = lathe.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const a = new THREE.Color("#ef7d57");
    const b = new THREE.Color("#fff1d6");
    const band = new THREE.Color("#f4c15d");
    for (let f = 0; f < pos.count; f += 3) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let k = 0; k < 3; k++) {
        cx += pos.getX(f + k);
        cy += pos.getY(f + k);
        cz += pos.getZ(f + k);
      }
      const gore = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 14);
      const col = cy / 3 > 1.15 && cy / 3 < 1.35 ? band : gore % 2 ? a : b;
      for (let k = 0; k < 3; k++) colors.set([col.r, col.g, col.b], (f + k) * 3);
    }
    lathe.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    lathe.computeVertexNormals();
    return lathe;
  }, []);

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime;
    balloonAt(t, BALLOON_POS);
    if (group.current) {
      group.current.position.copy(BALLOON_POS);
      group.current.rotation.y = t * 0.15;
      group.current.rotation.z = Math.sin(t * 0.7) * 0.04;
    }
    if (flame.current) {
      const m = mixRef.current;
      const burst = Math.max(0, Math.sin(clock.elapsedTime * 0.9)) ** 6;
      flame.current.color.setRGB(3 + burst * 4, 1.6 + burst * 2, 0.5);
      flame.current.opacity = 0.35 + m * 0.5 + burst * 0.4;
    }
  });

  return (
    <group ref={group} scale={0.5}>
      <mesh castShadow>
        <boxGeometry args={[0.36, 0.26, 0.36]} />
        <meshStandardMaterial color="#8b5a2b" flatShading />
      </mesh>
      {[
        [-0.15, -0.15],
        [0.15, -0.15],
        [-0.15, 0.15],
        [0.15, 0.15],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.42, z]}>
          <cylinderGeometry args={[0.008, 0.008, 0.6, 3]} />
          <meshBasicMaterial color="#3f3f46" />
        </mesh>
      ))}
      <mesh position={[0, 0.66, 0]}>
        <coneGeometry args={[0.07, 0.22, 6]} />
        <meshBasicMaterial ref={flame} color={[3, 1.6, 0.5]} transparent opacity={0.4} toneMapped={false} />
      </mesh>
      <mesh geometry={envelope} position={[0, 0.62, 0]} castShadow>
        <meshStandardMaterial vertexColors flatShading roughness={0.7} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* A flock of birds wheeling around the island                         */
/* ------------------------------------------------------------------ */

export function Birds({ quality, reducedMotion }: { quality: Quality; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const wing = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0.07, 0, 0, -0.07, 0.3, 0, -0.04]), 3));
    geo.computeVertexNormals();
    return geo;
  }, []);
  const flock = useMemo(() => {
    const random = createRandom(55);
    const n = quality === "high" ? 14 : 9;
    return Array.from({ length: n }, (_, i) => ({
      // Loose V: each bird trails a little behind and to one side.
      side: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.35 + (random() - 0.5) * 0.2,
      back: Math.ceil(i / 2) * 0.4 + random() * 0.3,
      up: (random() - 0.5) * 0.5,
      phase: random() * Math.PI * 2,
      flap: 8 + random() * 3,
    }));
  }, [quality]);
  const tmp = useMemo(() => ({ c: new THREE.Vector3(), n: new THREE.Vector3(), f: new THREE.Vector3(), r: new THREE.Vector3() }), []);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime * (reducedMotion ? 0.3 : 1);
    const path = (time: number, out: THREE.Vector3) => {
      const a = time * 0.11;
      const r = 8 + Math.sin(time * 0.17) * 1.5;
      return out.set(Math.cos(a) * r, 4.6 + Math.sin(time * 0.23) * 0.8, Math.sin(a) * r);
    };
    path(t, tmp.c);
    path(t + 0.2, tmp.n);
    tmp.f.subVectors(tmp.n, tmp.c).normalize();
    tmp.r.set(-tmp.f.z, 0, tmp.f.x);
    const heading = Math.atan2(tmp.f.x, tmp.f.z);
    group.current.children.forEach((bird, i) => {
      const b = flock[i];
      const wob = Math.sin(t * 0.8 + b.phase) * 0.15;
      bird.position
        .copy(tmp.c)
        .addScaledVector(tmp.f, -b.back)
        .addScaledVector(tmp.r, b.side + wob)
        .setY(tmp.c.y + b.up + Math.sin(t * 1.3 + b.phase) * 0.12);
      bird.rotation.set(0, heading, Math.sin(t * 0.5) * 0.25);
      const glide = Math.sin(t * 0.6 + b.phase) > 0.6;
      const flap = glide ? 0.15 : Math.sin(t * b.flap + b.phase) * 0.75;
      bird.children[0].rotation.z = flap;
      bird.children[1].rotation.z = -flap;
    });
  });

  return (
    <group ref={group}>
      {flock.map((_, i) => (
        <group key={i} scale={0.6}>
          <mesh geometry={wing}>
            <meshBasicMaterial color="#2b2f3a" side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={wing} scale={[-1, 1, 1]}>
            <meshBasicMaterial color="#2b2f3a" side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Night: fireflies over the meadow                                    */
/* ------------------------------------------------------------------ */

const fireflyVertex = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform float uMix;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float t = uTime * (0.3 + aSeed.x * 0.4);
    p += vec3(sin(t + aSeed.y * 6.28), sin(t * 1.3 + aSeed.z * 6.28) * 0.4, cos(t * 0.9 + aSeed.x * 6.28)) * 0.35;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float blink = smoothstep(0.2, 1.0, sin(uTime * (1.5 + aSeed.z * 2.0) + aSeed.y * 20.0));
    vAlpha = smoothstep(0.5, 0.95, uMix) * (0.25 + blink * 0.75);
    gl_PointSize = (4.0 + aSeed.x * 4.0) * uPixelRatio * (14.0 / -mv.z);
  }
`;

export function Fireflies({ quality }: { quality: Quality }) {
  const points = useRef<THREE.Points>(null);
  const { geometry, material } = useMemo(() => {
    const random = createRandom(303);
    const count = quality === "high" ? 90 : 45;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * 4.2;
      pos.set([Math.cos(a) * r, 0.7 + random() * 1.4, Math.sin(a) * r], i * 3);
      seed.set([random(), random(), random()], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: fireflyVertex,
      fragmentShader: SOFT_POINT_FRAG,
      uniforms: {
        uTime: ATMOS.uTime,
        uMix: ATMOS.uMix,
        uPixelRatio: ATMOS.uPixelRatio,
        uColor: { value: new THREE.Color(2.4, 3.2, 0.9) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: geo, material: mat };
  }, [quality]);
  useFrame(() => {
    if (points.current) points.current.visible = ATMOS.uMix.value > 0.45;
  });
  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />;
}

/* ------------------------------------------------------------------ */
/* Night: paper lanterns released from the island, rising slowly       */
/* ------------------------------------------------------------------ */

export function SkyLanterns({ quality, reducedMotion }: { quality: Quality; reducedMotion: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = quality === "high" ? 22 : 12;
  const seeds = useMemo(() => {
    const random = createRandom(808);
    return Array.from({ length: count }, () => ({
      a: random() * Math.PI * 2,
      r: 1 + random() * 3,
      k: random(),
      speed: 0.018 + random() * 0.012,
      sway: random() * 6,
    }));
  }, [count]);
  const o = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.09, 0.065, 0.17, 6), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.5, 0.45), toneMapped: false }),
    [],
  );

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const vis = THREE.MathUtils.smoothstep(ATMOS.uMix.value, 0.55, 0.95);
    m.visible = vis > 0.01;
    if (!m.visible) return;
    const t = clock.elapsedTime * (reducedMotion ? 0.25 : 1);
    seeds.forEach((s, i) => {
      const k = (s.k + t * s.speed) % 1;
      const r = s.r + k * 7;
      const a = s.a + k * 0.8;
      o.position.set(Math.cos(a) * r + Math.sin(t * 0.5 + s.sway) * 0.2, 1.2 + k * 15, Math.sin(a) * r);
      o.rotation.set(Math.sin(t + s.sway) * 0.1, 0, Math.cos(t * 0.8 + s.sway) * 0.1);
      o.scale.setScalar(vis * Math.min(1, k * 12) * (1 - k * 0.3));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh key={count} ref={mesh} args={[geometry, material, count]} frustumCulled={false} />;
}
