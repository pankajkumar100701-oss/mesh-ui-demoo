import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import NebulaSite from "@/components/sites/nebula/NebulaSite";
import SiteChrome from "@/components/SiteChrome";

const display = Space_Grotesk({
  variable: "--font-nebula",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Nebula Expeditions",
  description:
    "Space-tourism landing page: warp-speed intro, a shader spiral galaxy, and a scroll-driven flight past a ringed planet, through a nebula, to a ray-marched black hole.",
};

export default function Page() {
  return (
    <>
      <NebulaSite fontClassName={display.variable} />
      <SiteChrome slug="nebula" />
    </>
  );
}
