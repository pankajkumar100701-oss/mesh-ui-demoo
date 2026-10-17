"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRandom } from "@/lib/random";
import { ARCS, CITIES, GATEWAYS, HUBS, LANES, isLand, type Hub, type LonLat, type Shipment } from "./geo";

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export type TrackRequest = { shipment: Shipment; seq: number };

type SceneProps = {
  /** Render loop runs only while the hero is on screen. */
  active: boolean;
  reducedMotion: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  track: TrackRequest | null;
  /** A hub or shipment panel is open (phones lift the globe above the sheet). */
  panelOpen: boolean;
};

type Quality = 0 | 1 | 2;

/** Mutable camera / globe state shared by the controller and the input handlers. */
type View = {
  yaw: number;
  pitch: number;
  vYaw: number;
  vPitch: number;
  zoom: number;
  zoomTarget: number;
  focus: { yaw: number; pitch: number } | null;
  dragging: boolean;
  lastInput: number;
  intro: number;
  shiftX: number;
  shiftY: number;
  spin: number;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const DEG = Math.PI / 180;
/** Fixed sun in world space: day on the right, the terminator and city lights on the left. */
const SUN = new THREE.Vector3(1, 0.35, 0.55).normalize();
const FOV = 35;

function toVec(lon: number, lat: number, r = 1, out = new THREE.Vector3()) {
  const la = lat * DEG;
  const lo = lon * DEG;
  return out.set(Math.cos(la) * Math.sin(lo) * r, Math.sin(la) * r, Math.cos(la) * Math.cos(lo) * r);
}

function wrapPi(a: number) {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}

const hubById = (id: string) => HUBS.find((h) => h.id === id);

function endpoint(key: string): [number, number, string] {
  const hub = hubById(key);
  if (hub) return [hub.lon, hub.lat, hub.color];
  const g = GATEWAYS.find(([name]) => name === key);
  return g ? [g[1], g[2], "#38bdf8"] : [0, 0, "#38bdf8"];
}

/** Great-circle points between two lon/lats, lifted into an arc whose height scales with distance. */
function arcPoints(a: LonLat, b: LonLat, segments = 48, lift = 1) {
  const va = toVec(a[0], a[1]);
  const vb = toVec(b[0], b[1]);
  const angle = va.angleTo(vb);
  const height = Math.min(0.42, 0.05 + angle * 0.2) * lift;
  const pts: THREE.Vector3[] = [];
  const sin = Math.sin(angle) || 1;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const wa = Math.sin((1 - t) * angle) / sin;
    const wb = Math.sin(t * angle) / sin;
    const p = new THREE.Vector3().addScaledVector(va, wa).addScaledVector(vb, wb).normalize();
    pts.push(p.multiplyScalar(1.002 + height * Math.sin(Math.PI * t)));
  }
  return { pts, angle };
}

/** Densely sampled lane polyline on the sphere surface plus cumulative length. */
function sampleLane(points: LonLat[], radius: number) {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = toVec(points[i][0], points[i][1]);
    const b = toVec(points[i + 1][0], points[i + 1][1]);
    const steps = Math.max(2, Math.ceil(a.angleTo(b) / (1.2 * DEG)));
    for (let s = 0; s < steps; s++) {
      out.push(new THREE.Vector3().lerpVectors(a, b, s / steps).normalize().multiplyScalar(radius));
    }
  }
  const last = points[points.length - 1];
  out.push(toVec(last[0], last[1], radius));
  const lengths = [0];
  for (let i = 1; i < out.length; i++) lengths.push(lengths[i - 1] + out[i].distanceTo(out[i - 1]));
  return { points: out, lengths, total: lengths[lengths.length - 1] };
}

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const oceanVertex = /* glsl */ `
  varying vec3 vObj;
  varying vec3 vWorldN;
  varying vec3 vViewN;
  varying vec3 vViewPos;
  void main() {
    vObj = position;
    vWorldN = normalize(mat3(modelMatrix) * normal);
    vViewN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const oceanFragment = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uSunView;
  varying vec3 vObj;
  varying vec3 vWorldN;
  varying vec3 vViewN;
  varying vec3 vViewPos;

  float gridLine(float v, float spacing) {
    float x = v / spacing;
    float d = abs(fract(x - 0.5) - 0.5) / max(fwidth(x), 1e-4);
    return 1.0 - min(d, 1.0);
  }

  void main() {
    vec3 n = normalize(vWorldN);
    vec3 vn = normalize(vViewN);
    vec3 v = normalize(-vViewPos);
    float sunDot = dot(n, uSun);
    float day = smoothstep(-0.18, 0.35, sunDot);

    vec3 deep = vec3(0.004, 0.012, 0.04);
    vec3 shallow = vec3(0.012, 0.05, 0.16);
    vec3 col = mix(vec3(0.002, 0.004, 0.012), mix(deep, shallow, max(sunDot, 0.0)), day);

    // Lat / long graticule every 15 degrees.
    vec3 p = normalize(vObj);
    float lat = degrees(asin(clamp(p.y, -1.0, 1.0)));
    float lon = degrees(atan(p.x, p.z));
    float grid = max(gridLine(lat, 15.0), gridLine(lon, 15.0));
    col += vec3(0.05, 0.16, 0.35) * grid * (0.18 + 0.4 * day);

    // Sun glint on the water.
    vec3 h = normalize(uSunView + v);
    float spec = pow(max(dot(vn, h), 0.0), 220.0);
    col += vec3(1.0, 0.86, 0.65) * spec * 0.45 * day;

    // Fresnel rim that meets the atmosphere shell.
    float fres = pow(1.0 - max(dot(vn, v), 0.0), 3.0);
    col += mix(vec3(0.02, 0.06, 0.18), vec3(0.18, 0.55, 1.0), day) * fres * 0.9;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const atmoVertex = /* glsl */ `
  varying vec3 vViewN;
  varying vec3 vViewPos;
  varying vec3 vWorldN;
  void main() {
    vViewN = normalize(normalMatrix * normal);
    vWorldN = normalize(mat3(modelMatrix) * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const atmoFragment = /* glsl */ `
  uniform vec3 uSun;
  uniform float uInner;
  varying vec3 vViewN;
  varying vec3 vViewPos;
  varying vec3 vWorldN;
  void main() {
    float f = dot(normalize(vViewN), normalize(-vViewPos));
    float glow = pow(clamp(-f / uInner, 0.0, 1.0), 3.2);
    float lit = smoothstep(-0.45, 0.6, dot(normalize(vWorldN), uSun));
    vec3 col = mix(vec3(0.05, 0.12, 0.45), vec3(0.25, 0.7, 1.0), lit);
    gl_FragColor = vec4(col * glow * (0.45 + 1.1 * lit), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const landVertex = /* glsl */ `
  attribute float aCity;
  attribute float aRand;
  uniform vec3 uSun;
  uniform float uSize;
  varying float vDay;
  varying float vCity;
  varying float vRand;
  varying float vFacing;
  void main() {
    vec3 n = normalize(mat3(modelMatrix) * position);
    vDay = dot(n, uSun);
    vCity = aCity;
    vRand = aRand;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 viewN = normalize(mat3(viewMatrix) * n);
    vFacing = dot(viewN, normalize(-mv.xyz));
    float limb = 0.45 + 0.55 * smoothstep(0.0, 0.45, vFacing);
    gl_PointSize = uSize * limb * (1.0 + aCity * 0.35) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const landFragment = /* glsl */ `
  uniform float uTime;
  varying float vDay;
  varying float vCity;
  varying float vRand;
  varying float vFacing;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float disc = smoothstep(0.5, 0.3, d);
    float day = smoothstep(-0.12, 0.3, vDay);
    vec3 dayCol = mix(vec3(0.03, 0.2, 0.75), vec3(0.2, 0.85, 1.0), vRand * 0.7 + 0.15);
    dayCol *= 0.3 + 0.9 * max(vDay, 0.0);
    vec3 nightCol = vec3(0.012, 0.03, 0.09);
    float flicker = 0.85 + 0.15 * sin(uTime * 1.7 + vRand * 40.0);
    vec3 city = vec3(1.0, 0.55, 0.18) * vCity * (1.0 - day) * 2.6 * flicker;
    vec3 col = mix(nightCol, dayCol, day) + city;
    float limb = smoothstep(-0.02, 0.22, vFacing);
    gl_FragColor = vec4(col, disc * limb);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const arcVertex = /* glsl */ `
  attribute float aSeed;
  attribute float aSpeed;
  attribute vec3 aColor;
  varying float vT;
  varying float vSeed;
  varying float vSpeed;
  varying vec3 vColor;
  void main() {
    vT = uv.x;
    vSeed = aSeed;
    vSpeed = aSpeed;
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const arcFragment = /* glsl */ `
  uniform float uTime;
  uniform float uDim;
  varying float vT;
  varying float vSeed;
  varying float vSpeed;
  varying vec3 vColor;
  void main() {
    float head = fract(uTime * vSpeed + vSeed) * 1.3 - 0.15;
    float d = head - vT;
    float tail = d > 0.0 ? exp(-d * 11.0) * step(d, 0.45) : 0.0;
    float spark = smoothstep(0.018, 0.0, abs(d));
    float dash = step(0.6, fract(vT * 42.0 - uTime * 0.7));
    float ends = smoothstep(0.0, 0.05, vT) * smoothstep(1.0, 0.95, vT);
    vec3 base = mix(vec3(0.15, 0.55, 1.0), vColor, 0.5);
    vec3 col = base * (0.06 + dash * 0.1) * ends * uDim;
    col += vColor * tail * 1.5 * ends;
    col += vec3(1.0) * spark * 2.6 * ends;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const routeFragment = /* glsl */ `
  uniform float uTime;
  uniform float uDraw;
  uniform float uProgress;
  varying float vT;
  void main() {
    float drawn = step(vT, uDraw);
    float done = step(vT, min(uProgress, uDraw));
    float dash = step(0.5, fract(vT * 60.0 - uTime * 1.2));
    vec3 doneCol = vec3(1.0, 0.62, 0.15) * 2.2;
    vec3 todoCol = vec3(0.3, 0.75, 1.0) * (0.25 + dash * 0.55);
    float pulse = smoothstep(0.06, 0.0, abs(fract(uTime * 0.45) * uProgress - vT)) * done;
    vec3 col = mix(todoCol, doneCol, done) + vec3(1.0, 0.9, 0.7) * pulse * 2.0;
    gl_FragColor = vec4(col * drawn, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const pointVertex = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uScale;
  varying float vTw;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vTw = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase) + aPhase * 30.0);
    gl_PointSize = aSize * uScale;
    gl_Position = projectionMatrix * mv;
  }
`;

const pointFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vTw;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor * a * vTw, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const beamVertex = /* glsl */ `
  varying float vY;
  void main() {
    vY = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vY;
  void main() {
    float a = pow(1.0 - vY, 2.0) * uIntensity;
    gl_FragColor = vec4(uColor * a, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ */
/* Backdrop                                                            */
/* ------------------------------------------------------------------ */

function Stars({ count }: { count: number }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const rand = createRandom(7);
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(40 + rand() * 20);
      pos.set([v.x, v.y, v.z], i * 3);
      size[i] = 0.6 + Math.pow(rand(), 6) * 3.2;
      phase[i] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    return g;
  }, [count]);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uScale: { value: 1 }, uColor: { value: new THREE.Color("#b9d7ff") } }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((state, delta) => {
    const m = material.current;
    if (!m) return;
    m.uniforms.uTime.value += delta;
    m.uniforms.uScale.value = state.viewport.dpr * 1.6;
  });
  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        vertexShader={pointVertex}
        fragmentShader={pointFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/* Globe layers                                                        */
/* ------------------------------------------------------------------ */

function Ocean() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uSun: { value: SUN.clone() }, uSunView: { value: new THREE.Vector3() } }), []);
  useFrame(({ camera }) => {
    const m = material.current;
    if (!m) return;
    (m.uniforms.uSunView.value as THREE.Vector3).copy(SUN).transformDirection(camera.matrixWorldInverse);
  });
  return (
    <mesh renderOrder={0}>
      <sphereGeometry args={[1, 96, 64]} />
      <shaderMaterial
        ref={material}
        vertexShader={oceanVertex}
        fragmentShader={oceanFragment}
        uniforms={uniforms}
      />
    </mesh>
  );
}

function Atmosphere() {
  const scale = 1.16;
  const uniforms = useMemo(
    () => ({ uSun: { value: SUN.clone() }, uInner: { value: Math.sqrt(1 - 1 / (scale * scale)) } }),
    [],
  );
  return (
    <mesh scale={scale} renderOrder={-1}>
      <sphereGeometry args={[1, 64, 48]} />
      <shaderMaterial
        vertexShader={atmoVertex}
        fragmentShader={atmoFragment}
        uniforms={uniforms}
        side={THREE.BackSide}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/** Fibonacci-sphere dots kept where the inline coastline polygons say there is land. */
function LandDots({ count }: { count: number }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const { geometry, spacing } = useMemo(() => {
    const rand = createRandom(42);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const pos: number[] = [];
    const city: number[] = [];
    const rnd: number[] = [];
    const cityVecs = CITIES.map(([lon, lat, w]) => ({ v: toVec(lon, lat), w }));
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const y = 1 - ((i + 0.5) / count) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      p.set(Math.cos(th) * r, y, Math.sin(th) * r);
      const lat = Math.asin(p.y) / DEG;
      const lon = Math.atan2(p.x, p.z) / DEG;
      if (!isLand(lon, lat)) continue;
      let light = 0;
      for (const c of cityVecs) {
        const d = p.angleTo(c.v);
        if (d < 0.12) light += c.w * Math.exp(-(d * d) / 0.0016);
      }
      const rr = rand();
      if (lat > -40 && lat < 62 && rr < 0.07) light += 0.18 + rand() * 0.2;
      pos.push(p.x * 1.003, p.y * 1.003, p.z * 1.003);
      city.push(Math.min(1, light));
      rnd.push(rr);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aCity", new THREE.Float32BufferAttribute(city, 1));
    g.setAttribute("aRand", new THREE.Float32BufferAttribute(rnd, 1));
    return { geometry: g, spacing: Math.sqrt((4 * Math.PI) / count) };
  }, [count]);
  const uniforms = useMemo(() => ({ uSun: { value: SUN.clone() }, uSize: { value: 10 }, uTime: { value: 0 } }), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((state, delta) => {
    const m = material.current;
    if (!m) return;
    // Dot diameter ≈ 72% of the grid spacing, in device pixels.
    const px = (state.size.height * state.viewport.dpr) / 2 / Math.tan((FOV / 2) * DEG);
    m.uniforms.uSize.value = spacing * 0.72 * px;
    m.uniforms.uTime.value += delta;
  });
  return (
    <points geometry={geometry} renderOrder={1}>
      <shaderMaterial
        ref={material}
        vertexShader={landVertex}
        fragmentShader={landFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </points>
  );
}

/** Every air-freight route as one merged tube mesh with a comet running along each. */
function Arcs({ speed }: { speed: number }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const rand = createRandom(11);
    const parts = ARCS.map(([from, to]) => {
      const a = endpoint(from);
      const b = endpoint(to);
      const { pts, angle } = arcPoints([a[0], a[1]], [b[0], b[1]]);
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.0032, 5, false);
      const n = g.attributes.position.count;
      const seed = rand();
      const spd = (0.08 + rand() * 0.06) / Math.max(0.6, angle);
      const col = new THREE.Color(hubById(from) ? a[2] : b[2]);
      g.setAttribute("aSeed", new THREE.Float32BufferAttribute(new Array(n).fill(seed), 1));
      g.setAttribute("aSpeed", new THREE.Float32BufferAttribute(new Array(n).fill(spd), 1));
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) colors.set([col.r, col.g, col.b], i * 3);
      g.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
      g.deleteAttribute("normal");
      return g;
    });
    const merged = mergeGeometries(parts) ?? new THREE.BufferGeometry();
    parts.forEach((p) => p.dispose());
    return merged;
  }, []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uDim: { value: 1 } }), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    const m = material.current;
    if (!m) return;
    m.uniforms.uTime.value += delta * speed;
  });
  return (
    <mesh geometry={geometry} renderOrder={2}>
      <shaderMaterial
        ref={material}
        vertexShader={arcVertex}
        fragmentShader={arcFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

const SHIPS_PER_LANE = 7;

/** Dotted sea lanes and instanced container ships sailing along them. */
function Shipping({ speed }: { speed: number }) {
  const ships = useRef<THREE.InstancedMesh>(null);
  const glows = useRef<THREE.InstancedMesh>(null);
  const lanes = useMemo(() => LANES.map((l) => sampleLane(l, 1.004)), []);
  const fleet = useMemo(() => {
    const rand = createRandom(23);
    return lanes.flatMap((lane, li) =>
      Array.from({ length: SHIPS_PER_LANE }, (_, k) => ({
        lane: li,
        offset: (k / SHIPS_PER_LANE + rand() * 0.08) * lane.total,
        speed: 0.012 + rand() * 0.008,
        dir: k % 2 === 0 ? 1 : -1,
      })),
    );
  }, [lanes]);
  const laneGeometry = useMemo(() => {
    const pos: number[] = [];
    for (const lane of lanes) {
      // A dot every ~0.6 degrees along the lane.
      const step = 0.011;
      for (let s = 0; s < lane.total; s += step) {
        const p = pointOnLane(lane, s, new THREE.Vector3(), null);
        pos.push(p.x, p.y, p.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [lanes]);
  const hull = useMemo(() => {
    const g = new THREE.BoxGeometry(0.0038, 0.0024, 0.0135);
    g.translate(0, 0.001, 0);
    return g;
  }, []);
  const tmp = useMemo(
    () => ({ p: new THREE.Vector3(), f: new THREE.Vector3(), up: new THREE.Vector3(), r: new THREE.Vector3(), m: new THREE.Matrix4(), s: new THREE.Vector3(1, 1, 1) }),
    [],
  );
  const time = useRef(0);
  useEffect(
    () => () => {
      laneGeometry.dispose();
      hull.dispose();
    },
    [laneGeometry, hull],
  );

  useFrame((_, delta) => {
    const mesh = ships.current;
    const glow = glows.current;
    if (!mesh || !glow) return;
    time.current += delta * speed;
    fleet.forEach((ship, i) => {
      const lane = lanes[ship.lane];
      let s = (ship.offset + ship.dir * time.current * ship.speed) % lane.total;
      if (s < 0) s += lane.total;
      pointOnLane(lane, s, tmp.p, tmp.f);
      if (ship.dir < 0) tmp.f.negate();
      tmp.up.copy(tmp.p).normalize();
      tmp.r.crossVectors(tmp.up, tmp.f).normalize();
      tmp.f.crossVectors(tmp.r, tmp.up).normalize();
      tmp.m.makeBasis(tmp.r, tmp.up, tmp.f).setPosition(tmp.p);
      mesh.setMatrixAt(i, tmp.m);
      tmp.m.makeTranslation(tmp.p.x * 1.002, tmp.p.y * 1.002, tmp.p.z * 1.002);
      glow.setMatrixAt(i, tmp.m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <points geometry={laneGeometry} renderOrder={1}>
        <pointsMaterial color="#1d6fd8" size={1.6} sizeAttenuation={false} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
      </points>
      <instancedMesh ref={ships} args={[hull, undefined, fleet.length]} frustumCulled={false}>
        <meshBasicMaterial color={[2.2, 1.35, 0.45]} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={glows} args={[undefined, undefined, fleet.length]} frustumCulled={false} renderOrder={3}>
        <sphereGeometry args={[0.0065, 10, 8]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function pointOnLane(
  lane: ReturnType<typeof sampleLane>,
  s: number,
  out: THREE.Vector3,
  forward: THREE.Vector3 | null,
) {
  const { lengths, points } = lane;
  let lo = 0;
  let hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] <= s) lo = mid;
    else hi = mid;
  }
  const seg = lengths[hi] - lengths[lo] || 1;
  out.lerpVectors(points[lo], points[hi], (s - lengths[lo]) / seg);
  if (forward) forward.subVectors(points[hi], points[lo]).normalize();
  return out;
}

/** Glowing beam, pulse ring and core for each hub. */
function HubMarkers({ selected }: { selected: string | null }) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const beams = useRef<(THREE.ShaderMaterial | null)[]>([]);
  const items = useMemo(
    () =>
      HUBS.map((hub) => {
        const pos = toVec(hub.lon, hub.lat, 1.003);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
        return {
          hub,
          pos,
          quat,
          color: new THREE.Color(hub.color),
          uniforms: { uColor: { value: new THREE.Color(hub.color).multiplyScalar(1.6) }, uIntensity: { value: 0.8 } },
        };
      }),
    [],
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    items.forEach((item, i) => {
      const active = item.hub.id === selected;
      const g = groups.current[i];
      if (g) {
        const target = active ? 1.6 : 1;
        const s = THREE.MathUtils.lerp(g.scale.x, target, 0.1);
        g.scale.setScalar(s);
      }
      const ring = rings.current[i];
      if (ring) {
        const k = (t * 0.6 + i * 0.17) % 1;
        ring.scale.setScalar(0.6 + k * 2.2);
        (ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (active ? 0.95 : 0.6);
      }
      const beam = beams.current[i];
      if (beam) beam.uniforms.uIntensity.value = active ? 1.4 + Math.sin(t * 4) * 0.2 : 0.75;
    });
  });
  return (
    <group>
      {items.map((item, i) => (
        <group
          key={item.hub.id}
          position={item.pos}
          quaternion={item.quat}
          ref={(el) => {
            groups.current[i] = el;
          }}
        >
          <mesh position={[0, 0.07, 0]} renderOrder={4}>
            <cylinderGeometry args={[0.0025, 0.006, 0.14, 8, 1, true]} />
            <shaderMaterial
              ref={(el) => {
                beams.current[i] = el;
              }}
              vertexShader={beamVertex}
              fragmentShader={beamFragment}
              uniforms={item.uniforms}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={4}
            ref={(el) => {
              rings.current[i] = el;
            }}
          >
            <ringGeometry args={[0.012, 0.016, 40]} />
            <meshBasicMaterial color={item.color} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh renderOrder={4}>
            <sphereGeometry args={[0.009, 14, 10]} />
            <meshBasicMaterial color={item.color.clone().multiplyScalar(2.2)} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** The tracked shipment: drawn on in amber up to its current position, dashed beyond. */
function TrackedRoute({ track, reducedMotion }: { track: TrackRequest; reducedMotion: boolean }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const marker = useRef<THREE.Group>(null);
  const draw = useRef(0);
  const { geometry, curve } = useMemo(() => {
    const a = hubById(track.shipment.from) as Hub;
    const b = hubById(track.shipment.to) as Hub;
    const { pts } = arcPoints([a.lon, a.lat], [b.lon, b.lat], 96, track.shipment.mode === "Air" ? 1.15 : 0.55);
    const c = new THREE.CatmullRomCurve3(pts);
    return { geometry: new THREE.TubeGeometry(c, 160, 0.0055, 6, false), curve: c };
  }, [track]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uDraw: { value: 0 }, uProgress: { value: 0 } }), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    draw.current = reducedMotion ? 1 : 0;
    return () => geometry.dispose();
  }, [geometry, reducedMotion]);
  useFrame((state, delta) => {
    const m = material.current;
    if (!m) return;
    draw.current = Math.min(1, draw.current + delta / 2.2);
    const e = 1 - Math.pow(1 - draw.current, 3);
    const progress = track.shipment.progress;
    m.uniforms.uTime.value += delta;
    m.uniforms.uDraw.value = e;
    m.uniforms.uProgress.value = progress;
    const g = marker.current;
    if (g) {
      curve.getPointAt(Math.min(e, progress), tmp);
      g.position.copy(tmp);
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 5) * 0.18;
      g.scale.setScalar(pulse);
    }
  });
  return (
    <group>
      <mesh geometry={geometry} renderOrder={5}>
        <shaderMaterial
          ref={material}
          vertexShader={arcVertex}
          fragmentShader={routeFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <group ref={marker}>
        <mesh renderOrder={6}>
          <sphereGeometry args={[0.014, 16, 12]} />
          <meshBasicMaterial color={[3, 2, 0.8]} toneMapped={false} />
        </mesh>
        <mesh renderOrder={6}>
          <sphereGeometry args={[0.032, 16, 12]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.28} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Controller: input, inertia, fly-to, camera framing, hub labels      */
/* ------------------------------------------------------------------ */

function Controller({
  viewRef,
  globeRef,
  reducedMotion,
  selected,
  track,
  panelOpen,
  onSelect,
  buttonsRef,
}: {
  viewRef: RefObject<View>;
  globeRef: RefObject<THREE.Group | null>;
  reducedMotion: boolean;
  selected: string | null;
  track: TrackRequest | null;
  panelOpen: boolean;
  onSelect: (id: string | null) => void;
  buttonsRef: RefObject<Record<string, HTMLButtonElement | null>>;
}) {
  const get = useThree((s) => s.get);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const hubVecs = useMemo(() => HUBS.map((h) => toVec(h.lon, h.lat, 1.003)), []);
  const tmp = useMemo(() => ({ w: new THREE.Vector3(), n: new THREE.Vector3(), c: new THREE.Vector3(), o: new THREE.Vector3() }), []);

  // Fly to the selected hub or frame the tracked route.
  useEffect(() => {
    const v = viewRef.current;
    if (selected) {
      const hub = hubById(selected);
      if (hub) {
        v.focus = { yaw: -hub.lon * DEG, pitch: hub.lat * DEG };
        v.zoomTarget = 0.74;
      }
    } else if (track) {
      const a = hubById(track.shipment.from) as Hub;
      const b = hubById(track.shipment.to) as Hub;
      const va = toVec(a.lon, a.lat);
      const vb = toVec(b.lon, b.lat);
      const angle = va.angleTo(vb);
      const mid = va.add(vb);
      if (mid.lengthSq() < 1e-4) mid.set(0, 0.3, 1);
      mid.normalize();
      v.focus = { yaw: -Math.atan2(mid.x, mid.z), pitch: THREE.MathUtils.clamp(Math.asin(mid.y), -0.9, 1.0) };
      v.zoomTarget = 0.82 + (angle / Math.PI) * 0.45;
    } else {
      v.focus = null;
      v.zoomTarget = 1;
    }
  }, [selected, track, viewRef]);

  // Drag to spin with inertia. One-finger vertical swipes still scroll the page on phones.
  useEffect(() => {
    const el = get().gl.domElement;
    el.style.touchAction = "pan-y";
    el.style.cursor = "grab";
    let last: { x: number; y: number; t: number } | null = null;
    let travel = 0;
    let pointerId = -1;
    const rate = () => (1.8 / Math.max(320, el.clientHeight)) * viewRef.current.zoom;

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const v = viewRef.current;
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      travel = 0;
      pointerId = e.pointerId;
      v.dragging = true;
      v.vYaw = 0;
      v.vPitch = 0;
      v.lastInput = performance.now();
      el.style.cursor = "grabbing";
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
    };
    const move = (e: PointerEvent) => {
      if (!last || e.pointerId !== pointerId) return;
      const v = viewRef.current;
      const now = performance.now();
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      const dt = Math.max(8, now - last.t) / 1000;
      travel += Math.abs(dx) + Math.abs(dy);
      if (travel > 4) v.focus = null;
      const k = rate();
      v.yaw += dx * k;
      v.pitch += dy * k;
      v.vYaw = THREE.MathUtils.lerp(v.vYaw, (dx * k) / dt, 0.5);
      v.vPitch = THREE.MathUtils.lerp(v.vPitch, (dy * k) / dt, 0.5);
      v.lastInput = now;
      last = { x: e.clientX, y: e.clientY, t: now };
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const v = viewRef.current;
      v.dragging = false;
      v.lastInput = performance.now();
      if (last && performance.now() - last.t > 90) {
        v.vYaw = 0;
        v.vPitch = 0;
      }
      if (travel < 5 && e.type === "pointerup") onSelectRef.current(null);
      last = null;
      pointerId = -1;
      el.style.cursor = "grab";
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [get, viewRef]);

  useFrame((state, delta) => {
    const v = viewRef.current;
    const g = globeRef.current;
    if (!g) return;
    const dt = Math.min(delta, 0.05);
    const cam = state.camera as THREE.PerspectiveCamera;
    const { width: w, height: h } = state.size;
    const aspect = w / h;
    const portrait = aspect < 0.85;

    // Intro: fall in from far away while spinning to rest.
    if (v.intro < 1) v.intro = reducedMotion ? 1 : Math.min(1, v.intro + dt / 2.8);
    const e = 1 - Math.pow(1 - v.intro, 3);

    if (v.focus && !v.dragging) {
      const k = 1 - Math.exp(-dt * (reducedMotion ? 8 : 2.4));
      v.yaw += wrapPi(v.focus.yaw - v.yaw) * k;
      v.pitch += (v.focus.pitch - v.pitch) * k;
      v.vYaw = 0;
      v.vPitch = 0;
    } else if (!v.dragging) {
      v.yaw += v.vYaw * dt;
      v.pitch += v.vPitch * dt;
      const decay = Math.exp(-dt * 2.4);
      v.vYaw *= decay;
      v.vPitch *= decay;
      const idle = (performance.now() - v.lastInput) / 1000;
      const auto = !reducedMotion && !selected && !track ? THREE.MathUtils.smoothstep(idle, 2, 5) : 0;
      v.spin = THREE.MathUtils.lerp(v.spin, auto * 0.07, 0.05);
      v.yaw += v.spin * dt;
      // Ease back towards a pleasant northern tilt when idle.
      if (auto > 0) v.pitch += (0.32 - v.pitch) * (1 - Math.exp(-dt * 0.4)) * auto;
    }
    v.pitch = THREE.MathUtils.clamp(v.pitch, -1.15, 1.25);
    v.zoom += (v.zoomTarget - v.zoom) * (1 - Math.exp(-dt * (reducedMotion ? 8 : 2.2)));

    g.rotation.set(v.pitch, v.yaw - (1 - e) * 1.4, 0);

    // Frame the globe: fit it to the short side, nudge it right on wide screens, down on phones.
    const tanHalf = Math.tan((FOV / 2) * DEG);
    const fill = portrait ? 0.86 : aspect < 1.15 ? 0.66 : 0.78;
    const base = 1 / (fill * tanHalf * Math.min(aspect, 1));
    const dist = base * v.zoom * (1 + (1 - e) * 1.8);
    cam.position.set(0, 0, dist);
    cam.lookAt(0, 0, 0);
    const targetX = !portrait && aspect >= 1.15 ? (panelOpen ? w * 0.04 : w * 0.19) : 0;
    const targetY = portrait ? (panelOpen ? -h * 0.13 : h * 0.16) : aspect < 1.15 ? h * 0.1 : 0;
    const ks = 1 - Math.exp(-dt * 3);
    v.shiftX += (targetX - v.shiftX) * ks;
    v.shiftY += (targetY - v.shiftY) * ks;
    cam.setViewOffset(w, h, -v.shiftX, -v.shiftY, w, h);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    g.updateMatrixWorld();

    // Pin the DOM hub buttons to their spots on the globe.
    tmp.c.setFromMatrixPosition(g.matrixWorld);
    HUBS.forEach((hub, i) => {
      const btn = buttonsRef.current[hub.id];
      if (!btn) return;
      tmp.w.copy(hubVecs[i]).applyMatrix4(g.matrixWorld);
      tmp.n.copy(tmp.w).sub(tmp.c).normalize();
      tmp.o.copy(cam.position).sub(tmp.w).normalize();
      const facing = tmp.n.dot(tmp.o);
      tmp.w.project(cam);
      const x = (tmp.w.x * 0.5 + 0.5) * w;
      const y = (-tmp.w.y * 0.5 + 0.5) * h;
      const vis = THREE.MathUtils.smoothstep(facing, 0.12, 0.35) * e;
      btn.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      btn.style.opacity = vis.toFixed(3);
      btn.style.visibility = vis < 0.05 ? "hidden" : "visible";
    });
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function initialQuality(): Quality {
  if (typeof window === "undefined") return 1;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const cores = navigator.hardwareConcurrency || 4;
  if (small || cores <= 4) return 1;
  return 2;
}

function Effects({ quality }: { quality: Quality }) {
  if (quality === 0) return null;
  return (
    <EffectComposer multisampling={quality === 2 ? 4 : 0} enableNormalPass={false}>
      <Bloom mipmapBlur intensity={quality === 2 ? 1.05 : 0.9} luminanceThreshold={0.72} luminanceSmoothing={0.2} radius={0.72} />
      <Vignette offset={0.3} darkness={0.7} />
    </EffectComposer>
  );
}

export default function Scene({ active, reducedMotion, selected, onSelect, track, panelOpen }: SceneProps) {
  const [quality, setQuality] = useState<Quality>(initialQuality);
  // Dot density is fixed at mount so a quality drop never rebuilds the continents.
  const [dots] = useState(() => (initialQuality() === 2 ? 46000 : 30000));
  const viewRef = useRef<View>({
    yaw: -22 * DEG,
    pitch: 0.36,
    vYaw: 0,
    vPitch: 0,
    zoom: 1,
    zoomTarget: 1,
    focus: null,
    dragging: false,
    lastInput: 0,
    intro: 0,
    shiftX: 0,
    shiftY: 0,
    spin: 0,
  });
  const globeRef = useRef<THREE.Group>(null);
  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const flow = reducedMotion ? 0.35 : 1;
  const dpr: number | [number, number] = quality === 2 ? [1, 1.75] : quality === 1 ? [1, 1.35] : 1;

  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={dpr}
        flat
        frameloop={active ? "always" : "never"}
        camera={{ position: [0, 0, 4], fov: FOV, near: 0.05, far: 200 }}
        gl={{ antialias: quality === 2, powerPreference: "high-performance", stencil: false }}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color("#02040b");
        }}
      >
        <PerformanceMonitor
          flipflops={3}
          onDecline={() => setQuality((q) => (q > 0 ? ((q - 1) as Quality) : q))}
          onFallback={() => setQuality(0)}
        />
        <Stars count={quality === 2 ? 2200 : 1200} />
        <Atmosphere />
        <group ref={globeRef}>
          <Ocean />
          <LandDots count={dots} />
          <Shipping speed={flow} />
          <Arcs speed={flow} />
          <HubMarkers selected={selected} />
          {track && <TrackedRoute key={track.seq} track={track} reducedMotion={reducedMotion} />}
        </group>
        <Controller
          viewRef={viewRef}
          globeRef={globeRef}
          reducedMotion={reducedMotion}
          selected={selected}
          track={track}
          panelOpen={panelOpen}
          onSelect={onSelect}
          buttonsRef={buttonsRef}
        />
        <Effects quality={quality} />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {HUBS.map((hub) => {
          const isActive = hub.id === selected;
          return (
            <button
              key={hub.id}
              ref={(el) => {
                buttonsRef.current[hub.id] = el;
              }}
              type="button"
              onClick={() => onSelect(isActive ? null : hub.id)}
              aria-label={`Fly to the ${hub.name} hub`}
              aria-pressed={isActive}
              style={{ opacity: 0, visibility: "hidden", transform: "translate3d(-200px,-200px,0)" }}
              className="group pointer-events-auto absolute left-0 top-0 flex size-11 cursor-pointer items-center justify-center"
            >
              <span
                className="absolute size-6 animate-ping rounded-full opacity-40 motion-reduce:animate-none"
                style={{ background: hub.color, animationDuration: "2.6s" }}
              />
              <span
                className={`relative size-3.5 rounded-full border-2 border-white transition-transform duration-300 group-hover:scale-125 ${isActive ? "scale-125" : ""}`}
                style={{ background: hub.color, boxShadow: `0 0 16px ${hub.color}` }}
              />
              <span
                className={`pointer-events-none absolute left-full top-1/2 -ml-1 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#030712]/80 px-2 py-0.5 font-(family-name:--font-atlas-mono) text-[10px] uppercase tracking-wider text-white/90 backdrop-blur transition-opacity duration-300 ${
                  isActive ? "opacity-100" : "opacity-0 sm:opacity-80 sm:group-hover:opacity-100"
                }`}
              >
                {hub.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
