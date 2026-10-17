export type Site = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** Two colours used for the card gradient on the MeshUI home page. */
  colors: [string, string];
  tags: string[];
  /** Source files (relative to the project root) shown on the code page. */
  files: string[];
};

export const sites: Site[] = [
  {
    slug: "nebula",
    name: "Nebula Expeditions",
    tagline: "Scroll-driven flight through a living galaxy",
    description:
      "A space-tourism landing page that opens with a hyperspace warp into a shader spiral galaxy, then flies you past a ringed gas giant, through a nebula and up to a ray-marched black hole as you scroll.",
    colors: ["#7c3aed", "#06b6d4"],
    tags: ["Warp intro", "Ray-marched black hole", "Scroll camera"],
    files: [
      "components/sites/nebula/NebulaSite.tsx",
      "components/sites/nebula/Scene.tsx",
      "components/sites/nebula/Galaxy.tsx",
      "components/sites/nebula/Warp.tsx",
      "components/sites/nebula/RingedPlanet.tsx",
      "components/sites/nebula/NebulaCloud.tsx",
      "components/sites/nebula/BlackHole.tsx",
      "components/sites/nebula/Glow.tsx",
      "components/sites/nebula/journey.ts",
      "components/sites/nebula/shaders.ts",
      "components/sites/MobileMenu.tsx",
    ],
  },
  {
    slug: "prism",
    name: "Prism Atelier",
    tagline: "Real glass, real refraction, live configurator",
    description:
      "A luxury glass-sculpture studio. A beam of light strikes a crystal knot and fans into a rainbow; scroll and it shatters into quartz shards that reassemble as a brilliant-cut gem. Plus a live configurator.",
    colors: ["#f5f5f4", "#a78bfa"],
    tags: ["Dispersion glass", "Scroll story", "Configurator"],
    files: [
      "components/sites/prism/PrismSite.tsx",
      "components/sites/prism/Scene.tsx",
      "components/sites/prism/Optics.tsx",
      "components/sites/prism/Configurator.tsx",
      "components/sites/MobileMenu.tsx",
    ],
  },
  {
    slug: "neon",
    name: "Neon Drive",
    tagline: "A synthwave racer you can actually play",
    description:
      "A retro racing-game launch page whose hero is a playable mini-game: dodge traffic, grab orbs and boost down a mirror-wet neon highway in a procedural sports car, with a 3D garage turntable below.",
    colors: ["#ec4899", "#f97316"],
    tags: ["Playable mini-game", "Reflective road", "Synthwave"],
    files: [
      "components/sites/neon/NeonSite.tsx",
      "components/sites/neon/Scene.tsx",
      "components/sites/neon/Car.tsx",
      "components/sites/neon/Garage.tsx",
      "components/sites/MobileMenu.tsx",
    ],
  },
  {
    slug: "bounce",
    name: "Bounce Candy Co.",
    tagline: "Grab it, throw it, watch it bounce",
    description:
      "A playful candy brand with a real physics engine. Giant candy-cane letters pop in, an avalanche of sweets piles onto them, and you can grab, fling and shake every one.",
    colors: ["#fb7185", "#facc15"],
    tags: ["Rapier physics", "Drag & throw", "Pastel"],
    files: [
      "components/sites/bounce/BounceSite.tsx",
      "components/sites/bounce/Scene.tsx",
      "components/sites/bounce/Letters.tsx",
      "components/sites/bounce/candies.ts",
      "components/sites/MobileMenu.tsx",
    ],
  },
  {
    slug: "isle",
    name: "Isle Retreats",
    tagline: "A floating island above a sea of clouds, from golden hour to lantern night",
    description:
      "A boutique resort site that dives through the clouds onto a living low-poly island: swaying trees, koi, a waterfall, a drifting balloon, and guided hotspot tours. Flip to night for moonlight, fireflies and rising lanterns.",
    colors: ["#f59e0b", "#8b5cf6"],
    tags: ["Cloud-dive intro", "Hotspot tour", "Day / night"],
    files: [
      "components/sites/isle/IsleSite.tsx",
      "components/sites/isle/Scene.tsx",
      "components/sites/isle/Island.tsx",
      "components/sites/isle/Sky.tsx",
      "components/sites/isle/Life.tsx",
      "components/sites/isle/shared.ts",
      "components/sites/MobileMenu.tsx",
    ],
  },
  {
    slug: "abyss",
    name: "Abyss Dive Co.",
    tagline: "Scroll down from sunlit surface to the bioluminescent deep",
    description:
      "A deep-sea expedition outfitter. Scrolling sinks the camera from shimmering caustics past kelp and whale silhouettes into the midnight zone, where jellyfish, anglerfish and plankton glow and scatter from your cursor.",
    colors: ["#0ea5e9", "#14b8a6"],
    tags: ["Scroll descent", "Bioluminescence", "Boids schooling"],
    files: [
      "components/sites/abyss/AbyssSite.tsx",
      "components/sites/abyss/Scene.tsx",
      "components/sites/abyss/Fish.tsx",
      "components/sites/abyss/Creatures.tsx",
      "components/sites/abyss/world.ts",
      "components/sites/MobileMenu.tsx",
    ],
  },
  {
    slug: "atlas",
    name: "Atlas Freight",
    tagline: "A living globe with every route in flight",
    description:
      "A global logistics company built around a procedural Earth: drag to spin, watch cargo arcs and ships trace routes in real time, click a hub to fly the camera there, and track a live shipment.",
    colors: ["#2563eb", "#22d3ee"],
    tags: ["Interactive globe", "Flight arcs", "Fly-to hubs"],
    files: [
      "components/sites/atlas/AtlasSite.tsx",
      "components/sites/atlas/Scene.tsx",
      "components/sites/atlas/geo.ts",
      "components/sites/MobileMenu.tsx",
    ],
  },
  {
    slug: "bloom",
    name: "Bloom Botanica",
    tagline: "Grow a bouquet that sways with your cursor",
    description:
      "An artisan florist where procedural flowers sprout and unfurl as you scroll, petals drift on the wind your cursor makes, and a bouquet builder lets you pick stems, colours and wrap in 3D.",
    colors: ["#f472b6", "#84cc16"],
    tags: ["Procedural flowers", "Wind field", "Bouquet builder"],
    files: [
      "components/sites/bloom/BloomSite.tsx",
      "components/sites/bloom/Scene.tsx",
      "components/sites/bloom/Field.tsx",
      "components/sites/bloom/Bouquet.tsx",
      "components/sites/bloom/flora.ts",
      "components/sites/bloom/Art.tsx",
      "components/sites/MobileMenu.tsx",
    ],
  },
  {
    slug: "pulse",
    name: "Pulse Records",
    tagline: "An audio-reactive stage you can play",
    description:
      "An electronic music label whose hero is a live synth: a Web Audio sequencer generates the beat and a 3D speaker stage, light rig and particle tunnel pulse to every kick. Toggle steps and tracks to remix it.",
    colors: ["#a855f7", "#22c55e"],
    tags: ["Web Audio synth", "Audio-reactive", "Step sequencer"],
    files: [
      "components/sites/pulse/PulseSite.tsx",
      "components/sites/pulse/Scene.tsx",
      "components/sites/pulse/audio.ts",
      "components/sites/MobileMenu.tsx",
    ],
  },
  {
    slug: "metro",
    name: "Metro Habitat",
    tagline: "A miniature city that builds itself, dawn to dusk",
    description:
      "A city-planning and architecture studio. A tilt-shift miniature city assembles block by block, traffic and trains run through it, the sun sweeps from dawn to neon dusk, and every tower opens a project card when clicked.",
    colors: ["#f97316", "#0ea5e9"],
    tags: ["Tilt-shift city", "Time of day", "Clickable buildings"],
    files: [
      "components/sites/metro/MetroSite.tsx",
      "components/sites/metro/Scene.tsx",
      "components/sites/metro/City.tsx",
      "components/sites/metro/Traffic.tsx",
      "components/sites/metro/city.ts",
      "components/sites/metro/env.ts",
      "components/sites/metro/data.ts",
      "components/sites/MobileMenu.tsx",
    ],
  },
];

export function getSite(slug: string) {
  return sites.find((s) => s.slug === slug);
}
