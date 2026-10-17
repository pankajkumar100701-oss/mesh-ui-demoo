"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRandom } from "@/lib/random";
import { U, commonGLSL, rayPush } from "./world";

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/** A small streamlined fish, nose along +z, about 1.9 units long before scaling. */
function fishGeometry(deep: boolean) {
  const body = new THREE.SphereGeometry(1, 14, 9);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // Taper towards the tail, blunt nose; slightly deeper belly.
    const taper = z < 0 ? Math.max(0.12, 1 + z * 0.82) : 1 - z * z * 0.32;
    const belly = y < 0 ? (deep ? 1.15 : 1.05) : 1;
    p.setXYZ(i, x * 0.13 * taper, y * (deep ? 0.3 : 0.24) * taper * belly, z * 0.62);
  }
  body.computeVertexNormals();

  // Forked tail and a small dorsal fin, as flat double-sided triangles.
  const fins = new THREE.BufferGeometry();
  const verts = new Float32Array([
    // tail upper
    0, 0, -0.5, 0, 0.26, -0.98, 0, 0.02, -0.76,
    // tail lower
    0, 0, -0.5, 0, -0.02, -0.76, 0, -0.24, -0.96,
    // dorsal
    0, 0.18, 0.05, 0, 0.32, -0.12, 0, 0.16, -0.28,
  ]);
  fins.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  fins.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(verts.length).map((_, i) => (i % 3 === 0 ? 1 : 0)), 3));
  fins.setAttribute("uv", new THREE.BufferAttribute(new Float32Array((verts.length / 3) * 2), 2));
  fins.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);

  const merged = mergeGeometries([body, fins]);
  body.dispose();
  fins.dispose();
  return merged;
}

/* ------------------------------------------------------------------ */
/* Material                                                            */
/* ------------------------------------------------------------------ */

const fishVertex = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uWag;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;
  void main() {
    vec3 p = position;
    float tail = smoothstep(0.35, -0.95, p.z);
    p.x += sin(uTime * uWag + aPhase - p.z * 4.5) * 0.16 * tail;
    vLocal = position;
    vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fishFragment = /* glsl */ `
  uniform vec3 uBack;
  uniform vec3 uBelly;
  uniform vec3 uGlow;
  uniform float uPhotophores;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;
  ${commonGLSL}
  void main() {
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    vec3 V = cameraPosition - vWorld;
    float dist = length(V);
    V /= dist;
    float day = daylight(vWorld.y);
    // Counter-shading: dark back, silver belly, with a stripe along the flank.
    float up = smoothstep(-0.12, 0.16, vLocal.y);
    vec3 albedo = mix(uBelly, uBack, up);
    albedo *= 1.0 - 0.25 * smoothstep(0.02, 0.0, abs(vLocal.y - 0.03));
    vec3 col = albedo * (0.25 + 0.75 * max(n.y, 0.0)) * day * 1.3;
    // Silver flash when a flank turns towards the light.
    vec3 R = reflect(-V, n);
    float flash = pow(max(dot(R, vec3(0.0, 1.0, 0.0)), 0.0), 10.0);
    col += vec3(0.8, 0.95, 1.0) * flash * day * 1.6;
    float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    col += uFogColor * rim * 0.45;
    // Headlamp in the dark.
    col += albedo * max(dot(n, V), 0.0) * exp(-dist * 0.06) * (1.0 - uDay) * 0.8;
    // Photophores along the belly (lanternfish), only worth showing in the dark.
    if (uPhotophores > 0.0) {
      float row = smoothstep(0.035, 0.0, abs(vLocal.y + 0.1 + vLocal.z * 0.04));
      float dots = smoothstep(0.38, 0.12, abs(fract(vLocal.z * 7.0) - 0.5));
      float eye = smoothstep(0.06, 0.0, length(vLocal.yz - vec2(0.05, 0.42)));
      float dark = 1.0 - smoothstep(0.02, 0.25, day);
      col += uGlow * (row * dots + eye) * uPhotophores * dark * 3.2;
    }
    float fog = fogFactor(dist);
    gl_FragColor = vec4(mix(col, waterColor(-V), fog), 1.0);
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ */
/* School (boids)                                                      */
/* ------------------------------------------------------------------ */

export type SchoolSpec = {
  count: number;
  seed: number;
  size: number;
  /** World height band the school stays inside. */
  band: [number, number];
  /** How far in front of the camera the school likes to hang out. */
  ahead: number;
  speed: [number, number];
  back: string;
  belly: string;
  glow?: string;
  deep?: boolean;
  wag: number;
};

type Boids = {
  pos: Float32Array;
  vel: Float32Array;
  acc: Float32Array;
  home: THREE.Vector3;
  wander: number;
};

const tmp = {
  p: new THREE.Vector3(),
  push: new THREE.Vector3(),
  x: new THREE.Vector3(),
  y: new THREE.Vector3(),
  z: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
};

export function School({ spec, reduced }: { spec: SchoolSpec; reduced: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(() => {
    const g = fishGeometry(Boolean(spec.deep));
    const random = createRandom(spec.seed + 7);
    const phase = new Float32Array(spec.count);
    for (let i = 0; i < spec.count; i++) phase[i] = random() * Math.PI * 2;
    g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
    return g;
  }, [spec.count, spec.deep, spec.seed]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          ...U,
          uWag: { value: spec.wag },
          uBack: { value: new THREE.Color(spec.back) },
          uBelly: { value: new THREE.Color(spec.belly) },
          uGlow: { value: new THREE.Color(spec.glow ?? "#000000") },
          uPhotophores: { value: spec.glow ? 1 : 0 },
        },
        vertexShader: fishVertex,
        fragmentShader: fishFragment,
        side: THREE.DoubleSide,
      }),
    [spec.wag, spec.back, spec.belly, spec.glow],
  );

  const boids = useMemo<Boids>(() => {
    const random = createRandom(spec.seed);
    const n = spec.count;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const mid = (spec.band[0] + spec.band[1]) / 2;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (random() - 0.5) * 10;
      pos[i * 3 + 1] = mid + (random() - 0.5) * 6;
      pos[i * 3 + 2] = -spec.ahead + (random() - 0.5) * 10;
      const a = random() * Math.PI * 2;
      vel[i * 3] = Math.cos(a) * spec.speed[0];
      vel[i * 3 + 2] = Math.sin(a) * spec.speed[0];
    }
    return { pos, vel, acc: new Float32Array(n * 3), home: new THREE.Vector3(0, mid, -spec.ahead), wander: 0 };
  }, [spec.seed, spec.count, spec.band, spec.ahead, spec.speed]);
  // The simulation state is mutated every frame, so read it through a ref.
  const boidsRef = useRef(boids);
  useEffect(() => {
    boidsRef.current = boids;
  }, [boids]);

  useFrame((state, rawDelta) => {
    const m = mesh.current;
    if (!m) return;
    const cam = state.camera.position;
    const [bandLow, bandHigh] = spec.band;
    // Skip the whole simulation while the school is far out of view.
    const visible = cam.y < bandHigh + 30 && cam.y > bandLow - 40;
    m.visible = visible;
    if (!visible) return;

    const dt = Math.min(rawDelta, 1 / 30) * (reduced ? 0.45 : 1);
    const t = U.uTime.value;
    const { pos, vel, acc, home } = boidsRef.current;
    const n = spec.count;
    const s = spec.size;

    home.set(
      Math.sin(t * 0.11 + spec.seed) * 7,
      THREE.MathUtils.clamp(cam.y - 1.5 + Math.sin(t * 0.17) * 2, bandLow, bandHigh),
      cam.z - spec.ahead + Math.cos(t * 0.09) * 4,
    );

    // If the school has been left far behind (fast scrolling), carry it along.
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < n; i++) {
      mx += pos[i * 3];
      my += pos[i * 3 + 1];
      mz += pos[i * 3 + 2];
    }
    mx = home.x - mx / n;
    my = home.y - my / n;
    mz = home.z - mz / n;
    if (mx * mx + my * my + mz * mz > 30 * 30) {
      for (let i = 0; i < n; i++) {
        pos[i * 3] += mx;
        pos[i * 3 + 1] += my;
        pos[i * 3 + 2] += mz;
      }
    }

    const sepR = 0.9 * s;
    const sepR2 = sepR * sepR;
    const viewR2 = (3.2 * s) * (3.2 * s);
    const [minV, maxV] = spec.speed;

    // Boids: separation, alignment, cohesion (O(n²), counts are small).
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      const px = pos[ix];
      const py = pos[ix + 1];
      const pz = pos[ix + 2];
      let sx = 0, sy = 0, sz = 0;
      let ax = 0, ay = 0, az = 0;
      let cx = 0, cy = 0, cz = 0;
      let count = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const jx = j * 3;
        const dx = pos[jx] - px;
        const dy = pos[jx + 1] - py;
        const dz = pos[jx + 2] - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > viewR2) continue;
        count++;
        ax += vel[jx];
        ay += vel[jx + 1];
        az += vel[jx + 2];
        cx += dx;
        cy += dy;
        cz += dz;
        if (d2 < sepR2 && d2 > 1e-6) {
          const k = 1 / d2;
          sx -= dx * k;
          sy -= dy * k;
          sz -= dz * k;
        }
      }
      let fx = 0, fy = 0, fz = 0;
      if (count > 0) {
        const inv = 1 / count;
        fx += (ax * inv - vel[ix]) * 1.1 + cx * inv * 0.9;
        fy += (ay * inv - vel[ix + 1]) * 1.1 + cy * inv * 0.9;
        fz += (az * inv - vel[ix + 2]) * 1.1 + cz * inv * 0.9;
      }
      fx += sx * 1.6 * s;
      fy += sy * 1.6 * s;
      fz += sz * 1.6 * s;
      // Pull towards the roaming home point, gently, harder when far away.
      const hx = home.x - px;
      const hy = home.y - py;
      const hz = home.z - pz;
      const hd = Math.sqrt(hx * hx + hy * hy + hz * hz) + 1e-4;
      const pull = 0.12 + Math.max(0, hd - 7) * 0.08;
      fx += (hx / hd) * pull * 2;
      fy += (hy / hd) * pull * 2 * 1.4;
      fz += (hz / hd) * pull * 2;
      // Flee the cursor ray.
      tmp.p.set(px, py, pz);
      const dist = rayPush(tmp.p, tmp.push);
      const fleeR = 2.6 + s * 2;
      if (dist < fleeR) {
        const k = ((fleeR - dist) / fleeR) * 28 * U.uStir.value;
        fx += tmp.push.x * k;
        fy += tmp.push.y * k;
        fz += tmp.push.z * k;
      }
      acc[ix] = fx;
      acc[ix + 1] = fy;
      acc[ix + 2] = fz;
    }

    const arr = m.instanceMatrix.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      let vx = vel[ix] + acc[ix] * dt;
      let vy = (vel[ix + 1] + acc[ix + 1] * dt) * 0.985;
      let vz = vel[ix + 2] + acc[ix + 2] * dt;
      let sp = Math.sqrt(vx * vx + vy * vy + vz * vz) + 1e-5;
      const fast = Math.hypot(acc[ix], acc[ix + 1], acc[ix + 2]) > 14 ? 2.2 : 1;
      const clamped = THREE.MathUtils.clamp(sp, minV, maxV * fast);
      vx *= clamped / sp;
      vy *= clamped / sp;
      vz *= clamped / sp;
      sp = clamped;
      vel[ix] = vx;
      vel[ix + 1] = vy;
      vel[ix + 2] = vz;
      const px = (pos[ix] += vx * dt);
      const py = (pos[ix + 1] += vy * dt);
      const pz = (pos[ix + 2] += vz * dt);

      // Orientation: nose along velocity, kept upright.
      tmp.z.set(vx / sp, vy / sp, vz / sp);
      tmp.x.crossVectors(tmp.up, tmp.z);
      if (tmp.x.lengthSq() < 1e-6) tmp.x.set(1, 0, 0);
      tmp.x.normalize();
      tmp.y.crossVectors(tmp.z, tmp.x);
      const o = i * 16;
      arr[o] = tmp.x.x * s;
      arr[o + 1] = tmp.x.y * s;
      arr[o + 2] = tmp.x.z * s;
      arr[o + 3] = 0;
      arr[o + 4] = tmp.y.x * s;
      arr[o + 5] = tmp.y.y * s;
      arr[o + 6] = tmp.y.z * s;
      arr[o + 7] = 0;
      arr[o + 8] = tmp.z.x * s;
      arr[o + 9] = tmp.z.y * s;
      arr[o + 10] = tmp.z.z * s;
      arr[o + 11] = 0;
      arr[o + 12] = px;
      arr[o + 13] = py;
      arr[o + 14] = pz;
      arr[o + 15] = 1;
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, spec.count]}
      frustumCulled={false}
      onUpdate={(self) => self.instanceMatrix.setUsage(THREE.DynamicDrawUsage)}
    />
  );
}
