"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Project } from "./data";
import {
  BRIDGES_X,
  BRIDGE_TOP,
  KERB_H,
  RISE,
  RIVER,
  ROADS,
  SLAB,
  type Block,
  type CityLayout,
} from "./city";
import { ENV, U, damp, makeBuildingMaterial, setUniform, springy, type Quality } from "./env";

const O = new THREE.Object3D();
const TMP_C = new THREE.Color();
const HOVER = new THREE.Color("#ffb46b");

/* ------------------------------------------------------------------ */
/* Ground: countryside, the model board, roads, river, bridges         */
/* ------------------------------------------------------------------ */

const riverVertex = /* glsl */ `
  varying vec3 vW;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const riverFragment = /* glsl */ `
  uniform float uTime;
  uniform float uNeon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uWater;
  uniform vec3 uWaterDeep;
  uniform vec3 uHorizon;
  varying vec3 vW;
  varying vec2 vUv;

  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    // Flow runs west to east; two noise layers drift at different speeds.
    vec2 p = vW.xz * vec2(0.9, 2.2);
    float r1 = n2(p * 1.3 + vec2(uTime * 0.55, 0.0));
    float r2 = n2(p * 3.1 - vec2(uTime * 0.8, uTime * 0.1));
    float ripple = r1 * 0.6 + r2 * 0.4;
    float edge = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
    vec3 col = mix(uWater * 0.85, uWaterDeep, edge * 0.75);
    col = mix(col, uHorizon * 0.8, 0.1 + ripple * 0.1);

    // Sun glints: tiny bright specks where ripples face the sun.
    float glint = smoothstep(0.86, 0.98, r2 * r1 * 1.7) * max(uSunDir.y, 0.0);
    col += uSunColor * glint * 0.45;

    // Neon dusk: smeared reflections of the skyline in pink and cyan.
    float streak = n2(vec2(vW.x * 2.6, vW.z * 0.25 + uTime * 0.05));
    float s2 = n2(vec2(vW.x * 4.1 + 13.0, vW.z * 0.3 - uTime * 0.04));
    vec3 neon = vec3(1.0, 0.35, 0.8) * smoothstep(0.62, 0.9, streak) + vec3(0.2, 0.85, 1.0) * smoothstep(0.7, 0.95, s2);
    neon += vec3(1.0, 0.7, 0.35) * smoothstep(0.75, 0.95, n2(vec2(vW.x * 3.3 - 7.0, vW.z * 0.2)));
    col += neon * uNeon * (0.45 + ripple * 0.5) * edge;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Ground() {
  const slabMats = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ color: "#e7dfcf", roughness: 0.9 });
    const top = new THREE.MeshStandardMaterial({ color: "#a9c189", roughness: 1 });
    return [side, side, top, side, side, side];
  }, []);
  const river = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: riverVertex,
        fragmentShader: riverFragment,
        uniforms: {
          uTime: U.uTime,
          uNeon: U.uNeon,
          uSunDir: U.uSunDir,
          uSunColor: U.uSunColor,
          uWater: U.uWater,
          uWaterDeep: U.uWaterDeep,
          uHorizon: U.uHorizon,
        },
      }),
    [],
  );
  useEffect(
    () => () => {
      slabMats[0].dispose();
      slabMats[2].dispose();
      river.dispose();
    },
    [slabMats, river],
  );

  const w = SLAB.x1 - SLAB.x0;
  const d = SLAB.z1 - SLAB.z0;
  const cz = (SLAB.z0 + SLAB.z1) / 2;
  const rw = ROADS.x1 - ROADS.x0;
  const rd = ROADS.z1 - ROADS.z0;
  const riverD = RIVER.z1 - RIVER.z0;

  return (
    <group>
      {/* Countryside the model sits in; fog melts it into the horizon. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-SLAB.depth - 0.02} receiveShadow>
        <circleGeometry args={[220, 48]} />
        <meshStandardMaterial color="#aab58c" roughness={1} />
      </mesh>
      <mesh position={[0, -SLAB.depth / 2, cz]} material={slabMats} receiveShadow castShadow>
        <boxGeometry args={[w, SLAB.depth, d]} />
      </mesh>
      {/* Asphalt */}
      <mesh position={[0, 0.01, (ROADS.z0 + ROADS.z1) / 2]} receiveShadow>
        <boxGeometry args={[rw, 0.02, rd]} />
        <meshStandardMaterial color="#7c8089" roughness={0.95} />
      </mesh>
      {/* River, its stone banks and riverside promenades */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.026, RIVER.mid]} material={river}>
        <planeGeometry args={[w - 0.02, riverD, 1, 1]} />
      </mesh>
      {[RIVER.z0 - 0.2, RIVER.z1 + 0.2].map((z) => (
        <mesh key={z} position={[0, KERB_H / 2, z]} receiveShadow castShadow>
          <boxGeometry args={[w - 0.02, KERB_H, 0.4]} />
          <meshStandardMaterial color="#d9cfbd" roughness={0.9} />
        </mesh>
      ))}
      {BRIDGES_X.map((x) => (
        <Bridge key={x} x={x} />
      ))}
    </group>
  );
}

function Bridge({ x }: { x: number }) {
  const len = RIVER.z1 - RIVER.z0 + 0.9;
  return (
    <group position={[x, 0, RIVER.mid]}>
      <mesh position-y={BRIDGE_TOP - 0.05} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.1, len]} />
        <meshStandardMaterial color="#8a8e96" roughness={0.9} />
      </mesh>
      {[-0.68, 0.68].map((ox) => (
        <group key={ox} position-x={ox}>
          <mesh position-y={BRIDGE_TOP + 0.04}>
            <boxGeometry args={[0.05, 0.08, len]} />
            <meshStandardMaterial color="#efe9de" />
          </mesh>
          {/* Bowstring arch */}
          <mesh position-y={BRIDGE_TOP} rotation-y={Math.PI / 2} scale={[1, 0.32, 1]} castShadow>
            <torusGeometry args={[len / 2 - 0.25, 0.05, 6, 28, Math.PI]} />
            <meshStandardMaterial color="#f97316" roughness={0.55} />
          </mesh>
        </group>
      ))}
      {/* Piers */}
      {[-1.1, 1.1].map((z) => (
        <mesh key={z} position={[0, 0.06, z]}>
          <boxGeometry args={[1.1, 0.1, 0.25]} />
          <meshStandardMaterial color="#cfc4b2" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Block plates, park paths, dashes, lamps                             */
/* ------------------------------------------------------------------ */

const PLATE_COLORS: Record<Block["kind"], string> = {
  build: "#e4ddcf",
  featured: "#ebe4d6",
  plaza: "#f1e9da",
  park: "#8fbf6c",
};

function Plates({ blocks, built }: { blocks: Block[]; built: React.RefObject<boolean> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const paths = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  const parks = useMemo(() => blocks.filter((b) => b.kind === "park" || b.kind === "plaza"), [blocks]);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    blocks.forEach((b, i) => m.setColorAt(i, TMP_C.set(PLATE_COLORS[b.kind])));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [blocks]);

  useFrame(() => {
    const m = ref.current;
    const p = paths.current;
    if (!m || !p || built.current) return;
    blocks.forEach((b, i) => {
      const s = Math.max(springy((ENV.build - b.delay) / (RISE * 0.7)), 0.001);
      O.position.set(b.x, 0, b.z);
      O.rotation.set(0, 0, 0);
      O.scale.set(b.size, KERB_H * s, b.size);
      O.updateMatrix();
      m.setMatrixAt(i, O.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    parks.forEach((b, i) => {
      const s = THREE.MathUtils.clamp((ENV.build - b.delay - 0.4) / 0.5, 0.001, 1);
      for (let k = 0; k < 2; k++) {
        O.position.set(b.x, KERB_H, b.z);
        O.scale.set(k === 0 ? b.size * s : 0.32, 0.006, k === 0 ? 0.32 : b.size * s);
        O.updateMatrix();
        p.setMatrixAt(i * 2 + k, O.matrix);
      }
    });
    p.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={ref} args={[geometry, undefined, blocks.length]} receiveShadow frustumCulled={false}>
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={paths} args={[geometry, undefined, parks.length * 2]} receiveShadow frustumCulled={false}>
        <meshStandardMaterial color="#efe3c9" roughness={1} />
      </instancedMesh>
    </>
  );
}

function Dashes({ layout }: { layout: CityLayout }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    layout.dashes.forEach((d, i) => {
      O.position.set(d.x, 0.021, d.z);
      O.rotation.set(-Math.PI / 2, 0, d.along === "x" ? Math.PI / 2 : 0);
      O.scale.set(1, 1, 1);
      O.updateMatrix();
      m.setMatrixAt(i, O.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [layout]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, layout.dashes.length]} receiveShadow>
      <planeGeometry args={[0.05, 0.26]} />
      <meshStandardMaterial color="#f2eee4" roughness={1} />
    </instancedMesh>
  );
}

const LAMP_MAT = new THREE.MeshBasicMaterial({ color: "#ffd9a0", toneMapped: false });
const LAMP_BASE = new THREE.Color("#ffd9a0");

function Lamps({ layout }: { layout: CityLayout }) {
  const poles = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const p = poles.current;
    const h = heads.current;
    if (!p || !h) return;
    layout.lamps.forEach((l, i) => {
      O.rotation.set(0, 0, 0);
      O.scale.set(1, 1, 1);
      O.position.set(l.x, KERB_H + 0.15, l.z);
      O.updateMatrix();
      p.setMatrixAt(i, O.matrix);
      O.position.set(l.x, KERB_H + 0.31, l.z);
      O.updateMatrix();
      h.setMatrixAt(i, O.matrix);
    });
    p.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
    p.computeBoundingSphere();
    h.computeBoundingSphere();
  }, [layout]);
  useFrame(() => {
    LAMP_MAT.color.copy(LAMP_BASE).multiplyScalar(0.35 + ENV.lights * 3.2);
  });
  return (
    <>
      <instancedMesh ref={poles} args={[undefined, undefined, layout.lamps.length]}>
        <cylinderGeometry args={[0.012, 0.016, 0.3, 5]} />
        <meshStandardMaterial color="#3d4148" />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, LAMP_MAT, layout.lamps.length]}>
        <sphereGeometry args={[0.04, 6, 4]} />
      </instancedMesh>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Trees                                                               */
/* ------------------------------------------------------------------ */

function Trees({ layout, built, quality }: { layout: CityLayout; built: React.RefObject<boolean>; quality: Quality }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const crownGeo = useMemo(() => new THREE.IcosahedronGeometry(0.2, 0).translate(0, 0.3, 0), []);
  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.022, 0.03, 0.2, 5).translate(0, 0.1, 0), []);
  const { trees } = layout;

  useLayoutEffect(() => {
    const c = crowns.current;
    if (!c) return;
    trees.forEach((t, i) => c.setColorAt(i, t.tint));
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
  }, [trees]);

  useFrame(() => {
    const t = trunks.current;
    const c = crowns.current;
    if (!t || !c || built.current) return;
    trees.forEach((tree, i) => {
      const s = Math.max(springy((ENV.build - tree.delay) / RISE), 0.001) * tree.s;
      const onPlate = (Math.abs(tree.x) < 18 && tree.z > ROADS.z0 && tree.z < ROADS.z1) || Math.abs(tree.z - RIVER.mid) < 2.6;
      const y = onPlate ? KERB_H : 0;
      O.position.set(tree.x, y, tree.z);
      O.rotation.set(0, i * 1.7, 0);
      O.scale.set(s, s, s);
      O.updateMatrix();
      t.setMatrixAt(i, O.matrix);
      c.setMatrixAt(i, O.matrix);
    });
    t.instanceMatrix.needsUpdate = true;
    c.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={trunks} args={[trunkGeo, undefined, trees.length]} castShadow={quality === "high"} frustumCulled={false}>
        <meshStandardMaterial color="#7a5a40" />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[crownGeo, undefined, trees.length]} castShadow receiveShadow frustumCulled={false}>
        <meshStandardMaterial flatShading roughness={0.9} />
      </instancedMesh>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Generic buildings: one instanced mesh, springy rise, hover tint     */
/* ------------------------------------------------------------------ */

const CROWN_MAT = new THREE.MeshBasicMaterial({ toneMapped: false });

function Buildings({ layout, built }: { layout: CityLayout; built: React.RefObject<boolean> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const hovered = useRef(-1);
  const { buildings } = layout;
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  const { material } = useMemo(() => makeBuildingMaterial("#ffffff"), []);
  const crowned = useMemo(() => buildings.map((b, i) => (b.crown ? i : -1)).filter((i) => i >= 0), [buildings]);
  // Each stack (base + set-back tier) highlights as one building.
  const stacks = useMemo(() => {
    const root = buildings.map((b, i) => (b.parent >= 0 ? b.parent : i));
    return root.map((r) => root.flatMap((q, j) => (q === r ? [j] : [])));
  }, [buildings]);
  const heights = useMemo(() => new Float32Array(buildings.length), [buildings]);

  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    const m = ref.current;
    const c = crownRef.current;
    if (!m || !c) return;
    buildings.forEach((b, i) => m.setColorAt(i, b.color));
    crowned.forEach((bi, k) => c.setColorAt(k, buildings[bi].crown as THREE.Color));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
  }, [buildings, crowned]);

  useFrame(() => {
    CROWN_MAT.color.setScalar(0.55 + ENV.lights * 2.6);
    const m = ref.current;
    const c = crownRef.current;
    if (!m || !c || built.current) return;
    buildings.forEach((b, i) => {
      const s = springy((ENV.build - b.delay) / RISE);
      heights[i] = b.h * s;
      const base = b.parent >= 0 ? KERB_H + heights[b.parent] : KERB_H;
      O.position.set(b.x, base, b.z);
      O.rotation.set(0, 0, 0);
      O.scale.set(b.w, Math.max(heights[i], 0.001), b.d);
      O.updateMatrix();
      m.setMatrixAt(i, O.matrix);
    });
    crowned.forEach((bi, k) => {
      const b = buildings[bi];
      const base = b.parent >= 0 ? KERB_H + heights[b.parent] : KERB_H;
      const top = base + heights[bi];
      const on = heights[bi] > 0.2 ? 1 : 0.001;
      O.position.set(b.x, top - 0.13, b.z);
      O.scale.set((b.w + 0.03) * on, 0.045 * on, (b.d + 0.03) * on);
      O.updateMatrix();
      c.setMatrixAt(k, O.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    c.instanceMatrix.needsUpdate = true;
    // Bounds change while rising; let raycasts recompute them lazily.
    m.boundingSphere = null;
  });

  const paint = (i: number, on: boolean) => {
    const m = ref.current;
    if (!m || i < 0) return;
    for (const j of stacks[i]) m.setColorAt(j, on ? TMP_C.copy(buildings[j].color).lerp(HOVER, 0.75) : buildings[j].color);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  };

  return (
    <>
      <instancedMesh
        ref={ref}
        args={[geometry, material, buildings.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          const id = e.instanceId ?? -1;
          if (id === hovered.current) return;
          paint(hovered.current, false);
          hovered.current = id;
          paint(id, true);
        }}
        onPointerOut={() => {
          paint(hovered.current, false);
          hovered.current = -1;
        }}
      />
      <instancedMesh ref={crownRef} args={[geometry, CROWN_MAT, Math.max(crowned.length, 1)]} frustumCulled={false} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Featured towers: unique shapes, clickable                           */
/* ------------------------------------------------------------------ */

const FEATURE_COLORS: Record<Project["shape"], string> = {
  helix: "#e9eef3",
  lantern: "#d4e6ef",
  terraces: "#eadac4",
  canopy: "#d9bd94",
  spire: "#dcd7f0",
};

const PODIUM = 0.3;

function towerGeometry(p: Project) {
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) =>
    parts.push(new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y, z));
  box(3.3, PODIUM, 3.3, 0, PODIUM / 2, 0);
  switch (p.shape) {
    case "helix": {
      const n = Math.round(p.towerH / 0.365);
      for (let i = 0; i < n; i++) {
        const k = 1 - Math.pow(i / n, 3) * 0.25;
        box(1.95 * k, 0.33, 1.95 * k, 0, PODIUM + i * 0.365 + 0.165, 0, i * 0.075);
      }
      parts.push(new THREE.CylinderGeometry(0.035, 0.05, 1.1, 6).translate(0, PODIUM + n * 0.365 + 0.55, 0));
      break;
    }
    case "lantern": {
      const h = p.towerH - 0.7;
      parts.push(new THREE.CylinderGeometry(1.15, 1.25, h, 20).translate(0, PODIUM + h / 2, 0));
      parts.push(new THREE.CylinderGeometry(1.3, 1.3, 0.1, 20).translate(0, PODIUM + h, 0));
      break;
    }
    case "terraces": {
      for (let i = 0; i < 4; i++) {
        const depth = 3 - i * 0.68;
        box(3, 0.7, depth, 0, PODIUM + i * 0.7 + 0.35, 1.5 - depth / 2);
      }
      break;
    }
    case "canopy": {
      box(3, 0.95, 2.5, 0, PODIUM + 0.475, 0.1);
      box(1.7, 0.65, 1.4, -0.45, PODIUM + 0.95 + 0.325, 0.2);
      break;
    }
    case "spire": {
      const h = p.towerH - 0.9;
      parts.push(new THREE.CylinderGeometry(0.62, 1.45, h, 4, 1).rotateY(Math.PI / 4).translate(0, PODIUM + h / 2, 0));
      parts.push(new THREE.CylinderGeometry(0.03, 0.05, 1.3, 6).translate(0, PODIUM + h + 0.6, 0));
      break;
    }
  }
  // mergeGeometries needs matching attributes; strip to position/normal and drop indices.
  const clean = parts.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute("uv");
    return ng;
  });
  const merged = mergeGeometries(clean, false) ?? clean[0];
  // Non-indexed, so this gives crisp per-face normals: a faceted, model-like look.
  merged.computeVertexNormals();
  return merged;
}

function FeaturedTower({
  block,
  project,
  selected,
  onSelect,
  built,
}: {
  block: Block;
  project: Project;
  selected: boolean;
  onSelect: (id: string | null) => void;
  built: React.RefObject<boolean>;
}) {
  const group = useRef<THREE.Group>(null);
  const hovered = useRef(false);
  const geometry = useMemo(() => towerGeometry(project), [project]);
  const { material, hi } = useMemo(() => makeBuildingMaterial(FEATURE_COLORS[project.shape], project.accent), [project]);
  const glow = useMemo(
    () => new THREE.MeshStandardMaterial({ color: project.accent, emissive: project.accent, emissiveIntensity: 0.3, roughness: 0.4 }),
    [project],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      glow.dispose();
    },
    [geometry, material, glow],
  );

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const t = clock.elapsedTime;
    const target = selected ? 0.55 + Math.sin(t * 3) * 0.2 : hovered.current ? 0.55 : 0;
    const h = setUniform(hi, damp(hi.value, target, 8, dt));
    glow.setValues({ emissiveIntensity: 0.25 + ENV.lights * 3.2 + h * 1.5 });
    const g = group.current;
    if (g && !built.current) g.scale.set(1, Math.max(springy((ENV.build - block.delay - 0.5) / (RISE * 1.3)), 0.001), 1);
  });

  const H = PODIUM + project.towerH;
  return (
    <group
      ref={group}
      position={[block.x, KERB_H, block.z]}
      scale={[1, 0.001, 1]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(selected ? null : project.id);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hovered.current = true;
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        hovered.current = false;
        document.body.style.cursor = "";
      }}
    >
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
      {project.shape === "lantern" && (
        <mesh position-y={H - 0.35} material={glow} castShadow>
          <cylinderGeometry args={[0.85, 1.05, 0.6, 20]} />
        </mesh>
      )}
      {project.shape === "helix" && (
        <mesh position-y={H + 1.15} material={glow}>
          <sphereGeometry args={[0.08, 8, 6]} />
        </mesh>
      )}
      {project.shape === "spire" && (
        <mesh position-y={PODIUM + project.towerH - 0.9 + 1.28} material={glow}>
          <sphereGeometry args={[0.07, 8, 6]} />
        </mesh>
      )}
      {project.shape === "terraces" &&
        [0, 1, 2, 3].map((i) => {
          const depth = 3 - i * 0.68;
          const front = 1.5 - depth;
          return (
            <group key={i}>
              <mesh position={[0, PODIUM + (i + 1) * 0.7 + 0.03, i < 3 ? front + 0.34 : 0.5]} receiveShadow castShadow>
                <boxGeometry args={[2.85, 0.06, i < 3 ? 0.6 : 0.5]} />
                <meshStandardMaterial color="#79b05a" roughness={1} flatShading />
              </mesh>
              {i < 3 &&
                [-1, 0, 1].map((sx) => (
                  <mesh key={sx} position={[sx * 0.95, PODIUM + (i + 1) * 0.7 + 0.16, front + 0.34]} castShadow>
                    <icosahedronGeometry args={[0.12, 0]} />
                    <meshStandardMaterial color="#5f9e4f" flatShading />
                  </mesh>
                ))}
            </group>
          );
        })}
      {project.shape === "canopy" && (
        <>
          <mesh position={[0, PODIUM + 1.75, 0.05]} rotation-x={0.2} castShadow receiveShadow>
            <boxGeometry args={[3.5, 0.07, 3.1]} />
            <meshStandardMaterial color="#25355e" metalness={0.45} roughness={0.32} />
          </mesh>
          {[-1.55, 1.55].map((x) =>
            [-1.25, 1.25].map((z) => (
              <mesh key={`${x}${z}`} position={[x, PODIUM + 0.85, z]} castShadow>
                <cylinderGeometry args={[0.05, 0.05, 1.7 - z * 0.25, 6]} />
                <meshStandardMaterial color="#b98a55" />
              </mesh>
            )),
          )}
          <mesh position={[1.2, PODIUM + 1.05, 1.1]} material={glow}>
            <boxGeometry args={[0.5, 0.12, 0.04]} />
          </mesh>
        </>
      )}
    </group>
  );
}

function Fountain({ block }: { block: Block }) {
  const water = useRef<THREE.MeshStandardMaterial>(null);
  const jet = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (water.current) water.current.emissiveIntensity = 0.1 + ENV.lights * 2.2;
    if (jet.current) jet.current.scale.y = 1 + Math.sin(clock.elapsedTime * 4) * 0.12 * ENV.pace;
  });
  return (
    <group position={[block.x, KERB_H, block.z]}>
      <mesh position-y={0.05} receiveShadow castShadow>
        <cylinderGeometry args={[0.85, 0.9, 0.1, 20]} />
        <meshStandardMaterial color="#d6cbb8" />
      </mesh>
      <mesh position-y={0.101} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.75, 20]} />
        <meshStandardMaterial ref={water} color="#5cc8e0" emissive="#3ee0ff" emissiveIntensity={0.1} roughness={0.15} />
      </mesh>
      <mesh ref={jet} position-y={0.1}>
        <coneGeometry args={[0.08, 0.5, 8, 1, true]} />
        <meshStandardMaterial color="#e6fbff" transparent opacity={0.7} emissive="#7deaff" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* City                                                                */
/* ------------------------------------------------------------------ */

export function City({
  layout,
  quality,
  active,
  onSelect,
}: {
  layout: CityLayout;
  quality: Quality;
  active: string | null;
  onSelect: (id: string | null) => void;
}) {
  const built = useRef(false);
  const doneAt = useMemo(
    () => Math.max(...layout.buildings.map((b) => b.delay), ...layout.trees.map((t) => t.delay), ...layout.blocks.map((b) => b.delay + 0.5)) + RISE * 1.4,
    [layout],
  );
  // Every element has finished rising by doneAt, so its final pose is already written when updates stop.
  useFrame(() => {
    if (!built.current && ENV.build > doneAt + 0.2) built.current = true;
  });

  const featured = layout.blocks.filter((b) => b.kind === "featured" && b.project);
  const plazas = layout.blocks.filter((b) => b.kind === "plaza");

  return (
    <group>
      <Ground />
      <Plates blocks={layout.blocks} built={built} />
      <Dashes layout={layout} />
      <Lamps layout={layout} />
      <Trees layout={layout} built={built} quality={quality} />
      <Buildings layout={layout} built={built} />
      {featured.map((b) => (
        <FeaturedTower
          key={b.project!.id}
          block={b}
          project={b.project!}
          selected={active === b.project!.id}
          onSelect={onSelect}
          built={built}
        />
      ))}
      {plazas.map((b) => (
        <Fountain key={`${b.x},${b.z}`} block={b} />
      ))}
    </group>
  );
}
