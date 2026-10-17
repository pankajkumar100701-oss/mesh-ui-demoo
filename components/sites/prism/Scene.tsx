"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, MeshTransmissionMaterial, PerformanceMonitor } from "@react-three/drei";
import { createRandom } from "@/lib/random";
import {
  Caustics,
  Flag,
  GlassOnly,
  LightBeam,
  PEARL,
  Plinth,
  SpectrumFan,
  Studio,
  brilliant,
  prismKnot,
  quartzShard,
  useReducedMotion,
  useWindowPointer,
} from "./Optics";

export { PEARL };
export type { ShapeId } from "./Optics";

/** Layer for light effects that should be seen and refracted, but never cast contact shadows. */
const FX_LAYER = 1;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 0..1 progress of `p` between a and b, eased. */
const seg = (p: number, a: number, b: number) => {
  const t = clamp01((p - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

type Quality = "high" | "low";

/** Story timeline (p = scroll progress through the pinned hero, 0..1). */
function timeline(p: number) {
  const burst = seg(p, 0.2, 0.46); // knot breaks into shards
  const gather = seg(p, 0.56, 0.8); // shards fly back together
  return {
    knot: 1 - seg(p, 0.2, 0.36),
    gem: seg(p, 0.66, 0.84),
    burst,
    gather,
    shardsIn: seg(p, 0.18, 0.28) * (1 - seg(p, 0.7, 0.8)),
    turn: seg(p, 0.15, 0.55) * 0.95 - seg(p, 0.55, 0.92) * 0.75,
    dolly: 7.2 - seg(p, 0.2, 0.5) * 1.5 + seg(p, 0.55, 0.85) * 0.9,
    fan: 1 - 0.65 * seg(p, 0.2, 0.36) + 0.85 * seg(p, 0.68, 0.88),
  };
}

/* ------------------------------------------------------------------ */
/* The glass                                                            */
/* ------------------------------------------------------------------ */

function Glass({
  progress,
  intro,
  quality,
  reduced,
}: {
  progress: React.RefObject<number>;
  intro: React.RefObject<number>;
  quality: Quality;
  reduced: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const knot = useMemo(() => prismKnot(), []);
  const gem = useMemo(() => brilliant(18), []);
  useEffect(
    () => () => {
      knot.dispose();
      gem.dispose();
    },
    [knot, gem],
  );
  const [form, setForm] = useState<"knot" | "gem">("knot");

  useFrame((state, dt) => {
    const m = mesh.current;
    if (!m) return;
    const tl = timeline(progress.current);
    const wantGem = progress.current > 0.52;
    if (wantGem !== (form === "gem")) setForm(wantGem ? "gem" : "knot");
    const s = form === "knot" ? tl.knot * 0.8 : tl.gem * 0.82;
    // A little overshoot as the gem snaps together.
    const pop = form === "gem" ? 1 + Math.sin(tl.gem * Math.PI) * 0.08 : 1;
    const i = intro.current;
    m.scale.setScalar(Math.max(0.0001, s * pop * (0.6 + 0.4 * i)));
    // Arrives turning, then settles into its slow idle spin.
    m.rotation.z = (1 - i) * -1.4;
    m.visible = s > 0.002;
    // Skip the transmission buffer passes entirely while the piece is hidden.
    (m.material as THREE.Material).visible = m.visible;
    if (!reduced) m.rotation.y += dt * (form === "knot" ? 0.22 : 0.35);
    m.rotation.x = form === "gem" ? 0.35 + Math.sin(state.clock.elapsedTime * 0.4) * 0.06 : 0;
  });

  const high = quality === "high";
  return (
    <mesh ref={mesh} geometry={form === "knot" ? knot : gem}>
      <MeshTransmissionMaterial
        samples={high ? 8 : 4}
        resolution={high ? 768 : 384}
        backside={high}
        backsideThickness={0.4}
        thickness={form === "knot" ? 1.1 : 1.6}
        roughness={0}
        ior={1.62}
        chromaticAberration={high ? 0.9 : 0.6}
        anisotropicBlur={0.02}
        distortion={0.12}
        distortionScale={0.5}
        temporalDistortion={reduced ? 0 : 0.04}
        clearcoat={1}
        clearcoatRoughness={0}
        envMapIntensity={1.4}
        color="#ffffff"
      />
    </mesh>
  );
}

/** Quartz shards that the knot shatters into, then gathers back from. */
function Shards({
  progress,
  count,
  reduced,
  high,
}: {
  progress: React.RefObject<number>;
  count: number;
  reduced: boolean;
  high: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => quartzShard(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const data = useMemo(() => {
    const rand = createRandom(11);
    const tints = ["#ffffff", "#f4f0ff", "#fff5ea", "#effffa", "#fff1f4"];
    return Array.from({ length: count }, (_, i) => {
      // Start on the trefoil curve the knot is built from.
      const u = (i / count) * Math.PI * 4;
      const cs = Math.cos(1.5 * u);
      const r = 0.9;
      const start = new THREE.Vector3(
        r * (2 + cs) * 0.5 * Math.cos(u),
        r * (2 + cs) * 0.5 * Math.sin(u),
        r * Math.sin(1.5 * u) * 0.5,
      );
      const dir = start.clone().normalize();
      const out = start
        .clone()
        .add(dir.multiplyScalar(0.5 + rand() * 1.0))
        .add(new THREE.Vector3((rand() - 0.5) * 1.1, (rand() - 0.5) * 1.1, (rand() - 0.5) * 1.8));
      return {
        start,
        out,
        axis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
        spin: 0.4 + rand() * 1.2,
        phase: rand() * Math.PI * 2,
        size: 0.3 + rand() * 0.4,
        color: new THREE.Color(tints[i % tints.length]),
      };
    });
  }, [count]);

  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    data.forEach((d, i) => m.setColorAt(i, d.color));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [data]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const tl = timeline(progress.current);
    const t = reduced ? 0 : state.clock.elapsedTime;
    m.visible = tl.shardsIn > 0.001;
    // The transmission material skips its buffer passes when invisible.
    (m.material as THREE.Material).visible = m.visible;
    if (!m.visible) return;
    data.forEach((d, i) => {
      dummy.position.lerpVectors(d.start, d.out, tl.burst);
      dummy.position.y += Math.sin(t * 0.8 + d.phase) * 0.08 * tl.burst;
      // Gather: everything converges into the heart of the gem.
      dummy.position.multiplyScalar(1 - tl.gather);
      q.setFromAxisAngle(d.axis, d.phase + t * d.spin * 0.6 + tl.burst * 4 + tl.gather * 3);
      dummy.quaternion.copy(q);
      dummy.scale.setScalar(d.size * tl.shardsIn * (1 - tl.gather * 0.6));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, count]} frustumCulled={false}>
      {/* One transmission pass for every shard; switched off while they're hidden. */}
      <MeshTransmissionMaterial
        samples={high ? 5 : 3}
        resolution={high ? 512 : 256}
        thickness={0.45}
        roughness={0}
        ior={1.6}
        chromaticAberration={high ? 0.8 : 0.5}
        anisotropicBlur={0.02}
        distortion={0}
        clearcoat={1}
        envMapIntensity={1.4}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ */
/* Stage                                                               */
/* ------------------------------------------------------------------ */

function Backdrop({ focus }: { focus: React.RefObject<THREE.Vector2> }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uFocus: { value: new THREE.Vector2(0.65, 0.55) }, uAspect: { value: 1 } }),
    [],
  );
  const aspect = useThree((s) => s.size.width / s.size.height);
  useFrame(() => {
    if (!mat.current) return;
    mat.current.uniforms.uFocus.value.copy(focus.current);
    mat.current.uniforms.uAspect.value = aspect;
  });
  return (
    <mesh position={[0, 0, -9]} layers={FX_LAYER} renderOrder={-2}>
      <planeGeometry args={[60, 34]} />
      <shaderMaterial
        ref={mat}
        depthWrite={false}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec4 vClip;
          void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vClip = gl_Position; }
        `}
        fragmentShader={/* glsl */ `
          uniform vec2 uFocus; uniform float uAspect;
          varying vec4 vClip;
          void main() {
            vec2 uv = vClip.xy / vClip.w * 0.5 + 0.5;
            vec2 d = (uv - uFocus) * vec2(uAspect, 1.0);
            float r = length(d);
            vec3 pearl = vec3(0.953, 0.933, 0.902);
            vec3 stone = vec3(0.86, 0.83, 0.785);
            vec3 col = mix(vec3(0.985, 0.975, 0.955), pearl, smoothstep(0.0, 0.35, r));
            col = mix(col, stone, smoothstep(0.35, 1.25, r) * 0.85);
            // floor horizon: a touch darker below the plinth line
            col *= 1.0 - 0.05 * smoothstep(0.42, 0.0, uv.y);
            gl_FragColor = vec4(col, 1.0);
          }
        `}
      />
    </mesh>
  );
}

function Stage({
  progress,
  quality,
  reduced,
}: {
  progress: React.RefObject<number>;
  quality: Quality;
  reduced: boolean;
}) {
  const stage = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Group>(null);
  const pointer = useWindowPointer();
  const fanStrength = useRef(1);
  const smooth = useRef(progress.current ?? 0);
  const local = useRef(0);
  const focus = useRef(new THREE.Vector2(0.65, 0.55));
  const { camera, size } = useThree();
  const mobile = size.width < 768;
  const fanSway = useRef(0);
  // Opening sequence: the beam travels in, hits the glass, the spectrum unfurls.
  const beamReveal = useRef(reduced ? 1 : 0);
  const fanReveal = useRef(reduced ? 1 : 0);
  const glassIntro = useRef(reduced ? 1 : 0);

  useEffect(() => {
    camera.layers.enable(FX_LAYER);
  }, [camera]);

  useFrame((state, dt) => {
    // Smooth the scroll value so the story glides instead of stepping.
    const t = state.clock.elapsedTime;
    beamReveal.current = reduced ? 1 : seg(t, 0.5, 1.7);
    fanReveal.current = reduced ? 1 : seg(t, 1.55, 3.0);
    glassIntro.current = reduced ? 1 : seg(t, 0.1, 2.0);
    smooth.current = THREE.MathUtils.damp(smooth.current, progress.current ?? 0, reduced ? 20 : 5, dt);
    local.current = smooth.current;
    const p = smooth.current;
    const tl = timeline(p);
    const cam = state.camera as THREE.PerspectiveCamera;

    const z = mobile ? tl.dolly + 1.6 : tl.dolly;
    const px = reduced ? 0 : pointer.current.x;
    const py = reduced ? 0 : pointer.current.y;
    cam.position.x = THREE.MathUtils.damp(cam.position.x, px * 0.35, 2.5, dt);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, py * 0.25 + 0.1, 2.5, dt);
    cam.position.z = THREE.MathUtils.damp(cam.position.z, z, 4, dt);
    cam.lookAt(cam.position.x * 0.6, cam.position.y * 0.6, 0);

    const halfW = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.position.z * cam.aspect;
    // Desktop: the piece moves right → left → right as the copy alternates sides.
    const side = 0.42 - 0.84 * seg(p, 0.22, 0.42) + 0.84 * seg(p, 0.56, 0.72);
    const sx = mobile ? 0 : halfW * side;
    const halfH = halfW / cam.aspect;
    // Phones: keep the piece in the top half, clear of the copy below it.
    const ms = Math.min(0.7, halfW * 0.52, halfH * 0.26);
    const sy = 0.08;
    // Phones: shift the frame (not the piece) so we still look down onto the plinth.
    const offY = mobile ? Math.round(state.size.height * 0.22) : 0;
    const v = cam.view;
    if (offY && (!v || v.offsetY !== offY || v.fullWidth !== state.size.width || v.fullHeight !== state.size.height)) {
      cam.setViewOffset(state.size.width, state.size.height, 0, offY, state.size.width, state.size.height);
    } else if (!offY && v && v.enabled) {
      cam.clearViewOffset();
    }
    if (stage.current) {
      stage.current.position.set(sx, sy, 0);
      stage.current.scale.setScalar(mobile ? ms : 1);
    }
    focus.current.set(0.5 + (sx / halfW) * 0.5 + px * 0.02, mobile ? 0.72 : 0.55);

    if (turn.current) turn.current.rotation.y = tl.turn;
    if (tilt.current) {
      tilt.current.rotation.x = THREE.MathUtils.damp(tilt.current.rotation.x, -py * 0.35, 3, dt);
      tilt.current.rotation.z = THREE.MathUtils.damp(tilt.current.rotation.z, -px * 0.22, 3, dt);
      tilt.current.position.y = reduced ? 0 : Math.sin(state.clock.elapsedTime * 0.9) * 0.06;
    }
    if (ring.current) {
      ring.current.rotation.y = THREE.MathUtils.damp(ring.current.rotation.y, px * 0.25, 2, dt);
      ring.current.rotation.x = THREE.MathUtils.damp(ring.current.rotation.x, -py * 0.15, 2, dt);
    }
    fanStrength.current = tl.fan;
    // The rainbow swings with the cursor, as if the glass were tilted in the sun.
    fanSway.current = py * 0.08 - px * 0.05;
  });

  const high = quality === "high";
  return (
    <>
      <Backdrop focus={focus} />
      <group ref={stage}>
        <group ref={turn}>
          {/* Engraved halo behind the piece — a deliberate circle, not clutter. */}
          <group ref={ring} position={[0, 0.05, -1.6]}>
            <mesh layers={FX_LAYER}>
              <torusGeometry args={[2.0, 0.008, 8, 200]} />
              <meshBasicMaterial color="#5b4a39" toneMapped={false} />
            </mesh>
            <mesh layers={FX_LAYER}>
              <torusGeometry args={[2.16, 0.003, 6, 200]} />
              <meshBasicMaterial color="#9a8266" toneMapped={false} />
            </mesh>
          </group>
          <group position={[0, 0, -0.45]} layers={FX_LAYER}>
            <LightBeamLayer strength={fanStrength} reveal={beamReveal} fanReveal={fanReveal} />
            <SpectrumFanLayer sway={fanSway} strength={fanStrength} reveal={fanReveal} />
          </group>

          {/* Black cards seen only by the glass: crisp dark edges, rainbow fringes. */}
          <GlassOnly>
            <Flag position={[-1.55, 0.1, -1.1]} rotation={[0, 0, 0.12]} scale={[0.9, 5, 1]} />
            <Flag position={[1.65, 0.1, -1.1]} rotation={[0, 0, -0.1]} scale={[0.7, 5, 1]} />
            <Flag position={[0, -1.25, -0.9]} scale={[5, 0.5, 1]} opacity={0.8} />
            <Flag position={[0.2, 1.5, -1.2]} rotation={[0, 0, 0.3]} scale={[4, 0.35, 1]} opacity={0.7} />
            <Flag position={[0.1, 0.2, -1.0]} rotation={[0, 0, 0.55]} scale={[0.32, 4.2, 1]} opacity={0.9} />
            <Flag position={[-0.35, -0.1, -0.95]} rotation={[0, 0, -0.95]} scale={[0.22, 3.6, 1]} opacity={0.8} />
          </GlassOnly>

          <group ref={tilt}>
            <Glass progress={local} intro={glassIntro} quality={quality} reduced={reduced} />
            <Shards progress={local} count={high ? 56 : 30} reduced={reduced} high={high} />
          </group>

          <group position={[0, -1.72, 0]}>
            <Plinth radius={1.75} height={0.6} />
            <group position={[0, 0.004, 0]}>
              <Caustics radius={1.6} strength={fanStrength} />
            </group>
            <ContactShadows
              position={[0, 0.006, 0]}
              opacity={0.5}
              scale={4}
              blur={2.2}
              far={2.6}
              resolution={high ? 512 : 256}
              frames={reduced ? 1 : Infinity}
              color="#6b5a48"
            />
          </group>
        </group>
      </group>
    </>
  );
}

/** Wrappers that put the light effects on the FX layer (meshes don't inherit group layers). */
function LightBeamLayer({
  strength,
  reveal,
  fanReveal,
}: {
  strength: React.RefObject<number>;
  reveal: React.RefObject<number>;
  fanReveal: React.RefObject<number>;
}) {
  const g = useRef<THREE.Group>(null);
  useLayoutLayers(g);
  return (
    <group ref={g}>
      <LightBeam from={[-10, 3.6, 0]} width={0.14} reveal={reveal} />
      <SpectrumHalo strength={strength} reveal={fanReveal} />
    </group>
  );
}

function SpectrumFanLayer({
  sway,
  strength,
  reveal,
}: {
  sway: React.RefObject<number>;
  strength: React.RefObject<number>;
  reveal: React.RefObject<number>;
}) {
  const g = useRef<THREE.Group>(null);
  useLayoutLayers(g);
  return (
    <group ref={g}>
      <SpectrumFan angle={-0.42} sway={sway} reveal={reveal} spread={0.5} length={10} strength={strength} />
    </group>
  );
}

/** Soft white bloom where the beam enters the glass. */
function SpectrumHalo({
  strength,
  reveal,
}: {
  strength: React.RefObject<number>;
  reveal: React.RefObject<number>;
}) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    // Flares as the beam first strikes the glass, then settles.
    const r = reveal.current;
    const flare = r > 0 && r < 1 ? Math.sin(r * Math.PI) * 0.6 : 0;
    if (mat.current) mat.current.opacity = (0.5 * Math.min(1, strength.current ?? 1) + flare) * Math.min(1, r * 4);
  });
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,246,228,0.5)");
    g.addColorStop(1, "rgba(255,246,228,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh scale={2.4}>
      <planeGeometry />
      <meshBasicMaterial ref={mat} map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function useLayoutLayers(g: React.RefObject<THREE.Group | null>) {
  useEffect(() => {
    g.current?.traverse((o) => o.layers.set(FX_LAYER));
  });
}

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

export function HeroCanvas({
  active,
  progress,
}: {
  active: boolean;
  progress: React.RefObject<number>;
}) {
  const reduced = useReducedMotion();
  const [quality, setQuality] = useState<Quality>(() =>
    typeof window !== "undefined" && (window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4)
      ? "low"
      : "high",
  );
  const [dpr, setDpr] = useState(() =>
    typeof window !== "undefined" ? Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.5 : 1.75) : 1,
  );

  return (
    <Canvas
      flat
      dpr={dpr}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0.1, 7.2], fov: 32 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <PerformanceMonitor
        onDecline={() => {
          setQuality("low");
          setDpr(1);
        }}
        flipflops={2}
      />
      <color attach="background" args={[PEARL]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} />
      <Studio />
      <Stage progress={progress} quality={quality} reduced={reduced} />
    </Canvas>
  );
}
