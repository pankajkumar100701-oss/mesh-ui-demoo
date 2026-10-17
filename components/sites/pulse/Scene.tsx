"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer, Vignette } from "@react-three/postprocessing";
import type { BloomEffect, ChromaticAberrationEffect } from "postprocessing";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { createRandom } from "@/lib/random";
import { BAND_COUNT, createSignal, idleSignal, type PulseEngine, type Signal } from "./audio";

type Quality = 0 | 1 | 2;
type SigRef = RefObject<Signal>;

type SceneProps = {
  engineRef: RefObject<PulseEngine | null>;
  active: boolean;
  reducedMotion: boolean;
};

const BG = "#07040d";
const PURPLE = new THREE.Color("#a855f7");
const GREEN = new THREE.Color("#22c55e");
const WHITE = new THREE.Color("#ffffff");
const HALO_Y = 4.7;
const HALO_Z = -2.6;

/* ------------------------------------------------------------------ */
/* Signal: engine analysis when playing, a soft heartbeat when idle    */
/* ------------------------------------------------------------------ */

function SignalDriver({ engineRef, sig }: { engineRef: RefObject<PulseEngine | null>; sig: SigRef }) {
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const e = engineRef.current;
    if (e && e.running) e.sample(sig.current, dt);
    else idleSignal(sig.current, state.clock.elapsedTime, dt);
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

function CameraRig({ sig, reducedMotion }: { sig: SigRef; reducedMotion: boolean }) {
  const pointer = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const look = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, delta) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    const s = sig.current;
    const t = state.clock.elapsedTime;
    const p = pointer.current;
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 2.5);
    p.sx += (p.x - p.sx) * k;
    p.sy += (p.y - p.sy) * k;

    const aspect = state.size.width / Math.max(1, state.size.height);
    const portrait = aspect < 1.25;
    const fov = portrait ? 62 : 48;
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const dist = portrait ? Math.min(30, (16 * 1.25) / aspect) : 17;
    // Shift the frame (not the perspective) so the stage clears the hero copy and the deck console.
    const ox = portrait ? 0 : -state.size.width * 0.08;
    const oy = state.size.height * (portrait ? 0.1 : 0.12);
    const view = cam.view;
    if (!view || view.offsetX !== ox || view.offsetY !== oy || view.fullWidth !== state.size.width || view.fullHeight !== state.size.height) {
      cam.setViewOffset(state.size.width, state.size.height, ox, oy, state.size.width, state.size.height);
    }
    const motion = reducedMotion ? 0.25 : 1;
    const shake = reducedMotion ? 0 : s.kick * 0.05;
    cam.position.set(
      Math.sin(t * 0.13) * 1.4 * motion + p.sx * 1.6 + Math.sin(t * 61) * shake,
      4.5 + Math.sin(t * 0.21) * 0.25 * motion - p.sy * 0.6 + Math.cos(t * 53) * shake,
      dist - s.kick * 0.15 * motion,
    );
    look.set(p.sx * 0.6, portrait ? 4.0 : 3.5, 0);
    cam.lookAt(look);
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Floor: grid + ripples that ring out from every kick                 */
/* ------------------------------------------------------------------ */

const floorVertex = /* glsl */ `
  varying vec2 vXZ;
  varying float vDist;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vXZ = world.xz;
    vec4 mv = viewMatrix * world;
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const floorFragment = /* glsl */ `
  uniform float uTime;
  uniform float uKickAge;
  uniform float uBass;
  uniform float uLevel;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uFog;
  varying vec2 vXZ;
  varying float vDist;

  float grid(vec2 p, float s) {
    vec2 c = p / s;
    vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }

  void main() {
    vec2 p = vXZ - vec2(0.0, -1.0);
    float r = length(p);
    vec3 col = vec3(0.012, 0.006, 0.022);
    float g = grid(vXZ, 1.5);
    float near = 1.0 - smoothstep(4.0, 34.0, r);
    col += mix(uA, uB, 0.5 + 0.5 * sin(r * 0.25 - uTime * 0.6)) * g * near * (0.22 + uLevel * 0.9);

    // Ripple ring from the last kick.
    float ringR = uKickAge * 15.0;
    float ring = exp(-abs(r - ringR) * 2.2) * exp(-uKickAge * 1.6);
    col += mix(uA, uB, clamp(uKickAge * 1.5, 0.0, 1.0)) * ring * 1.6;

    // Stage glow pool.
    float pool = exp(-r * 0.22) * (0.25 + uBass * 1.3);
    col += uA * pool * 0.45;

    float fog = smoothstep(14.0, 60.0, vDist);
    col = mix(col, uFog, fog);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function Floor({ sig }: { sig: SigRef }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uKickAge: { value: 99 },
      uBass: { value: 0 },
      uLevel: { value: 0 },
      uA: { value: PURPLE.clone() },
      uB: { value: GREEN.clone() },
      uFog: { value: new THREE.Color(BG) },
    }),
    [],
  );
  useFrame((state) => {
    const m = mat.current;
    if (!m) return;
    const s = sig.current;
    m.uniforms.uTime.value = state.clock.elapsedTime;
    m.uniforms.uKickAge.value = s.kickAge;
    m.uniforms.uBass.value = s.bass;
    m.uniforms.uLevel.value = s.level;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
      <planeGeometry args={[140, 140]} />
      <shaderMaterial ref={mat} uniforms={uniforms} vertexShader={floorVertex} fragmentShader={floorFragment} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Stage + DJ booth with a live spectrum on its front                  */
/* ------------------------------------------------------------------ */

const spectrumFragment = /* glsl */ `
  uniform float uBands[${BAND_COUNT}];
  uniform float uKick;
  varying vec2 vUv;
  void main() {
    float fx = vUv.x * ${BAND_COUNT}.0;
    int idx = int(floor(fx));
    float v = 0.0;
    for (int i = 0; i < ${BAND_COUNT}; i++) { if (i == idx) v = uBands[i]; }
    float cellX = fract(fx);
    float cellY = fract(vUv.y * 12.0);
    float led = step(0.12, cellX) * step(cellX, 0.88) * step(0.18, cellY) * step(cellY, 0.82);
    float lit = step(vUv.y, v * 1.05 + 0.04);
    vec3 low = vec3(0.13, 0.77, 0.37);
    vec3 midc = vec3(0.98, 0.8, 0.08);
    vec3 top = vec3(0.66, 0.33, 0.97);
    vec3 c = mix(low, midc, smoothstep(0.3, 0.6, vUv.y));
    c = mix(c, top, smoothstep(0.65, 0.9, vUv.y));
    vec3 col = c * led * (lit * (1.8 + uKick * 1.2) + 0.05);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const uvVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function Stage({ sig }: { sig: SigRef }) {
  const spectrum = useRef<THREE.ShaderMaterial>(null);
  const edge = useRef<THREE.MeshBasicMaterial>(null);
  const uniforms = useMemo(() => ({ uBands: { value: new Float32Array(BAND_COUNT) }, uKick: { value: 0 } }), []);
  const edgeColor = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const s = sig.current;
    if (spectrum.current) {
      (spectrum.current.uniforms.uBands.value as Float32Array).set(s.bands);
      spectrum.current.uniforms.uKick.value = s.kick;
    }
    if (edge.current) {
      edgeColor.copy(GREEN).multiplyScalar(0.6 + s.level * 3 + s.kick * 1.2);
      edge.current.color.copy(edgeColor);
    }
  });
  return (
    <group>
      {/* Platform */}
      <mesh position={[0, 0.4, -0.6]}>
        <boxGeometry args={[11.5, 0.8, 5]} />
        <meshStandardMaterial color="#0d0a14" roughness={0.55} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.8, 1.92]}>
        <boxGeometry args={[11.5, 0.05, 0.05]} />
        <meshBasicMaterial ref={edge} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.06, 1.92]}>
        <boxGeometry args={[11.5, 0.04, 0.05]} />
        <meshBasicMaterial color={PURPLE} toneMapped={false} />
      </mesh>
      {/* Booth */}
      <mesh position={[0, 1.38, 0.2]}>
        <boxGeometry args={[3.6, 1.15, 1.1]} />
        <meshStandardMaterial color="#120d1c" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, 1.36, 0.76]}>
        <planeGeometry args={[3.3, 0.95]} />
        <shaderMaterial ref={spectrum} uniforms={uniforms} vertexShader={uvVertex} fragmentShader={spectrumFragment} />
      </mesh>
      {/* Decks on the booth top */}
      {[-0.95, 0.95].map((x) => (
        <Platter key={x} x={x} sig={sig} />
      ))}
      <mesh position={[0, 1.99, 0.2]}>
        <boxGeometry args={[0.6, 0.06, 0.6]} />
        <meshStandardMaterial color="#1c1628" emissive="#22c55e" emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

function Platter({ x, sig }: { x: number; sig: SigRef }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y -= Math.min(delta, 0.1) * (sig.current.playing ? 3.5 : 0.6);
  });
  return (
    <group ref={ref} position={[x, 1.99, 0.2]}>
      <mesh>
        <cylinderGeometry args={[0.38, 0.38, 0.04, 40]} />
        <meshStandardMaterial color="#09070d" roughness={0.3} metalness={0.2} />
      </mesh>
      <mesh position={[0.18, 0.03, 0]}>
        <boxGeometry args={[0.08, 0.01, 0.02]} />
        <meshBasicMaterial color="#facc15" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.025, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.01, 24]} />
        <meshBasicMaterial color={x < 0 ? PURPLE : GREEN} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Speaker stacks: cones physically pump on every kick                 */
/* ------------------------------------------------------------------ */

function Cone({ radius, position, sig, sub }: { radius: number; position: [number, number, number]; sig: SigRef; sub?: boolean }) {
  const diaphragm = useRef<THREE.Group>(null);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  const points = useMemo(
    () => [
      new THREE.Vector2(radius * 0.2, -radius * 0.34),
      new THREE.Vector2(radius * 0.45, -radius * 0.24),
      new THREE.Vector2(radius * 0.72, -radius * 0.11),
      new THREE.Vector2(radius * 0.86, -radius * 0.02),
    ],
    [radius],
  );
  const color = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const s = sig.current;
    const push = sub ? s.kick * 0.22 + s.bass * 0.06 : s.kick * 0.12 + s.mid * 0.05;
    if (diaphragm.current) {
      diaphragm.current.position.z = push * radius;
      diaphragm.current.scale.setScalar(1 + push * 0.04);
    }
    if (ring.current) {
      color.copy(sub ? PURPLE : GREEN).multiplyScalar(0.35 + s.kick * (sub ? 2.6 : 1.4) + s.bass * 0.8);
      ring.current.color.copy(color);
    }
  });
  return (
    <group position={position}>
      <mesh>
        <torusGeometry args={[radius * 0.95, radius * 0.06, 8, 40]} />
        <meshBasicMaterial ref={ring} toneMapped={false} />
      </mesh>
      <group ref={diaphragm}>
        <mesh rotation-x={Math.PI / 2}>
          <latheGeometry args={[points, 36]} />
          <meshStandardMaterial color="#141118" roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
        <mesh>
          <torusGeometry args={[radius * 0.88, radius * 0.045, 8, 40]} />
          <meshStandardMaterial color="#1f1a26" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0, -radius * 0.28]} rotation-x={Math.PI / 2} scale={[1, 0.5, 1]}>
          <sphereGeometry args={[radius * 0.22, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#26202e" roughness={0.4} metalness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

function Cabinet({
  size,
  position,
  cones,
  sig,
  sub,
}: {
  size: [number, number, number];
  position: [number, number, number];
  cones: [number, number, number][];
  sig: SigRef;
  sub?: boolean;
}) {
  const [w, h, d] = size;
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#0b090f" roughness={0.75} metalness={0.15} />
      </mesh>
      {/* Front grille frame */}
      <mesh position={[0, 0, d / 2 + 0.001]}>
        <planeGeometry args={[w * 0.94, h * 0.9]} />
        <meshStandardMaterial color="#050407" roughness={1} />
      </mesh>
      {cones.map(([x, y, r]) => (
        <Cone key={`${x}:${y}`} radius={r} position={[x, y, d / 2 + 0.02]} sig={sig} sub={sub} />
      ))}
    </group>
  );
}

function SpeakerStack({ side, sig }: { side: 1 | -1; sig: SigRef }) {
  return (
    <group position={[side * 7.3, 0, 0.6]} rotation-y={-side * 0.24}>
      <Cabinet size={[2.2, 1.7, 1.5]} position={[0, 0.85, 0]} cones={[[0, 0, 0.66]]} sig={sig} sub />
      <Cabinet
        size={[2.0, 1.1, 1.3]}
        position={[0, 2.27, -0.05]}
        cones={[
          [-0.48, 0, 0.36],
          [0.48, 0, 0.36],
        ]}
        sig={sig}
      />
      <Cabinet
        size={[1.8, 0.9, 1.2]}
        position={[0, 3.29, -0.1]}
        cones={[
          [-0.5, 0, 0.28],
          [0.5, 0, 0.28],
          [0, 0.02, 0.14],
        ]}
        sig={sig}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Moving-head light rig with volumetric beams                         */
/* ------------------------------------------------------------------ */

const beamVertex = /* glsl */ `
  uniform float uLength;
  varying float vAlong;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    vAlong = clamp(-position.y / uLength, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying float vAlong;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    float facing = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
    float core = pow(facing, 2.2);
    float fall = pow(1.0 - vAlong, 1.6) * smoothstep(0.0, 0.04, vAlong);
    float haze = 0.75 + 0.25 * sin(vAlong * 22.0 - uTime * 2.3 + vViewPos.x * 0.7);
    float a = core * fall * haze * uIntensity * 0.42;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

const BEAM_LENGTH = 15;

function MovingHead({
  index,
  count,
  x,
  geometry,
  sig,
  speed,
}: {
  index: number;
  count: number;
  x: number;
  geometry: THREE.BufferGeometry;
  sig: SigRef;
  speed: number;
}) {
  const pan = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const beam = useRef<THREE.ShaderMaterial>(null);
  const lens = useRef<THREE.MeshBasicMaterial>(null);
  const clock = useRef(0);
  const base = index % 2 === 0 ? PURPLE : GREEN;
  const uniforms = useMemo(
    () => ({
      uColor: { value: base.clone() },
      uIntensity: { value: 0.4 },
      uTime: { value: 0 },
      uLength: { value: BEAM_LENGTH },
    }),
    [base],
  );

  useFrame((state, delta) => {
    const s = sig.current;
    const dt = Math.min(delta, 0.1);
    clock.current += dt * speed * (s.playing ? 1 + s.level * 0.8 : 0.45);
    const t = clock.current;
    const c = (index - (count - 1) / 2) / ((count - 1) / 2); // -1 … 1 across the truss

    // Three looks that cross-fade over time: fan, scissor cross, rolling wave.
    const cycle = state.clock.elapsedTime * 0.07;
    const w0 = Math.max(0, Math.cos(cycle * Math.PI * 2)) ** 2;
    const w1 = Math.max(0, Math.cos(cycle * Math.PI * 2 - 2.094)) ** 2;
    const w2 = Math.max(0, Math.cos(cycle * Math.PI * 2 + 2.094)) ** 2;
    const ws = w0 + w1 + w2 || 1;

    const fanP = c * (0.25 + 0.2 * Math.sin(t * 0.6));
    const fanT = 0.42 + 0.18 * Math.sin(t * 0.8);
    const crossP = Math.sin(t * 0.9 + (index % 2) * Math.PI) * 0.55;
    const crossT = 0.5 + 0.1 * Math.sin(t * 1.7);
    const waveP = Math.sin(t * 1.1 + index * 0.75) * 0.45;
    const waveT = 0.32 + 0.24 * Math.sin(t * 1.4 + index * 0.6);

    const p = (fanP * w0 + crossP * w1 + waveP * w2) / ws;
    const tl = (fanT * w0 + crossT * w1 + waveT * w2) / ws - s.kick * 0.05;
    if (pan.current) pan.current.rotation.z = p;
    if (tilt.current) tilt.current.rotation.x = -tl;

    // Brightness: mids drive the body, claps flash, hats chase across alternate heads.
    const chase = s.playing && (s.step + index) % 4 === 0 ? s.hat * 0.5 : 0;
    const intensity = s.playing ? 0.35 + s.mid * 1.1 + s.clap * 0.9 + chase + s.kick * 0.25 : 0.3 + s.chord * 0.3;
    const m = beam.current;
    if (m) {
      m.uniforms.uIntensity.value = intensity;
      m.uniforms.uTime.value = state.clock.elapsedTime;
      (m.uniforms.uColor.value as THREE.Color).copy(base).lerp(WHITE, Math.min(0.75, s.clap * 0.7));
    }
    if (lens.current) lens.current.color.copy(base).multiplyScalar(1.5 + intensity * 3);
  });

  return (
    <group position={[x, 8.1, -0.6]}>
      {/* Yoke */}
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[0.5, 0.14, 0.32]} />
        <meshStandardMaterial color="#17131f" roughness={0.5} metalness={0.6} />
      </mesh>
      <group ref={pan}>
        <group ref={tilt}>
          <mesh position={[0, -0.22, 0]}>
            <cylinderGeometry args={[0.2, 0.26, 0.42, 20]} />
            <meshStandardMaterial color="#1d1828" roughness={0.45} metalness={0.7} />
          </mesh>
          <mesh position={[0, -0.44, 0]} rotation-x={Math.PI / 2}>
            <circleGeometry args={[0.2, 20]} />
            <meshBasicMaterial ref={lens} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={geometry} position={[0, -0.44, 0]}>
            <shaderMaterial
              ref={beam}
              uniforms={uniforms}
              vertexShader={beamVertex}
              fragmentShader={beamFragment}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function LightRig({ sig, reducedMotion }: { sig: SigRef; reducedMotion: boolean }) {
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.14, 1.45, BEAM_LENGTH, 40, 1, true);
    g.translate(0, -BEAM_LENGTH / 2, 0);
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const xs = [-5.6, -3.36, -1.12, 1.12, 3.36, 5.6];
  return (
    <group>
      {/* Truss: two chords and zig-zag struts */}
      {[-0.18, 0.18].map((z) =>
        [8.32, 8.68].map((y) => (
          <mesh key={`${z}:${y}`} position={[0, y, -0.6 + z]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.035, 0.035, 14.5, 6]} />
            <meshStandardMaterial color="#2a2533" roughness={0.4} metalness={0.9} />
          </mesh>
        )),
      )}
      {Array.from({ length: 24 }, (_, i) => (
        <mesh key={i} position={[-7 + i * 0.61 + 0.3, 8.5, -0.6]} rotation-z={i % 2 === 0 ? 0.6 : -0.6}>
          <cylinderGeometry args={[0.018, 0.018, 0.44, 4]} />
          <meshStandardMaterial color="#2a2533" roughness={0.4} metalness={0.9} />
        </mesh>
      ))}
      {xs.map((x, i) => (
        <MovingHead
          key={x}
          index={i}
          count={xs.length}
          x={x}
          geometry={geometry}
          sig={sig}
          speed={reducedMotion ? 0.3 : 1}
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Halo + hexagonal ring tunnel, brightness travels back like a wave   */
/* ------------------------------------------------------------------ */

const RING_COUNT = 34;
const TUNNEL_NEAR = HALO_Z - 0.6;
const TUNNEL_FAR = -95;
const HISTORY = 90;

function Tunnel({ sig, reducedMotion }: { sig: SigRef; reducedMotion: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const halo = useRef<THREE.Group>(null);
  const haloOuter = useRef<THREE.MeshBasicMaterial>(null);
  const haloInner = useRef<THREE.MeshBasicMaterial>(null);
  const state = useRef({
    travel: 0,
    history: new Float32Array(HISTORY),
    head: 0,
    acc: 0,
    dummy: new THREE.Object3D(),
    color: new THREE.Color(),
  });

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < RING_COUNT; i++) m.setColorAt(i, PURPLE);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);

  useFrame((frame, delta) => {
    const m = mesh.current;
    if (!m) return;
    const s = sig.current;
    const dt = Math.min(delta, 0.1);
    const st = state.current;
    const motion = reducedMotion ? 0.3 : 1;
    st.travel += dt * (3 + s.level * 26 + s.kick * 6) * motion;

    // Record energy at 60 Hz so rings further back show older beats.
    st.acc += dt;
    while (st.acc > 1 / 60) {
      st.acc -= 1 / 60;
      st.head = (st.head + 1) % HISTORY;
      st.history[st.head] = s.kick * 0.8 + s.bass * 0.7;
    }

    const span = TUNNEL_NEAR - TUNNEL_FAR;
    const gap = span / RING_COUNT;
    const t = frame.clock.elapsedTime;
    for (let i = 0; i < RING_COUNT; i++) {
      const raw = (i * gap + st.travel) % span;
      const z = TUNNEL_FAR + raw;
      const depth = 1 - raw / span; // 0 near … 1 far
      const lag = Math.floor(depth * (HISTORY - 1));
      const e = st.history[(st.head - lag + HISTORY) % HISTORY];
      const d = st.dummy;
      d.position.set(0, HALO_Y, z);
      d.rotation.set(0, 0, t * 0.08 * motion + z * 0.035);
      d.scale.setScalar(1 + e * 0.12);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      st.color.copy(i % 2 === 0 ? PURPLE : GREEN).multiplyScalar(0.25 + e * 3.2);
      m.setColorAt(i, st.color);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;

    if (halo.current) {
      halo.current.scale.setScalar(1 + s.kick * 0.06);
      halo.current.rotation.z = t * 0.05 * motion;
    }
    if (haloOuter.current) haloOuter.current.color.copy(PURPLE).multiplyScalar(1.2 + s.kick * 3 + s.bass * 1.5);
    if (haloInner.current) haloInner.current.color.copy(GREEN).multiplyScalar(0.6 + s.high * 3 + s.hat * 1.5);
  });

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, RING_COUNT]} frustumCulled={false}>
        <torusGeometry args={[3.4, 0.05, 4, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <group ref={halo} position={[0, HALO_Y, HALO_Z]}>
        <mesh>
          <torusGeometry args={[3.7, 0.11, 10, 96]} />
          <meshBasicMaterial ref={haloOuter} toneMapped={false} />
        </mesh>
        <mesh>
          <torusGeometry args={[3.35, 0.035, 6, 96]} />
          <meshBasicMaterial ref={haloInner} toneMapped={false} />
        </mesh>
        {/* Tick marks around the halo, like a VU dial */}
        {Array.from({ length: 48 }, (_, i) => {
          const a = (i / 48) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 4.05, Math.sin(a) * 4.05, 0]} rotation-z={a}>
              <boxGeometry args={[i % 4 === 0 ? 0.36 : 0.18, 0.035, 0.035]} />
              <meshBasicMaterial color={i % 4 === 0 ? "#d8b4fe" : "#6b21a8"} toneMapped={false} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Particles streaming out of the tunnel over the crowd                */
/* ------------------------------------------------------------------ */

const particleVertex = /* glsl */ `
  uniform float uTravel;
  uniform float uSize;
  uniform float uNear;
  uniform float uFar;
  attribute float aRand;
  varying float vRand;
  varying float vFade;
  void main() {
    vec3 p = position;
    float span = uNear - uFar;
    p.z = uFar + mod(p.z - uFar + uTravel * (0.6 + aRand * 0.8), span);
    vFade = smoothstep(uFar, uFar + 20.0, p.z) * (1.0 - smoothstep(uNear - 6.0, uNear, p.z));
    vRand = aRand;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = min(uSize * (0.5 + aRand) / -mv.z, 48.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFragment = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uGlow;
  varying float vRand;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    vec3 col = mix(uA, uB, step(0.55, vRand));
    gl_FragColor = vec4(col * a * vFade * uGlow, 1.0);
  }
`;

function Particles({ count, sig, reducedMotion }: { count: number; sig: SigRef; reducedMotion: boolean }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const travel = useRef(0);
  const { positions, rand } = useMemo(() => {
    const r = createRandom(77);
    const positions = new Float32Array(count * 3);
    const rand = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const rad = 1.2 + Math.pow(r(), 0.7) * 9;
      positions[i * 3] = Math.cos(a) * rad;
      positions[i * 3 + 1] = HALO_Y + Math.sin(a) * rad * 0.8;
      positions[i * 3 + 2] = -95 + r() * 106;
      rand[i] = r();
    }
    return { positions, rand };
  }, [count]);
  const uniforms = useMemo(
    () => ({
      uTravel: { value: 0 },
      uSize: { value: 70 },
      uNear: { value: 11 },
      uFar: { value: -95 },
      uA: { value: PURPLE.clone().multiplyScalar(1.4) },
      uB: { value: GREEN.clone().multiplyScalar(1.2) },
      uGlow: { value: 1 },
    }),
    [],
  );
  useFrame((state, delta) => {
    const s = sig.current;
    const dt = Math.min(delta, 0.1);
    travel.current += dt * (2.5 + s.level * 30 + s.kick * 8) * (reducedMotion ? 0.3 : 1);
    const m = mat.current;
    if (!m) return;
    m.uniforms.uTravel.value = travel.current;
    m.uniforms.uGlow.value = 0.6 + s.high * 1.6 + s.kick * 0.6;
    m.uniforms.uSize.value = 70 * state.viewport.dpr * (1 + s.kick * 0.3);
  });
  if (count === 0) return null;
  return (
    <points key={count} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aRand" args={[rand, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={particleVertex}
        fragmentShader={particleFragment}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/* Crowd silhouettes bobbing to the kick                               */
/* ------------------------------------------------------------------ */

type Dancer = { x: number; z: number; h: number; phase: number; amp: number; arms: boolean; lean: number };

function Crowd({ count, sig, reducedMotion }: { count: number; sig: SigRef; reducedMotion: boolean }) {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const arms = useRef<THREE.InstancedMesh>(null);
  const dancers = useMemo<Dancer[]>(() => {
    const r = createRandom(2024);
    const list: Dancer[] = [];
    for (let i = 0; i < count; i++) {
      const z = 3.4 + Math.pow(r(), 0.9) * 6.6;
      const spread = 6 + (z - 3.4) * 0.7;
      list.push({
        x: (r() * 2 - 1) * spread,
        z,
        h: 0.8 + r() * 0.25,
        phase: r() * Math.PI * 2,
        amp: 0.5 + r() * 0.8,
        arms: r() < 0.22,
        lean: (r() - 0.5) * 0.2,
      });
    }
    return list;
  }, [count]);
  const armCount = useMemo(() => dancers.filter((d) => d.arms).length, [dancers]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    const b = bodies.current;
    const h = heads.current;
    const a = arms.current;
    if (!b || !h || !a) return;
    const s = sig.current;
    const t = state.clock.elapsedTime;
    const energy = reducedMotion ? 0.3 : s.playing ? 1 : 0.35;
    let ai = 0;
    for (let i = 0; i < dancers.length; i++) {
      const d = dancers[i];
      const bob = (s.kick * 0.14 * d.amp + Math.sin(t * 2 + d.phase) * 0.02) * energy;
      const sway = Math.sin(t * 1.3 + d.phase) * 0.06 * energy + d.lean;
      dummy.position.set(d.x, 0.62 * d.h + bob, d.z);
      dummy.rotation.set(0, 0, sway);
      dummy.scale.set(1, d.h, 1);
      dummy.updateMatrix();
      b.setMatrixAt(i, dummy.matrix);

      dummy.position.set(d.x - Math.sin(sway) * 0.7 * d.h, 1.42 * d.h + bob * 1.2, d.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      h.setMatrixAt(i, dummy.matrix);

      if (d.arms) {
        const lift = s.playing ? 0.5 + s.clap * 0.5 : 0.35;
        for (const side of [-1, 1]) {
          dummy.position.set(d.x + side * 0.2, 1.55 * d.h + bob * 1.3 + lift * 0.15, d.z);
          dummy.rotation.set(0, 0, side * (0.35 - lift * 0.25) + Math.sin(t * 3 + d.phase) * 0.08 * energy);
          dummy.scale.set(1, 0.8 + lift * 0.3, 1);
          dummy.updateMatrix();
          a.setMatrixAt(ai++, dummy.matrix);
        }
      }
    }
    b.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
    a.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;
  return (
    <group key={count}>
      <instancedMesh ref={bodies} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.24, 0.62, 4, 8]} />
        <meshStandardMaterial color="#040306" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.17, 10, 8]} />
        <meshStandardMaterial color="#040306" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={arms} args={[undefined, undefined, Math.max(1, armCount * 2)]} frustumCulled={false}>
        <capsuleGeometry args={[0.055, 0.6, 3, 6]} />
        <meshStandardMaterial color="#040306" roughness={1} />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Lights + post                                                       */
/* ------------------------------------------------------------------ */

function StageLights({ sig }: { sig: SigRef }) {
  const back = useRef<THREE.PointLight>(null);
  const left = useRef<THREE.PointLight>(null);
  const right = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const s = sig.current;
    if (back.current) back.current.intensity = 18 + s.kick * 60 + s.bass * 30;
    if (left.current) left.current.intensity = 8 + s.mid * 40 + s.clap * 30;
    if (right.current) right.current.intensity = 8 + s.high * 40 + s.hat * 18;
  });
  return (
    <>
      <ambientLight intensity={0.25} color="#8b5cf6" />
      <pointLight ref={back} position={[0, 4.5, -1.5]} color="#a855f7" distance={22} decay={1.6} />
      <pointLight ref={left} position={[-6, 6, 4]} color="#22c55e" distance={18} decay={1.6} />
      <pointLight ref={right} position={[6, 6, 4]} color="#c084fc" distance={18} decay={1.6} />
    </>
  );
}

function Effects({ sig, quality, reducedMotion }: { sig: SigRef; quality: Quality; reducedMotion: boolean }) {
  const bloom = useRef<BloomEffect>(null);
  const ca = useRef<ChromaticAberrationEffect>(null);
  useFrame(() => {
    const s = sig.current;
    if (bloom.current) bloom.current.intensity = 0.85 + s.kick * 0.45 + s.level * 0.35;
    const k = reducedMotion ? 0 : s.kick * 0.0022 + s.clap * 0.0015;
    ca.current?.offset.set(0.0004 + k, 0.0002 + k * 0.5);
  });
  if (quality === 2) {
    return (
      <EffectComposer multisampling={0}>
        <Bloom ref={bloom} mipmapBlur intensity={1.1} luminanceThreshold={0.55} luminanceSmoothing={0.3} />
        <ChromaticAberration ref={ca} radialModulation modulationOffset={0.2} />
        <Vignette offset={0.25} darkness={0.85} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0}>
      <Bloom ref={bloom} mipmapBlur intensity={1.0} luminanceThreshold={0.55} luminanceSmoothing={0.3} />
      <Vignette offset={0.25} darkness={0.85} />
    </EffectComposer>
  );
}

function initialQuality(): Quality {
  if (typeof window === "undefined") return 1;
  const small = window.innerWidth < 768;
  const cores = navigator.hardwareConcurrency || 4;
  if (small || cores <= 4) return 1;
  return 2;
}

export default function Scene({ engineRef, active, reducedMotion }: SceneProps) {
  const sig = useRef<Signal>(createSignal());
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const dpr: number | [number, number] = quality === 2 ? [1, 1.75] : quality === 1 ? [1, 1.3] : 1;

  return (
    <Canvas
      dpr={dpr}
      frameloop={active ? "always" : "never"}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      camera={{ position: [0, 3.3, 16], fov: 48, near: 0.1, far: 200 }}
    >
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => setQuality((q) => (q > 0 ? ((q - 1) as Quality) : q))}
        onFallback={() => setQuality(0)}
      />
      <color attach="background" args={[BG]} />
      <fogExp2 attach="fog" args={[BG, 0.022]} />
      <SignalDriver engineRef={engineRef} sig={sig} />
      <CameraRig sig={sig} reducedMotion={reducedMotion} />
      <StageLights sig={sig} />
      <Floor sig={sig} />
      <Stage sig={sig} />
      <SpeakerStack side={-1} sig={sig} />
      <SpeakerStack side={1} sig={sig} />
      <Tunnel sig={sig} reducedMotion={reducedMotion} />
      <LightRig sig={sig} reducedMotion={reducedMotion} />
      <Particles count={quality === 2 ? 1600 : quality === 1 ? 900 : 400} sig={sig} reducedMotion={reducedMotion} />
      <Crowd count={quality === 0 ? 70 : 140} sig={sig} reducedMotion={reducedMotion} />
      <Effects sig={sig} quality={quality} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
