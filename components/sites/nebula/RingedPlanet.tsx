"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { noise3 } from "./shaders";
import { PLANET_POS, PLANET_RADIUS } from "./journey";

/** Light comes from the left (towards the galaxy), so the planet shows a lit half and a deep night side. */
const SUN_DIR = new THREE.Vector3(-0.93, 0.25, 0.27).normalize();
const RING_TILT = new THREE.Euler(0.38, 0, -0.32);
const RING_NORMAL = new THREE.Vector3(0, 1, 0).applyEuler(RING_TILT);
const INNER = 1.38;
const OUTER = 2.55;

const ringDensity = /* glsl */ `
  float ringDensity(float t) {
    // t: 0 inner edge → 1 outer edge
    float b = noise3(vec3(t * 46.0, 0.0, 0.0)) * 0.65 + noise3(vec3(t * 170.0, 4.0, 0.0)) * 0.35;
    float edge = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.9, t);
    float cassini = smoothstep(0.015, 0.05, abs(t - 0.64));
    float encke = smoothstep(0.004, 0.012, abs(t - 0.88));
    return clamp(b * 1.25, 0.0, 1.0) * edge * cassini * encke * mix(0.55, 1.0, smoothstep(0.1, 0.5, t));
  }
`;

const planetVertex = /* glsl */ `
  varying vec3 vObj;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vObj = position;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const planetFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSun;
  uniform vec3 uCenter;
  uniform vec3 uRingN;
  uniform float uR;
  varying vec3 vObj;
  varying vec3 vN;
  varying vec3 vW;
  ${noise3}
  ${ringDensity}

  void main() {
    vec3 p = normalize(vObj);
    float lat = p.y;
    float swirl = fbm3(p * 2.6 + vec3(uTime * 0.02, 0.0, 0.0));
    float bands = sin((lat + swirl * 0.22) * 22.0) * 0.5 + 0.5;
    float fineBands = sin((lat + swirl * 0.12) * 64.0) * 0.5 + 0.5;
    vec3 cream = vec3(1.0, 0.8, 0.55);
    vec3 amber = vec3(0.9, 0.42, 0.16);
    vec3 rust = vec3(0.45, 0.18, 0.1);
    vec3 col = mix(cream, amber, bands);
    col = mix(col, rust, fineBands * 0.35 * smoothstep(0.2, 0.7, abs(lat)));
    // A great storm.
    vec3 sp = p - normalize(vec3(0.6, -0.25, 0.75));
    float storm = smoothstep(0.22, 0.0, length(sp * vec3(1.0, 2.2, 1.0)) + (swirl - 0.5) * 0.12);
    col = mix(col, vec3(0.75, 0.3, 0.2), storm);
    col = mix(col, vec3(0.6, 0.75, 0.95), smoothstep(0.82, 0.98, abs(lat)) * 0.5);

    vec3 n = normalize(vN);
    float ndl = dot(n, uSun);
    float diff = smoothstep(-0.05, 0.75, ndl);

    // Shadow cast by the rings.
    float t = dot(uCenter - vW, uRingN) / dot(uSun, uRingN);
    float shade = 1.0;
    if (t > 0.0) {
      vec3 hit = vW + uSun * t;
      float rr = length(hit - uCenter) / uR;
      float k = (rr - ${INNER.toFixed(2)}) / ${(OUTER - INNER).toFixed(2)};
      if (k > 0.0 && k < 1.0) shade = 1.0 - ringDensity(k) * 0.85;
    }

    vec3 viewDir = normalize(cameraPosition - vW);
    float rim = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
    float fwd = pow(max(dot(-viewDir, uSun), 0.0), 2.0);

    vec3 lit = col * diff * shade * 1.5;
    vec3 night = col * 0.025;
    vec3 atmo = vec3(1.0, 0.62, 0.35) * rim * (smoothstep(-0.3, 0.4, ndl) * 1.8 + fwd * 2.0);
    gl_FragColor = vec4(lit + night + atmo, 1.0);
  }
`;

const ringVertex = /* glsl */ `
  varying vec3 vW;
  varying vec3 vL;
  void main() {
    vL = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const ringFragment = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uCenter;
  uniform vec3 uRingN;
  uniform float uR;
  varying vec3 vW;
  varying vec3 vL;
  ${noise3}
  ${ringDensity}

  void main() {
    float rr = length(vL.xy) / uR;
    float k = (rr - ${INNER.toFixed(2)}) / ${(OUTER - INNER).toFixed(2)};
    if (k < 0.0 || k > 1.0) discard;
    float d = ringDensity(k);

    // Planet shadow on the rings.
    vec3 oc = vW - uCenter;
    float b = dot(oc, uSun);
    float c = dot(oc, oc) - uR * uR;
    float h = b * b - c;
    float lit = 1.0;
    if (h > 0.0 && -b - sqrt(h) > 0.0) lit = 0.04;

    // Rings glow when back-lit (forward scattering) and are dimmer from the unlit side.
    vec3 viewDir = normalize(cameraPosition - vW);
    float fwd = pow(max(dot(-viewDir, uSun), 0.0), 4.0);
    float side = sign(dot(viewDir, uRingN)) == sign(dot(uSun, uRingN)) ? 1.0 : 0.45;
    vec3 tint = mix(vec3(0.95, 0.78, 0.58), vec3(0.62, 0.55, 0.52), smoothstep(0.3, 0.9, k));
    vec3 col = tint * (0.12 + 0.85 * side + fwd * 2.0) * lit;
    gl_FragColor = vec4(col * d, d * 0.92);
  }
`;

const atmoVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const atmoFragment = /* glsl */ `
  uniform vec3 uSun;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vW);
    float f = pow(1.0 - abs(dot(n, v)), 3.0);
    float light = smoothstep(-0.5, 0.5, dot(-n, uSun) * -1.0);
    float fwd = pow(max(dot(-v, uSun), 0.0), 3.0);
    vec3 col = vec3(1.0, 0.6, 0.32) * f * (light * 1.6 + fwd * 3.0);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function RingedPlanet() {
  const body = useRef<THREE.Mesh>(null);
  const bodyMat = useRef<THREE.ShaderMaterial>(null);
  const moon = useRef<THREE.Group>(null);

  const shared = useMemo(
    () => ({
      uSun: { value: SUN_DIR.clone() },
      uCenter: { value: PLANET_POS.clone() },
      uRingN: { value: RING_NORMAL.clone() },
      uR: { value: PLANET_RADIUS },
    }),
    [],
  );
  const planetUniforms = useMemo(() => ({ ...shared, uTime: { value: 0 } }), [shared]);

  useFrame((state, delta) => {
    if (body.current) body.current.rotation.y += delta * 0.04;
    if (bodyMat.current) bodyMat.current.uniforms.uTime.value += delta;
    if (moon.current) moon.current.rotation.y = state.clock.elapsedTime * 0.08;
  });

  const sunPos = useMemo(
    () => PLANET_POS.clone().addScaledVector(SUN_DIR, 140).toArray() as [number, number, number],
    [],
  );

  return (
    <>
      <group position={PLANET_POS}>
        <group rotation={RING_TILT}>
          <mesh ref={body}>
            <sphereGeometry args={[PLANET_RADIUS, 96, 64]} />
            <shaderMaterial
              ref={bodyMat}
              vertexShader={planetVertex}
              fragmentShader={planetFragment}
              uniforms={planetUniforms}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[PLANET_RADIUS * INNER, PLANET_RADIUS * OUTER, 192, 1]} />
            <shaderMaterial
              vertexShader={ringVertex}
              fragmentShader={ringFragment}
              uniforms={shared}
              side={THREE.DoubleSide}
              transparent
              depthWrite={false}
            />
          </mesh>
        </group>
        <mesh scale={1.06}>
          <sphereGeometry args={[PLANET_RADIUS, 64, 48]} />
          <shaderMaterial
            vertexShader={atmoVertex}
            fragmentShader={atmoFragment}
            uniforms={shared}
            side={THREE.BackSide}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <group ref={moon} rotation={[0.25, 0, 0.1]}>
          <mesh position={[PLANET_RADIUS * 3.6, 0.6, 0]}>
            <sphereGeometry args={[0.7, 32, 24]} />
            <meshStandardMaterial color="#b9b4c8" roughness={0.9} />
          </mesh>
        </group>
      </group>
      <directionalLight position={sunPos} intensity={2.4} color="#ffe9d0" />
    </>
  );
}
