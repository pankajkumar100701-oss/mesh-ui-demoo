import type { Metadata } from "next";
import { Space_Mono, Unbounded } from "next/font/google";
import SiteChrome from "@/components/SiteChrome";
import PulseSite from "@/components/sites/pulse/PulseSite";

const unbounded = Unbounded({
  subsets: ["latin"],
  variable: "--font-pulse-display",
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-pulse-mono",
});

export const metadata: Metadata = {
  title: "Pulse Records",
  description:
    "Electronic music label landing page whose hero is a live Web Audio synth: program a 16-step sequencer and watch a 3D speaker stage, moving-head light rig and ring tunnel pulse to every kick.",
};

export default function Page() {
  return (
    <div className={`${unbounded.variable} ${spaceMono.variable}`}>
      <PulseSite />
      <SiteChrome slug="pulse" />
    </div>
  );
}
