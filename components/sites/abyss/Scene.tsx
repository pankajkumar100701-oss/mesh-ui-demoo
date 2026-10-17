"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { createRandom } from "@/lib/random";
import { Anglers, Jellies, Submersible, Whales } from "./Creatures";
import { School, type SchoolSpec } from "./Fish";
import {
  PLAIN_Y,
  SHELF_EDGE_Z,
  SUN_DIR,
  TRAIL,
  U,
  camY,
  camZ,
  commonGLSL,
  fbm,
  floorY,
  litGLSL,
  litVertex,
  waterAt,
} from "./world";

/** Mutable dive state written by the page every frame (no React re-render). */
export type Dive = { depth: number };

type Quality = "high" | "low";

const smooth = (t: number) => {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/* ------------------------------------------------------------------ */
/* Camera + shared uniforms                                            */
/* ------------------------------------------------------------------ */

function CameraRig({ dive, reduced }: { dive: RefObject<Dive>; reduced: boolean }) {
  const pointer = useRef({ x: 0, y: 0, sx: 0, sy: 0, moved: -10, has: false, lastTrail: 0, trailIndex: 0 });
  const tmp = useMemo(() => ({ mid: new THREE.Color(), v: new THREE.Vector3() }), []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = pointer.current;
      p.x = (e.clientX / window.innerWidth) * 2 - 1;
      p.y = -(e.clientY / window.innerHeight) * 2 + 1;
      p.moved = performance.now() / 1000;
      p.has = true;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
    };
  }, []);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const cam = state.camera as THREE.PerspectiveCamera;
    const m = dive.current?.depth ?? 0;
    const p = pointer.current;
    const now = performance.now() / 1000;

    U.uTime.value += dt * (reduced ? 0.45 : 1);
    U.uPixelRatio.value = state.gl.getPixelRatio();

    // Water colour & light around the camera.
    const density = waterAt(m, U.uWaterUp.value, tmp.mid, U.uWaterDown.value);
    U.uFogColor.value.copy(tmp.mid);
    U.uFogDensity.value = density;
    U.uDay.value = Math.exp(-m / 150);
    const bg = state.scene.background;
    if (bg instanceof THREE.Color) bg.copy(tmp.mid);

    // Pointer parallax (mouse only feels right; touch just stirs).
    const parallax = reduced ? 0 : 1;
    p.sx = THREE.MathUtils.damp(p.sx, p.has ? p.x : 0, 2, dt);
    p.sy = THREE.MathUtils.damp(p.sy, p.has ? p.y : 0, 2, dt);

    const y = camY(m);
    const z = camZ(y);
    const t = U.uTime.value;
    cam.position.set(
      Math.sin(t * 0.21) * 0.35 * parallax + p.sx * 0.6 * parallax,
      y + Math.sin(t * 0.33) * 0.18 * parallax,
      z,
    );
    const pitch =
      m < 60
        ? THREE.MathUtils.lerp(0.25, -0.13, smooth(m / 60))
        : m < 260
          ? THREE.MathUtils.lerp(-0.13, -0.04, smooth((m - 60) / 200))
          : m > 3250
          ? THREE.MathUtils.lerp(-0.04, -0.3, smooth((m - 3250) / 700))
          : -0.04;
    cam.rotation.set(
      pitch + p.sy * 0.05 * parallax + Math.sin(t * 0.27) * 0.01 * parallax,
      -p.sx * 0.08 * parallax + Math.sin(t * 0.19) * 0.012 * parallax,
      Math.sin(t * 0.23) * 0.012 * parallax,
      "YXZ",
    );
    const portrait = state.size.width / state.size.height < 0.9;
    const fov = portrait ? 68 : 58;
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();

    // Pointer ray + stir level + glowing trail.
    const active = p.has && now - p.moved < 1.2;
    U.uStir.value = THREE.MathUtils.damp(U.uStir.value, active ? 1 : 0, active ? 8 : 1.5, dt);
    tmp.v.set(p.x, p.y, 0.5).unproject(cam).sub(cam.position).normalize();
    U.uRayOrigin.value.copy(cam.position);
    U.uRayDir.value.copy(tmp.v);
    if (active && now - p.lastTrail > 0.07) {
      p.lastTrail = now;
      const slot = U.uTrail.value[p.trailIndex % TRAIL];
      slot.set(cam.position.x + tmp.v.x * 13, cam.position.y + tmp.v.y * 13, cam.position.z + tmp.v.z * 13, t);
      p.trailIndex++;
    }
  }, -1);

  return null;
}

/* ------------------------------------------------------------------ */
/* Water volume: gradient dome, surface, god rays                      */
/* ------------------------------------------------------------------ */

function WaterDome() {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...U, uSun: { value: SUN_DIR } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uSun;
          varying vec3 vDir;
          ${commonGLSL}
          void main() {
            vec3 d = normalize(vDir);
            vec3 col = waterColor(d);
            // Light leaking down from the sun direction.
            float s = max(dot(d, uSun), 0.0);
            col += uWaterUp * (pow(s, 8.0) * 0.6 + pow(s, 2.0) * 0.15) * uDay;
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }
        `,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [],
  );
  useFrame((state) => mesh.current?.position.copy(state.camera.position));
  return (
    <mesh ref={mesh} material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[480, 32, 16]} />
    </mesh>
  );
}

function Surface() {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...U, uSun: { value: SUN_DIR } },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uSun;
          varying vec3 vWorld;
          ${commonGLSL}
          void main() {
            vec3 V = vWorld - cameraPosition;
            float dist = length(V);
            V /= dist;
            vec2 q = vWorld.xz;
            float t = uTime;
            // Wave slopes: a few travelling swells plus finer chop.
            vec2 g = vec2(cos(q.x * 0.55 + t * 0.9), cos(q.y * 0.45 - t * 0.7)) * 0.5;
            g += vec2(cos((q.x + q.y) * 1.3 + t * 1.6), cos((q.x - q.y) * 1.1 - t * 1.4)) * 0.3;
            g += vec2(sin(q.x * 3.1 - t * 2.3 + q.y), cos(q.y * 2.7 + t * 2.1 - q.x)) * 0.12;
            float ca = caustic(q * 0.03, t * 0.35);
            vec3 Vp = normalize(V + vec3(g.x, 0.0, g.y) * 0.09);
            float cosA = Vp.y;
            // Snell's window: above ~48.6° from vertical you see the sky, outside it the deep is mirrored.
            float window = smoothstep(0.6, 0.7, cosA);
            vec3 sky = mix(uWaterUp * 0.95, vec3(1.05, 1.2, 1.25), smoothstep(0.75, 1.0, cosA));
            vec3 mirror = uFogColor * (0.75 + 0.9 * ca) + uWaterUp * 0.12;
            vec3 col = mix(mirror, sky * (0.9 + 0.3 * ca), window);
            col += vec3(0.7, 1.0, 1.0) * smoothstep(0.06, 0.0, abs(cosA - 0.655)) * 0.35;
            float s = max(dot(Vp, uSun), 0.0);
            col += vec3(1.0, 0.95, 0.78) * (pow(s, 600.0) * 6.0 + pow(s, 40.0) * 0.9 + pow(s, 6.0) * 0.15);
            // Fade into the same colour as the background dome so the far edge never shows.
            col = mix(col, waterColor(V), smoothstep(0.0, 1.0, fogFactor(dist) * 1.15));
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  );
  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    m.visible = state.camera.position.y > -80;
    m.position.set(state.camera.position.x, 0, state.camera.position.z);
  });
  return (
    <mesh ref={mesh} material={material} rotation-x={Math.PI / 2} frustumCulled={false}>
      <planeGeometry args={[900, 900, 1, 1]} />
    </mesh>
  );
}

function GodRays({ count }: { count: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const random = createRandom(5);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const origin = new Float32Array(count * 3);
    const len = new Float32Array(count);
    const width = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      origin[i * 3] = (random() * 2 - 1) * 48;
      origin[i * 3 + 1] = 0;
      origin[i * 3 + 2] = -130 + random() * 180;
      len[i] = 50 + random() * 70;
      width[i] = 1.2 + Math.pow(random(), 2) * 6;
      phase[i] = random() * 100;
    }
    g.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(origin, 3));
    g.setAttribute("aLen", new THREE.InstancedBufferAttribute(len, 1));
    g.setAttribute("aWidth", new THREE.InstancedBufferAttribute(width, 1));
    g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
    g.instanceCount = count;
    return g;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...U, uAxis: { value: SUN_DIR.clone().negate() } },
        vertexShader: /* glsl */ `
          attribute vec3 aOrigin;
          attribute float aLen;
          attribute float aWidth;
          attribute float aPhase;
          uniform vec3 uAxis;
          varying float vAlong;
          varying float vAcross;
          varying float vPhase;
          varying vec3 vWorld;
          void main() {
            vec3 mid = aOrigin + uAxis * aLen * 0.5;
            vec3 toCam = normalize(cameraPosition - mid);
            vec3 side = normalize(cross(uAxis, toCam));
            float w = aWidth * (1.0 + position.y * 0.8);
            vec3 p = aOrigin + uAxis * position.y * aLen + side * position.x * w;
            vAlong = position.y;
            vAcross = position.x * 2.0;
            vPhase = aPhase;
            vWorld = p;
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vAlong;
          varying float vAcross;
          varying float vPhase;
          varying vec3 vWorld;
          ${commonGLSL}
          void main() {
            float dist = length(vWorld - cameraPosition);
            float a = smoothstep(0.0, 0.3, vAlong) * pow(1.0 - vAlong, 1.6);
            a *= pow(1.0 - vAcross * vAcross, 1.5);
            float flicker = 0.55 + 0.45 * sin(uTime * (0.35 + fract(vPhase) * 0.5) + vPhase);
            flicker *= 0.8 + 0.2 * sin(uTime * 1.7 + vPhase * 3.0);
            a *= flicker * smoothstep(1.5, 9.0, dist) * (1.0 - fogFactor(dist));
            a *= smoothstep(-80.0, -6.0, vWorld.y);
            gl_FragColor = vec4(vec3(0.75, 0.95, 1.0) * a * 0.2, 1.0);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useFrame((state) => {
    if (mesh.current) mesh.current.visible = state.camera.position.y > -90;
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />;
}

/* ------------------------------------------------------------------ */
/* Sea floor, rocks, kelp                                              */
/* ------------------------------------------------------------------ */

function SeaFloor({ quality }: { quality: Quality }) {
  const geometry = useMemo(() => {
    const segX = quality === "high" ? 200 : 120;
    const segZ = quality === "high" ? 240 : 140;
    const g = new THREE.PlaneGeometry(260, 280, segX, segZ);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -95);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, floorY(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    return g;
  }, [quality]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...U },
        vertexShader: litVertex,
        fragmentShader: /* glsl */ `
          varying vec3 vWorld;
          varying vec3 vNormal;
          ${commonGLSL}
          ${litGLSL}
          float hash12(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
          }
          void main() {
            vec3 n = normalize(vNormal);
            float flatness = smoothstep(0.7, 0.95, n.y);
            float shelf = smoothstep(-34.0, -27.0, vWorld.y);
            float plain = smoothstep(${(PLAIN_Y + 8).toFixed(1)}, ${(PLAIN_Y + 3).toFixed(1)}, vWorld.y);
            float grain = 0.5 + 0.5 * sin(vWorld.x * 7.1 + sin(vWorld.z * 5.3)) * sin(vWorld.z * 6.7 + sin(vWorld.x * 4.1));
            float ripple = 0.5 + 0.5 * sin(vWorld.x * 1.4 + sin(vWorld.z * 0.6) * 2.0);
            vec3 sand = vec3(0.6, 0.54, 0.4) * (0.82 + 0.12 * grain + 0.1 * ripple);
            vec3 rock = vec3(0.16, 0.19, 0.21) * (0.8 + 0.3 * grain);
            vec3 ooze = vec3(0.32, 0.31, 0.33) * (0.85 + 0.15 * grain);
            vec3 albedo = mix(rock, sand, flatness * shelf);
            albedo = mix(albedo, ooze, plain * flatness);
            vec3 col = shade(albedo, vWorld, n, shelf * flatness);
            // Glowing specks scattered over the abyssal plain.
            if (plain > 0.5) {
              vec2 cell = floor(vWorld.xz * 0.9);
              float h = hash12(cell);
              if (h > 0.9) {
                vec2 o = vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5;
                float d = length(fract(vWorld.xz * 0.9) - 0.5 - o * 0.6);
                float tw = 0.5 + 0.5 * sin(uTime * (0.8 + h * 3.0) + h * 60.0);
                vec3 glow = mix(vec3(0.2, 0.9, 1.0), vec3(0.6, 0.45, 1.0), fract(h * 13.0));
                float dist = length(cameraPosition - vWorld);
                col += glow * smoothstep(0.09, 0.0, d) * tw * 2.4 * (1.0 - fogFactor(dist) * 0.7);
              }
            }
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  );

  return <mesh geometry={geometry} material={material} />;
}

function Rocks({ count }: { count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const k = 0.75 + fbm(v.x * 1.7 + 5, v.y * 1.7 + v.z * 1.3) * 0.5;
      p.setXYZ(i, v.x * k, v.y * k * 0.7, v.z * k);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const material = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...U, uAlbedo: { value: new THREE.Color("#5d6560") } },
      vertexShader: litVertex,
      fragmentShader: /* glsl */ `
        uniform vec3 uAlbedo;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying vec3 vLocal;
        ${commonGLSL}
        ${litGLSL}
        void main() {
          vec3 n = normalize(vNormal);
          // Encrusted tops: a little coralline pink and algae green.
          float top = smoothstep(0.3, 0.9, n.y);
          float mottle = 0.5 + 0.5 * sin(vLocal.x * 9.0) * sin(vLocal.z * 8.0 + vLocal.y * 5.0);
          vec3 albedo = mix(uAlbedo, mix(vec3(0.62, 0.36, 0.42), vec3(0.32, 0.45, 0.2), mottle), top * 0.6);
          gl_FragColor = vec4(shade(albedo, vWorld, n, 1.0), 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    return m;
  }, []);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const random = createRandom(77);
    const o = new THREE.Object3D();
    let placed = 0;
    let tries = 0;
    while (placed < count && tries < count * 20) {
      tries++;
      const x = (random() * 2 - 1) * 70;
      const z = SHELF_EDGE_Z + 2 + random() * 95;
      if (Math.abs(x) < 4 && z > -64) continue;
      const s = 0.5 + Math.pow(random(), 2.2) * 3.2;
      o.position.set(x, floorY(x, z) + s * 0.15, z);
      o.rotation.set(random() * 0.4, random() * Math.PI * 2, random() * 0.4);
      o.scale.set(s * (0.8 + random() * 0.6), s, s * (0.8 + random() * 0.6));
      o.updateMatrix();
      m.setMatrixAt(placed++, o.matrix);
    }
    m.count = placed;
    m.instanceMatrix.needsUpdate = true;
  }, [count]);

  return <instancedMesh ref={mesh} args={[geometry, material, count]} frustumCulled={false} />;
}

function Kelp({ count, reduced }: { count: number; reduced: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const random = createRandom(21);
    const base = new THREE.PlaneGeometry(1, 1, 1, 30);
    base.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.attributes.position);
    const root: number[] = [];
    const height: number[] = [];
    const width: number[] = [];
    const phase: number[] = [];
    const yaw: number[] = [];
    let tries = 0;
    while (root.length / 3 < count && tries < count * 40) {
      tries++;
      const x = (random() * 2 - 1) * 72;
      const z = SHELF_EDGE_Z + 2 + random() * 95;
      if (Math.abs(x) < 4.5 && z > -66) continue;
      // Patchy forest: clearings where the noise is low.
      if (fbm(x * 0.05 + 3, z * 0.05 + 9) < 0.42) continue;
      const y = floorY(x, z);
      if (y < -27) continue;
      // Several fronds per holdfast.
      const fronds = 1 + Math.floor(random() * 3);
      for (let f = 0; f < fronds && root.length / 3 < count; f++) {
        root.push(x + (random() - 0.5) * 0.8, y - 0.3, z + (random() - 0.5) * 0.8);
        height.push(12 + random() * 10);
        width.push(0.45 + random() * 0.5);
        phase.push(random() * 6.28);
        yaw.push(random() * 6.28);
      }
    }
    const n = root.length / 3;
    g.setAttribute("aRoot", new THREE.InstancedBufferAttribute(new Float32Array(root), 3));
    g.setAttribute("aHeight", new THREE.InstancedBufferAttribute(new Float32Array(height), 1));
    g.setAttribute("aWidth", new THREE.InstancedBufferAttribute(new Float32Array(width), 1));
    g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(new Float32Array(phase), 1));
    g.setAttribute("aYaw", new THREE.InstancedBufferAttribute(new Float32Array(yaw), 1));
    g.instanceCount = n;
    return g;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...U, uSway: { value: reduced ? 0.35 : 1 } },
        vertexShader: /* glsl */ `
          attribute vec3 aRoot;
          attribute float aHeight;
          attribute float aWidth;
          attribute float aPhase;
          attribute float aYaw;
          uniform float uTime;
          uniform float uSway;
          uniform vec3 uRayOrigin;
          uniform vec3 uRayDir;
          uniform float uStir;
          varying float vT;
          varying float vEdge;
          varying vec3 vWorld;
          varying vec3 vN;
          void main() {
            float t = position.y;
            float leaf = 0.35 + 0.65 * sin(3.14159 * min(t * 1.1 + 0.05, 1.0));
            float frill = 1.0 + 0.3 * sin(t * 46.0 + aPhase * 7.0);
            float w = aWidth * leaf * frill;
            float tw = aYaw + t * 2.4;
            float c = cos(tw), s = sin(tw);
            vec3 local = vec3(position.x * w * c, 0.0, position.x * w * s);
            float k = pow(t, 1.4);
            float sx = sin(uTime * 0.6 + aPhase + t * 2.2) * 1.1 + sin(uTime * 1.3 + aPhase * 2.0 + t * 4.0) * 0.3;
            float sz = cos(uTime * 0.45 + aPhase * 1.3 + t * 1.7) * 0.8;
            vec3 p = aRoot + local + vec3(sx * k * uSway + t * t * 1.6, t * aHeight, sz * k * uSway);
            // Fronds lean away from the cursor.
            vec3 v = p - uRayOrigin;
            float along = max(dot(v, uRayDir), 0.0);
            vec3 perp = v - uRayDir * along;
            float d = length(perp);
            p += perp / max(d, 0.001) * (1.0 - smoothstep(0.0, 3.5, d)) * 1.6 * k * uStir;
            vT = t;
            vEdge = position.x * 2.0;
            vWorld = p;
            vN = normalize(vec3(-s, 0.3, c));
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vT;
          varying float vEdge;
          varying vec3 vWorld;
          varying vec3 vN;
          ${commonGLSL}
          void main() {
            vec3 V = cameraPosition - vWorld;
            float dist = length(V);
            V /= dist;
            float day = daylight(vWorld.y);
            vec3 albedo = mix(vec3(0.2, 0.26, 0.07), vec3(0.62, 0.48, 0.13), smoothstep(0.1, 0.95, vT));
            albedo *= 1.0 - 0.35 * smoothstep(0.25, 0.0, abs(vEdge));
            float diff = 0.45 + 0.55 * abs(dot(normalize(vN), vec3(0.0, 1.0, 0.0)));
            vec3 col = albedo * diff * day * 1.35;
            // Light glowing through the blade when we look up towards the surface.
            float through = pow(max(-V.y, 0.0), 1.5);
            col += vec3(0.75, 0.62, 0.15) * through * day * 0.9 * (0.6 + 0.4 * vT);
            col += albedo * vec3(0.7, 0.9, 1.0) * caustic(vWorld.xz * 0.07 + vWorld.y * 0.02, uTime * 0.55) * day * 0.6;
            gl_FragColor = vec4(mix(col, waterColor(-V), fogFactor(dist)), 1.0);
            #include <colorspace_fragment>
          }
        `,
        side: THREE.DoubleSide,
      }),
    [reduced],
  );

  useFrame((state) => {
    if (mesh.current) mesh.current.visible = state.camera.position.y > -75;
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />;
}

/* ------------------------------------------------------------------ */
/* Abyssal plain: bioluminescent sea pens                              */
/* ------------------------------------------------------------------ */

function SeaPens({ count }: { count: number }) {
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const random = createRandom(55);
    const base = new THREE.CylinderGeometry(0.03, 0.06, 1, 5, 12, true);
    base.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.attributes.position);
    const root: number[] = [];
    const meta: number[] = [];
    const camEndZ = camZ(camY(4000));
    for (let i = 0; i < count; i++) {
      const x = (random() * 2 - 1) * (8 + random() * 26);
      const z = camEndZ - 8 - Math.pow(random(), 0.8) * 46;
      root.push(x, floorY(x, z) - 0.1, z);
      meta.push(0.8 + random() * 2.2, random() * 6.28, random());
    }
    g.setAttribute("aRoot", new THREE.InstancedBufferAttribute(new Float32Array(root), 3));
    g.setAttribute("aMeta", new THREE.InstancedBufferAttribute(new Float32Array(meta), 3));
    g.instanceCount = count;
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...U },
        vertexShader: /* glsl */ `
          attribute vec3 aRoot;
          attribute vec3 aMeta; // height, phase, hue
          uniform float uTime;
          varying float vT;
          varying float vHue;
          varying float vPhase;
          varying float vDist;
          void main() {
            float t = position.y;
            vec3 p = position;
            float fan = smoothstep(0.35, 1.0, t);
            p.xz *= 1.0 + fan * 5.0 * (0.6 + 0.4 * sin(t * 30.0));
            p.y *= aMeta.x;
            p.x += sin(uTime * 0.5 + aMeta.y) * 0.18 * t * t;
            p.z += cos(uTime * 0.4 + aMeta.y) * 0.12 * t * t;
            vec3 wp = aRoot + p;
            vT = t;
            vHue = aMeta.z;
            vPhase = aMeta.y;
            vec4 mv = viewMatrix * vec4(wp, 1.0);
            vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vT;
          varying float vHue;
          varying float vPhase;
          varying float vDist;
          ${commonGLSL}
          void main() {
            vec3 glow = mix(vec3(0.25, 0.85, 1.0), vec3(0.75, 0.4, 1.0), vHue);
            // A wave of light that ripples up each pen.
            float wave = 0.5 + 0.5 * sin(uTime * 1.6 - vT * 6.0 + vPhase);
            float a = smoothstep(0.25, 1.0, vT) * (0.35 + wave * 1.4);
            vec3 col = mix(vec3(0.05, 0.04, 0.05), glow * 2.2, a);
            col *= 1.0 - fogFactor(vDist) * 0.75;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useFrame((state) => {
    if (group.current) group.current.visible = state.camera.position.y < -200;
  });
  return (
    <group ref={group}>
      <mesh geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Particles: marine snow / bioluminescent plankton, bubbles           */
/* ------------------------------------------------------------------ */

function Plankton({ count, box }: { count: number; box: number }) {
  const geometry = useMemo(() => {
    const random = createRandom(31);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = random() * box;
      pos[i * 3 + 1] = random() * box;
      pos[i * 3 + 2] = random() * box;
      seed[i] = random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [count, box]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...U, uBox: { value: box } },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uBox;
          uniform float uPixelRatio;
          uniform vec4 uTrail[${TRAIL}];
          varying float vExcite;
          varying float vSeed;
          varying float vDeep;
          varying float vFade;
          ${commonGLSL}
          void main() {
            vec3 p = position;
            p.y -= uTime * (0.12 + aSeed * 0.25);
            p.x += sin(uTime * 0.2 + aSeed * 40.0) * 0.8;
            p.z += cos(uTime * 0.17 + aSeed * 31.0) * 0.8;
            vec3 cam = cameraPosition;
            p = mod(p - cam + uBox * 0.5, uBox) - uBox * 0.5 + cam;
            // Swept aside by the cursor, and lit up by it.
            float along;
            vec3 perp = rayOffset(p, along);
            float d = length(perp);
            float R = 2.2 + along * 0.08;
            float push = (1.0 - smoothstep(0.0, R, d)) * uStir;
            p += perp / max(d, 0.001) * push * 1.4;
            float ex = push;
            for (int i = 0; i < ${TRAIL}; i++) {
              vec4 tr = uTrail[i];
              float age = uTime - tr.w;
              float k = exp(-age * 0.8) * (1.0 - smoothstep(0.8, 4.0, distance(p, tr.xyz)));
              ex = max(ex, k);
            }
            vExcite = ex;
            vSeed = aSeed;
            vDeep = 1.0 - smoothstep(-130.0, -45.0, p.y);
            vec4 mv = viewMatrix * vec4(p, 1.0);
            float dist = -mv.z;
            vFade = smoothstep(0.4, 2.0, dist) * (1.0 - fogFactor(dist) * mix(0.95, 0.6, vDeep));
            float size = (0.05 + aSeed * 0.07) * (1.0 + ex * 1.8 + vDeep * 0.4);
            gl_PointSize = clamp(size * uPixelRatio * 520.0 / dist, 1.0, 40.0);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vExcite;
          varying float vSeed;
          varying float vDeep;
          varying float vFade;
          uniform float uTime;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float r = length(c) * 2.0;
            float a = smoothstep(1.0, 0.0, r);
            a *= a;
            vec3 snow = vec3(0.75, 0.9, 0.95) * 0.35;
            float tw = 0.4 + 0.6 * sin(uTime * (0.7 + vSeed * 2.0) + vSeed * 80.0);
            vec3 bio = mix(vec3(0.15, 0.7, 1.0), vec3(0.3, 1.0, 0.75), fract(vSeed * 7.0));
            vec3 col = mix(snow, bio * (0.12 + max(tw, 0.0) * 0.25), vDeep);
            col += bio * vExcite * mix(0.8, 4.5, vDeep);
            gl_FragColor = vec4(col * a * vFade, 1.0);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [box],
  );

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

function Bubbles({ count }: { count: number }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const random = createRandom(61);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Columns of bubbles trail up from the kelp forest.
      const column = Math.floor(random() * 7);
      const cx = Math.sin(column * 12.9) * 14;
      const cz = 30 - ((column * 7.3) % 1) * 50 - column * 6;
      pos[i * 3] = cx + (random() - 0.5) * 1.6;
      pos[i * 3 + 1] = random() * 30;
      pos[i * 3 + 2] = cz + (random() - 0.5) * 1.6;
      seed[i] = random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...U },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uPixelRatio;
          varying float vFade;
          ${commonGLSL}
          void main() {
            vec3 p = position;
            float h = mod(p.y + uTime * (1.2 + aSeed * 1.6), 30.0);
            p.y = -30.0 + h;
            p.x += sin(uTime * 3.0 + aSeed * 20.0 + h) * 0.12;
            p.z += cos(uTime * 2.6 + aSeed * 13.0 + h) * 0.12;
            vec4 mv = viewMatrix * vec4(p, 1.0);
            float dist = -mv.z;
            vFade = smoothstep(0.0, 3.0, h) * smoothstep(30.0, 27.0, h) * (1.0 - fogFactor(dist));
            gl_PointSize = clamp((0.05 + aSeed * 0.12) * uPixelRatio * 600.0 / dist, 1.0, 36.0);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vFade;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float r = length(c) * 2.0;
            float ring = smoothstep(1.0, 0.8, r) * smoothstep(0.45, 0.85, r);
            float spec = smoothstep(0.3, 0.0, length(c - vec2(-0.15, 0.15)) * 2.0);
            float a = (ring * 0.7 + spec) * vFade;
            gl_FragColor = vec4(vec3(0.85, 0.97, 1.0) * a * 0.8, 1.0);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  useFrame((state) => {
    if (points.current) points.current.visible = state.camera.position.y > -45;
  });
  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />;
}

/* ------------------------------------------------------------------ */
/* World                                                               */
/* ------------------------------------------------------------------ */

const SCHOOLS: Record<Quality, SchoolSpec[]> = {
  high: [
    { count: 150, seed: 3, size: 0.42, band: [-17, -5], ahead: 16, speed: [2.2, 4.4], back: "#2f5f7a", belly: "#dfe9ee", wag: 13 },
    { count: 70, seed: 8, size: 0.9, band: [-46, -24], ahead: 22, speed: [2.6, 4.6], back: "#20425a", belly: "#b8c9d2", wag: 9 },
    { count: 90, seed: 12, size: 0.5, band: [-128, -60], ahead: 15, speed: [1.6, 3.4], back: "#18242e", belly: "#5d6a73", glow: "#59c8ff", deep: true, wag: 11 },
  ],
  low: [
    { count: 80, seed: 3, size: 0.45, band: [-17, -5], ahead: 16, speed: [2.2, 4.4], back: "#2f5f7a", belly: "#dfe9ee", wag: 13 },
    { count: 36, seed: 8, size: 0.9, band: [-46, -24], ahead: 22, speed: [2.6, 4.6], back: "#20425a", belly: "#b8c9d2", wag: 9 },
    { count: 50, seed: 12, size: 0.5, band: [-128, -60], ahead: 15, speed: [1.6, 3.4], back: "#18242e", belly: "#5d6a73", glow: "#59c8ff", deep: true, wag: 11 },
  ],
};

const COUNTS = {
  high: { plankton: 7000, box: 64, kelp: 200, rocks: 70, rays: 30, jellies: 34, pens: 90, bubbles: 160 },
  low: { plankton: 2800, box: 54, kelp: 120, rocks: 40, rays: 20, jellies: 20, pens: 50, bubbles: 90 },
};

function World({ dive, quality, reduced }: { dive: RefObject<Dive>; quality: Quality; reduced: boolean }) {
  const c = COUNTS[quality];
  const background = useMemo(() => new THREE.Color("#1ba6c9"), []);
  return (
    <>
      <primitive attach="background" object={background} />
      <CameraRig dive={dive} reduced={reduced} />
      <WaterDome />
      <Surface />
      <SeaFloor quality={quality} />
      <Rocks count={c.rocks} />
      <Kelp count={c.kelp} reduced={reduced} />
      <SeaPens count={c.pens} />
      {SCHOOLS[quality].map((s) => (
        <School key={`${quality}-${s.seed}`} spec={s} reduced={reduced} />
      ))}
      <Whales reduced={reduced} />
      <Submersible reduced={reduced} />
      <Jellies count={c.jellies} reduced={reduced} />
      <Anglers reduced={reduced} />
      <GodRays count={c.rays} />
      <Bubbles count={reduced ? 0 : c.bubbles} />
      <Plankton count={c.plankton} box={c.box} />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          mipmapBlur
          luminanceThreshold={0.62}
          luminanceSmoothing={0.3}
          intensity={quality === "high" ? 1.15 : 0.95}
          radius={0.78}
          levels={quality === "high" ? 7 : 5}
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette eskil={false} offset={0.25} darkness={0.62} />
      </EffectComposer>
    </>
  );
}

function initialQuality(): Quality {
  if (typeof window === "undefined") return "low";
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  return small || coarse || weak ? "low" : "high";
}

export default function Scene({ dive, reduced }: { dive: RefObject<Dive>; reduced: boolean }) {
  const [quality, setQuality] = useState<Quality>(initialQuality);
  return (
    <Canvas
      dpr={quality === "high" ? [1, 1.5] : [0.85, 1.15]}
      camera={{ fov: 58, near: 0.1, far: 560, position: [0, -2, 0] }}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      style={{ pointerEvents: "none" }}
    >
      <PerformanceMonitor flipflops={2} onDecline={() => setQuality("low")} onFallback={() => setQuality("low")} />
      <World dive={dive} quality={quality} reduced={reduced} />
    </Canvas>
  );
}
