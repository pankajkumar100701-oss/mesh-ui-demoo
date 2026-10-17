"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { createRandom } from "@/lib/random";
import { flight } from "./journey";

/**
 * Hyperspace streaks. Built in camera space (the group copies the camera each
 * frame) so the lines always rush straight past the viewer while `flight.warp`
 * is above zero.
 */
const DEPTH = 220;

const vertex = /* glsl */ `
  uniform float uTravel;
  uniform float uStretch;
  attribute vec2 aCorner;   // x: side (-1/1), y: 0 head / 1 tail
  attribute vec2 aOffset;
  attribute float aPhase;
  attribute float aSpeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlong;
  varying float vSide;
  varying float vFade;
  void main() {
    float head = -${DEPTH.toFixed(1)} + mod(aPhase * ${DEPTH.toFixed(1)} + uTravel * aSpeed, ${DEPTH.toFixed(1)});
    float z = head - aCorner.y * uStretch * aSpeed;
    vec2 dir = normalize(aOffset);
    vec2 perp = vec2(-dir.y, dir.x);
    float width = 0.035 * length(aOffset) * 0.2 + 0.02;
    vec3 p = vec3(aOffset + perp * aCorner.x * width, z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    vColor = aColor;
    vAlong = aCorner.y;
    vSide = aCorner.x;
    vFade = smoothstep(-${DEPTH.toFixed(1)}, -${(DEPTH * 0.6).toFixed(1)}, head) * smoothstep(0.0, -6.0, head);
  }
`;

const fragment = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlong;
  varying float vSide;
  varying float vFade;
  void main() {
    float across = 1.0 - abs(vSide);
    float a = pow(1.0 - vAlong, 1.6) * across * vFade * uOpacity;
    gl_FragColor = vec4(vColor * a * 2.2, 1.0);
  }
`;

export default function Warp({ count }: { count: number }) {
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const camera = useThree((s) => s.camera);

  const geometry = useMemo(() => {
    const random = createRandom(3);
    const g = new THREE.InstancedBufferGeometry();
    const corners = new Float32Array([-1, 0, 1, 0, 1, 1, -1, 1]);
    g.setAttribute("aCorner", new THREE.BufferAttribute(corners, 2));
    // `position` is required by three for draw-range bookkeeping.
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const offsets = new Float32Array(count * 2);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const palette = ["#ffffff", "#bcd2ff", "#c9a8ff", "#ff9bd8", "#9ff0ff"].map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2;
      const r = 1.6 + Math.pow(random(), 0.7) * 22;
      offsets[i * 2] = Math.cos(a) * r;
      offsets[i * 2 + 1] = Math.sin(a) * r;
      phases[i] = random();
      speeds[i] = 0.6 + random() * 0.8;
      const c = palette[Math.floor(random() * palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 2));
    g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
    g.setAttribute("aSpeed", new THREE.InstancedBufferAttribute(speeds, 1));
    g.setAttribute("aColor", new THREE.InstancedBufferAttribute(colors, 3));
    g.instanceCount = count;
    return g;
  }, [count]);

  const uniforms = useMemo(
    () => ({ uTravel: { value: 0 }, uStretch: { value: 40 }, uOpacity: { value: 1 } }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    const g = group.current;
    const m = material.current;
    if (!g || !m) return;
    const w = flight.warp;
    g.visible = w > 0.002;
    if (!g.visible) return;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    const speed = 30 + w * w * 420;
    m.uniforms.uTravel.value += delta * speed;
    m.uniforms.uStretch.value = 1.5 + w * w * 70;
    m.uniforms.uOpacity.value = Math.min(1, w * 1.6);
  });

  return (
    <group ref={group}>
      <mesh geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={material}
          vertexShader={vertex}
          fragmentShader={fragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
