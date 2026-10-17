"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* ------------------------------------------------------------------ */
/* Car catalogue (shared by the hero game and the garage turntable)    */
/* ------------------------------------------------------------------ */

export type BodyStyle = {
  /** Roof height of the glass canopy. */
  roof: number;
  /** Height of the nose tip. */
  nose: number;
  /** Height of the rear deck / tail. */
  deck: number;
  wing: "duck" | "wing" | "twin";
};

export type CarSpec = {
  id: string;
  name: string;
  class: string;
  /** Body paint. */
  paint: string;
  /** Neon accent: trims, rims and underglow. */
  accent: string;
  /** Tail light colour. */
  tail: string;
  from: string;
  to: string;
  stats: Record<"Speed" | "Handling" | "Boost", number>;
  body: BodyStyle;
};

export const CAR_SPECS: CarSpec[] = [
  {
    id: "vapor",
    name: "Vapor GT",
    class: "S-Class · Starter",
    paint: "#e0177f",
    accent: "#18e7ff",
    tail: "#ff2050",
    from: "#ff2a9d",
    to: "#7b2cbf",
    stats: { Speed: 72, Handling: 88, Boost: 64 },
    body: { roof: 1.1, nose: 0.4, deck: 0.74, wing: "duck" },
  },
  {
    id: "interceptor",
    name: "Magenta Interceptor",
    class: "X-Class · Pursuit",
    paint: "#ff7a1a",
    accent: "#ff2a9d",
    tail: "#ff1a3c",
    from: "#ffb347",
    to: "#ff2a6d",
    stats: { Speed: 91, Handling: 66, Boost: 80 },
    body: { roof: 1.04, nose: 0.36, deck: 0.78, wing: "wing" },
  },
  {
    id: "midnight",
    name: "Midnight RS",
    class: "Z-Class · Legendary",
    paint: "#1a1f6b",
    accent: "#18e7ff",
    tail: "#ff2a9d",
    from: "#18e7ff",
    to: "#3b1d8f",
    stats: { Speed: 98, Handling: 79, Boost: 97 },
    body: { roof: 0.98, nose: 0.33, deck: 0.72, wing: "twin" },
  },
];

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

const L = 2.15; // half length
const BODY_W = 1.62; // extrusion depth (before bevel)
export const WHEEL_R = 0.36;
const WHEEL_X = 0.86;
const WHEEL_Z = { rear: 1.3, front: -1.35 };

/**
 * Extrude a side profile drawn in (length, height) space and turn it so the
 * profile's +x (the nose) faces -z, the direction of travel.
 */
function extrudeProfile(
  shape: THREE.Shape,
  depth: number,
  bevel: number,
  bevelSegments = 4,
  /** Pinch the width with height (tumblehome) and toward the nose. */
  taper?: { from: number; top: number; nose: number },
) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel * 1.3,
    bevelSize: bevel,
    bevelSegments,
    curveSegments: 18,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  if (taper) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const k = 1 - Math.max(0, y - taper.from) * taper.top - Math.max(0, -z - 1.1) * taper.nose;
      pos.setX(i, pos.getX(i) * k);
    }
  }
  const creased = toCreasedNormals(g, Math.PI / 4);
  g.dispose();
  return creased;
}

function bodyShape(b: BodyStyle) {
  const s = new THREE.Shape();
  const archR = 0.5;
  s.moveTo(-L, 0.32);
  s.lineTo(-L + 0.08, 0.22);
  s.lineTo(-WHEEL_Z.rear - archR, 0.22);
  s.absarc(-WHEEL_Z.rear, 0.32, archR, Math.PI, 0, true);
  s.lineTo(-WHEEL_Z.front - archR, 0.22);
  s.absarc(-WHEEL_Z.front, 0.32, archR, Math.PI, 0, true);
  s.lineTo(L - 0.12, 0.2);
  // Wedge nose, low splitter, then a long hood rising to the windscreen.
  s.quadraticCurveTo(L + 0.16, 0.22, L + 0.12, b.nose);
  s.quadraticCurveTo(L - 0.05, b.nose + 0.12, 1.55, b.nose + 0.17);
  s.quadraticCurveTo(1.05, b.nose + 0.24, 0.72, 0.7);
  s.lineTo(-1.45, 0.74);
  s.quadraticCurveTo(-1.95, b.deck + 0.04, -L - 0.03, b.deck);
  s.lineTo(-L, 0.32);
  return s;
}

function canopyShape(b: BodyStyle) {
  const s = new THREE.Shape();
  s.moveTo(0.9, 0.64);
  s.quadraticCurveTo(0.42, b.roof - 0.06, -0.05, b.roof);
  s.lineTo(-0.5, b.roof);
  s.quadraticCurveTo(-1.15, b.roof - 0.06, -1.78, 0.72);
  s.lineTo(-1.5, 0.6);
  s.lineTo(0.9, 0.6);
  return s;
}

function wingShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.3, 0);
  s.quadraticCurveTo(0, 0.02, 0.26, 0.05);
  s.quadraticCurveTo(0.3, 0.09, 0.2, 0.1);
  s.quadraticCurveTo(-0.05, 0.1, -0.3, 0.06);
  s.lineTo(-0.3, 0);
  return s;
}

type CarGeometry = { body: THREE.BufferGeometry; canopy: THREE.BufferGeometry; wing: THREE.BufferGeometry };
const geometryCache = new Map<string, CarGeometry>();

export function getCarGeometry(b: BodyStyle): CarGeometry {
  const key = `${b.roof}|${b.nose}|${b.deck}`;
  let g = geometryCache.get(key);
  if (!g) {
    g = {
      body: extrudeProfile(bodyShape(b), BODY_W, 0.075, 4, { from: 0.42, top: 0.38, nose: 0.12 }),
      canopy: extrudeProfile(canopyShape(b), 1.3, 0.11, 5, { from: 0.6, top: 0.9, nose: 0.25 }),
      wing: extrudeProfile(wingShape(), 1.86, 0.015, 2),
    };
    geometryCache.set(key, g);
  }
  return g;
}

/** Wheel parts, shared by every car on screen. */
const wheelParts = (() => {
  const tire = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 28, 1);
  tire.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.25, 0.25, 0.31, 24, 1);
  rim.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.06, 0.06, 0.33, 10, 1);
  hub.rotateZ(Math.PI / 2);
  const spoke = new THREE.BoxGeometry(0.04, 0.44, 0.07);
  const ring = new THREE.TorusGeometry(0.27, 0.014, 6, 36);
  ring.rotateY(Math.PI / 2);
  return { tire, rim, hub, spoke, ring };
})();

/* ------------------------------------------------------------------ */
/* Underglow                                                           */
/* ------------------------------------------------------------------ */

const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const glowFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * vec2(1.0, 0.55) * 2.0;
    float d = length(p);
    float a = smoothstep(1.0, 0.0, d);
    a = a * a * a * uStrength * 0.55;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/* ------------------------------------------------------------------ */
/* Car component                                                       */
/* ------------------------------------------------------------------ */

/** Live inputs the car animates from (written by the game/turntable each frame). */
export type CarMotion = {
  /** Road speed in units / second, spins the wheels. */
  speed: number;
  /** -1 … 1, turns the front wheels. */
  steer: number;
  /** 0 … 1, exhaust flames and brighter lights. */
  boost: number;
  /** 0 … 1, flash the tail lights. */
  brake: number;
};

type SportsCarProps = Omit<ThreeElements["group"], "ref"> & {
  spec: CarSpec;
  motion?: RefObject<CarMotion>;
  /** Cheaper version for traffic: no spokes, flames or underglow. */
  lowDetail?: boolean;
  /** Override paint for traffic cars. */
  paint?: string;
  tail?: string;
  /** Smoothly blend paint/accent changes (garage swaps). */
  blendColors?: boolean;
};

const tmpColor = new THREE.Color();

function hdr(hex: string, k: number) {
  return new THREE.Color(hex).multiplyScalar(k);
}

export function SportsCar({
  spec,
  motion,
  lowDetail = false,
  paint,
  tail,
  blendColors = false,
  ...group
}: SportsCarProps) {
  const geo = getCarGeometry(spec.body);
  const wheels = useRef<(THREE.Group | null)[]>([]);
  const spinners = useRef<(THREE.Group | null)[]>([]);
  const paintMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const root = useRef<THREE.Group>(null);
  const accentMats = useRef<THREE.MeshBasicMaterial[]>([]);
  const tailMat = useRef<THREE.MeshBasicMaterial>(null);
  const glowMat = useRef<THREE.ShaderMaterial>(null);
  const flames = useRef<THREE.Group>(null);
  const glowUniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(spec.accent) }, uStrength: { value: 1 } }),
    // Colour changes are blended in useFrame, so the uniforms object is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Collect the neon accent materials (tagged via userData) so they can be recoloured.
  useEffect(() => {
    const list: THREE.MeshBasicMaterial[] = [];
    root.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (m && !Array.isArray(m) && m.userData.accent) list.push(m);
    });
    accentMats.current = list;
  });

  const paintHex = paint ?? spec.paint;
  const tailHex = tail ?? spec.tail;
  const accent = useMemo(() => hdr(spec.accent, 2.6), [spec.accent]);
  const tailColor = useMemo(() => hdr(tailHex, 3.2), [tailHex]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const m = motion?.current;
    if (m) {
      const spin = (m.speed * dt) / WHEEL_R;
      for (const s of spinners.current) if (s) s.rotation.x -= spin;
      for (let i = 0; i < 2; i++) {
        const w = wheels.current[i + 2];
        if (w) w.rotation.y = THREE.MathUtils.damp(w.rotation.y, -m.steer * 0.32, 10, dt);
      }
      if (tailMat.current) {
        const k = 2.6 + m.brake * 3 + m.boost * 1.5;
        tailMat.current.color.set(tailHex).multiplyScalar(k);
      }
      if (flames.current) {
        const flicker = 0.75 + Math.sin(state.clock.elapsedTime * 63) * 0.25;
        flames.current.visible = m.boost > 0.04;
        flames.current.scale.set(1, 1, Math.max(0.001, m.boost * flicker));
      }
      if (glowMat.current) glowMat.current.uniforms.uStrength.value = 0.9 + m.boost * 0.6;
    }
    if (blendColors) {
      const k = 1 - Math.exp(-dt * 5);
      if (paintMat.current) paintMat.current.color.lerp(tmpColor.set(spec.paint), k);
      tmpColor.set(spec.accent).multiplyScalar(2.6);
      for (const a of accentMats.current) a.color.lerp(tmpColor, k);
      glowMat.current?.uniforms.uColor.value.lerp(tmpColor.set(spec.accent), k);
    }
  });

  const wheelDefs: [number, number][] = [
    [-WHEEL_X, WHEEL_Z.rear],
    [WHEEL_X, WHEEL_Z.rear],
    [-WHEEL_X, WHEEL_Z.front],
    [WHEEL_X, WHEEL_Z.front],
  ];
  const accentData = { accent: true };

  return (
    <group ref={root} {...group}>
      {/* Body shell */}
      <mesh geometry={geo.body}>
        <meshPhysicalMaterial
          ref={paintMat}
          color={paintHex}
          metalness={0.55}
          roughness={0.24}
          clearcoat={1}
          clearcoatRoughness={0.06}
          envMapIntensity={1.4}
        />
      </mesh>
      {/* Glass canopy */}
      <mesh geometry={geo.canopy}>
        <meshPhysicalMaterial color="#07040f" metalness={1} roughness={0.08} clearcoat={1} envMapIntensity={1.1} />
      </mesh>
      {/* Tail: recessed black panel + full-width light bar */}
      <mesh position={[0, spec.body.deck - 0.16, L + 0.07]}>
        <boxGeometry args={[1.66, 0.2, 0.04]} />
        <meshStandardMaterial color="#030106" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, spec.body.deck - 0.14, L + 0.1]}>
        <boxGeometry args={[1.58, 0.065, 0.03]} />
        <meshBasicMaterial ref={tailMat} color={tailColor} toneMapped={false} />
      </mesh>
      {!lowDetail && (
        <>
          {[-1, 1].map((s) => (
            <mesh key={`tc${s}`} position={[s * 0.72, spec.body.deck - 0.2, L + 0.1]}>
              <boxGeometry args={[0.16, 0.1, 0.03]} />
              <meshBasicMaterial color={tailColor} toneMapped={false} />
            </mesh>
          ))}
          {/* Diffuser with fins and twin exhausts */}
          <mesh position={[0, 0.27, L - 0.02]}>
            <boxGeometry args={[1.4, 0.12, 0.2]} />
            <meshStandardMaterial color="#050208" metalness={0.6} roughness={0.4} />
          </mesh>
          {[-0.25, 0, 0.25].map((x) => (
            <mesh key={`fin${x}`} position={[x, 0.24, L + 0.09]}>
              <boxGeometry args={[0.025, 0.12, 0.06]} />
              <meshStandardMaterial color="#1a0f24" metalness={0.8} roughness={0.3} />
            </mesh>
          ))}
          {[-0.5, 0.5].map((x) => (
            <mesh key={`ex${x}`} position={[x, 0.3, L + 0.06]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.07, 0.022, 8, 20]} />
              <meshStandardMaterial color="#d8d0e8" metalness={1} roughness={0.2} />
            </mesh>
          ))}
          {/* Front light blade */}
          <mesh position={[0, spec.body.nose - 0.02, -L - 0.17]}>
            <boxGeometry args={[1.5, 0.035, 0.03]} />
            <meshBasicMaterial userData={accentData} color={accent} toneMapped={false} />
          </mesh>
        </>
      )}
      {/* Side neon strips between the arches */}
      {[-1, 1].map((s) => (
        <mesh key={`ss${s}`} position={[s * 0.93, 0.27, 0]}>
          <boxGeometry args={[0.02, 0.035, 1.55]} />
          <meshBasicMaterial userData={accentData} color={accent} toneMapped={false} />
        </mesh>
      ))}
      {/* Mirrors */}
      {!lowDetail &&
        [-1, 1].map((s) => (
          <mesh key={`mi${s}`} position={[s * 0.82, 0.8, -0.35]}>
            <boxGeometry args={[0.16, 0.07, 0.12]} />
            <meshPhysicalMaterial color={paintHex} metalness={0.6} roughness={0.25} clearcoat={1} />
          </mesh>
        ))}
      {/* Spoilers */}
      {spec.body.wing === "duck" ? (
        <mesh position={[0, spec.body.deck + 0.02, L - 0.12]} rotation={[0, 0, 0]} scale={[1, 1.2, 0.9]}>
          <boxGeometry args={[1.6, 0.06, 0.24]} />
          <meshStandardMaterial color="#09030f" metalness={0.7} roughness={0.25} />
        </mesh>
      ) : (
        <group position={[0, spec.body.wing === "twin" ? 1.0 : 1.08, 1.82]}>
          <mesh geometry={geo.wing} rotation={[0.08, 0, 0]}>
            <meshStandardMaterial color="#09030f" metalness={0.7} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.115, 0.02]}>
            <boxGeometry args={[1.84, 0.012, 0.05]} />
            <meshBasicMaterial userData={accentData} color={accent} toneMapped={false} />
          </mesh>
          {[-0.62, 0.62].map((x) => (
            <mesh key={x} position={[x, -0.18, 0.05]}>
              <boxGeometry args={[0.05, 0.36, 0.18]} />
              <meshStandardMaterial color="#09030f" metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
          {spec.body.wing === "twin" &&
            [-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.97, 0.02, 0]}>
                <boxGeometry args={[0.03, 0.22, 0.6]} />
                <meshStandardMaterial color="#09030f" metalness={0.7} roughness={0.3} />
              </mesh>
            ))}
        </group>
      )}
      {/* Wheels */}
      {wheelDefs.map(([x, z], i) => (
        <group
          key={i}
          position={[x, WHEEL_R, z]}
          ref={(g) => {
            wheels.current[i] = g;
          }}
        >
          <group
            ref={(g) => {
              spinners.current[i] = g;
            }}
          >
            <mesh geometry={wheelParts.tire}>
              <meshStandardMaterial color="#08060c" roughness={0.75} metalness={0.1} />
            </mesh>
            {!lowDetail && (
              <mesh geometry={wheelParts.rim} scale={[1.01, 1, 1]}>
                <meshStandardMaterial color="#c8c0d8" metalness={1} roughness={0.22} />
              </mesh>
            )}
            {!lowDetail &&
              [0, 1, 2, 3, 4].map((k) => (
                <mesh
                  key={k}
                  geometry={wheelParts.spoke}
                  position={[x < 0 ? -0.162 : 0.162, 0, 0]}
                  rotation={[(k / 5) * Math.PI, 0, 0]}
                >
                  <meshStandardMaterial color="#18101f" metalness={0.9} roughness={0.3} />
                </mesh>
              ))}
            {!lowDetail && (
              <mesh geometry={wheelParts.hub}>
                <meshStandardMaterial color="#2a1840" metalness={1} roughness={0.2} />
              </mesh>
            )}
            <mesh geometry={wheelParts.ring} position={[x < 0 ? -0.16 : 0.16, 0, 0]}>
              <meshBasicMaterial userData={accentData} color={accent} toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}
      {/* Underglow pool on the road */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <planeGeometry args={[lowDetail ? 2.6 : 3.6, lowDetail ? 4.8 : 6.2]} />
        <shaderMaterial
          ref={glowMat}
          vertexShader={glowVertex}
          fragmentShader={glowFragment}
          uniforms={glowUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      {/* Exhaust flames (boost only) */}
      {!lowDetail && (
        <group ref={flames} position={[0, 0.3, L + 0.08]} visible={false}>
          {[-0.42, 0.42].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh position={[0, 0, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.1, 0.85, 12, 1, true]} />
                <meshBasicMaterial color={[3.6, 1.3, 0.35]} toneMapped={false} transparent opacity={0.9} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[0, 0, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.055, 0.5, 10, 1, true]} />
                <meshBasicMaterial color={[1.2, 2.6, 4]} toneMapped={false} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </group>
  );
}

/**
 * Local, procedural reflection environment: neon light strips rendered into a
 * cube map once. No HDR files, no network.
 */
export function NeonEnvironment({ resolution = 128 }: { resolution?: number }) {
  return (
    <Environment resolution={resolution} frames={1}>
      <color attach="background" args={["#0d0118"]} />
      <Lightformer form="rect" intensity={1.6} color="#ff2a9d" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[14, 1.2, 1]} />
      <Lightformer form="rect" intensity={1.6} color="#7b2cbf" position={[0, 6, 4]} rotation-x={Math.PI / 2} scale={[14, 0.6, 1]} />
      <Lightformer form="rect" intensity={2.6} color="#18e7ff" position={[-7, 1.5, 0]} rotation-y={Math.PI / 2} scale={[16, 0.5, 1]} />
      <Lightformer form="rect" intensity={2.6} color="#18e7ff" position={[7, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[16, 0.5, 1]} />
      <Lightformer form="circle" intensity={2.2} color="#ff9a3c" position={[0, 3, -12]} scale={5} />
      <Lightformer form="rect" intensity={1.2} color="#ff2a9d" position={[0, -1, 8]} rotation-y={Math.PI} scale={[16, 2, 1]} />
    </Environment>
  );
}
