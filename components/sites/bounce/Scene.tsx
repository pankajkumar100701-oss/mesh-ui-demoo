"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import {
  BallCollider,
  CapsuleCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { createRandom } from "@/lib/random";
import { COLLIDERS, PALETTE, candyGeometry, getCandyMaterial, pickKind, type Kind } from "./candies";
import Letters, { rowSize } from "./Letters";

/* =====================================================================
   Layout: everything (camera distance, walls, floor, letters) is derived
   from the canvas size and from where the HTML headline ends, so the candy
   box always matches exactly what's on screen — at any aspect ratio.
   ===================================================================== */

const FOV = 30;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
/** Candies live in a slab -SLAB..SLAB along z; walls are fitted to the FRONT plane. */
const SLAB = 1.1;

export type Layout = ReturnType<typeof computeLayout>;

function computeLayout(width: number, height: number, copyBottom: number) {
  const phone = width < 640;
  const rows = phone ? ["BOU", "NCE"] : ["BOUNCE"];
  const row = rows.map(rowSize);
  const lettersW = Math.max(...row.map((r) => r.width));
  const lettersH = rows.length * row[0].height + (rows.length - 1) * 0.55;
  const pile = phone ? 2.1 : 2.0;
  const free = THREE.MathUtils.clamp((height - copyBottom) / height, 0.38, 0.92);
  const aspect = width / height;
  const needH = Math.max(phone ? 5.5 : 4.8, (lettersH + pile + (phone ? 1 : 1.3)) / (2 * free));
  const halfH = Math.max(needH, (lettersW / 2 + (phone ? 0.85 : 1.0)) / aspect);
  const halfW = halfH * aspect;
  const camZ = SLAB + halfH / TAN;
  // World y (front plane) of the bottom of the HTML copy.
  const copyY = halfH - (2 * halfH * copyBottom) / height;
  const top = copyY - (phone ? 0.5 : 0.8); // leave room for sweets resting on the letters
  const bottom = -halfH + pile;
  const space = top - bottom;
  const lettersY = top - lettersH / 2 - Math.max(0, space - lettersH) * 0.6;
  return { phone, rows, halfW, halfH, camZ, lettersY, lettersH };
}

/* ---------- drag state shared by candies and the pointer controller ---------- */

function createDrag() {
  let body: RapierRigidBody | null = null;
  let el: HTMLElement | null = null;
  return {
    attach(element: HTMLElement) {
      el = element;
    },
    held: () => body,
    grab(next: RapierRigidBody) {
      body = next;
      next.wakeUp();
      if (el) el.style.cursor = "grabbing";
    },
    release() {
      body = null;
      if (el) el.style.cursor = "";
    },
    hover(over: boolean) {
      if (!body && el) el.style.cursor = over ? "grab" : "";
    },
  };
}
type Drag = ReturnType<typeof createDrag>;

/* ---------- pop particles ---------- */

const POP_MAX = 220;

function createPops() {
  const pos = new Float32Array(POP_MAX * 3);
  const vel = new Float32Array(POP_MAX * 3);
  const life = new Float32Array(POP_MAX);
  const size = new Float32Array(POP_MAX);
  const colors: THREE.Color[] = Array.from({ length: POP_MAX }, () => new THREE.Color());
  let cursor = 0;
  let alive = 0;
  let budget = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const white = new THREE.Color("#ffffff");
  return {
    /** Burst of sugar sparkles. Rate limited so an avalanche doesn't flood. */
    emit(x: number, y: number, z: number, hex: string, n = 8, power = 1) {
      if (budget <= 0) return;
      budget--;
      for (let k = 0; k < n; k++) {
        const i = cursor;
        cursor = (cursor + 1) % POP_MAX;
        const a = Math.random() * Math.PI * 2;
        const sp = (2 + Math.random() * 3.5) * power;
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z + 0.3;
        vel[i * 3] = Math.cos(a) * sp;
        vel[i * 3 + 1] = Math.sin(a) * sp + 2.5;
        vel[i * 3 + 2] = (Math.random() - 0.2) * 2;
        life[i] = 0.45 + Math.random() * 0.35;
        size[i] = 0.06 + Math.random() * 0.08;
        colors[i].set(hex).lerp(white, Math.random() * 0.5);
      }
      alive = POP_MAX;
    },
    update(mesh: THREE.InstancedMesh, dt: number) {
      budget = Math.min(budget + dt * 40, 6);
      if (alive <= 0) return;
      let any = 0;
      for (let i = 0; i < POP_MAX; i++) {
        if (life[i] > 0) {
          life[i] -= dt;
          vel[i * 3 + 1] -= 14 * dt;
          pos[i * 3] += vel[i * 3] * dt;
          pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
          pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
          const k = Math.max(0, life[i]) / 0.8;
          s.setScalar(size[i] * Math.min(1, k * 2.2));
          any++;
        } else s.setScalar(0);
        p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, colors[i]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      alive = any;
      if (!any) alive = 0;
    },
  };
}
type Pops = ReturnType<typeof createPops>;

function PopMesh({ pops }: { pops: Pops }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.OctahedronGeometry(1, 0), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const c = new THREE.Color("#ffffff");
    for (let i = 0; i < POP_MAX; i++) {
      m.setMatrixAt(i, zero);
      m.setColorAt(i, c);
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);
  useFrame((_, dt) => {
    if (mesh.current) pops.update(mesh.current, Math.min(dt, 0.05));
  });
  return <instancedMesh ref={mesh} args={[geometry, material, POP_MAX]} frustumCulled={false} />;
}

/* ---------- candies ---------- */

type CandySpec = {
  id: number;
  kind: Kind;
  color: string;
  accent: string;
  scale: number;
  position: [number, number, number];
  rotation: [number, number, number];
  velocity: [number, number, number];
  spin: [number, number, number];
};

type Entry = {
  spec: CandySpec;
  body: RapierRigidBody;
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  jig: number;
  jigT: number;
  cool: number;
  age: number;
};

function makeSpecs(
  count: number,
  box: { halfW: number; halfH: number; lettersTop: number },
  initial: number,
  batchSize: number,
  calm: boolean,
) {
  const specs: CandySpec[] = [];
  const usable = Math.max(1, 2 * box.halfW - 1.4);
  const perRow = Math.max(4, Math.floor(usable / 1.05));
  for (let i = 0; i < count; i++) {
    const rand = createRandom(1000 + i * 31);
    const kind = pickKind(rand());
    const color = PALETTE[Math.floor(rand() * PALETTE.length)];
    let accent = PALETTE[Math.floor(rand() * PALETTE.length)];
    if (accent === color) accent = "#ffffff";
    const scale = (kind === "lollipop" || kind === "donut" ? 0.82 : 0.95) + rand() * 0.2;
    const inBatch = i < initial ? i : (i - initial) % batchSize;
    const row = Math.floor(inBatch / perRow);
    let position: [number, number, number];
    let velocity: [number, number, number];
    if (calm && i < initial) {
      // Reduced motion: start as a settled heap along the floor.
      const col = inBatch % perRow;
      position = [
        -box.halfW + 0.7 + (col + (row % 2) * 0.5) * (usable / perRow),
        // two rows on the floor, the rest resting on top of the letters
        row < 2 ? -box.halfH + 0.5 + row * 0.75 : box.lettersTop + 0.5 + (row - 2) * 0.8,
        (rand() - 0.5) * 1.2,
      ];
      velocity = [0, 0, 0];
    } else {
      position = [
        -box.halfW + 0.7 + rand() * usable,
        box.halfH + 1.4 + row * 1.5 + rand() * 1.2,
        (rand() - 0.5) * 1.4,
      ];
      velocity = [(rand() - 0.5) * 2.5, -5 - rand() * 4, 0];
    }
    specs.push({
      id: i,
      kind,
      color,
      accent,
      scale,
      position,
      rotation: [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI],
      velocity,
      spin: calm ? [0, 0, 0] : [(rand() - 0.5) * 8, (rand() - 0.5) * 8, (rand() - 0.5) * 8],
    });
  }
  return specs;
}

function CandyColliders({ kind, s }: { kind: Kind; s: number }) {
  return (
    <>
      {COLLIDERS[kind].map((c, i) => {
        const pos = (c.pos ?? [0, 0, 0]).map((v) => v * s) as [number, number, number];
        const common = { position: pos, restitution: 0.62, friction: 0.55 };
        switch (c.type) {
          case "ball":
            return <BallCollider key={i} args={[c.r * s]} {...common} />;
          case "capsule":
            return <CapsuleCollider key={i} args={[c.hh * s, c.r * s]} rotation={c.rot} {...common} />;
          case "cuboid":
            return (
              <CuboidCollider key={i} args={[c.he[0] * s, c.he[1] * s, c.he[2] * s]} rotation={c.rot} {...common} />
            );
          case "cylinder":
            return <CylinderCollider key={i} args={[c.hh * s, c.r * s]} rotation={c.rot} {...common} />;
        }
      })}
    </>
  );
}

function Candy({
  spec,
  material,
  register,
  drag,
}: {
  spec: CandySpec;
  material: THREE.Material;
  register: (spec: CandySpec, body: RapierRigidBody | null, mesh: THREE.Mesh | null) => void;
  drag: Drag;
}) {
  const body = useRef<RapierRigidBody>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => candyGeometry(spec.kind, spec.color, spec.accent), [spec.kind, spec.color, spec.accent]);

  useEffect(() => {
    register(spec, body.current, mesh.current);
    return () => register(spec, null, null);
  }, [register, spec]);

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!body.current || drag.held()) return;
    e.stopPropagation();
    drag.grab(body.current);
  };

  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={spec.position}
      rotation={spec.rotation}
      linearVelocity={spec.velocity}
      angularVelocity={spec.spin}
      linearDamping={0.12}
      angularDamping={0.35}
    >
      <mesh
        ref={mesh}
        geometry={geometry}
        material={material}
        scale={spec.scale}
        castShadow
        onPointerDown={onDown}
        onPointerOver={() => drag.hover(true)}
        onPointerOut={() => drag.hover(false)}
      />
      <CandyColliders kind={spec.kind} s={spec.scale} />
    </RigidBody>
  );
}

/* ---------- invisible box fitted to the visible frustum ---------- */

function Bounds({ halfW, halfH }: { halfW: number; halfH: number }) {
  const T = 1.5; // wall half-thickness: thick walls stop fast flings tunnelling
  const tall = halfH + 30;
  return (
    <RigidBody type="fixed" colliders={false} key={`${halfW.toFixed(2)}-${halfH.toFixed(2)}`}>
      <CuboidCollider args={[halfW + 4, T, SLAB + 4]} position={[0, -halfH - T, 0]} restitution={0.45} friction={0.85} />
      <CuboidCollider args={[T, tall, SLAB + 4]} position={[-halfW - T, tall - halfH - 2, 0]} restitution={0.5} />
      <CuboidCollider args={[T, tall, SLAB + 4]} position={[halfW + T, tall - halfH - 2, 0]} restitution={0.5} />
      <CuboidCollider args={[halfW + 4, tall, T]} position={[0, tall - halfH - 2, -SLAB - T]} restitution={0.4} />
      <CuboidCollider args={[halfW + 4, tall, T]} position={[0, tall - halfH - 2, SLAB + T]} restitution={0.4} />
      <CuboidCollider args={[halfW + 4, T, SLAB + 4]} position={[0, 2 * tall - halfH - 2 + T, 0]} />
    </RigidBody>
  );
}

/* ---------- pointer: drag + fling, hover pusher ---------- */

const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const hit = new THREE.Vector3();
const PARKED = { x: 0, y: -200, z: 0 };

function PointerControls({ drag }: { drag: Drag }) {
  const pusher = useRef<RapierRigidBody>(null);
  const hover = useRef({ inside: false, mouse: false });
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const el = gl.domElement;
    drag.attach(el);
    const release = () => drag.release();
    const enter = (e: PointerEvent) => {
      hover.current.inside = true;
      hover.current.mouse = e.pointerType === "mouse";
    };
    const leave = () => {
      hover.current.inside = false;
    };
    // Only while a candy is held do we stop the page from scrolling on touch.
    const touchMove = (e: TouchEvent) => {
      if (drag.held() && e.cancelable) e.preventDefault();
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointermove", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointermove", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("touchmove", touchMove);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [gl, drag]);

  useFrame((state) => {
    const held = drag.held();
    if (held) {
      const p = held.translation();
      plane.constant = -p.z;
      state.raycaster.setFromCamera(state.pointer, state.camera);
      if (state.raycaster.ray.intersectPlane(plane, hit)) {
        let vx = (hit.x - p.x) * 16;
        let vy = (hit.y - p.y) * 16;
        const speed = Math.hypot(vx, vy);
        if (speed > 32) {
          vx *= 32 / speed;
          vy *= 32 / speed;
        }
        held.setLinvel({ x: vx, y: vy, z: -p.z * 3 }, true);
        const av = held.angvel();
        held.setAngvel({ x: av.x * 0.92, y: av.y * 0.92, z: av.z * 0.92 + vx * 0.02 }, true);
      }
    }

    const body = pusher.current;
    if (!body) return;
    if (!held && hover.current.inside && hover.current.mouse) {
      plane.constant = 0;
      state.raycaster.setFromCamera(state.pointer, state.camera);
      if (state.raycaster.ray.intersectPlane(plane, hit)) {
        body.setNextKinematicTranslation({ x: hit.x, y: hit.y, z: 0 });
        return;
      }
    }
    body.setNextKinematicTranslation(PARKED);
  });

  return (
    <RigidBody ref={pusher} type="kinematicPosition" colliders={false} position={[0, -200, 0]}>
      <BallCollider args={[0.6]} />
    </RigidBody>
  );
}

/* ---------- camera: fitted distance + shake ---------- */

function CameraRig({ camZ, shake, calm }: { camZ: number; shake: number; calm: boolean }) {
  const kick = useRef(0);
  useEffect(() => {
    if (shake && !calm) kick.current = 1;
  }, [shake, calm]);
  useFrame((state, dt) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    if (cam.fov !== FOV) {
      cam.fov = FOV;
      cam.near = 1;
      cam.far = camZ + 40;
      cam.updateProjectionMatrix();
    }
    const k = kick.current;
    kick.current = Math.max(0, k - dt * 2.2);
    const t = state.clock.elapsedTime;
    cam.position.set(Math.sin(t * 47) * k * 0.25, Math.cos(t * 39) * k * 0.18, camZ);
    cam.lookAt(0, 0, 0);
    if (Math.abs(cam.far - (camZ + 40)) > 0.5) {
      cam.far = camZ + 40;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

/* ---------- the world ---------- */

type WorldProps = SceneProps & { layout: Layout; calm: boolean; lite: boolean };

function World({ layout, batches, shake, onCountChange, calm, lite }: WorldProps) {
  const material = getCandyMaterial(lite);
  const [drag] = useState(createDrag);
  const [pops] = useState(createPops);
  const entries = useRef(new Map<number, Entry>());
  const recover = useRef(0);

  // Spawn box & counts are frozen on mount so resizes don't re-spawn sweets.
  const [frozen] = useState(() => {
    const floor = 2 * layout.halfW;
    const density = layout.phone ? 6.5 : 6.2;
    const initial = Math.round(THREE.MathUtils.clamp(floor * density * (lite && !layout.phone ? 0.75 : 1), 30, layout.phone ? 50 : 110));
    const batchSize = layout.phone ? 10 : 18;
    const batches = layout.phone || lite ? 2 : 3;
    return {
      halfW: layout.halfW,
      halfH: layout.halfH,
      lettersTop: layout.lettersY + layout.lettersH / 2,
      initial, batchSize, cap: initial + batchSize * batches };
  });
  const count = Math.min(frozen.cap, frozen.initial + batches * frozen.batchSize);
  const specs = useMemo(
    () => makeSpecs(count, frozen, frozen.initial, frozen.batchSize, calm),
    [count, frozen, calm],
  );

  useEffect(() => {
    onCountChange?.(count, count >= frozen.cap);
  }, [count, frozen.cap, onCountChange]);

  const register = useMemo(
    () => (spec: CandySpec, body: RapierRigidBody | null, mesh: THREE.Mesh | null) => {
      if (body && mesh) {
        entries.current.set(spec.id, {
          spec,
          body,
          mesh,
          vx: spec.velocity[0],
          vy: spec.velocity[1],
          vz: spec.velocity[2],
          jig: 0,
          jigT: 10,
          cool: 0,
          age: 0,
        });
      } else entries.current.delete(spec.id);
    },
    [],
  );

  // "Shake it!": toss every sweet upward with a twist.
  useEffect(() => {
    if (!shake) return;
    for (const e of entries.current.values()) {
      const b = e.body;
      const m = b.mass();
      b.wakeUp();
      b.applyImpulse(
        { x: (Math.random() - 0.5) * 6 * m, y: (8 + Math.random() * 9) * m, z: (Math.random() - 0.5) * m },
        true,
      );
      b.applyTorqueImpulse(
        { x: (Math.random() - 0.5) * 0.3 * m, y: (Math.random() - 0.5) * 0.3 * m, z: (Math.random() - 0.5) * 0.3 * m },
        true,
      );
    }
  }, [shake]);

  // Impact detection by velocity change: squash & stretch + sugar pops.
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const held = drag.held();
    recover.current += dt;
    const doRecover = recover.current > 0.5;
    if (doRecover) recover.current = 0;

    for (const e of entries.current.values()) {
      const b = e.body;
      e.age += dt;
      e.cool -= dt;
      if (!b.isSleeping()) {
        const v = b.linvel();
        const dv = Math.hypot(v.x - e.vx, v.y - e.vy, v.z - e.vz);
        e.vx = v.x;
        e.vy = v.y;
        e.vz = v.z;
        if (!calm && b !== held && e.age > 0.15 && dv > 5 && e.cool <= 0) {
          e.jig = Math.min(0.32, dv * 0.025);
          e.jigT = 0;
          e.cool = 0.25;
          if (dv > 7.5) {
            const p = b.translation();
            pops.emit(p.x, p.y, p.z, e.spec.color, dv > 12 ? 10 : 6, Math.min(1.4, dv / 10));
          }
        }
        if (doRecover) {
          const p = b.translation();
          if (
            p.y < -layout.halfH - 3 ||
            Math.abs(p.x) > layout.halfW + 3 ||
            Math.abs(p.z) > SLAB + 3 ||
            p.y > layout.halfH + 45
          ) {
            b.setTranslation({ x: (Math.random() - 0.5) * layout.halfW, y: layout.halfH + 2, z: 0 }, true);
            b.setLinvel({ x: 0, y: -4, z: 0 }, true);
          }
        }
      }
      if (e.jigT < 1) {
        e.jigT += dt;
        const w = e.jig * Math.exp(-e.jigT * 7) * Math.cos(e.jigT * 32);
        const s = e.spec.scale;
        e.mesh.scale.set(s * (1 + w * 0.55), s * (1 - w), s * (1 + w * 0.55));
        if (e.jigT >= 1) e.mesh.scale.setScalar(s);
      }
    }
  });

  // Tap / click on empty space: a candy "boop" shockwave.
  const onBoop = (ev: ThreeEvent<MouseEvent>) => {
    if (calm) return;
    const { x, y } = ev.point;
    pops.emit(x, y, 0.6, PALETTE[Math.floor(Math.random() * PALETTE.length)], 14, 1.3);
    for (const e of entries.current.values()) {
      const p = e.body.translation();
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.hypot(dx, dy);
      if (d > 3.2) continue;
      const f = (1 - d / 3.2) * 9 * e.body.mass();
      const n = d || 1;
      e.body.applyImpulse({ x: (dx / n) * f, y: (dy / n) * f + f * 0.6, z: 0 }, true);
    }
  };

  const onLetterHit = useMemo(
    () => (x: number, y: number, speed: number, color: string) => {
      if (speed > 6) pops.emit(x, y, 0.4, color, 6, 0.8);
    },
    [pops],
  );

  return (
    <>
      <Bounds halfW={layout.halfW} halfH={layout.halfH} />
      <PointerControls drag={drag} />
      <Letters rows={layout.rows} centerY={layout.lettersY} calm={calm} onHit={onLetterHit} />
      {specs.map((spec) => (
        <Candy key={spec.id} spec={spec} material={material} register={register} drag={drag} />
      ))}
      <PopMesh pops={pops} />
      {/* back wall: catches soft shadows and taps */}
      <mesh position={[0, 0, -SLAB - 0.05]} receiveShadow onClick={onBoop}>
        <planeGeometry args={[layout.halfW * 2 + 6, layout.halfH * 2 + 6]} />
        <shadowMaterial transparent opacity={0.16} color="#8a2f5b" />
      </mesh>
    </>
  );
}

/* ---------- canvas ---------- */

export type SceneProps = {
  /** Extra batches dropped via "More candy". */
  batches: number;
  /** Incremented each time "Shake it!" is pressed. */
  shake: number;
  /** Pixel offset (from the top of the hero) where the HTML copy ends. */
  copyBottom: number;
  /** False while the hero is scrolled out of view: pauses render + physics. */
  active: boolean;
  onCountChange?: (count: number, full: boolean) => void;
};

function Rig(props: SceneProps & { calm: boolean; lite: boolean }) {
  const size = useThree((s) => s.size);
  const layout = useMemo(
    () => computeLayout(size.width, size.height, props.copyBottom),
    [size.width, size.height, props.copyBottom],
  );
  const { halfW, halfH, phone } = layout;
  const map = phone || props.lite ? 1024 : 2048;
  return (
    <>
      <CameraRig camZ={layout.camZ} shake={props.shake} calm={props.calm} />
      <ambientLight intensity={0.55} color="#fff3f8" />
      <directionalLight
        position={[halfW * 0.35, halfH * 1.1, 12]}
        intensity={2.1}
        color="#fffaf0"
        castShadow
        shadow-mapSize={[map, map]}
        shadow-camera-left={-halfW - 2}
        shadow-camera-right={halfW + 2}
        shadow-camera-top={halfH + 2}
        shadow-camera-bottom={-halfH - 2}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-radius={8}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <Physics gravity={[0, -20, 0]} paused={!props.active}>
        <World {...props} layout={layout} />
      </Physics>
    </>
  );
}

export default function Scene(props: SceneProps) {
  const [env] = useState(() => {
    const mq = (q: string) => typeof window !== "undefined" && window.matchMedia(q).matches;
    const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
    const small = typeof window !== "undefined" && window.innerWidth < 640;
    const weak = !!nav && ((nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4);
    return { calm: mq("(prefers-reduced-motion: reduce)"), lite: small || weak, small };
  });
  const maxDpr = env.small ? 1.5 : 1.75;
  const [dpr, setDpr] = useState(maxDpr);

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, dpr]}
      frameloop={props.active ? "always" : "never"}
      camera={{ position: [0, 0, 20], fov: FOV, near: 1, far: 80 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      style={{ touchAction: "pan-y" }}
      aria-hidden
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} color="#fff1f6" position={[0, 6, 6]} scale={[14, 3, 1]} />
        <Lightformer form="rect" intensity={2.4} color="#ffe08a" position={[-8, 1, 4]} scale={[3, 10, 1]} />
        <Lightformer form="ring" intensity={3} color="#bfe7ff" position={[7, 3, 4]} scale={4} />
        <Lightformer form="rect" intensity={1.6} color="#ffc4dd" position={[0, -6, 5]} scale={[14, 2, 1]} />
        <Lightformer form="circle" intensity={2} color="#d9ccff" position={[0, 0, -8]} scale={8} />
      </Environment>
      <Rig {...props} calm={env.calm} lite={env.lite} />
    </Canvas>
  );
}
