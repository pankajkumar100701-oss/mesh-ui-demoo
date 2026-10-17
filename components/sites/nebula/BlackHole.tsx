"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { noise3 } from "./shaders";
import { BLACK_HOLE_POS, flight } from "./journey";
import Glow from "./Glow";

/**
 * Ray-marched black hole. Each pixel of a bounding sphere integrates a light ray
 * through a Schwarzschild-like potential (units of the horizon radius), so the
 * accretion disc behind the hole is lensed up and over the shadow and the star
 * field around it is visibly bent. Fully procedural.
 */
const RS = 1.8; // horizon radius in world units
const BOUND = 13; // bounding sphere radius in RS units
const DISC_IN = 2.6;
const DISC_OUT = 9.5;

const vertex = /* glsl */ `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uCam;      // camera in local (RS) units
  uniform float uTime;
  uniform float uSteps;
  uniform float uFade;
  varying vec3 vLocal;
  ${noise3}

  const float BOUND = ${BOUND.toFixed(1)};
  const float DIN = ${DISC_IN.toFixed(2)};
  const float DOUT = ${DISC_OUT.toFixed(2)};

  vec3 discColor(vec3 c, vec3 v, out float alpha) {
    float r = length(c.xz);
    float t = (r - DIN) / (DOUT - DIN);
    // Keplerian swirl: inner gas laps the outer gas.
    float ang = uTime * 1.6 / pow(r, 1.5);
    float ca = cos(ang), sa = sin(ang);
    vec2 q = mat2(ca, -sa, sa, ca) * c.xz;
    float n = fbm3(vec3(q * 0.9, r * 1.4));
    float streaks = noise3(vec3(normalize(q) * 6.0, r * 5.0 - uTime * 0.4));
    float dens = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.45, t);
    dens *= 0.45 + 0.9 * n + 0.35 * streaks;
    alpha = clamp(dens * 1.4, 0.0, 1.0);

    vec3 hot = vec3(1.0, 0.82, 0.55);
    vec3 mid = vec3(1.0, 0.42, 0.1);
    vec3 cool = vec3(0.55, 0.1, 0.06);
    vec3 col = mix(hot, mid, smoothstep(0.0, 0.35, t));
    col = mix(col, cool, smoothstep(0.35, 1.0, t));

    // Relativistic beaming: the side rotating towards us is far brighter.
    vec3 orbit = normalize(vec3(-c.z, 0.0, c.x));
    float beam = 1.0 + 0.6 * dot(orbit, -normalize(v));
    beam = beam * beam * beam;
    float heat = 1.45 * pow(1.0 - t, 2.4) + 0.1;
    return col * heat * beam * (0.6 + n);
  }

  vec3 stars(vec3 d) {
    // Procedural star field on the escape direction, for the lensed backdrop.
    vec3 p = d * 90.0;
    vec3 id = floor(p);
    vec3 f = fract(p) - 0.5;
    float h = hash3(id);
    float s = step(0.991, h) * smoothstep(0.25, 0.0, length(f));
    vec3 tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.8, 0.7), hash3(id + 3.1));
    float neb = fbm3(d * 3.0);
    return tint * s * 1.1 + vec3(0.35, 0.18, 0.6) * pow(neb, 3.0) * 0.6;
  }

  void main() {
    vec3 ro = uCam;
    vec3 rd = normalize(vLocal - uCam);

    // Enter the bounding sphere (or start at the camera if we are inside it).
    float b = dot(ro, rd);
    float c = dot(ro, ro) - BOUND * BOUND;
    float h = b * b - c;
    if (h < 0.0) discard;
    float t0 = max(-b - sqrt(h), 0.0);
    vec3 p = ro + rd * t0;
    vec3 v = rd;

    vec3 hcross = cross(p, v);
    float h2 = dot(hcross, hcross);

    vec3 col = vec3(0.0);
    float alpha = 0.0;
    float minR = 1e3;
    bool captured = false;
    bool escaped = false;

    for (int i = 0; i < 160; i++) {
      if (float(i) >= uSteps) break;
      float r = length(p);
      minR = min(minR, r);
      float dt = clamp(0.09 * r, 0.03, 0.9);
      vec3 acc = -1.5 * h2 * p / pow(r, 5.0);
      v += acc * dt;
      vec3 pn = p + v * dt;

      if (p.y * pn.y < 0.0) {
        float k = p.y / (p.y - pn.y);
        vec3 hit = mix(p, pn, k);
        float rr = length(hit.xz);
        if (rr > DIN && rr < DOUT) {
          float a;
          vec3 dc = discColor(hit, v, a);
          col += (1.0 - alpha) * dc * a;
          alpha += (1.0 - alpha) * a;
        }
      }
      p = pn;
      if (dot(p, p) < 1.0) { captured = true; break; }
      if (r > BOUND && dot(p, v) > 0.0) { escaped = true; break; }
      if (alpha > 0.98) break;
    }

    // Rays that ran out of steps were circling the hole: treat them as swallowed.
    if (captured || (!escaped && alpha < 0.98)) {
      alpha = 1.0;
    } else {
      // Bent background, only where the bending is noticeable so it blends into the real sky.
      vec3 dir = normalize(v);
      float bend = 1.0 - dot(dir, rd);
      float w = smoothstep(0.0, 0.025, bend);
      col += (1.0 - alpha) * stars(dir) * w;
      alpha += (1.0 - alpha) * w * 0.94;

      // Photon ring: escaping rays that skimmed the photon sphere glow.
      float ring = exp(-pow((minR - 1.6) * 4.0, 2.0));
      col += vec3(1.0, 0.7, 0.4) * ring * 0.8;
    }

    gl_FragColor = vec4(col, alpha) * uFade;
  }
`;

export default function BlackHole({ steps }: { steps: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const glow = useRef<THREE.Group>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const uniforms = useMemo(
    () => ({
      uCam: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uSteps: { value: steps },
      uFade: { value: 0 },
    }),
    [steps],
  );

  useFrame(({ camera }, delta) => {
    const m = material.current;
    const o = mesh.current;
    if (!m || !o) return;
    m.uniforms.uTime.value += delta;
    // Only switch on once the flight is past the nebula: saves fill-rate and keeps the reveal for later.
    const fade = THREE.MathUtils.smoothstep(flight.chapter, 2.25, 2.9);
    m.uniforms.uFade.value = fade;
    o.visible = fade > 0.001;
    if (glow.current) glow.current.visible = o.visible;
    o.updateWorldMatrix(true, false);
    m.uniforms.uCam.value.copy(o.worldToLocal(tmp.copy(camera.position)));
  });

  return (
    <group position={BLACK_HOLE_POS} rotation={[0, 0.5, 0.05]}>
      <group ref={glow}>
        <Glow scale={RS * 42} color="#ff7a2e" intensity={0.22} falloff={5} />
      </group>
      <mesh ref={mesh} scale={RS} renderOrder={2}>
        <sphereGeometry args={[BOUND, 48, 32]} />
        <shaderMaterial
          ref={material}
          vertexShader={vertex}
          fragmentShader={fragment}
          uniforms={uniforms}
          side={THREE.BackSide}
          transparent
          premultipliedAlpha
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
