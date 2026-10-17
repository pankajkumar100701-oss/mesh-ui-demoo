"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";

export const PEARL = "#f3eee6";

export type ShapeId = "knot" | "gem" | "helix" | "halo";

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Pointer position over the whole window, normalised to -1..1. */
export function useWindowPointer() {
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return pointer;
}

/* ------------------------------------------------------------------ */
/* Studio light — only light-formers, nothing is downloaded            */
/* ------------------------------------------------------------------ */

export function Studio({ warm = 1 }: { warm?: number }) {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={["#14110f"]} />
      {/* Long softbox strips: these become the crisp white lines on every facet. */}
      <Lightformer form="rect" intensity={6} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 1.2, 1]} />
      <Lightformer form="rect" intensity={4} position={[-6, 1, 1]} rotation-y={Math.PI / 2} scale={[1, 10, 1]} />
      <Lightformer form="rect" intensity={4} position={[6, 1, -1]} rotation-y={-Math.PI / 2} scale={[1.2, 10, 1]} />
      <Lightformer form="rect" intensity={2.5} position={[0, 1, 6]} scale={[12, 0.6, 1]} />
      {/* Coloured gels give the glass something to split. */}
      <Lightformer form="rect" intensity={3 * warm} color="#ffb36b" position={[-4, -1, -5]} rotation-y={0.6} scale={[3, 6, 1]} />
      <Lightformer form="rect" intensity={3} color="#9d8cff" position={[4, -1, -5]} rotation-y={-0.6} scale={[3, 6, 1]} />
      <Lightformer form="ring" intensity={8} position={[2, 4, 5]} scale={1.4} />
      <Lightformer form="circle" intensity={3} color="#7ee8d8" position={[-3, -4, 3]} scale={2} />
    </Environment>
  );
}

/* ------------------------------------------------------------------ */
/* Geometry — every form is built in code                               */
/* ------------------------------------------------------------------ */

/** Turns a smooth geometry into hard, flat facets (each triangle its own normal). */
function facet(g: THREE.BufferGeometry) {
  const flat = g.index ? g.toNonIndexed() : g;
  if (flat !== g) g.dispose();
  flat.computeVertexNormals();
  return flat;
}

/** Point on a (p, q) torus knot — same formula three.js uses for TorusKnotGeometry. */
class KnotCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private radius = 0.9, private p = 2, private q = 3) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const u = t * this.p * Math.PI * 2;
    const cs = Math.cos((this.q / this.p) * u);
    const r = this.radius;
    return target.set(r * (2 + cs) * 0.5 * Math.cos(u), r * (2 + cs) * 0.5 * Math.sin(u), r * Math.sin((this.q / this.p) * u) * 0.5);
  }
}

/**
 * A trefoil whose tube is an equilateral triangle that slowly twists along
 * its length. Each of the three faces gets its own vertices, so the ridges
 * stay razor sharp while the faces stay perfectly smooth along the curve.
 */
export function prismKnot(segments = 420, thickness = 0.27, twists = 4) {
  const curve = new KnotCurve(0.9);
  const frames = curve.computeFrenetFrames(segments, true);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const P = new THREE.Vector3();
  const corner = (i: number, a: number, out: THREE.Vector3) => {
    const N = frames.normals[i % segments];
    const B = frames.binormals[i % segments];
    curve.getPointAt((i % segments) / segments, P);
    return out.copy(P).addScaledVector(N, Math.cos(a) * thickness).addScaledVector(B, Math.sin(a) * thickness);
  };
  const a = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let face = 0; face < 3; face++) {
    const base = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      // Twist by whole thirds of a turn so the ends meet seamlessly.
      const tw = (i / segments) * twists * ((Math.PI * 2) / 3);
      const a0 = tw + (face * Math.PI * 2) / 3;
      const a1 = a0 + (Math.PI * 2) / 3;
      const mid = a0 + Math.PI / 3;
      corner(i, a0, a);
      positions.push(a.x, a.y, a.z);
      corner(i, a1, a);
      positions.push(a.x, a.y, a.z);
      const N = frames.normals[i % segments];
      const B = frames.binormals[i % segments];
      n.copy(N).multiplyScalar(Math.cos(mid)).addScaledVector(B, Math.sin(mid)).normalize();
      normals.push(n.x, n.y, n.z, n.x, n.y, n.z);
    }
    for (let i = 0; i < segments; i++) {
      const v0 = base + i * 2;
      const v1 = v0 + 1;
      const v2 = v0 + 2;
      const v3 = v0 + 3;
      indices.push(v0, v1, v2, v1, v3, v2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(indices);
  return g;
}

/** Round brilliant: pavilion, girdle, crown and table. */
export function brilliant(sides = 16) {
  const pts = [
    new THREE.Vector2(0.0001, -0.95),
    new THREE.Vector2(1.18, -0.08),
    new THREE.Vector2(1.18, 0.04),
    new THREE.Vector2(0.92, 0.34),
    new THREE.Vector2(0.62, 0.5),
    new THREE.Vector2(0.0001, 0.5),
  ];
  const g = new THREE.LatheGeometry(pts, sides);
  g.translate(0, 0.12, 0);
  return facet(g);
}

/**
 * Triangular column twisted along its height. Like the knot, each face owns
 * its vertices so the three ridges stay sharp while the faces stay smooth.
 */
export function twistedPrism(height = 2.3, radius = 0.62, turn = 4.7, rings = 160) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const third = (Math.PI * 2) / 3;
  for (let face = 0; face < 3; face++) {
    const base = positions.length / 3;
    for (let i = 0; i <= rings; i++) {
      const v = i / rings;
      const y = (v - 0.5) * height;
      const tw = (v - 0.5) * turn;
      const a0 = tw + face * third;
      const a1 = a0 + third;
      const mid = a0 + third / 2;
      positions.push(Math.cos(a0) * radius, y, Math.sin(a0) * radius);
      positions.push(Math.cos(a1) * radius, y, Math.sin(a1) * radius);
      normals.push(Math.cos(mid), 0, Math.sin(mid), Math.cos(mid), 0, Math.sin(mid));
    }
    for (let i = 0; i < rings; i++) {
      const v0 = base + i * 2;
      indices.push(v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3);
    }
  }
  // Polished end caps
  for (const end of [-1, 1]) {
    const base = positions.length / 3;
    const tw = end * 0.5 * turn;
    for (let k = 0; k < 3; k++) {
      const a = tw + k * third;
      positions.push(Math.cos(a) * radius, (end * height) / 2, Math.sin(a) * radius);
      normals.push(0, end, 0);
    }
    if (end > 0) indices.push(base, base + 2, base + 1);
    else indices.push(base, base + 1, base + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(indices);
  return g;
}

/** A ring with a hexagonal section, like a ground lens edge. */
export function facetHalo() {
  const g = new THREE.TorusGeometry(0.92, 0.32, 6, 96);
  return facet(g);
}

export function makeGeometry(shape: ShapeId) {
  switch (shape) {
    case "knot":
      return prismKnot();
    case "gem":
      return brilliant();
    case "helix":
      return twistedPrism();
    case "halo":
      return facetHalo();
  }
}

/** A small quartz point used for the floating shards. */
export function quartzShard() {
  const pts = [
    new THREE.Vector2(0.0001, -0.62),
    new THREE.Vector2(0.16, -0.36),
    new THREE.Vector2(0.16, 0.3),
    new THREE.Vector2(0.0001, 0.62),
  ];
  return facet(new THREE.LatheGeometry(pts, 6));
}

/* ------------------------------------------------------------------ */
/* Light: the beam, the spectrum fan and floor caustics                */
/* ------------------------------------------------------------------ */

const SPECTRUM_GLSL = /* glsl */ `
  vec3 spectrum(float x) {
    // red -> orange -> yellow -> green -> cyan -> blue -> violet
    vec3 c = vec3(0.0);
    c += vec3(0.96, 0.18, 0.30) * smoothstep(0.24, 0.0, abs(x - 0.02));
    c += vec3(1.00, 0.52, 0.16) * smoothstep(0.20, 0.0, abs(x - 0.18));
    c += vec3(1.00, 0.86, 0.22) * smoothstep(0.20, 0.0, abs(x - 0.34));
    c += vec3(0.26, 0.86, 0.48) * smoothstep(0.20, 0.0, abs(x - 0.50));
    c += vec3(0.16, 0.78, 0.92) * smoothstep(0.20, 0.0, abs(x - 0.66));
    c += vec3(0.30, 0.42, 1.00) * smoothstep(0.20, 0.0, abs(x - 0.82));
    c += vec3(0.62, 0.30, 0.98) * smoothstep(0.24, 0.0, abs(x - 0.98));
    return c;
  }
`;

/**
 * The dispersed fan of colour leaving the glass. Built from a strip whose
 * vertices are bent into a wedge in the vertex shader.
 */
export function SpectrumFan({
  angle = -0.32,
  spread = 0.42,
  length = 9,
  intensity = 1,
  strength,
  sway,
  reveal,
}: {
  /** Optional 0..1 draw-on along the fan's length. */
  reveal?: React.RefObject<number>;
  angle?: number;
  /** Optional live angle offset (radians) read every frame. */
  sway?: React.RefObject<number>;
  spread?: number;
  length?: number;
  intensity?: number;
  /** Optional live multiplier (0..1) read every frame. */
  strength?: React.RefObject<number>;
}) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAngle: { value: angle },
      uSpread: { value: spread },
      uLength: { value: length },
      uIntensity: { value: intensity },
      uReveal: { value: 1 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useFrame((_, dt) => {
    const m = mat.current;
    if (!m) return;
    m.uniforms.uTime.value += dt;
    const k = 1 - Math.exp(-5 * dt);
    const goal = angle + (sway ? sway.current : 0);
    m.uniforms.uAngle.value += (goal - m.uniforms.uAngle.value) * k;
    m.uniforms.uSpread.value += (spread - m.uniforms.uSpread.value) * k;
    const target = intensity * (strength ? strength.current : 1);
    m.uniforms.uIntensity.value += (target - m.uniforms.uIntensity.value) * k;
    m.uniforms.uReveal.value = reveal ? reveal.current : 1;
  });
  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[1, 1, 48, 64]} />
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          uniform float uAngle, uSpread, uLength;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            float r = uv.x * uLength;
            float a = uAngle + (uv.y - 0.5) * uSpread * smoothstep(0.0, 0.35, uv.x + 0.05);
            vec3 p = vec3(cos(a) * r, sin(a) * r, 0.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform float uTime, uIntensity, uReveal;
          varying vec2 vUv;
          ${SPECTRUM_GLSL}
          void main() {
            float drawn = smoothstep(uReveal * 1.1, uReveal * 1.1 - 0.1, vUv.x);
            float along = smoothstep(0.0, 0.06, vUv.x) * pow(1.0 - vUv.x, 1.25);
            float edge = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
            float shimmer = 0.88 + 0.12 * sin(vUv.x * 40.0 - uTime * 1.6 + vUv.y * 6.0);
            vec3 col = spectrum(1.0 - vUv.y);
            float a = along * edge * shimmer * uIntensity * drawn * 0.78;
            gl_FragColor = vec4(col, a);
          }
        `}
      />
    </mesh>
  );
}

/** A narrow shaft of daylight running from `from` to the origin. */
export function LightBeam({
  from = [-9, 3.2, 0] as [number, number, number],
  width = 0.16,
  strength,
  reveal,
}: {
  from?: [number, number, number];
  width?: number;
  strength?: React.RefObject<number>;
  /** Optional 0..1: how far the beam has travelled from its source. */
  reveal?: React.RefObject<number>;
}) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const len = Math.hypot(from[0], from[1], from[2]);
  const rot = Math.atan2(-from[1], -from[0]);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uIntensity: { value: 1 }, uReveal: { value: 1 } }),
    [],
  );
  useFrame((_, dt) => {
    const m = mat.current;
    if (!m) return;
    m.uniforms.uTime.value += dt;
    const target = strength ? strength.current : 1;
    m.uniforms.uIntensity.value += (target - m.uniforms.uIntensity.value) * (1 - Math.exp(-5 * dt));
    m.uniforms.uReveal.value = reveal ? reveal.current : 1;
  });
  return (
    <group position={from} rotation-z={rot}>
      <mesh position={[len / 2, 0, 0]} frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[len, width * 6, 1, 1]} />
        <shaderMaterial
          ref={mat}
          transparent
          depthWrite={false}
          toneMapped={false}
          uniforms={uniforms}
          vertexShader={/* glsl */ `
            varying vec2 vUv;
            void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
          `}
          fragmentShader={/* glsl */ `
            uniform float uTime, uIntensity, uReveal;
            varying vec2 vUv;
            void main() {
              float head = uReveal * 1.05;
              float drawn = smoothstep(head, head - 0.04, vUv.x) * (1.0 + 2.5 * exp(-pow((vUv.x - head) * 30.0, 2.0)) * step(uReveal, 0.999));
              float d = abs(vUv.y - 0.5) * 2.0;
              float core = exp(-d * d * 260.0);
              float halo = exp(-d * d * 14.0) * 0.35;
              float fade = smoothstep(0.15, 0.6, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
              float flicker = 0.92 + 0.08 * sin(vUv.x * 30.0 - uTime * 3.0);
              vec3 col = mix(vec3(1.0, 0.86, 0.62), vec3(1.0), core);
              gl_FragColor = vec4(col, (core + halo) * fade * flicker * uIntensity * drawn);
            }
          `}
        />
      </mesh>
    </group>
  );
}

/** Dancing light-through-glass pattern for the plinth top, tinted with the spectrum. */
export function Caustics({ radius = 1.6, strength }: { radius?: number; strength?: React.RefObject<number> }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uIntensity: { value: 1 } }), []);
  useFrame((_, dt) => {
    const m = mat.current;
    if (!m) return;
    m.uniforms.uTime.value += dt;
    const target = strength ? strength.current : 1;
    m.uniforms.uIntensity.value += (target - m.uniforms.uIntensity.value) * (1 - Math.exp(-4 * dt));
  });
  return (
    <mesh rotation-x={-Math.PI / 2} renderOrder={-1}>
      <circleGeometry args={[radius, 64]} />
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `}
        fragmentShader={/* glsl */ `
          uniform float uTime, uIntensity;
          varying vec2 vUv;
          ${SPECTRUM_GLSL}
          float caustic(vec2 uv, float time) {
            vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
            vec2 i = p;
            float c = 1.0;
            float inten = 0.006;
            for (int n = 0; n < 4; n++) {
              float t = time * (1.0 - (3.5 / float(n + 1)));
              i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
              c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
            }
            c /= 4.0;
            c = 1.17 - pow(c, 1.4);
            return pow(abs(c), 8.0);
          }
          void main() {
            vec2 q = vUv - 0.5;
            float r = length(q) * 2.0;
            float mask = smoothstep(1.0, 0.25, r);
            float t = uTime * 0.35;
            float c = caustic(vUv * 1.3 + 0.2, t);
            float c2 = caustic(vUv * 1.3 + 0.204, t);
            vec3 col = spectrum(fract(atan(q.y, q.x) / 6.28318 + r * 0.6 + uTime * 0.03));
            vec3 tint = mix(vec3(1.0, 0.97, 0.9), col, 0.65);
            float a = clamp(c * 0.9 + c2 * 0.3, 0.0, 1.0) * mask * uIntensity;
            gl_FragColor = vec4(tint, a * 0.85);
          }
        `}
      />
    </mesh>
  );
}

/** Low drum of honed stone the piece floats above. */
export function Plinth({ radius = 1.7, height = 0.5 }: { radius?: number; height?: number }) {
  return (
    <group>
      <mesh position={[0, -height / 2, 0]}>
        <cylinderGeometry args={[radius, radius * 1.02, height, 96]} />
        <meshStandardMaterial color="#efe9df" roughness={0.55} metalness={0} />
      </mesh>
      {/* Brass inlay ring on the top face */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]}>
        <ringGeometry args={[radius * 0.93, radius * 0.94, 128]} />
        <meshStandardMaterial color="#b08d57" metalness={0.9} roughness={0.25} />
      </mesh>
    </group>
  );
}

/**
 * Photographers shape glass with black cards placed just out of frame. These
 * cards are the same idea: they are drawn only into the off-screen buffers the
 * glass refracts (any render with a render target), never to the page itself,
 * so the crystal gets crisp dark edges while the scene stays light and airy.
 */
export function GlassOnly({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    // Layer 1 keeps the cards out of contact-shadow passes (their camera sees layer 0 only).
    camera.layers.enable(1);
  }, [camera]);
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    g.traverse((o) => o.layers.set(1));
    let root: THREE.Object3D = g;
    while (root.parent) root = root.parent;
    const prev = root.onBeforeRender;
    root.onBeforeRender = (renderer, sc, cam, target, material, group) => {
      // For a Scene, the 4th argument is the active render target (null = the page).
      g.visible = (target as unknown) !== null;
      prev.call(root, renderer, sc, cam, target, material, group);
    };
    return () => {
      root.onBeforeRender = prev;
    };
  }, []);
  return <group ref={group}>{children}</group>;
}

/** A soft-edged black card (see GlassOnly). */
export function Flag({
  position,
  rotation = [0, 0, 0],
  scale,
  opacity = 1,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale: [number, number, number];
  opacity?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      <planeGeometry />
      <shaderMaterial
        transparent
        depthWrite={false}
        toneMapped={false}
        uniforms={{ uOpacity: { value: opacity } }}
        vertexShader={/* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `}
        fragmentShader={/* glsl */ `
          uniform float uOpacity;
          varying vec2 vUv;
          void main() {
            vec2 d = abs(vUv - 0.5) * 2.0;
            float a = smoothstep(1.0, 0.55, d.x) * smoothstep(1.0, 0.7, d.y);
            gl_FragColor = vec4(vec3(0.07, 0.06, 0.055), a * uOpacity);
          }
        `}
      />
    </mesh>
  );
}
