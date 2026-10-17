"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const SPACING = 0.42;
const PALETTE = ["#4c1d95", "#6d5dfc", "#22d3ee", "#f472b6"].map((c) => new THREE.Color(c));

/** Height → colour along the brand gradient (violet → cyan → pink at the crests). */
function paint(t: number, out: THREE.Color) {
  const x = THREE.MathUtils.clamp(t, 0, 1) * (PALETTE.length - 1);
  const i = Math.min(Math.floor(x), PALETTE.length - 2);
  return out.copy(PALETTE[i]).lerp(PALETTE[i + 1], x - i);
}

type Ripple = { x: number; z: number; t: number };

/** A field of rounded pillars that swells like the sea and splashes wherever the cursor touches it. */
function MeshField({ cols, rows, reduced }: { cols: number; rows: number; reduced: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = cols * rows;
  const pointer = useRef(new THREE.Vector3(999, 0, 999));
  const ripples = useRef<Ripple[]>([]);
  const lastDrop = useRef(0);
  const { camera, gl } = useThree();

  const cells = useMemo(() => {
    const xs = new Float32Array(count);
    const zs = new Float32Array(count);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        xs[i] = (c - (cols - 1) / 2) * SPACING;
        zs[i] = (r - (rows - 1) / 2) * SPACING;
      }
    }
    return { xs, zs };
  }, [cols, rows, count]);

  // Track the pointer on the window (the canvas sits behind the hero text), projected onto the floor plane.
  useEffect(() => {
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    function project(clientX: number, clientY: number) {
      const rect = gl.domElement.getBoundingClientRect();
      if (clientY < rect.top || clientY > rect.bottom) return null;
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(plane, hit);
    }

    function onMove(e: PointerEvent) {
      const p = project(e.clientX, e.clientY);
      if (p) pointer.current.copy(p);
      else pointer.current.set(999, 0, 999);
    }
    function onDown(e: PointerEvent) {
      const p = project(e.clientX, e.clientY);
      if (p) ripples.current.push({ x: p.x, z: p.z, t: 0 });
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [camera, gl]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    const m = mesh.current;
    if (!m) return;
    const time = reduced ? 0 : state.clock.elapsedTime;

    // Ambient raindrops keep the surface alive even when nobody touches it.
    if (!reduced && time - lastDrop.current > 1.6) {
      lastDrop.current = time;
      ripples.current.push({
        x: (Math.random() - 0.5) * cols * SPACING * 0.8,
        z: (Math.random() - 0.5) * rows * SPACING * 0.8,
        t: 0,
      });
    }
    ripples.current = ripples.current.filter((r) => (r.t += delta) < 4);

    const px = pointer.current.x;
    const pz = pointer.current.z;

    for (let i = 0; i < count; i++) {
      const x = cells.xs[i];
      const z = cells.zs[i];

      let h =
        Math.sin(x * 0.55 + time * 0.9) * 0.35 +
        Math.cos(z * 0.7 - time * 0.7) * 0.3 +
        Math.sin((x + z) * 0.35 + time * 0.5) * 0.25;

      // Cursor lifts a smooth dome under it.
      const dp = (x - px) * (x - px) + (z - pz) * (z - pz);
      h += Math.exp(-dp * 0.45) * 1.5;

      // Expanding rings from clicks and raindrops.
      for (const r of ripples.current) {
        const d = Math.sqrt((x - r.x) * (x - r.x) + (z - r.z) * (z - r.z));
        const front = r.t * 3.2;
        const band = d - front;
        h += Math.exp(-band * band * 2.2) * Math.max(0, 1 - r.t / 4) * 1.1 * Math.cos(band * 3);
      }

      const height = 0.6 + Math.max(0.05, h + 0.9);
      dummy.position.set(x, height / 2 - 1, z);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, paint((h + 0.9) / 2.6, color));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <boxGeometry args={[SPACING * 0.82, 1, SPACING * 0.82]} />
      <meshStandardMaterial roughness={0.28} metalness={0.55} />
    </instancedMesh>
  );
}

/** Gentle camera sway that follows the pointer. */
function Rig() {
  useFrame((state, delta) => {
    const { x, y } = state.pointer;
    const cam = state.camera;
    cam.position.x = THREE.MathUtils.damp(cam.position.x, 3 + x * 1.2, 2, delta);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, 7.5 + y * 0.8, 2, delta);
    cam.lookAt(1.5, -1, -1);
  });
  return null;
}

export default function HeroScene() {
  const { small, reduced } = useMemo(() => {
    if (typeof window === "undefined") return { small: false, reduced: false };
    return {
      small: window.innerWidth < 768,
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  }, []);

  return (
    <Canvas
      dpr={[1, small ? 1.5 : 1.75]}
      camera={{ position: [3, 7.5, 9], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <fog attach="fog" args={["#07070a", 9, 22]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[-5, 8, 4]} intensity={2.4} />
      <pointLight position={[6, 3, 2]} intensity={60} distance={18} color="#22d3ee" />
      <pointLight position={[-6, 2, -4]} intensity={60} distance={18} color="#f472b6" />
      <MeshField cols={small ? 28 : 56} rows={small ? 22 : 34} reduced={reduced} />
      {!reduced && <Rig />}
    </Canvas>
  );
}
