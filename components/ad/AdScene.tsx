"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, MeshTransmissionMaterial, RoundedBox, useTexture } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createRandom } from "@/lib/random";
import { previews } from "@/lib/previews";
import { sites } from "@/lib/sites";
import { BEATS, galleryIndex, range, smooth, timeline, windowed } from "./timeline";

const SPACING = 0.42;
const PALETTE = ["#4c1d95", "#6d5dfc", "#22d3ee", "#f472b6"].map((c) => new THREE.Color(c));
const STAGE_Y = 2.6;

function paint(t: number, out: THREE.Color) {
  const x = THREE.MathUtils.clamp(t, 0, 1) * (PALETTE.length - 1);
  const i = Math.min(Math.floor(x), PALETTE.length - 2);
  return out.copy(PALETTE[i]).lerp(PALETTE[i + 1], x - i);
}

/* ------------------------------------------------------------------ */
/* Pillar field: the MeshUI hero, rising from flat and splashing on beat */
/* ------------------------------------------------------------------ */

/** Splashes fired at fixed points of the ad so the field punctuates the copy. */
const SPLASHES = [
  { t: 0.4, x: 0, z: 0 },
  { t: 22.3, x: -2, z: 1 },
  { t: 23.4, x: 1, z: -1 },
  { t: 24.5, x: 0, z: 0.5 },
  { t: 26.9, x: 0, z: 0 },
];

type Ripple = { x: number; z: number; t: number; power: number };

function Field({ cols, rows }: { cols: number; rows: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = cols * rows;
  const ripples = useRef<Ripple[]>([]);
  const lastT = useRef(0);
  const lastDrop = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const cells = useMemo(() => {
    const xs = new Float32Array(count);
    const zs = new Float32Array(count);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        xs[r * cols + c] = (c - (cols - 1) / 2) * SPACING;
        zs[r * cols + c] = (r - (rows - 1) / 2) * SPACING;
      }
    return { xs, zs };
  }, [cols, rows, count]);

  useFrame((state, delta) => {
    const m = mesh.current;
    if (!m) return;
    const t = timeline.t;
    const time = state.clock.elapsedTime;

    if (t < lastT.current) ripples.current = [];
    for (const s of SPLASHES) if (lastT.current < s.t && t >= s.t) ripples.current.push({ x: s.x, z: s.z, t: 0, power: 2 });
    lastT.current = t;
    if (time - lastDrop.current > 1.4) {
      lastDrop.current = time;
      ripples.current.push({
        x: (Math.random() - 0.5) * cols * SPACING * 0.8,
        z: (Math.random() - 0.5) * rows * SPACING * 0.8,
        t: 0,
        power: 1,
      });
    }
    ripples.current = ripples.current.filter((r) => (r.t += delta) < 4);

    // Rise from a flat floor in the first seconds, and calm down under the floating objects.
    const amp = smooth(t / 1.6) * (1 - 0.45 * windowed(t, BEATS.shaders[0], BEATS.gallery[1], 0.8));

    for (let i = 0; i < count; i++) {
      const x = cells.xs[i];
      const z = cells.zs[i];
      let h =
        Math.sin(x * 0.55 + time * 0.9) * 0.35 +
        Math.cos(z * 0.7 - time * 0.7) * 0.3 +
        Math.sin((x + z) * 0.35 + time * 0.5) * 0.25;
      for (const r of ripples.current) {
        const d = Math.sqrt((x - r.x) * (x - r.x) + (z - r.z) * (z - r.z));
        const band = d - r.t * 3.4;
        h += Math.exp(-band * band * 2.2) * Math.max(0, 1 - r.t / 4) * 1.1 * r.power * Math.cos(band * 3);
      }
      h *= amp;
      const height = 0.25 + Math.max(0.05, h + 0.9 * amp + 0.35);
      dummy.position.set(x, height / 2 - 1, z);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, paint((h + 0.9) / 2.6, color));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[SPACING * 0.82, 1, SPACING * 0.82]} />
      <meshStandardMaterial roughness={0.25} metalness={0.6} />
    </instancedMesh>
  );
}

/** Scales a group in and out over a beat, with a little overshoot on the way in. */
function useBeatScale(ref: React.RefObject<THREE.Object3D | null>, a: number, b: number, fade = 0.45) {
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = timeline.t;
    const enter = range(t, a, a + fade);
    const pop = enter < 1 ? 1 - Math.pow(1 - enter, 3) * Math.cos(enter * 7) : 1;
    const s = Math.max(0, pop) * (1 - smooth((t - (b - fade)) / fade));
    g.scale.setScalar(Math.max(s, 0.0001));
    g.visible = s > 0.002;
  });
}

/* ------------------------------------------------------------------ */
/* Beat: Shaders                                                       */
/* ------------------------------------------------------------------ */

const blobVertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vD;
  float wave(vec3 p) {
    return sin(p.x * 2.1 + uTime * 1.3) * sin(p.y * 2.3 + uTime * 1.1) * sin(p.z * 1.9 + uTime * 0.9);
  }
  void main() {
    float d = wave(normal * 1.6 + position * 0.7) * 0.32 + sin(position.y * 4.0 + uTime * 2.4) * 0.05;
    vD = d;
    vec4 mv = modelViewMatrix * vec4(position + normal * d, 1.0);
    vView = -mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const blobFragment = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vD;
  void main() {
    vec3 violet = vec3(0.43, 0.36, 0.99);
    vec3 cyan = vec3(0.13, 0.83, 0.93);
    vec3 pink = vec3(0.96, 0.45, 0.71);
    vec3 c = mix(violet, cyan, smoothstep(-0.25, 0.2, vD));
    c = mix(c, pink, smoothstep(0.12, 0.34, vD));
    float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.4);
    gl_FragColor = vec4(c * 0.72 + rim * vec3(1.0, 0.85, 1.0) * 0.85, 1.0);
  }
`;

function ShaderBlob() {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useBeatScale(group, BEATS.shaders[0], BEATS.shaders[1] + 0.1);
  useFrame((state, delta) => {
    if (mesh.current) {
      (mesh.current.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.elapsedTime;
      mesh.current.rotation.y += delta * 0.4;
      mesh.current.rotation.x += delta * 0.15;
    }
  });
  return (
    <group ref={group} position={[0, STAGE_Y, 0]}>
      <mesh ref={mesh}>
        <icosahedronGeometry args={[1.35, 64]} />
        <shaderMaterial vertexShader={blobVertex} fragmentShader={blobFragment} uniforms={uniforms} toneMapped={false} />
      </mesh>
      <mesh rotation-x={Math.PI / 2.3}>
        <torusGeometry args={[2.2, 0.012, 8, 160]} />
        <meshBasicMaterial color={[0.6, 2.4, 2.6]} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Beat: Physics — candy dropped onto a plinth, bounces are analytic   */
/* ------------------------------------------------------------------ */

const G = 22;
const RESTITUTION = 0.55;

/** Height above the floor `tau` seconds after being dropped from `h0`. Deterministic, so scrubbing works. */
function bounceY(tau: number, h0: number) {
  if (tau <= 0) return h0;
  const t0 = Math.sqrt((2 * h0) / G);
  if (tau < t0) return h0 - 0.5 * G * tau * tau;
  let left = tau - t0;
  let v = G * t0 * RESTITUTION;
  for (let k = 0; k < 10; k++) {
    const span = (2 * v) / G;
    if (left < span) return v * left - 0.5 * G * left * left;
    left -= span;
    v *= RESTITUTION;
  }
  return 0;
}

const CANDY = ["#fb7185", "#facc15", "#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fb923c"];

function Physics() {
  const group = useRef<THREE.Group>(null);
  const balls = useRef<(THREE.Mesh | null)[]>([]);
  const PLINTH = 1.1;
  const candies = useMemo(() => {
    const rnd = createRandom(7);
    return Array.from({ length: 18 }, (_, i) => {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * 1.75;
      const r = 0.2 + rnd() * 0.2;
      return {
        x: Math.cos(a) * d,
        z: Math.sin(a) * d,
        r,
        h0: 4.5 + rnd() * 3,
        delay: BEATS.physics[0] + 0.05 + i * 0.07,
        color: CANDY[i % CANDY.length],
        spin: (rnd() - 0.5) * 6,
      };
    });
  }, []);
  useBeatScale(group, BEATS.physics[0] - 0.1, BEATS.physics[1] + 0.1);
  useFrame(() => {
    const t = timeline.t;
    candies.forEach((c, i) => {
      const b = balls.current[i];
      if (!b) return;
      const y = bounceY(t - c.delay, c.h0);
      b.position.set(c.x, PLINTH + c.r + y, c.z);
      // Squash a little on contact.
      const squash = Math.max(0, 1 - y / 0.25) * 0.18;
      b.scale.set(1 + squash, 1 - squash, 1 + squash);
      b.rotation.set(t * c.spin, t * c.spin * 0.5, 0);
    });
  });
  return (
    <group ref={group} position={[0, STAGE_Y - 1.6, 0]}>
      <mesh position-y={PLINTH / 2}>
        <cylinderGeometry args={[2.4, 2.6, PLINTH, 64]} />
        <meshPhysicalMaterial color="#14121c" roughness={0.2} metalness={0.4} clearcoat={1} />
      </mesh>
      <mesh position-y={PLINTH + 0.005} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[2.3, 2.4, 96]} />
        <meshBasicMaterial color={[2.6, 0.9, 1.8]} toneMapped={false} />
      </mesh>
      {candies.map((c, i) => (
        <mesh key={i} ref={(m) => void (balls.current[i] = m)}>
          {i % 3 === 0 ? (
            <torusGeometry args={[c.r * 0.8, c.r * 0.42, 20, 40]} />
          ) : (
            <sphereGeometry args={[c.r, 32, 32]} />
          )}
          <meshPhysicalMaterial color={c.color} roughness={0.18} clearcoat={1} clearcoatRoughness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Beat: Glass                                                         */
/* ------------------------------------------------------------------ */

function Glass() {
  const group = useRef<THREE.Group>(null);
  const knot = useRef<THREE.Mesh>(null);
  const bars = useRef<THREE.Group>(null);
  useBeatScale(group, BEATS.glass[0], BEATS.glass[1] + 0.15);
  useFrame((_, delta) => {
    if (knot.current) {
      knot.current.rotation.y += delta * 0.5;
      knot.current.rotation.x += delta * 0.2;
      (knot.current.material as THREE.Material).visible = !!group.current?.visible;
    }
    if (bars.current) bars.current.rotation.z += delta * 0.6;
  });
  return (
    <group ref={group} position={[0, STAGE_Y, 0]}>
      <mesh ref={knot}>
        <torusKnotGeometry args={[1, 0.36, 260, 40]} />
        <MeshTransmissionMaterial
          samples={6}
          resolution={512}
          backside
          backsideThickness={0.4}
          thickness={1.2}
          roughness={0}
          ior={1.6}
          chromaticAberration={1}
          anisotropicBlur={0.03}
          distortion={0.15}
          distortionScale={0.4}
          temporalDistortion={0.05}
          clearcoat={1}
          envMapIntensity={1.5}
          color="#ffffff"
        />
      </mesh>
      {/* Bright bars behind the knot give it something colourful to bend. */}
      <group ref={bars} position-z={-2.2}>
        {[
          [2.8, 0.6, 2.4],
          [0.4, 2.4, 2.8],
          [2.6, 1.0, 0.4],
        ].map((c, i) => (
          <mesh key={i} rotation-z={(i * Math.PI) / 3}>
            <capsuleGeometry args={[0.12, 4.4, 8, 16]} />
            <meshBasicMaterial color={c as [number, number, number]} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Beat: Gallery — the ten sites on a turning carousel                 */
/* ------------------------------------------------------------------ */

// Wide enough that neighbouring cards (36° apart) never intersect.
const RING = 8.8;
const CARD_W = 4.8;
const CARD_H = 2.7;

function Gallery() {
  const ring = useRef<THREE.Group>(null);
  const cards = useRef<(THREE.Group | null)[]>([]);
  const urls = useMemo(() => sites.map((s) => previews[s.slug].src), []);
  const textures = useTexture(urls);
  useEffect(() => {
    textures.forEach((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.needsUpdate = true;
    });
  }, [textures]);
  // Border glow per card: the more saturated of the two brand colours, lightness capped, so pale brands
  // (e.g. an off-white) glow in colour instead of blowing out to white under bloom.
  const borders = useMemo(
    () =>
      sites.map((s) => {
        const [c, hsl] = s.colors
          .map((hex) => {
            const col = new THREE.Color(hex);
            return [col, col.getHSL({ h: 0, s: 0, l: 0 })] as const;
          })
          .reduce((a, b) => (b[1].s > a[1].s ? b : a));
        return c.setHSL(hsl.h, hsl.s, Math.min(hsl.l, 0.55)).multiplyScalar(1.6);
      }),
    [],
  );
  const step = (Math.PI * 2) / sites.length;
  const scatter = useMemo(() => {
    const rnd = createRandom(3);
    return sites.map(() => ({ x: (rnd() - 0.5) * 14, y: 6 + rnd() * 6, spin: (rnd() - 0.5) * 3 }));
  }, []);

  useFrame(() => {
    const t = timeline.t;
    const r = ring.current;
    if (!r) return;
    r.visible = t > BEATS.gallery[0] - 0.2 && t < BEATS.gallery[1] + 1;
    if (!r.visible) return;
    r.rotation.y = -galleryIndex(t, sites.length).position * step;

    cards.current.forEach((c, i) => {
      if (!c) return;
      const a = i * step;
      const enter = smooth(range(t, BEATS.gallery[0] + i * 0.035, BEATS.gallery[0] + 0.75 + i * 0.035));
      const exit = smooth(range(t, BEATS.gallery[1] - 0.5 + i * 0.03, BEATS.gallery[1] + 0.3 + i * 0.03));
      const s = scatter[i];
      const k = 1 - enter + exit;
      c.position.set(Math.sin(a) * RING + s.x * k, STAGE_Y + (enter < 1 ? -s.y : s.y) * k, Math.cos(a) * RING);
      c.rotation.set(s.spin * k, a + s.spin * k, 0);
      c.scale.setScalar(Math.max(0.0001, enter * (1 - exit)));
    });
  });

  return (
    <group ref={ring}>
      {sites.map((site, i) => (
        <group key={site.slug} ref={(g) => void (cards.current[i] = g)}>
          <mesh position-z={-0.02}>
            <planeGeometry args={[CARD_W + 0.14, CARD_H + 0.14]} />
            <meshBasicMaterial color={borders[i]} toneMapped={false} />
          </mesh>
          <mesh>
            <planeGeometry args={[CARD_W, CARD_H]} />
            <meshBasicMaterial map={textures[i]} color="#d9d9d9" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Outro — the MeshUI mark                                             */
/* ------------------------------------------------------------------ */

function Logo() {
  const group = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    // A block "M", 3 × 3 units.
    const s = new THREE.Shape();
    const pts: [number, number][] = [
      [0, 0], [0.72, 0], [0.72, 1.85], [1.5, 0.95], [2.28, 1.85], [2.28, 0],
      [3, 0], [3, 3], [2.36, 3], [1.5, 1.95], [0.64, 3], [0, 3],
    ];
    s.moveTo(...pts[0]);
    pts.slice(1).forEach((p) => s.lineTo(...p));
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.7,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.08,
      bevelSegments: 6,
    });
    g.center();
    return g;
  }, []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = timeline.t;
    const enter = range(t, BEATS.outro[0] + 0.1, BEATS.outro[0] + 1.3);
    g.visible = enter > 0;
    const e = 1 - Math.pow(1 - enter, 4);
    g.scale.setScalar(Math.max(0.0001, e * 0.52));
    g.rotation.y = (1 - e) * -Math.PI * 2 + Math.sin(state.clock.elapsedTime * 0.8) * 0.18;
    g.rotation.x = Math.sin(state.clock.elapsedTime * 0.6) * 0.06;
    g.position.y = STAGE_Y + 0.9 + (1 - e) * -3 + Math.sin(state.clock.elapsedTime * 1.2) * 0.06;
    if (halo.current) {
      halo.current.scale.setScalar(Math.max(0.0001, smooth(range(t, BEATS.outro[0] + 0.5, BEATS.outro[0] + 1.8))));
      halo.current.rotation.z = state.clock.elapsedTime * 0.3;
    }
  });

  return (
    <group>
      <group ref={group}>
        <RoundedBox args={[4.1, 4.1, 0.5]} radius={0.5} smoothness={6} position-z={-0.55}>
          <meshPhysicalMaterial color="#7c5cff" roughness={0.15} metalness={0.2} clearcoat={1} iridescence={1} iridescenceIOR={1.4} />
        </RoundedBox>
        <mesh geometry={geometry}>
          <meshPhysicalMaterial color="#0b0b12" roughness={0.12} metalness={0.8} clearcoat={1} />
        </mesh>
      </group>
      <mesh ref={halo} position={[0, STAGE_Y + 0.9, -1.4]}>
        <torusGeometry args={[1.85, 0.022, 8, 200]} />
        <meshBasicMaterial color={[0.9, 2.2, 2.8]} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

type Key = { t: number; pos: [number, number, number]; look: [number, number, number] };

const KEYS: Key[] = [
  { t: 0, pos: [0, 17, 3], look: [0, 0, 0] },
  { t: 4.0, pos: [3, 6.5, 9], look: [1, -0.5, -1] },
  { t: 4.9, pos: [0.6, 3.6, 7.6], look: [-1.8, STAGE_Y, 0] },
  { t: 7.0, pos: [-0.8, 3.4, 7.4], look: [-1.8, STAGE_Y, 0] },
  { t: 9.5, pos: [0.8, 3.2, 7.2], look: [-1.8, STAGE_Y, 0] },
  { t: 11.6, pos: [0, 3.4, 7.6], look: [-1.8, STAGE_Y, 0] },
  { t: 12.6, pos: [0, 3.1, RING + 7.6], look: [0, STAGE_Y - 0.1, RING] },
  { t: 21.6, pos: [0, 3.1, RING + 7.4], look: [0, STAGE_Y - 0.1, RING] },
  // Kept high and back: the splashes in this beat throw tall pillars that would otherwise fill the lens.
  { t: 22.6, pos: [-6.5, 4.6, 10.5], look: [0, 0, 0] },
  { t: 26.2, pos: [5.5, 4.8, 10.8], look: [0, 0.2, 0] },
  { t: 27.4, pos: [0, 3.6, 9.4], look: [0, STAGE_Y - 0.2, 0] },
  { t: 30, pos: [0, 3.5, 8.8], look: [0, STAGE_Y - 0.2, 0] },
];

function Rig() {
  const { camera, size } = useThree();
  const pos = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    const t = timeline.t;
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
    const k0 = KEYS[i];
    const k1 = KEYS[i + 1];
    const u = THREE.MathUtils.smoothstep(t, k0.t, k1.t);
    pos.lerpVectors(a.fromArray(k0.pos), b.fromArray(k1.pos), u);
    look.lerpVectors(a.fromArray(k0.look), b.fromArray(k1.look), u);

    // Portrait: keep objects centred and higher, leaving the bottom of the frame for copy.
    const portrait = size.width < size.height;
    if (portrait) {
      look.set(look.x * 0.15, look.y - 1.1, look.z);
      pos.setZ(pos.z + 4);
    }
    // A slow handheld drift keeps every shot alive.
    const tm = state.clock.elapsedTime;
    camera.position.set(pos.x + Math.sin(tm * 0.5) * 0.12, pos.y + Math.cos(tm * 0.4) * 0.08, pos.z);
    camera.lookAt(look);
  });
  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[-5, 8, 4]} intensity={2.2} />
      <pointLight position={[6, 3, 2]} intensity={60} distance={18} color="#22d3ee" />
      <pointLight position={[-6, 2, -4]} intensity={60} distance={18} color="#f472b6" />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={5} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 1.2, 1]} />
        <Lightformer form="rect" intensity={4} color="#22d3ee" position={[-6, 1, 1]} rotation-y={Math.PI / 2} scale={[1, 10, 1]} />
        <Lightformer form="rect" intensity={4} color="#f472b6" position={[6, 1, -1]} rotation-y={-Math.PI / 2} scale={[1.2, 10, 1]} />
        <Lightformer form="rect" intensity={3} color="#8b5cf6" position={[0, 1, 6]} scale={[12, 0.8, 1]} />
        <Lightformer form="ring" intensity={6} position={[2, 4, 5]} scale={1.4} />
      </Environment>
    </>
  );
}

export default function AdScene() {
  const small = typeof window !== "undefined" && window.innerWidth < 768;
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 17, 3], fov: 42, near: 0.1, far: 80 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#07070a"]} />
      <fog attach="fog" args={["#07070a", 11, 28]} />
      <Lights />
      <Field cols={small ? 34 : 60} rows={small ? 30 : 36} />
      <ShaderBlob />
      <Physics />
      <Glass />
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
      <Logo />
      <Rig />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.72} luminanceSmoothing={0.25} />
        <Vignette offset={0.3} darkness={0.8} />
      </EffectComposer>
    </Canvas>
  );
}
