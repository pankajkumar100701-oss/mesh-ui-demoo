import * as THREE from "three";

/** World layout. The galaxy sits at the origin, the set-pieces trail off to one side of it. */
export const GALAXY_RADIUS = 26;
export const GALAXY_TILT: [number, number, number] = [0.42, 0, 0.16];
export const PLANET_POS = new THREE.Vector3(48, 5, 30);
export const PLANET_RADIUS = 6;
export const NEBULA_POS = new THREE.Vector3(74, 4, -18);
export const BLACK_HOLE_POS = new THREE.Vector3(58, 10, -118);

/**
 * One camera keyframe per content chapter. `offset` slides the subject across the
 * frame (fraction of viewport, +x = right, +y = down) so it frames the copy instead
 * of sitting under it. `mOffset` is used on portrait screens.
 */
export type Shot = {
  id: string;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  offset: [number, number];
  mOffset: [number, number];
};

export const shots: Shot[] = [
  {
    id: "top",
    pos: new THREE.Vector3(-6, 38, 58),
    look: new THREE.Vector3(0, -1, 0),
    offset: [0.2, 0.02],
    mOffset: [0, 0.2],
  },
  {
    id: "destinations",
    pos: new THREE.Vector3(70, 13, 62),
    look: PLANET_POS.clone().add(new THREE.Vector3(0, 0, 0)),
    offset: [0.26, -0.18],
    mOffset: [0.42, -0.36],
  },
  {
    id: "voyage",
    pos: new THREE.Vector3(66, 6, 4),
    look: NEBULA_POS.clone().add(new THREE.Vector3(2, -1, -10)),
    offset: [-0.24, 0],
    mOffset: [0, -0.1],
  },
  {
    id: "pricing",
    pos: new THREE.Vector3(70, 7, -40),
    look: BLACK_HOLE_POS.clone(),
    offset: [0, -0.3],
    mOffset: [0, -0.32],
  },
  {
    id: "stories",
    pos: new THREE.Vector3(52, 13, -82),
    look: BLACK_HOLE_POS.clone(),
    offset: [0.22, 0],
    mOffset: [0, -0.2],
  },
  {
    id: "book",
    pos: new THREE.Vector3(54, 15, -72),
    look: BLACK_HOLE_POS.clone(),
    offset: [0, -0.27],
    mOffset: [0, -0.22],
  },
];

export const chapters = [
  { id: "top", label: "Departure" },
  { id: "destinations", label: "Ringworld" },
  { id: "voyage", label: "Nebula" },
  { id: "pricing", label: "Deep space" },
  { id: "stories", label: "Approach" },
  { id: "book", label: "Event horizon" },
];

/** Mutable flight state shared between the camera rig and the scene objects. */
export const flight = {
  /** 0 → 1 while the warp intro plays. */
  intro: 0,
  /** Warp speed, 1 at launch, 0 when cruising. */
  warp: 1,
  /** Continuous chapter index (0 … shots.length - 1). */
  chapter: 0,
};
