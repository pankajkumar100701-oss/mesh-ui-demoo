"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRandom } from "@/lib/random";
import { TRACK, buildLanes, buildTrackCurve, lanePoint, roadLift, stationU } from "./city";
import { ENV, U, springy } from "./env";

const O = new THREE.Object3D();
const P = new THREE.Vector3();
const T = new THREE.Vector3();

function boxes(specs: [number, number, number, number, number, number][]) {
  const parts = specs.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed());
  parts.forEach((g) => g.deleteAttribute("uv"));
  return mergeGeometries(parts, false) ?? parts[0];
}

const PAINT = ["#ef4444", "#f8fafc", "#0ea5e9", "#facc15", "#334155", "#f97316", "#22c55e", "#e2e8f0", "#a855f7", "#f8fafc"];

/* ------------------------------------------------------------------ */
/* Cars: instanced bodies, head/tail lights and night-time beams       */
/* ------------------------------------------------------------------ */

const beamVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const beamFragment = /* glsl */ `
  uniform float uLights;
  varying vec2 vUv;
  void main() {
    float along = vUv.y;
    float across = abs(vUv.x - 0.5) * 2.0;
    float a = (1.0 - along) * (1.0 - smoothstep(0.25 + along * 0.6, 0.35 + along * 0.65, across));
    gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * a * uLights * 0.55, 1.0);
  }
`;

export function Cars({ startAt }: { startAt: number }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const tails = useRef<THREE.InstancedMesh>(null);
  const beams = useRef<THREE.InstancedMesh>(null);

  const lanes = useMemo(() => buildLanes(), []);
  const cars = useMemo(() => {
    const random = createRandom(512);
    const list: { lane: number; s: number; yaw: number; color: THREE.Color; long: boolean }[] = [];
    lanes.forEach((lane, li) => {
      const n = Math.floor(lane.length / 6.2);
      for (let k = 0; k < n; k++) {
        list.push({
          lane: li,
          s: ((k + random() * 0.5) / n) * lane.length,
          yaw: 0,
          color: new THREE.Color(PAINT[Math.floor(random() * PAINT.length)]),
          long: random() < 0.08,
        });
      }
    });
    return list;
  }, [lanes]);

  const geo = useMemo(
    () => ({
      body: boxes([
        [0.2, 0.08, 0.4, 0, 0.06, 0],
        [0.17, 0.07, 0.21, 0, 0.135, -0.025],
      ]),
      heads: boxes([
        [0.05, 0.03, 0.02, -0.06, 0.07, 0.2],
        [0.05, 0.03, 0.02, 0.06, 0.07, 0.2],
      ]),
      tails: boxes([
        [0.05, 0.025, 0.02, -0.065, 0.075, -0.2],
        [0.05, 0.025, 0.02, 0.065, 0.075, -0.2],
      ]),
      beam: new THREE.PlaneGeometry(0.42, 1.0).rotateX(-Math.PI / 2).translate(0, 0.012, 0.72),
    }),
    [],
  );
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.2 }),
      heads: new THREE.MeshBasicMaterial({ color: "#fff4d6", toneMapped: false }),
      tails: new THREE.MeshBasicMaterial({ color: "#ff2b3a", toneMapped: false }),
      beam: new THREE.ShaderMaterial({
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        uniforms: { uLights: U.uLights },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    },
    [geo, mats],
  );

  useLayoutEffect(() => {
    const b = body.current;
    if (!b) return;
    cars.forEach((c, i) => b.setColorAt(i, c.color));
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
  }, [cars]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const b = body.current;
    const h = heads.current;
    const t = tails.current;
    const bm = beams.current;
    if (!b || !h || !t || !bm) return;
    const L = ENV.lights;
    mats.heads.color.set("#fff4d6").multiplyScalar(0.5 + L * 3.4);
    mats.tails.color.set("#ff2b3a").multiplyScalar(0.35 + L * 2.6);
    bm.visible = L > 0.02;
    const pop = ENV.build - startAt;
    cars.forEach((c, i) => {
      const lane = lanes[c.lane];
      c.s += lane.speed * dt * ENV.pace;
      const heading = lanePoint(lane, c.s, P);
      let d = heading - c.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      c.yaw += d * (1 - Math.exp(-14 * dt));
      const s = Math.max(springy((pop - i * 0.012) / 0.6), 0.001);
      O.position.set(P.x, 0.02 + roadLift(P.z), P.z);
      O.rotation.set(0, c.yaw, 0);
      O.scale.set(s, s, s * (c.long ? 1.9 : 1));
      O.updateMatrix();
      b.setMatrixAt(i, O.matrix);
      h.setMatrixAt(i, O.matrix);
      t.setMatrixAt(i, O.matrix);
      bm.setMatrixAt(i, O.matrix);
    });
    b.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
    t.instanceMatrix.needsUpdate = true;
    bm.instanceMatrix.needsUpdate = true;
  });

  const n = cars.length;
  return (
    <>
      <instancedMesh ref={body} args={[geo.body, mats.body, n]} castShadow frustumCulled={false} />
      <instancedMesh ref={heads} args={[geo.heads, mats.heads, n]} frustumCulled={false} />
      <instancedMesh ref={tails} args={[geo.tails, mats.tails, n]} frustumCulled={false} />
      <instancedMesh ref={beams} args={[geo.beam, mats.beam, n]} frustumCulled={false} renderOrder={2} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Elevated train: viaduct, station and a five-car train               */
/* ------------------------------------------------------------------ */

const SEGMENTS = 200;
const CARS = 5;
const CAR_GAP = 1.62;
const STATION = { x: TRACK.hx, z: -7 };

const TRAIN_WINDOWS = new THREE.MeshStandardMaterial({ color: "#26324a", emissive: "#ffd89a", emissiveIntensity: 0, roughness: 0.25 });

export function Train() {
  const deck = useRef<THREE.InstancedMesh>(null);
  const rails = useRef<THREE.InstancedMesh>(null);
  const pillars = useRef<THREE.InstancedMesh>(null);
  const cars = useRef<(THREE.Group | null)[]>([]);
  const state = useRef({ u: 0.18 });

  const curve = useMemo(() => buildTrackCurve(), []);
  const length = useMemo(() => curve.getLength(), [curve]);
  const station = useMemo(() => stationU(curve, STATION.x, STATION.z), [curve]);
  const geo = useMemo(
    () => ({
      deck: new THREE.BoxGeometry(0.66, 0.13, 1).translate(0, -0.065, 0),
      rails: boxes([
        [0.045, 0.035, 1, -0.17, 0.018, 0],
        [0.045, 0.035, 1, 0.17, 0.018, 0],
      ]),
      pillar: new THREE.CylinderGeometry(0.08, 0.11, 1, 6).translate(0, 0.5, 0),
    }),
    [],
  );
  const pillarCount = Math.floor(SEGMENTS / 5);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  useLayoutEffect(() => {
    const d = deck.current;
    const r = rails.current;
    const p = pillars.current;
    if (!d || !r || !p) return;
    const seg = (length / SEGMENTS) * 1.04;
    for (let i = 0; i < SEGMENTS; i++) {
      const u = i / SEGMENTS;
      curve.getPointAt(u, P);
      curve.getTangentAt(u, T);
      O.position.copy(P);
      O.rotation.set(0, Math.atan2(T.x, T.z), 0);
      O.scale.set(1, 1, seg);
      O.updateMatrix();
      d.setMatrixAt(i, O.matrix);
      r.setMatrixAt(i, O.matrix);
    }
    for (let k = 0; k < pillarCount; k++) {
      curve.getPointAt(k / pillarCount, P);
      O.position.set(P.x, 0, P.z);
      O.rotation.set(0, 0, 0);
      O.scale.set(1, TRACK.y - 0.12, 1);
      O.updateMatrix();
      p.setMatrixAt(k, O.matrix);
    }
    [d, r, p].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    });
  }, [curve, length, pillarCount]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    TRAIN_WINDOWS.emissiveIntensity = ENV.lights * 2.4;
    // Ease into the station, then pull away.
    let gap = Math.abs(state.current.u - station);
    gap = Math.min(gap, 1 - gap) * length;
    const speed = 4.2 * (0.22 + 0.78 * THREE.MathUtils.smoothstep(gap, 0.4, 7));
    state.current.u = (state.current.u + (speed * dt * ENV.pace) / length) % 1;
    for (let k = 0; k < CARS; k++) {
      const g = cars.current[k];
      if (!g) continue;
      const u = (state.current.u - (k * CAR_GAP) / length + 1) % 1;
      curve.getPointAt(u, P);
      curve.getTangentAt(u, T);
      g.position.copy(P);
      g.rotation.set(0, Math.atan2(T.x, T.z), 0);
    }
  });

  return (
    <group>
      <instancedMesh ref={deck} args={[geo.deck, undefined, SEGMENTS]} castShadow receiveShadow>
        <meshStandardMaterial color="#e3dccd" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={rails} args={[geo.rails, undefined, SEGMENTS]}>
        <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={pillars} args={[geo.pillar, undefined, pillarCount]} castShadow>
        <meshStandardMaterial color="#d8d0c0" roughness={0.9} />
      </instancedMesh>

      {Array.from({ length: CARS }, (_, k) => (
        <group
          key={k}
          ref={(el) => {
            cars.current[k] = el;
          }}
        >
          <mesh position-y={0.25} castShadow>
            <boxGeometry args={[0.44, 0.34, 1.5]} />
            <meshStandardMaterial color="#f6f4ef" roughness={0.5} />
          </mesh>
          <mesh position-y={0.12}>
            <boxGeometry args={[0.45, 0.06, 1.52]} />
            <meshStandardMaterial color="#f97316" roughness={0.5} />
          </mesh>
          <mesh position-y={0.31} material={TRAIN_WINDOWS}>
            <boxGeometry args={[0.452, 0.1, 1.36]} />
          </mesh>
          <mesh position-y={0.43}>
            <boxGeometry args={[0.36, 0.03, 1.3]} />
            <meshStandardMaterial color="#9ca3af" />
          </mesh>
        </group>
      ))}

      {/* Greenline station on the east side of the loop */}
      <group position={[STATION.x + 0.62, TRACK.y - 0.08, STATION.z]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.55, 0.1, 3.6]} />
          <meshStandardMaterial color="#e9e3d6" />
        </mesh>
        <mesh position={[-0.25, 0.85, 0]} castShadow>
          <boxGeometry args={[1.25, 0.05, 3.9]} />
          <meshStandardMaterial color="#0ea5e9" roughness={0.4} />
        </mesh>
        {[-1.6, 0, 1.6].map((z) => (
          <mesh key={z} position={[0.2, 0.42, z]}>
            <boxGeometry args={[0.05, 0.8, 0.05]} />
            <meshStandardMaterial color="#e5e7eb" />
          </mesh>
        ))}
        <mesh position={[0.2, -TRACK.y / 2 + 0.05, 1.7]} castShadow>
          <boxGeometry args={[0.3, TRACK.y, 0.3]} />
          <meshStandardMaterial color="#d8d0c0" />
        </mesh>
      </group>
    </group>
  );
}
