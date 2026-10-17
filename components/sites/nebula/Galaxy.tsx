"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { createRandom } from "@/lib/random";
import { noise2 } from "./shaders";
import { flight, GALAXY_RADIUS, GALAXY_TILT } from "./journey";
import Glow from "./Glow";

/** Arms follow a logarithmic spiral: angle = ln(r) / TAN_PITCH + arm * PI. */
const TAN_PITCH = 0.36;
const ARMS = 2;

/* ------------------------------------------------------------------ */
/* Luminous gas disc (one big shader plane)                            */
/* ------------------------------------------------------------------ */

const discVertex = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const discFragment = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uRadius;
  varying vec2 vP;
  ${noise2}

  float armWave(float phase, float sharp) {
    return pow(0.5 + 0.5 * cos(${ARMS.toFixed(1)} * phase), sharp);
  }

  void main() {
    float r = length(vP);
    float rn = r / uRadius;
    if (rn > 1.0) discard;
    float th = atan(vP.y, vP.x);
    float lr = log(max(r, 0.35));

    vec2 q = vP * 0.22;
    float warp = fbm2(q + vec2(uTime * 0.01, 0.0)) - 0.5;
    float phase = th - lr / ${TAN_PITCH.toFixed(3)} + warp * 0.9;

    float clouds = fbm2(vP * 0.55 + 3.0);
    float fine = fbm2(vP * 1.9 - 7.0);

    float arm = armWave(phase, 3.0);
    float armCore = armWave(phase, 14.0);
    // Dust lanes hug the inner (concave) edge of each arm.
    float lane = armWave(phase + 0.42, 16.0) * smoothstep(0.38, 0.62, clouds);

    float disc = exp(-rn * 3.6);
    float bulge = exp(-pow(r / 2.8, 2.0));
    float core = exp(-pow(r / 0.9, 2.0));

    vec3 armBlue = mix(vec3(0.25, 0.48, 1.0), vec3(0.55, 0.3, 1.0), smoothstep(0.25, 0.9, rn));
    vec3 col = vec3(0.0);
    col += armBlue * disc * (0.12 + 2.2 * arm * (0.35 + clouds));
    col += vec3(0.6, 0.75, 1.0) * disc * armCore * fine * 1.0;
    // Pink star-forming knots along the arms.
    col += vec3(1.0, 0.28, 0.62) * disc * armCore * smoothstep(0.58, 0.78, fine) * 3.2;
    col += vec3(1.0, 0.6, 0.3) * bulge * 2.2;
    col += vec3(1.0, 0.92, 0.78) * core * 5.0;

    col *= 1.0 - 0.9 * lane * smoothstep(0.06, 0.16, rn) * (1.0 - smoothstep(0.75, 0.95, rn));
    col *= 1.0 - smoothstep(0.75, 1.0, rn);
    gl_FragColor = vec4(col * uReveal * 0.85, 1.0);
  }
`;

function GasDisc() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(GALAXY_RADIUS * 2, GALAXY_RADIUS * 2, 1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uReveal: { value: 0 }, uRadius: { value: GALAXY_RADIUS } }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    const m = material.current;
    if (!m) return;
    m.uniforms.uTime.value += delta;
    m.uniforms.uReveal.value = flight.intro;
  });
  return (
    <mesh geometry={geometry} renderOrder={-1}>
      <shaderMaterial
        ref={material}
        vertexShader={discVertex}
        fragmentShader={discFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Star particles that follow the same arms                            */
/* ------------------------------------------------------------------ */

const starVertex = /* glsl */ `
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uReveal;
  uniform float uTime;
  attribute float aScale;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vBright;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.75 + 0.25 * sin(uTime * (0.8 + aPhase) + aPhase * 20.0);
    float size = uSize * aScale * uPixelRatio / -mv.z;
    // Stars swell out of the void during the warp reveal.
    size *= mix(0.2, 1.0, uReveal);
    gl_PointSize = clamp(size, 1.0, 48.0);
    // Keep the light of sub-pixel stars instead of letting them pop.
    vBright = min(size, 1.0) * twinkle * uReveal;
    vColor = color;
  }
`;

const starFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vBright;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-d * d * 6.0) + exp(-d * 18.0) * 0.6;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a * vBright * 0.8, 1.0);
  }
`;

function gauss(random: () => number) {
  // Box-Muller
  const u = Math.max(random(), 1e-6);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function GalaxyStars({ count }: { count: number }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const gl = useThree((s) => s.gl);

  const geometry = useMemo(() => {
    const random = createRandom(11);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const phases = new Float32Array(count);
    const c = new THREE.Color();
    const hot = new THREE.Color("#fff1d6");
    const warm = new THREE.Color("#ffb36b");
    const blue = new THREE.Color("#7fa4ff");
    const violet = new THREE.Color("#a070ff");
    const pink = new THREE.Color("#ff5fb0");
    const white = new THREE.Color("#ffffff");

    for (let i = 0; i < count; i++) {
      const kind = random();
      let x: number, y: number, z: number;
      if (kind < 0.16) {
        // Bulge: squashed gaussian ball.
        const s = 2.6;
        x = gauss(random) * s;
        y = gauss(random) * s * 0.45;
        z = gauss(random) * s;
        c.copy(hot).lerp(warm, random() * 0.8);
        scales[i] = 0.6 + random() * 1.2;
      } else {
        // Disc + arms: exponential radial profile, arms with gaussian scatter.
        const r = Math.min(-Math.log(1 - random() * 0.985) * 6.2 + 1.2, GALAXY_RADIUS * 0.98);
        const inArm = kind < 0.86;
        const arm = Math.floor(random() * ARMS);
        const base = Math.log(Math.max(r, 0.35)) / TAN_PITCH + (arm * Math.PI * 2) / ARMS;
        const scatter = inArm ? gauss(random) * 0.22 : random() * Math.PI * 2;
        const th = base + scatter;
        x = Math.cos(th) * r + gauss(random) * 0.35;
        z = Math.sin(th) * r + gauss(random) * 0.35;
        y = gauss(random) * (0.35 - (r / GALAXY_RADIUS) * 0.2);
        const t = r / GALAXY_RADIUS;
        const roll = random();
        if (roll < 0.06 && inArm) c.copy(pink);
        else if (roll < 0.08) c.copy(white);
        else if (t < 0.18) c.copy(warm).lerp(hot, random());
        else c.copy(blue).lerp(violet, Math.min(1, t * 1.3) * random());
        scales[i] = (0.5 + random() * 1.3) * (random() < 0.015 ? 3.2 : 1);
      }
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      phases[i] = random() * 3;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    return g;
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uSize: { value: 60 },
      uPixelRatio: { value: 1 },
      uReveal: { value: 0 },
      uTime: { value: 0 },
    }),
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    const m = material.current;
    if (!m) return;
    m.uniforms.uPixelRatio.value = gl.getPixelRatio();
    m.uniforms.uReveal.value = flight.intro;
    m.uniforms.uTime.value += delta;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={material}
        vertexShader={starVertex}
        fragmentShader={starFragment}
        uniforms={uniforms}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/* Assembled galaxy                                                    */
/* ------------------------------------------------------------------ */

export default function Galaxy({ count, still }: { count: number; still: boolean }) {
  const spin = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (spin.current && !still) spin.current.rotation.y += delta * 0.018;
  });
  return (
    <group rotation={GALAXY_TILT}>
      <group ref={spin}>
        <GasDisc />
        <GalaxyStars count={count} />
      </group>
      <Glow scale={9} color="#ffb877" intensity={0.9} falloff={5} reveal />
      <Glow scale={30} color="#7d5cff" intensity={0.16} falloff={3} reveal />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Background sky                                                      */
/* ------------------------------------------------------------------ */

const skyVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aPhase;
  attribute float aSize;
  varying float vTwinkle;
  varying vec3 vColor;
  void main() {
    vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vTwinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase) + aPhase * 12.0);
    gl_PointSize = aSize * uPixelRatio;
    vColor = color;
  }
`;

const skyFragment = /* glsl */ `
  varying float vTwinkle;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-d * d * 5.0);
    if (a < 0.02) discard;
    gl_FragColor = vec4(vColor * vTwinkle * a, 1.0);
  }
`;

export function Sky({ count }: { count: number }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null);

  const geometry = useMemo(() => {
    const random = createRandom(42);
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    const palette = ["#cdd9ff", "#ffffff", "#ffd8b0", "#b9a2ff", "#9fd8ff"];
    for (let i = 0; i < count; i++) {
      const r = 260 + random() * 120;
      const theta = random() * Math.PI * 2;
      // Concentrate a share of stars into a faint band across the sky.
      const band = random() < 0.45;
      const phi = band ? Math.PI / 2 + gauss(random) * 0.18 : Math.acos(2 * random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      phases[i] = random() * 3;
      const big = random() < 0.04;
      sizes[i] = big ? 3 + random() * 2.5 : 1.2 + random() * 1.6;
      c.set(palette[Math.floor(random() * palette.length)]).multiplyScalar(big ? 1.4 : 0.55 + random() * 0.45);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [count]);

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: 1 } }), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    // The sky is "infinitely" far: it follows the camera so it never gets closer.
    group.current?.position.copy(camera.position);
    const m = material.current;
    if (!m) return;
    m.uniforms.uTime.value += delta;
    m.uniforms.uPixelRatio.value = gl.getPixelRatio();
  });

  return (
    <group ref={group} rotation={[0.5, 0, 0.9]}>
      <points geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={material}
          vertexShader={skyVertex}
          fragmentShader={skyFragment}
          uniforms={uniforms}
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
