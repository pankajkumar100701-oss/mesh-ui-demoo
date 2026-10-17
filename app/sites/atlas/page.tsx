import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import SiteChrome from "@/components/SiteChrome";
import AtlasSite from "@/components/sites/atlas/AtlasSite";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-atlas-display",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-atlas-mono",
});

export const metadata: Metadata = {
  title: "Atlas Freight",
  description:
    "Global logistics landing page built around a procedural Earth: drag to spin, watch cargo arcs and ships trace their routes, fly to a hub and track a live shipment, built with React Three Fiber.",
};

export default function Page() {
  return (
    <div className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <AtlasSite />
      <SiteChrome slug="atlas" />
    </div>
  );
}
