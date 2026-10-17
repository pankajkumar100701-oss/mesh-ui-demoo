import { createRandom } from "@/lib/random";

/**
 * Small flat-vector posies for the collection cards — drawn from the same seeded randomness as the
 * 3D meadow, so every card is unique but identical on every load (and between server and client).
 */

type FlowerKind = "rose" | "daisy" | "tulip" | "peony";

function Daisy({ x, y, r, color, rot }: { x: number; y: number; r: number; color: string; rot: number }) {
  const n = 14;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      {Array.from({ length: n }, (_, i) => (
        <ellipse
          key={i}
          cx={0}
          cy={-r * 0.55}
          rx={r * 0.16}
          ry={r * 0.5}
          fill={color}
          stroke="rgba(120,90,70,0.12)"
          strokeWidth={0.6}
          transform={`rotate(${(i / n) * 360})`}
        />
      ))}
      <circle r={r * 0.26} fill="#f2b632" />
      <circle r={r * 0.15} cx={-r * 0.05} cy={-r * 0.05} fill="#f7cf63" />
    </g>
  );
}

function Rose({ x, y, r, color, rot }: { x: number; y: number; r: number; color: string; rot: number }) {
  const layers = [
    { n: 5, d: 0.5, rx: 0.5, ry: 0.42, o: 0.95 },
    { n: 5, d: 0.3, rx: 0.4, ry: 0.32, o: 0.85 },
    { n: 4, d: 0.14, rx: 0.3, ry: 0.24, o: 0.75 },
  ];
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      {layers.map((l, li) =>
        Array.from({ length: l.n }, (_, i) => {
          const a = (i / l.n) * 360 + li * 31;
          return (
            <ellipse
              key={`${li}-${i}`}
              cx={0}
              cy={-r * l.d}
              rx={r * l.rx}
              ry={r * l.ry}
              fill={color}
              opacity={l.o}
              stroke="rgba(90,30,40,0.18)"
              strokeWidth={0.7}
              transform={`rotate(${a})`}
            />
          );
        }),
      )}
      <path
        d={`M ${-r * 0.12} 0 a ${r * 0.12} ${r * 0.12} 0 1 1 ${r * 0.18} ${r * 0.06}`}
        fill="none"
        stroke="rgba(90,30,40,0.35)"
        strokeWidth={1}
      />
    </g>
  );
}

function Tulip({ x, y, r, color, rot }: { x: number; y: number; r: number; color: string; rot: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path
        d={`M ${-r * 0.5} ${-r * 0.1} C ${-r * 0.55} ${-r * 0.9}, ${-r * 0.2} ${-r * 1.0}, 0 ${-r * 0.7} C ${r * 0.2} ${-r * 1.0}, ${r * 0.55} ${-r * 0.9}, ${r * 0.5} ${-r * 0.1} C ${r * 0.45} ${r * 0.35}, ${-r * 0.45} ${r * 0.35}, ${-r * 0.5} ${-r * 0.1} Z`}
        fill={color}
        stroke="rgba(120,50,40,0.18)"
        strokeWidth={0.8}
      />
      <path
        d={`M 0 ${-r * 0.7} C ${-r * 0.1} ${-r * 0.3}, ${-r * 0.1} 0, 0 ${r * 0.25}`}
        fill="none"
        stroke="rgba(120,50,40,0.22)"
        strokeWidth={0.8}
      />
    </g>
  );
}

function Peony({ x, y, r, color, rot }: { x: number; y: number; r: number; color: string; rot: number }) {
  const rings = [
    { n: 9, d: 0.55, s: 0.38, o: 0.9 },
    { n: 8, d: 0.36, s: 0.32, o: 0.85 },
    { n: 6, d: 0.18, s: 0.26, o: 0.8 },
  ];
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      {rings.map((ring, ri) =>
        Array.from({ length: ring.n }, (_, i) => (
          <circle
            key={`${ri}-${i}`}
            cx={0}
            cy={-r * ring.d}
            r={r * ring.s}
            fill={color}
            opacity={ring.o}
            stroke="rgba(110,40,60,0.12)"
            strokeWidth={0.6}
            transform={`rotate(${(i / ring.n) * 360 + ri * 17})`}
          />
        )),
      )}
      <circle r={r * 0.12} fill="#f5d27a" />
    </g>
  );
}

const DRAW: Record<FlowerKind, typeof Rose> = { rose: Rose, daisy: Daisy, tulip: Tulip, peony: Peony };

export function Posy({
  seed,
  colors,
  kinds,
  className,
}: {
  seed: number;
  colors: string[];
  kinds: FlowerKind[];
  className?: string;
}) {
  const rnd = createRandom(seed);
  const n = 7;
  const heads = Array.from({ length: n }, (_, i) => {
    const a = -0.95 + (i / (n - 1)) * 1.9 + (rnd() - 0.5) * 0.2;
    const len = 120 + rnd() * 70;
    return {
      kind: kinds[i % kinds.length],
      color: colors[Math.floor(rnd() * colors.length)],
      x: 160 + Math.sin(a) * len * 0.72,
      y: 300 - Math.cos(a) * len * 1.05,
      r: 24 + rnd() * 16,
      rot: (rnd() - 0.5) * 50,
      leaf: rnd() > 0.4,
      la: rnd(),
    };
  });
  return (
    <svg viewBox="0 0 320 400" className={className} aria-hidden>
      {heads.map((h, i) => (
        <g key={`s${i}`}>
          <path
            d={`M 160 360 Q ${160 + (h.x - 160) * 0.2} ${250} ${h.x} ${h.y}`}
            stroke="#7d9c5a"
            strokeWidth={2.2}
            fill="none"
            strokeLinecap="round"
          />
          {h.leaf && (
            <path
              d={`M ${160 + (h.x - 160) * 0.35} ${300 - (300 - h.y) * 0.25} q ${h.la > 0.5 ? 26 : -26} -10 ${h.la > 0.5 ? 40 : -40} -34 q ${h.la > 0.5 ? -24 : 24} 4 ${h.la > 0.5 ? -40 : 40} 34 Z`}
              fill="#93ad6e"
              opacity={0.9}
            />
          )}
        </g>
      ))}
      {heads
        .slice()
        .sort((a, b) => a.y - b.y)
        .map((h, i) => {
          const D = DRAW[h.kind];
          return <D key={`h${i}`} x={h.x} y={h.y} r={h.r} color={h.color} rot={h.rot} />;
        })}
      {/* paper cone */}
      <path d="M 92 290 L 160 392 L 228 290 Q 160 312 92 290 Z" fill="rgba(196,154,108,0.85)" />
      <path d="M 160 392 L 228 290 Q 196 300 176 304 Z" fill="rgba(160,120,80,0.35)" />
      <path d="M 136 352 Q 160 344 184 352" stroke="#c46b7c" strokeWidth={4} fill="none" strokeLinecap="round" />
    </svg>
  );
}
