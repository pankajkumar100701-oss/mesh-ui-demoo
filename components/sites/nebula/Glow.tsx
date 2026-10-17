"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { glowFragment, glowVertex } from "./shaders";
import { flight } from "./journey";

/** Additive camera-facing glow sprite (no textures, pure shader). */
export default function Glow({
  scale = 1,
  color = "#ffffff",
  intensity = 1,
  falloff = 4,
  position,
  reveal = false,
}: {
  scale?: number;
  color?: string;
  intensity?: number;
  falloff?: number;
  position?: [number, number, number];
  reveal?: boolean;
}) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: reveal ? 0 : intensity },
      uFalloff: { value: falloff },
    }),
    [color, intensity, falloff, reveal],
  );
  useFrame(() => {
    if (reveal && material.current) material.current.uniforms.uIntensity.value = intensity * flight.intro;
  });
  return (
    <mesh position={position} scale={scale} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={material}
        vertexShader={glowVertex}
        fragmentShader={glowFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
