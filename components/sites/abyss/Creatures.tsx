"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRandom } from "@/lib/random";
import { U, camY, camZ, commonGLSL, glowMaterial, litGLSL, litMaterial, rayPush } from "./world";

const scratch = { p: new THREE.Vector3(), push: new THREE.Vector3(), v: new THREE.Vector3() };

/* ------------------------------------------------------------------ */
/* Whales                                                              */
/* ------------------------------------------------------------------ */

/** Humpback-ish silhouette, 1 unit long, head along +z. */
function whaleGeometry() {
  const profile: THREE.Vector2[] = [];
  const N = 34;
  for (let i = 0; i <= N; i++) {
    const s = i / N; // 0 head → 1 tail
    const head = THREE.MathUtils.smoothstep(s, 0, 0.16);
    const tail = 1 - THREE.MathUtils.smoothstep(s, 0.3, 1.0) * 0.93;
    const r = Math.max(0.004, 0.118 * Math.pow(head, 0.6) * tail);
    profile.push(new THREE.Vector2(r, 0.5 - s));
  }
  const body = new THREE.LatheGeometry(profile, 28);
  body.rotateX(Math.PI / 2); // lathe axis (y) → z, head at +z
  body.scale(1, 0.82, 1);
  // A slight jaw line / throat bulge.
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const y = p.getY(i);
    if (y < 0 && z > 0.15) p.setY(i, y * (1 + (z - 0.15) * 0.9));
  }
  body.computeVertexNormals();

  const fluke = new THREE.Shape();
  fluke.moveTo(0, 0);
  fluke.bezierCurveTo(0.06, 0.02, 0.15, 0.03, 0.2, 0.1);
  fluke.bezierCurveTo(0.12, 0.085, 0.05, 0.07, 0, 0.075);
  fluke.bezierCurveTo(-0.05, 0.07, -0.12, 0.085, -0.2, 0.1);
  fluke.bezierCurveTo(-0.15, 0.03, -0.06, 0.02, 0, 0);
  const flukes = new THREE.ShapeGeometry(fluke, 10);
  flukes.rotateX(-Math.PI / 2); // shape y → -z
  flukes.translate(0, 0, -0.47);

  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.bezierCurveTo(0.12, -0.01, 0.26, -0.05, 0.32, -0.09);
  fin.bezierCurveTo(0.25, -0.08, 0.12, -0.07, 0, -0.06);
  fin.closePath();
  const finR = new THREE.ShapeGeometry(fin, 8);
  finR.rotateX(-Math.PI / 2);
  finR.rotateZ(-0.45);
  finR.translate(0.07, -0.05, 0.27);
  const finL = finR.clone();
  finL.scale(-1, 1, 1);

  const merged = mergeGeometries([body, flukes, finR, finL]);
  [body, flukes, finR, finL].forEach((g) => g.dispose());
  return merged;
}

/** Each whale crosses the view side-on, wrapping far outside the frame. */
const WHALES = [
  { y: -55, z: -96, speed: 1.6, phase: 0.15, length: 14, dir: 1 },
  { y: -69, z: -112, speed: 1.3, phase: 0.62, length: 11, dir: -1 },
  { y: -82, z: -132, speed: 1.9, phase: 0.4, length: 6, dir: 1 },
] as const;
const WHALE_SPAN = 150;

export function Whales({ reduced }: { reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => whaleGeometry(), []);
  const material = useMemo(() => {
    const m = litMaterial("#26313a", 0.25, THREE.DoubleSide);
    m.vertexShader = /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec3 p = position;
        float phase = modelMatrix[3].x * 0.3;
        float tail = smoothstep(0.05, -0.55, p.z);
        p.y += sin(uTime * 0.9 + phase - p.z * 3.0) * 0.055 * tail;
        // Pectoral fins row slowly.
        float fin = smoothstep(0.08, 0.2, abs(p.x));
        p.y += sin(uTime * 0.6 + phase) * 0.03 * fin;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `;
    return m;
  }, []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const camYv = state.camera.position.y;
    g.visible = camYv < -12 && camYv > -150;
    if (!g.visible) return;
    const t = U.uTime.value * (reduced ? 0.5 : 1);
    g.children.forEach((child, i) => {
      const w = WHALES[i];
      const run = (w.phase * WHALE_SPAN + t * w.speed) % WHALE_SPAN;
      const x = w.dir * (run - WHALE_SPAN / 2);
      const y = w.y + Math.sin(t * 0.13 + i) * 2.5;
      const z = w.z + Math.sin(t * 0.05 + i * 2) * 6;
      child.position.set(x, y, z);
      // Head along the direction of travel, with a gentle porpoising pitch.
      scratch.v.set(w.dir, Math.cos(t * 0.13 + i) * 0.04, Math.cos(t * 0.05 + i * 2) * 0.012);
      child.lookAt(x + scratch.v.x, y + scratch.v.y, z + scratch.v.z);
      child.rotateZ(Math.sin(t * 0.2 + i) * 0.1);
    });
  });

  return (
    <group ref={group}>
      {WHALES.map((w, i) => (
        <mesh key={i} geometry={geometry} material={material} scale={w.length} frustumCulled={false} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Jellyfish                                                           */
/* ------------------------------------------------------------------ */

const JELLY_PALETTE = ["#5ef2ff", "#ff5ed1", "#9b7bff", "#5effb0", "#7fb6ff", "#ff8a5e"];

const jellyInstanceGLSL = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec2 aTilt;
  attribute float aScale;
  attribute float aPhase;
  attribute float aExcite;
  attribute vec3 aColor;
  uniform float uTime;
  vec3 tilt(vec3 p) {
    float cx = cos(aTilt.y), sx = sin(aTilt.y);
    p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
    float cz = cos(aTilt.x), sz = sin(aTilt.x);
    return vec3(p.x * cz - p.y * sz, p.x * sz + p.y * cz, p.z);
  }
  float pulse() { return 0.5 + 0.5 * sin(uTime * (1.6 + aPhase * 0.25) + aPhase * 6.0); }
`;

const bellVertex = /* glsl */ `
  ${jellyInstanceGLSL}
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vColor;
  varying float vExcite;
  void main() {
    vec3 p = position;
    float c = pulse();
    float rim = smoothstep(0.75, -0.1, p.y);
    p.xz *= 1.0 - 0.2 * c * rim;
    p.y *= 1.0 + 0.12 * c;
    vLocal = p;
    vec3 n = normalize(vec3(normal.x, normal.y * 0.9, normal.z));
    vec3 wp = aOffset + tilt(p) * aScale;
    vWorld = wp;
    vNormalW = tilt(n);
    vColor = aColor;
    vExcite = aExcite;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const bellFragment = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vColor;
  varying float vExcite;
  ${commonGLSL}
  void main() {
    vec3 V = cameraPosition - vWorld;
    float dist = length(V);
    V /= dist;
    vec3 n = normalize(vNormalW);
    float fres = pow(1.0 - abs(dot(n, V)), 2.2);
    float ang = atan(vLocal.z, vLocal.x);
    float canals = smoothstep(0.82, 1.0, cos(ang * 4.0)) * smoothstep(-0.1, 0.55, vLocal.y);
    float gonad = smoothstep(0.3, 0.0, abs(length(vLocal.xz) - 0.38)) * smoothstep(0.2, 0.55, vLocal.y) * (0.6 + 0.4 * cos(ang * 4.0));
    float rim = smoothstep(0.02, -0.12, vLocal.y);
    float glow = 0.08 + fres * 1.3 + canals * 0.55 + gonad * 0.7 + rim * 1.6;
    glow *= 1.0 + vExcite * 2.6;
    vec3 col = vColor * glow;
    col *= 1.0 - fogFactor(dist) * 0.8;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const tentacleVertex = /* glsl */ `
  ${jellyInstanceGLSL}
  attribute vec3 aStrand; // angle, radius, kind (0 tentacle / 1 oral arm)
  varying float vAlong;
  varying vec3 vColor;
  varying float vExcite;
  varying float vDist;
  void main() {
    float t = position.y; // 0 at the rim → 1 at the tip
    float c = pulse();
    float arm = aStrand.z;
    float len = mix(4.2, 1.7, arm);
    float r = aStrand.y * (1.0 - 0.2 * c);
    vec3 p = vec3(cos(aStrand.x) * r, -0.05 - t * len * (1.0 - 0.08 * c), sin(aStrand.x) * r);
    float wave = uTime * (0.9 + arm * 0.6) + aPhase * 5.0 + aStrand.x * 1.7;
    float amp = mix(0.22, 0.12, arm) * t * (0.4 + t);
    p.x += sin(wave - t * 5.0) * amp + aTilt.x * t * t * -2.2;
    p.z += cos(wave * 0.8 - t * 4.0) * amp - aTilt.y * t * t * 2.2;
    // Oral arms curl in a slow spiral.
    if (arm > 0.5) {
      p.x += cos(t * 9.0 + wave) * 0.06;
      p.z += sin(t * 9.0 + wave) * 0.06;
    }
    vec3 wp = aOffset + tilt(p) * aScale;
    vAlong = t;
    vColor = aColor;
    vExcite = aExcite;
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const tentacleFragment = /* glsl */ `
  varying float vAlong;
  varying vec3 vColor;
  varying float vExcite;
  varying float vDist;
  ${commonGLSL}
  void main() {
    float a = (1.0 - vAlong) * (0.55 + vExcite * 1.6);
    a *= 0.75 + 0.25 * sin(vAlong * 40.0 - uTime * 3.0);
    vec3 col = vColor * a * 0.9 * (1.0 - fogFactor(vDist) * 0.8);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function bellGeometry() {
  const pts: THREE.Vector2[] = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 0.55;
    pts.push(new THREE.Vector2(Math.max(0.001, Math.sin(a) * 1.0), Math.cos(a) * 0.72 - 0.02));
  }
  pts.push(new THREE.Vector2(0.96, -0.12), new THREE.Vector2(0.86, -0.15));
  return new THREE.LatheGeometry(pts, 32);
}

function tentacleGeometry() {
  const SEG = 22;
  const strands: [number, number, number][] = [];
  for (let k = 0; k < 12; k++) strands.push([(k / 12) * Math.PI * 2, 0.88, 0]);
  for (let k = 0; k < 4; k++) strands.push([(k / 4) * Math.PI * 2 + 0.4, 0.14, 1]);
  const positions: number[] = [];
  const strand: number[] = [];
  for (const s of strands) {
    for (let i = 0; i < SEG; i++) {
      positions.push(0, i / SEG, 0, 0, (i + 1) / SEG, 0);
      strand.push(...s, ...s);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("aStrand", new THREE.Float32BufferAttribute(strand, 3));
  return g;
}

type JellySim = {
  base: Float32Array;
  off: Float32Array;
  vel: Float32Array;
  offset: THREE.InstancedBufferAttribute;
  tilt: THREE.InstancedBufferAttribute;
  excite: THREE.InstancedBufferAttribute;
  attrs: Record<string, THREE.InstancedBufferAttribute>;
};

export function Jellies({ count, reduced }: { count: number; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);

  const sim = useMemo<JellySim>(() => {
    const random = createRandom(41);
    const base = new Float32Array(count * 3);
    const scale = new Float32Array(count);
    const phase = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const y = -118 - (i / count) * 140 - random() * 4;
      const dz = 9 + Math.pow(random(), 1.4) * 34;
      const spread = 4 + dz * 0.55;
      base[i * 3] = (random() * 2 - 1) * spread;
      base[i * 3 + 1] = y;
      base[i * 3 + 2] = camZ(y) - dz;
      scale[i] = 0.45 + random() * 0.9 + (random() < 0.12 ? 0.8 : 0);
      phase[i] = random() * 6.28;
      c.set(JELLY_PALETTE[Math.floor(random() * JELLY_PALETTE.length)]).multiplyScalar(1.6);
      color.set([c.r, c.g, c.b], i * 3);
    }
    const offset = new THREE.InstancedBufferAttribute(base.slice(), 3).setUsage(THREE.DynamicDrawUsage);
    const tilt = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2).setUsage(THREE.DynamicDrawUsage);
    const excite = new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
    const attrs = {
      aOffset: offset,
      aTilt: tilt,
      aExcite: excite,
      aScale: new THREE.InstancedBufferAttribute(scale, 1),
      aPhase: new THREE.InstancedBufferAttribute(phase, 1),
      aColor: new THREE.InstancedBufferAttribute(color, 3),
    };
    return {
      base,
      off: new Float32Array(count * 3),
      vel: new Float32Array(count * 3),
      offset,
      tilt,
      excite,
      attrs,
    };
  }, [count]);
  const simRef = useRef(sim);
  useEffect(() => {
    simRef.current = sim;
  }, [sim]);

  const bell = useMemo(() => {
    const src = bellGeometry();
    const g = new THREE.InstancedBufferGeometry();
    g.index = src.index;
    g.setAttribute("position", src.attributes.position);
    g.setAttribute("normal", src.attributes.normal);
    for (const [k, a] of Object.entries(sim.attrs)) g.setAttribute(k, a);
    g.instanceCount = count;
    return g;
  }, [sim, count]);

  const tentacles = useMemo(() => {
    const g = tentacleGeometry();
    for (const [k, a] of Object.entries(sim.attrs)) g.setAttribute(k, a);
    g.instanceCount = count;
    return g;
  }, [sim, count]);

  const materials = useMemo(
    () => ({
      bell: new THREE.ShaderMaterial({
        uniforms: { ...U },
        vertexShader: bellVertex,
        fragmentShader: bellFragment,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      tentacle: new THREE.ShaderMaterial({
        uniforms: { ...U },
        vertexShader: tentacleVertex,
        fragmentShader: tentacleFragment,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    }),
    [],
  );

  useFrame((state, rawDelta) => {
    const g = group.current;
    if (!g) return;
    g.visible = state.camera.position.y < -85;
    if (!g.visible) return;
    const dt = Math.min(rawDelta, 1 / 30);
    const t = U.uTime.value;
    const sim = simRef.current;
    const { base, off, vel } = sim;
    const offArr = sim.offset.array as Float32Array;
    const tiltArr = sim.tilt.array as Float32Array;
    const exArr = sim.excite.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      // Slow rise-and-sink drift plus a lazy horizontal wander.
      const bob = reduced ? 0 : Math.sin(t * 0.25 + i * 1.3) * 1.4;
      const wx = reduced ? 0 : Math.sin(t * 0.07 + i) * 1.6;
      scratch.p.set(base[ix] + wx + off[ix], base[ix + 1] + bob + off[ix + 1], base[ix + 2] + off[ix + 2]);
      const dist = rayPush(scratch.p, scratch.push);
      const R = 3.2;
      if (dist < R) {
        const k = ((R - dist) / R) * 26 * U.uStir.value;
        vel[ix] += scratch.push.x * k * dt;
        vel[ix + 1] += scratch.push.y * k * dt;
        vel[ix + 2] += scratch.push.z * k * dt;
        exArr[i] = Math.min(1, exArr[i] + dt * 4);
      } else {
        exArr[i] = Math.max(0, exArr[i] - dt * 0.6);
      }
      // Spring back home, heavily damped (water).
      for (let a = 0; a < 3; a++) {
        vel[ix + a] += -off[ix + a] * 0.35 * dt;
        vel[ix + a] *= Math.exp(-1.6 * dt);
        off[ix + a] += vel[ix + a] * dt;
      }
      offArr[ix] = scratch.p.x;
      offArr[ix + 1] = scratch.p.y;
      offArr[ix + 2] = scratch.p.z;
      // Lean away from the push direction.
      tiltArr[i * 2] = THREE.MathUtils.clamp(-vel[ix] * 0.35, -0.6, 0.6);
      tiltArr[i * 2 + 1] = THREE.MathUtils.clamp(vel[ix + 2] * 0.35, -0.6, 0.6);
    }
    sim.offset.needsUpdate = true;
    sim.tilt.needsUpdate = true;
    sim.excite.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <lineSegments geometry={tentacles} material={materials.tentacle} frustumCulled={false} />
      <mesh geometry={bell} material={materials.bell} frustumCulled={false} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Anglerfish                                                          */
/* ------------------------------------------------------------------ */

const LURE_LOCAL = new THREE.Vector3(0, 0.95, 1.72);

function anglerGeometry() {
  const body = new THREE.SphereGeometry(1, 48, 32);
  const p = body.attributes.position;
  const random = createRandom(9);
  const bumps = Array.from({ length: 24 }, () => [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1]);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    // Big head, quick taper into a short tail.
    if (z < 0) {
      const k = Math.max(0.16, 1 + z * 0.72);
      x *= k;
      y *= k;
      z *= 1.55;
    } else {
      z *= 1.05;
    }
    // Under-bite: the lower jaw juts forward and up.
    if (y < 0.05 && z > 0.2) {
      const j = THREE.MathUtils.smoothstep(z, 0.2, 1.0);
      z += j * 0.28 * THREE.MathUtils.smoothstep(-y, -0.05, 0.4);
      y += j * 0.1;
    }
    // Mouth gape: a crease between the jaws.
    const lip = Math.exp(-Math.pow((y - 0.06) / 0.07, 2)) * THREE.MathUtils.smoothstep(z, 0.55, 1.0);
    z -= lip * 0.32;
    // Lumpy skin.
    let lump = 0;
    for (const b of bumps) lump += Math.max(0, 1 - Math.hypot(x - b[0], y - b[1], z - b[2]) * 3) * 0.05;
    p.setXYZ(i, x * 0.82 * (1 + lump), y * 0.78 * (1 + lump), z * 0.9);
  }
  body.computeVertexNormals();

  const tail = new THREE.Shape();
  tail.moveTo(0, 0);
  tail.quadraticCurveTo(0.35, 0.05, 0.62, 0.42);
  tail.quadraticCurveTo(0.5, 0, 0.62, -0.42);
  tail.quadraticCurveTo(0.35, -0.05, 0, 0);
  const tailG = new THREE.ShapeGeometry(tail, 8);
  tailG.rotateY(Math.PI / 2); // shape x → -z
  tailG.translate(0, 0, -1.25);

  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.quadraticCurveTo(0.15, 0.4, 0.45, 0.32);
  fin.quadraticCurveTo(0.3, 0.1, 0.42, -0.05);
  fin.lineTo(0, 0);
  const finR = new THREE.ShapeGeometry(fin, 6);
  finR.rotateY(Math.PI / 2 + 0.6);
  finR.rotateZ(-0.4);
  finR.translate(0.62, -0.15, -0.2);
  const finL = finR.clone();
  finL.scale(-1, 1, 1);

  const dorsal = new THREE.Shape();
  dorsal.moveTo(0, 0);
  dorsal.quadraticCurveTo(0.2, 0.3, 0.55, 0.18);
  dorsal.lineTo(0.6, 0);
  dorsal.lineTo(0, 0);
  const dorsalG = new THREE.ShapeGeometry(dorsal, 6);
  dorsalG.rotateY(Math.PI / 2);
  dorsalG.translate(0, 0.42, -0.35);

  const stalk = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.62, 0.45),
      new THREE.Vector3(0, 1.18, 0.75),
      new THREE.Vector3(0, 1.25, 1.35),
      LURE_LOCAL.clone().add(new THREE.Vector3(0, 0.06, -0.04)),
    ]),
    32,
    0.022,
    5,
  );
  const merged = mergeGeometries([body, tailG, finR, finL, dorsalG, stalk]);
  [body, tailG, finR, finL, dorsalG, stalk].forEach((g) => g.dispose());
  return merged;
}

function teethGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const random = createRandom(13);
  for (let i = 0; i < 22; i++) {
    const upper = i % 2 === 0;
    const u = (i / 21) * 2 - 1; // across the mouth
    const len = 0.12 + random() * 0.16;
    const cone = new THREE.ConeGeometry(0.022, len, 5);
    if (upper) cone.rotateX(Math.PI);
    cone.rotateX(upper ? -0.35 : 0.5);
    const a = u * 1.05;
    const r = upper ? 0.66 : 0.72;
    cone.translate(Math.sin(a) * r * 0.82, upper ? 0.02 : 0.06, Math.cos(a) * r * 0.9 + (upper ? 0.16 : 0.3));
    parts.push(cone);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return merged;
}

const ANGLERS = [
  { m: 2300, x: 5.2, ahead: 13, scale: 1.25, seed: 1 },
  { m: 2850, x: -6.5, ahead: 15, scale: 1.0, seed: 2 },
  { m: 3500, x: 3.8, ahead: 11, scale: 1.6, seed: 3 },
] as const;

export function Anglers({ reduced }: { reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const body = useMemo(() => anglerGeometry(), []);
  const teeth = useMemo(() => teethGeometry(), []);
  const eye = useMemo(() => new THREE.SphereGeometry(0.07, 12, 8), []);
  const lureGeo = useMemo(() => new THREE.SphereGeometry(0.075, 16, 12), []);
  const glowGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  const mats = useMemo(() => {
    const skin = new THREE.ShaderMaterial({
      uniforms: { ...U, uLure: { value: LURE_LOCAL.clone() }, uLureGlow: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying vec3 vLocal;
        varying vec3 vLocalN;
        void main() {
          vec3 p = position;
          float tail = smoothstep(-0.3, -1.6, p.z);
          p.x += sin(uTime * 1.6 + modelMatrix[3].y) * 0.12 * tail;
          vLocal = p;
          vLocalN = normal;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uLure;
        uniform float uLureGlow;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying vec3 vLocal;
        varying vec3 vLocalN;
        ${commonGLSL}
        ${litGLSL}
        void main() {
          vec3 n = normalize(vNormal);
          if (!gl_FrontFacing) n = -n;
          vec3 ln = normalize(vLocalN);
          if (!gl_FrontFacing) ln = -ln;
          float mottled = 0.8 + 0.2 * sin(vLocal.x * 6.0 + sin(vLocal.z * 5.0) * 2.0) * sin(vLocal.y * 5.0 + vLocal.z * 3.0 + sin(vLocal.x * 9.0));
          vec3 albedo = vec3(0.16, 0.11, 0.1) * mottled;
          // Inside of the mouth is black.
          float mouth = smoothstep(0.1, 0.02, abs(vLocal.y - 0.05)) * smoothstep(0.35, 0.65, vLocal.z);
          albedo *= 1.0 - mouth * 0.9;
          vec3 col = shade(albedo, vWorld, n, 0.0);
          // The lure lights its own face.
          vec3 L = uLure - vLocal;
          float d2 = dot(L, L);
          float diff = max(dot(ln, normalize(L)), 0.0);
          vec3 lureCol = vec3(1.0, 0.82, 0.45);
          col += albedo * lureCol * diff * uLureGlow * 9.0 / (1.0 + d2 * 3.0);
          // Faint blue sheen on the wet skin.
          vec3 V = normalize(cameraPosition - vWorld);
          col += vec3(0.05, 0.12, 0.2) * pow(1.0 - max(dot(n, V), 0.0), 4.0) * 0.6;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
      side: THREE.DoubleSide,
    });
    const tooth = litMaterial("#d6d0c4");
    const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color("#9fd8ff").multiplyScalar(0.9) });
    return { skin, tooth, eye: eyeM };
  }, []);

  const lures = useMemo(
    () =>
      ANGLERS.map(() => ({
        core: new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff1c2").multiplyScalar(6), toneMapped: false }),
        glow: glowMaterial("#ffc96b", 1.6),
      })),
    [],
  );

  useFrame((state, rawDelta) => {
    const g = group.current;
    if (!g) return;
    const cam = state.camera.position;
    const ease = 1 - Math.exp(-Math.min(rawDelta, 0.1) * 1.8);
    g.visible = cam.y < -140;
    if (!g.visible) return;
    const t = U.uTime.value * (reduced ? 0.4 : 1);
    g.children.forEach((fish, i) => {
      const a = ANGLERS[i];
      const y = camY(a.m) + Math.sin(t * 0.3 + i) * 0.4;
      const x = a.x + Math.sin(t * 0.11 + i * 2) * 0.8;
      fish.position.set(x, y, camZ(camY(a.m)) - a.ahead);
      // Turn lazily towards the cursor when it is near, otherwise idle side-on to the viewer.
      const dist = rayPush(fish.position, scratch.push);
      const near = dist < 9 ? 1 - dist / 9 : 0;
      const idleYaw = (a.x > 0 ? -1 : 1) * (1.15 + Math.sin(t * 0.17 + i) * 0.35);
      let targetYaw = idleYaw;
      let targetPitch = Math.sin(t * 0.21 + i) * 0.08;
      if (near > 0) {
        scratch.p.copy(U.uRayOrigin.value).addScaledVector(U.uRayDir.value, Math.max(4, cam.distanceTo(fish.position) * 0.8));
        scratch.v.copy(scratch.p).sub(fish.position);
        targetYaw = THREE.MathUtils.lerp(idleYaw, Math.atan2(scratch.v.x, scratch.v.z), Math.min(1, near * 2));
        targetPitch = THREE.MathUtils.lerp(targetPitch, -Math.atan2(scratch.v.y, Math.hypot(scratch.v.x, scratch.v.z)) * 0.6, near);
      }
      fish.rotation.y = THREE.MathUtils.lerp(fish.rotation.y, targetYaw, ease);
      fish.rotation.x = THREE.MathUtils.lerp(fish.rotation.x, targetPitch, ease);
      fish.rotation.z = Math.sin(t * 0.4 + i) * 0.06;
      const flicker = 0.85 + Math.sin(t * 2.3 + i * 3) * 0.1 + Math.sin(t * 7.1 + i) * 0.05 + near * 0.6;
      lures[i].glow.uniforms.uStrength.value = 1.4 * flicker;
      lures[i].core.color.set("#fff1c2").multiplyScalar(5 * flicker);
    });
  });

  return (
    <group ref={group}>
      {ANGLERS.map((a, i) => (
        <group key={a.seed} scale={a.scale} rotation-y={(a.x > 0 ? -1 : 1) * 1.15}>
          <mesh geometry={body} material={mats.skin} />
          <mesh geometry={teeth} material={mats.tooth} />
          <mesh geometry={eye} material={mats.eye} position={[0.56, 0.36, 0.6]} />
          <mesh geometry={eye} material={mats.eye} position={[-0.56, 0.36, 0.6]} />
          <mesh geometry={lureGeo} material={lures[i].core} position={LURE_LOCAL} />
          <mesh geometry={glowGeo} material={lures[i].glow} position={LURE_LOCAL} scale={1.5} />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Submersible "Nautilus-7"                                            */
/* ------------------------------------------------------------------ */

export const SUB_DEPTH = 1600;

const beamVertex = /* glsl */ `
  varying float vAlong;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vAlong = uv.y;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlong;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  ${commonGLSL}
  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    float edge = pow(abs(dot(normalize(vNormalW), V)), 1.6);
    // uv.y runs 0 (wide end) → 1 (lamp) on a ConeGeometry.
    float a = pow(vAlong, 1.8) * edge;
    a *= 0.85 + 0.15 * sin(vWorld.y * 3.0 + uTime * 1.5 + vWorld.x * 2.0);
    a *= 1.0 - fogFactor(length(cameraPosition - vWorld)) * 0.7;
    gl_FragColor = vec4(uColor * a * 0.2, 1.0);
  }
`;

export function Submersible({ reduced }: { reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const prop = useRef<THREE.Group>(null);
  const port = useRef<THREE.MeshBasicMaterial>(null);
  const star = useRef<THREE.MeshBasicMaterial>(null);

  const geo = useMemo(() => {
    const hull = new THREE.CapsuleGeometry(0.85, 2.4, 10, 28);
    hull.rotateZ(Math.PI / 2); // along x, bow at -x
    const sail = new THREE.CapsuleGeometry(0.32, 0.6, 6, 16);
    sail.rotateZ(Math.PI / 2);
    sail.scale(1, 1, 0.75);
    sail.translate(0.2, 0.86, 0);
    const skid = new THREE.BoxGeometry(3.2, 0.1, 0.12);
    const skidL = skid.clone().translate(0, -1.05, 0.55);
    const skidR = skid.clone().translate(0, -1.05, -0.55);
    const strutParts = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.BoxGeometry(0.08, 0.36, 0.08).translate(sx * 1.0, -0.86, sz * 0.5)));
    const frame = mergeGeometries([skidL, skidR, ...strutParts]);
    [skid, skidL, skidR, ...strutParts].forEach((g) => g.dispose());
    const finV = new THREE.BoxGeometry(0.55, 0.9, 0.06).translate(2.05, 0.15, 0);
    const finH = new THREE.BoxGeometry(0.55, 0.06, 1.5).translate(2.05, 0, 0);
    const fins = mergeGeometries([finV, finH]);
    finV.dispose();
    finH.dispose();
    const shroud = new THREE.TorusGeometry(0.42, 0.06, 8, 28).rotateY(Math.PI / 2).translate(2.45, 0, 0);
    const blade = new THREE.BoxGeometry(0.04, 0.7, 0.12);
    const dome = new THREE.SphereGeometry(0.68, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(Math.PI / 2).translate(-1.55, 0, 0);
    const lamp = new THREE.CylinderGeometry(0.12, 0.15, 0.22, 16).rotateZ(Math.PI / 2);
    const beam = new THREE.ConeGeometry(3.4, 16, 32, 1, true);
    beam.translate(0, -8, 0); // tip at the origin, opening along -y
    beam.rotateZ(-Math.PI / 2); // opening along -x (forward)
    const bulb = new THREE.SphereGeometry(0.07, 10, 8);
    const glow = new THREE.PlaneGeometry(1, 1);
    return { hull, sail, frame, fins, shroud, blade, dome, lamp, beam, bulb, glow };
  }, []);

  const mats = useMemo(() => {
    const beam = new THREE.ShaderMaterial({
      uniforms: { ...U, uColor: { value: new THREE.Color("#d8f0ff") } },
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const dome = new THREE.ShaderMaterial({
      uniforms: { ...U },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        varying vec3 vNormalW;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld;
        varying vec3 vNormalW;
        ${commonGLSL}
        void main() {
          vec3 V = normalize(cameraPosition - vWorld);
          float f = pow(1.0 - max(dot(normalize(vNormalW), V), 0.0), 2.0);
          // Warm cabin light behind tinted acrylic, plus a cool reflection at grazing angles.
          vec3 glass = vec3(0.02, 0.04, 0.06) + vec3(1.0, 0.6, 0.25) * 0.28 * (1.0 - f);
          vec3 col = glass + vec3(0.55, 0.8, 1.0) * f * 0.7;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    return {
      hull: litMaterial("#f2a93b"),
      dark: litMaterial("#2b3138"),
      white: litMaterial("#e9edf0"),
      lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color("#e8f6ff").multiplyScalar(7), toneMapped: false }),
      beam,
      dome,
      lampGlow: glowMaterial("#cfeaff", 1.1),
    };
  }, []);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const cy = state.camera.position.y;
    const y0 = camY(SUB_DEPTH);
    g.visible = cy < y0 + 45 && cy > y0 - 55;
    if (!g.visible) return;
    const t = U.uTime.value;
    const m = reduced ? 0.3 : 1;
    g.position.set(5.8 + Math.sin(t * 0.13) * 0.4 * m, y0 - 1.2 + Math.sin(t * 0.4) * 0.35 * m, camZ(y0) - 15);
    g.rotation.set(Math.sin(t * 0.31) * 0.02 * m, 0.55 + Math.sin(t * 0.1) * 0.06 * m, Math.sin(t * 0.27) * 0.04 * m);
    if (prop.current) prop.current.rotation.x += delta * (reduced ? 1.5 : 6);
    const blink = Math.sin(t * 2.4) > 0.75 ? 1 : 0.08;
    if (port.current) port.current.color.setRGB(4 * blink, 0.15 * blink, 0.15 * blink);
    if (star.current) star.current.color.setRGB(0.15 * blink, 4 * blink, 0.6 * blink);
  });

  return (
    <group ref={group} scale={1.25}>
      <mesh geometry={geo.hull} material={mats.hull} />
      <mesh geometry={geo.sail} material={mats.white} />
      <mesh geometry={geo.frame} material={mats.dark} />
      <mesh geometry={geo.fins} material={mats.hull} />
      <mesh geometry={geo.shroud} material={mats.dark} />
      <group ref={prop} position={[2.45, 0, 0]}>
        {[0, 1, 2].map((k) => (
          <mesh key={k} geometry={geo.blade} material={mats.dark} rotation={[(k / 3) * Math.PI * 2, 0, 0.3]} />
        ))}
      </group>
      <mesh geometry={geo.dome} material={mats.dome} />
      {[0.55, -0.55].map((z) => (
        <group key={z} position={[-1.35, -0.62, z]}>
          <mesh geometry={geo.lamp} material={mats.dark} />
          <mesh geometry={geo.bulb} material={mats.lamp} position={[-0.14, 0, 0]} />
          <mesh geometry={geo.beam} material={mats.beam} position={[-0.14, 0, 0]} rotation={[0, z > 0 ? 0.12 : -0.12, 0.28]} />
          <mesh geometry={geo.glow} material={mats.lampGlow} position={[-0.2, 0, 0]} scale={0.9} />
        </group>
      ))}
      <mesh geometry={geo.bulb} position={[0.3, 1.25, 0.25]}>
        <meshBasicMaterial ref={port} toneMapped={false} />
      </mesh>
      <mesh geometry={geo.bulb} position={[0.3, 1.25, -0.25]}>
        <meshBasicMaterial ref={star} toneMapped={false} />
      </mesh>
    </group>
  );
}
