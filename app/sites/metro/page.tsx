import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Manrope } from "next/font/google";
import MetroSite from "@/components/sites/metro/MetroSite";
import SiteChrome from "@/components/SiteChrome";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-metro-display",
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-metro-body",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-metro-mono",
});

export const metadata: Metadata = {
  title: "Metro Habitat",
  description:
    "A city-planning and architecture studio. A tilt-shift miniature city builds itself, traffic and an elevated train run through it, and the sun sweeps from dawn to neon dusk.",
};

export default function Page() {
  return (
    <div className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <MetroSite />
      <SiteChrome slug="metro" />
    </div>
  );
}
