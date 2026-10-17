"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  MeshTransmissionMaterial,
  PerformanceMonitor,
  PresentationControls,
} from "@react-three/drei";
import {
  Caustics,
  Flag,
  GlassOnly,
  LightBeam,
  Plinth,
  SpectrumFan,
  Studio,
  makeGeometry,
  useReducedMotion,
  type ShapeId,
} from "./Optics";

const SIZE_SCALE = { S: 0.56, M: 0.7, L: 0.84 } as const;
export type SizeId = keyof typeof SIZE_SCALE;

const SHAPE_TILT: Record<ShapeId, number> = { knot: 0, gem: 0.32, helix: 0, halo: 0.5 };
const SHAPE_LIFT: Record<ShapeId, number> = { knot: 0.05, gem: -0.15, helix: 0.0, halo: 0.0 };

function Piece({
  shape,
  tint,
  size,
  high,
  reduced,
}: {
  shape: ShapeId;
  tint: string;
  size: SizeId;
  high: boolean;
  reduced: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const [shown, setShown] = useState<ShapeId>(shape);
  const scale = useRef(0);
  const spin = useRef(0);
  const target = useMemo(() => new THREE.Color(), []);
  const white = useMemo(() => new THREE.Color("#ffffff"), []);

  const geometries = useMemo(
    () => ({
      knot: makeGeometry("knot"),
      gem: makeGeometry("gem"),
      helix: makeGeometry("helix"),
      halo: makeGeometry("halo"),
    }),
    [],
  );
  useEffect(() => () => Object.values(geometries).forEach((g) => g.dispose()), [geometries]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    // Swap: spin the old form away into a point, change geometry, unfold the new one.
    const leaving = shown !== shape;
    const goal = leaving ? 0 : SIZE_SCALE[size];
    scale.current = THREE.MathUtils.damp(scale.current, goal, leaving ? 11 : 6, dt);
    if (leaving && scale.current < 0.03) setShown(shape);
    spin.current = THREE.MathUtils.damp(spin.current, leaving ? 9 : 0, 6, dt);
    m.scale.setScalar(Math.max(0.0001, scale.current));
    m.rotation.y += dt * (reduced ? 0 : spin.current);
    m.rotation.x = THREE.MathUtils.damp(m.rotation.x, SHAPE_TILT[shown], 4, dt);
    m.position.y = THREE.MathUtils.damp(m.position.y, SHAPE_LIFT[shown], 4, dt);
    const mat = m.material as THREE.MeshPhysicalMaterial;
    // Tint is applied on both passes through the glass, so keep it delicate.
    mat.color.lerp(target.set(tint).lerp(white, 0.45), 1 - Math.exp(-5 * dt));
  });

  return (
    <mesh ref={mesh} geometry={geometries[shown]}>
      <MeshTransmissionMaterial
        samples={high ? 8 : 4}
        resolution={high ? 640 : 320}
        backside={high}
        backsideThickness={0.35}
        thickness={1.2}
        roughness={0}
        ior={1.6}
        chromaticAberration={high ? 0.85 : 0.55}
        anisotropicBlur={0.06}
        distortion={0.1}
        distortionScale={0.4}
        temporalDistortion={reduced ? 0 : 0.03}
        clearcoat={1}
        envMapIntensity={1.4}
      />
    </mesh>
  );
}

/** The turntable: a plinth that turns, carrying the piece with it. */
function Turntable({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current && !reduced) g.current.rotation.y += dt * 0.3;
  });
  const ticks = useMemo(() => Array.from({ length: 36 }, (_, i) => (i / 36) * Math.PI * 2), []);
  return (
    <group ref={g}>
      <group position={[0, -1.05, 0]}>
        <Plinth radius={1.55} height={0.32} />
        {ticks.map((a, i) => (
          <mesh
            key={i}
            position={[Math.cos(a) * 1.53, -0.16, Math.sin(a) * 1.53]}
            rotation-y={-a}
          >
            <boxGeometry args={[0.012, i % 9 === 0 ? 0.2 : 0.08, 0.012]} />
            <meshStandardMaterial color="#b08d57" metalness={0.9} roughness={0.3} />
          </mesh>
        ))}
        <group position={[0, 0.004, 0]}>
          <Caustics radius={1.35} />
        </group>
        <ContactShadows position={[0, 0.006, 0]} opacity={0.45} scale={3.6} blur={2} far={2.2} resolution={256} color="#6b5a48" />
      </group>
      {children}
    </group>
  );
}

function Rig() {
  const mobile = useThree((s) => s.size.width < 640);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(0, mobile ? 1.1 : 0.95, mobile ? 8.4 : 6.9);
    camera.lookAt(0, -0.3, 0);
  }, [camera, mobile]);
  return null;
}

export function ConfiguratorCanvas({
  active,
  shape,
  tint,
  size,
}: {
  active: boolean;
  shape: ShapeId;
  tint: string;
  size: SizeId;
}) {
  const reduced = useReducedMotion();
  const [high, setHigh] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 768 && (navigator.hardwareConcurrency ?? 8) > 4,
  );
  const [dpr, setDpr] = useState(() =>
    typeof window !== "undefined" ? Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.5 : 1.75) : 1,
  );
  return (
    <Canvas flat dpr={dpr} frameloop={active ? "always" : "never"} camera={{ position: [0, 0.75, 5.6], fov: 34 }}>
      <PerformanceMonitor
        onDecline={() => {
          setHigh(false);
          setDpr(1);
        }}
        flipflops={2}
      />
      <Rig />
      <color attach="background" args={["#ece5d9"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 5, 3]} intensity={1.3} />
      <Studio />
      {/* The house signature: a shaft of daylight in, the spectrum out. */}
      <group position={[0, 0.05, -0.8]}>
        <LightBeam from={[-7, 3.1, 0]} width={0.12} />
        <SpectrumFan angle={-0.3} spread={0.45} length={7} intensity={0.95} />
      </group>
      <mesh position={[0, 0.05, -2.2]}>
        <torusGeometry args={[1.9, 0.008, 8, 200]} />
        <meshBasicMaterial color="#5b4a39" toneMapped={false} />
      </mesh>
      <GlassOnly>
        <Flag position={[-1.3, 0.2, -1]} rotation={[0, 0, 0.1]} scale={[0.7, 4, 1]} />
        <Flag position={[1.35, 0.2, -1]} rotation={[0, 0, -0.12]} scale={[0.6, 4, 1]} />
        <Flag position={[0.05, 0.3, -0.9]} rotation={[0, 0, 0.6]} scale={[0.28, 3.6, 1]} opacity={0.85} />
        <Flag position={[0, 1.35, -1]} scale={[3.5, 0.3, 1]} opacity={0.7} />
      </GlassOnly>
      <PresentationControls
        global={false}
        cursor
        snap
        speed={1.4}
        polar={[-0.3, 0.3]}
        azimuth={[-Math.PI / 1.5, Math.PI / 1.5]}
      >
        <Turntable reduced={reduced}>
          <Piece shape={shape} tint={tint} size={size} high={high} reduced={reduced} />
        </Turntable>
      </PresentationControls>
    </Canvas>
  );
}
