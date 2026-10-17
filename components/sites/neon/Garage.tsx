"use client";

import { MeshReflectorMaterial } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { NeonEnvironment, SportsCar, type CarMotion, type CarSpec } from "./Car";

/** Drag state written by the page wrapper (keeps page scroll on touch). */
export type TurntableInput = { dragVelocity: number; seq: number };

const ringVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ringFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float ang = atan(p.y, p.x);
    float ring = smoothstep(0.012, 0.0, abs(r - 0.92)) * 2.5;
    float ring2 = smoothstep(0.006, 0.0, abs(r - 0.78)) * (0.6 + 0.4 * step(0.5, fract(ang * 6.0 / 6.2831 + uTime * 0.2)));
    float glow = exp(-abs(r - 0.92) * 14.0) * 0.5;
    float a = ring + ring2 + glow;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

function Turntable({ spec, input, reducedMotion }: { spec: CarSpec; input: RefObject<TurntableInput>; reducedMotion: boolean }) {
  const table = useRef<THREE.Group>(null);
  const motion = useRef<CarMotion>({ speed: 0, steer: 0, boost: 0, brake: 0 });
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color(spec.accent).multiplyScalar(2) }, uTime: { value: 0 } }), [spec.accent]);
  const lastId = useRef(spec.id);
  const flourish = useRef(0);
  const ringMat = useRef<THREE.ShaderMaterial>(null);
  const spin = useRef({ vel: 0, seq: 0 });

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const inp = input.current;
    if (lastId.current !== spec.id) {
      lastId.current = spec.id;
      flourish.current = 1;
    }
    flourish.current = Math.max(0, flourish.current - dt * 1.2);
    const auto = reducedMotion ? 0 : 0.35;
    const sp = spin.current;
    if (inp.seq !== sp.seq) {
      sp.seq = inp.seq;
      sp.vel = inp.dragVelocity;
    }
    sp.vel *= 1 - Math.min(1, dt * 3);
    const spinVel = auto + sp.vel + flourish.current * flourish.current * 9;
    if (table.current) table.current.rotation.y += spinVel * dt;
    motion.current.steer = Math.sin(state.clock.elapsedTime * 0.7) * 0.6;
    motion.current.boost = flourish.current;
    if (ringMat.current) ringMat.current.uniforms.uTime.value += dt;
  });

  return (
    <group ref={table}>
      <SportsCar spec={spec} motion={motion} blendColors />
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.4, 6.4]} />
        <shaderMaterial
          ref={ringMat}
          vertexShader={ringVertex}
          fragmentShader={ringFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** Pull the camera back on tall/narrow stages so the whole car fits. */
function FitCamera() {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.viewport.aspect);
  useEffect(() => {
    const k = aspect < 1 ? 1.75 : aspect < 1.4 ? 1.3 : 1;
    camera.position.set(4.1 * k, 1.7 + (k - 1) * 0.9, 4.9 * k);
    camera.lookAt(0, 0.4, 0);
  }, [aspect, camera]);
  return null;
}

export default function Garage({
  spec,
  input,
  active,
  lowPower,
  reducedMotion,
}: {
  spec: CarSpec;
  input: RefObject<TurntableInput>;
  active: boolean;
  lowPower: boolean;
  reducedMotion: boolean;
}) {
  return (
    <Canvas
      dpr={lowPower ? [1, 1.25] : [1, 1.6]}
      frameloop={active ? "always" : "never"}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [4.1, 1.7, 4.9], fov: 34, near: 0.1, far: 80 }}
      onCreated={({ camera, scene }) => {
        camera.lookAt(0, 0.4, 0);
        scene.background = new THREE.Color("#0b0218");
        scene.fog = new THREE.Fog("#0b0218", 9, 18);
      }}
    >
      <FitCamera />
      <NeonEnvironment resolution={lowPower ? 64 : 128} />
      <ambientLight intensity={0.4} color="#b48cff" />
      <hemisphereLight args={["#ffb3e6", "#1a0533", 0.8]} />
      <spotLight position={[0, 7, 0]} angle={0.5} penumbra={0.8} intensity={120} color="#ffd1f0" />
      <pointLight position={[-4, 1.5, -3]} intensity={25} color="#ff2a9d" distance={12} />
      <pointLight position={[4, 1.5, 3]} intensity={20} color="#18e7ff" distance={12} />
      <Turntable spec={spec} input={input} reducedMotion={reducedMotion} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 30]} />
        {lowPower ? (
          <meshStandardMaterial color="#120424" metalness={0.8} roughness={0.35} />
        ) : (
          <MeshReflectorMaterial
            resolution={512}
            blur={[200, 60]}
            mixBlur={0.8}
            mixStrength={2.5}
            mirror={0.8}
            roughness={0.6}
            metalness={0.5}
            depthScale={0.8}
            minDepthThreshold={0.3}
            maxDepthThreshold={1.2}
            color="#160628"
            envMapIntensity={0.2}
          />
        )}
      </mesh>
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.5} luminanceSmoothing={0.2} />
        <Vignette offset={0.3} darkness={0.7} />
      </EffectComposer>
    </Canvas>
  );
}
