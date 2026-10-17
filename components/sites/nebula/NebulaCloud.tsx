"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createRandom } from "@/lib/random";
import { NEBULA_POS } from "./journey";
import Glow from "./Glow";

/**
 * A volumetric-looking emission nebula: dozens of large, slowly turning
 * billboards that each sample a procedurally generated cloud texture. Stacked
 * additively they read as thick glowing gas, and they fade out as the camera
 * flies through them so there is never a hard edge.
 */

function makeCloudTexture(size: number) {
  const random = createRandom(99);
  const grid = 16;
  const lattice = new Float32Array(grid * grid);
  for (let i = 0; i < lattice.length; i++) lattice[i] = random();
  const smooth = (t: number) => t * t * (3 - 2 * t);
  // Tileable value noise on a small lattice.
  const vnoise = (x: number, y: number, period: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const at = (a: number, b: number) =>
      lattice[(((a % period) + period) % period) + (((b % period) + period) % period) * grid];
    const top = at(xi, yi) * (1 - xf) + at(xi + 1, yi) * xf;
    const bot = at(xi, yi + 1) * (1 - xf) + at(xi + 1, yi + 1) * xf;
    return top * (1 - yf) + bot * yf;
  };
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let f = 0;
      let amp = 0.5;
      let freq = 2;
      for (let o = 0; o < 5; o++) {
        f += amp * vnoise(u * freq, v * freq, Math.min(freq, grid));
        freq *= 2;
        amp *= 0.5;
      }
      // Second, ridged channel for filaments.
      let ridge = 0;
      amp = 0.5;
      freq = 4;
      for (let o = 0; o < 4; o++) {
        const n = vnoise(u * freq + 3, v * freq + 7, Math.min(freq, grid));
        ridge += amp * (1 - Math.abs(n * 2 - 1));
        freq *= 2;
        amp *= 0.5;
      }
      const i = (y * size + x) * 4;
      data[i] = Math.min(255, f * 255);
      data[i + 1] = Math.min(255, Math.pow(ridge, 3) * 255 * 1.4);
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const vertex = /* glsl */ `
  uniform float uTime;
  attribute vec3 aCenter;
  attribute float aSize;
  attribute float aRot;
  attribute float aSeed;
  attribute vec3 aColor;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vSeed;
  varying float vFade;
  void main() {
    vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
    float a = aRot + uTime * 0.02 * (aSeed - 0.5);
    mat2 r = mat2(cos(a), -sin(a), sin(a), cos(a));
    mv.xy += r * position.xy * aSize;
    gl_Position = projectionMatrix * mv;
    vUv = uv;
    vColor = aColor;
    vSeed = aSeed;
    float dist = -mv.z;
    // Fade puffs that get too close (fly-through) or are behind the camera.
    vFade = smoothstep(aSize * 0.3, aSize * 1.2, dist);
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uCloud;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uDust;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vSeed;
  varying float vFade;
  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c) * 2.0;
    vec2 uv = vUv * 0.7 + vec2(vSeed * 7.31, vSeed * 3.17) + uTime * 0.004;
    vec4 t = texture2D(uCloud, uv);
    vec4 t2 = texture2D(uCloud, uv * 2.1 + 0.37);
    float shape = smoothstep(1.0, 0.15, d + (t.r - 0.5) * 0.9);
    float gas = pow(t.r * 0.75 + t2.r * 0.5, 3.4);
    float fil = t.g * 1.1;
    if (uDust > 0.5) {
      // Dark, filamentary dust (multiplied over the glowing gas).
      float a = shape * smoothstep(0.3, 0.7, t.r) * (0.4 + t2.g) * vFade * uOpacity;
      a = clamp(a, 0.0, 0.92);
      gl_FragColor = vec4(vColor * a, a);
      return;
    }
    float a = shape * (gas * 0.9 + fil * 0.6) * vFade * uOpacity;
    vec3 col = vColor * a + vec3(1.0, 0.9, 0.95) * fil * shape * 0.1 * vFade * uOpacity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

type Swarm = { count: number; seed: number; dust: boolean };

function buildSwarm({ count, seed, dust }: Swarm) {
  const random = createRandom(seed);
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute("position", base.getAttribute("position"));
  g.setAttribute("uv", base.getAttribute("uv"));
  const centers = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const rots = new Float32Array(count);
  const seeds = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const magenta = new THREE.Color("#ff2f9e");
  const violet = new THREE.Color("#6a2cff");
  const teal = new THREE.Color("#19c6e6");
  const amber = new THREE.Color("#ff8a2a");
  const soot = new THREE.Color("#2a0f1c");
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // Ellipsoidal swarm, denser in the middle.
    const u = random() * Math.PI * 2;
    const v = Math.acos(2 * random() - 1);
    const r = Math.pow(random(), dust ? 0.8 : 0.6);
    const x = Math.sin(v) * Math.cos(u) * r * 30;
    const y = Math.cos(v) * r * 11;
    const z = Math.sin(v) * Math.sin(u) * r * 34;
    centers[i * 3] = x;
    centers[i * 3 + 1] = y;
    centers[i * 3 + 2] = z;
    sizes[i] = dust ? 9 + random() * 14 : 12 + random() * 20;
    rots[i] = random() * Math.PI * 2;
    seeds[i] = random();
    if (dust) {
      c.copy(soot);
    } else {
      // Colour by position: hot magenta heart, violet body, teal and amber edges.
      c.copy(magenta).lerp(violet, Math.min(1, r * 1.3));
      if (x > 6 && random() < 0.6) c.lerp(teal, 0.8);
      if (z < -10 && random() < 0.5) c.lerp(amber, 0.65);
      c.multiplyScalar(0.45 + (1 - r) * 0.6);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("aCenter", new THREE.InstancedBufferAttribute(centers, 3));
  g.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 1));
  g.setAttribute("aRot", new THREE.InstancedBufferAttribute(rots, 1));
  g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  g.setAttribute("aColor", new THREE.InstancedBufferAttribute(colors, 3));
  g.instanceCount = count;
  return g;
}

export default function NebulaCloud({ count }: { count: number }) {
  const gasMat = useRef<THREE.ShaderMaterial>(null);
  const dustMat = useRef<THREE.ShaderMaterial>(null);
  const texture = useMemo(() => makeCloudTexture(128), []);
  const gas = useMemo(() => buildSwarm({ count, seed: 5, dust: false }), [count]);
  const dust = useMemo(
    () => buildSwarm({ count: Math.round(count * 0.4), seed: 8, dust: true }),
    [count],
  );

  const gasUniforms = useMemo(
    () => ({
      uCloud: { value: texture },
      uTime: { value: 0 },
      uOpacity: { value: 0.42 },
      uDust: { value: 0 },
    }),
    [texture],
  );
  const dustUniforms = useMemo(
    () => ({
      uCloud: { value: texture },
      uTime: { value: 0 },
      uOpacity: { value: 0.75 },
      uDust: { value: 1 },
    }),
    [texture],
  );

  useEffect(
    () => () => {
      gas.dispose();
      dust.dispose();
      texture.dispose();
    },
    [gas, dust, texture],
  );

  useFrame((_, delta) => {
    if (gasMat.current) gasMat.current.uniforms.uTime.value += delta;
    if (dustMat.current) dustMat.current.uniforms.uTime.value += delta;
  });

  const stars = useMemo(() => {
    const random = createRandom(21);
    return Array.from({ length: 7 }, () => ({
      p: [(random() - 0.5) * 40, (random() - 0.5) * 12, (random() - 0.5) * 44] as [number, number, number],
      s: 4 + random() * 7,
      c: random() < 0.5 ? "#bfe8ff" : "#ffd1f0",
    }));
  }, []);

  return (
    <group position={NEBULA_POS}>
      <mesh geometry={gas} frustumCulled={false}>
        <shaderMaterial
          ref={gasMat}
          vertexShader={vertex}
          fragmentShader={fragment}
          uniforms={gasUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {stars.map((s, i) => (
        <Glow key={i} position={s.p} scale={s.s} color={s.c} intensity={1.4} falloff={9} />
      ))}
      <mesh geometry={dust} frustumCulled={false} renderOrder={1}>
        <shaderMaterial
          ref={dustMat}
          vertexShader={vertex}
          fragmentShader={fragment}
          uniforms={dustUniforms}
          transparent
          premultipliedAlpha
          depthWrite={false}
          blending={THREE.MultiplyBlending}
        />
      </mesh>
    </group>
  );
}
