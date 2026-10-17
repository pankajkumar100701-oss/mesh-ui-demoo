import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import PrismSite from "@/components/sites/prism/PrismSite";
import SiteChrome from "@/components/SiteChrome";

const serif = Cormorant_Garamond({
  variable: "--font-prism-serif",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Prism Atelier",
  description:
    "Hand-blown optical glass sculptures with a live 3D configurator — a MeshUI demo.",
};

export default function Page() {
  return (
    <div className={serif.variable}>
      <PrismSite />
      <SiteChrome slug="prism" />
    </div>
  );
}
