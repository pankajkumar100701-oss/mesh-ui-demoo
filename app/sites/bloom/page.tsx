import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import SiteChrome from "@/components/SiteChrome";
import BloomSite from "@/components/sites/bloom/BloomSite";

const serif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-bloom-serif",
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-bloom-sans",
});

export const metadata: Metadata = {
  title: "Bloom Botanica",
  description:
    "Artisan florist landing page where procedural roses, tulips, peonies and daisies sprout and unfurl as you scroll, sway in a cursor-driven wind, and a live 3D bouquet builder prices your arrangement — built with React Three Fiber.",
};

export default function Page() {
  return (
    <div className={`${serif.variable} ${sans.variable}`}>
      <BloomSite />
      <SiteChrome slug="bloom" />
    </div>
  );
}
