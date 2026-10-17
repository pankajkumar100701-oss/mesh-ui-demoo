/* Plain data shared by the page and the 3D scene. No three.js in here, so the landing page bundle stays light. */

export type ProjectShape = "helix" | "lantern" | "terraces" | "canopy" | "spire";

export type Project = {
  id: string;
  name: string;
  kind: string;
  architect: string;
  floors: number;
  height: number;
  year: string;
  district: string;
  /** Sustainability certification shown on the card. */
  rating: string;
  /** 1 to 5 leaves. */
  score: number;
  blurb: string;
  facts: string[];
  accent: string;
  shape: ProjectShape;
  /** Block centre on the model's street grid. */
  block: [number, number];
  /** Tower height in scene units, above its podium. */
  towerH: number;
};

export const PROJECTS: Project[] = [
  {
    id: "helix",
    name: "Helix Tower",
    kind: "Mixed-use tower",
    architect: "Ira Menon",
    floors: 48,
    height: 196,
    year: "2027",
    district: "Central Business District",
    rating: "LEED Platinum",
    score: 5,
    blurb:
      "Every floor turns four degrees, so each terrace shades the one below. The twist cuts the cooling load by a third and gives every desk a corner view.",
    facts: ["Twisting floor plates", "Rainwater-fed sky gardens", "−41% cooling energy"],
    accent: "#f97316",
    shape: "helix",
    block: [0, -7.5],
    towerH: 8.4,
  },
  {
    id: "lantern",
    name: "The Lantern",
    kind: "Cultural centre",
    architect: "Tomás Aguirre",
    floors: 26,
    height: 112,
    year: "2025",
    district: "North Riverfront",
    rating: "BREEAM Outstanding",
    score: 5,
    blurb:
      "A glass drum on the river bend with a library, a black-box theatre and a rooftop lantern that turns the skyline amber after dark.",
    facts: ["Double-skin glass facade", "River-source heat pumps", "Open 7am to midnight"],
    accent: "#0ea5e9",
    shape: "lantern",
    block: [10, -2.5],
    towerH: 5.2,
  },
  {
    id: "terraces",
    name: "Riverside Terraces",
    kind: "Affordable housing",
    architect: "Noor Haddad",
    floors: 12,
    height: 41,
    year: "2026",
    district: "South Bank",
    rating: "Passivhaus Plus",
    score: 4,
    blurb:
      "Two hundred and twenty homes stepping down to the water. Every flat has a planted terrace, and the roofs grow vegetables for the ground-floor market.",
    facts: ["220 homes, 40% family sized", "Food-growing roofs", "Car-free courtyard"],
    accent: "#22c55e",
    shape: "terraces",
    block: [-5, 8.5],
    towerH: 2.9,
  },
  {
    id: "canopy",
    name: "Canopy Exchange",
    kind: "Market hall & workspace",
    architect: "Kenji Arakawa",
    floors: 6,
    height: 28,
    year: "2024",
    district: "Old Mill Quarter",
    rating: "Net-zero carbon",
    score: 4,
    blurb:
      "A timber market hall under one tilted solar roof. Stalls on the ground, studios above, and a public stair that doubles as a 400-seat amphitheatre.",
    facts: ["Mass-timber frame", "1.2 MW solar canopy", "Night market on Fridays"],
    accent: "#eab308",
    shape: "canopy",
    block: [-10, -12.5],
    towerH: 2.1,
  },
  {
    id: "spire",
    name: "Meridian Spire",
    kind: "Transit-linked offices",
    architect: "Abena Owusu",
    floors: 34,
    height: 154,
    year: "2028",
    district: "Greenline Junction",
    rating: "WELL Gold",
    score: 4,
    blurb:
      "A tapering tower built over the new Greenline station. Commuters step off the elevated train straight into a public sky lobby on level nine.",
    facts: ["Direct station access", "Tapered to cut wind load", "Bike hub for 900"],
    accent: "#a855f7",
    shape: "spire",
    block: [5, 13.5],
    towerH: 6.4,
  },
];

/** Time of day runs 0 (dawn) to 1 (neon dusk), mapped to 05:30 to 20:45. */
export function clockLabel(t: number) {
  const minutes = Math.round(330 + t * 915);
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function phaseLabel(t: number) {
  if (t < 0.12) return "Dawn";
  if (t < 0.24) return "Morning";
  if (t < 0.46) return "Midday";
  if (t < 0.66) return "Afternoon";
  if (t < 0.78) return "Golden hour";
  if (t < 0.9) return "Sunset";
  return "Neon dusk";
}

export const PHASES: { label: string; t: number }[] = [
  { label: "Dawn", t: 0.03 },
  { label: "Noon", t: 0.36 },
  { label: "Golden", t: 0.72 },
  { label: "Dusk", t: 1 },
];
