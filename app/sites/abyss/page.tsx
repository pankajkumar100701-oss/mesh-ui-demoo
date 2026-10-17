import type { Metadata } from "next";
import { JetBrains_Mono, Manrope, Unbounded } from "next/font/google";
import SiteChrome from "@/components/SiteChrome";
import AbyssSite from "@/components/sites/abyss/AbyssSite";

const display = Unbounded({
  subsets: ["latin"],
  variable: "--font-abyss-display",
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-abyss-body",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-abyss-mono",
});

export const metadata: Metadata = {
  title: "Abyss Dive Co.",
  description:
    "Deep-sea expedition outfitter. Scroll to sink from a shimmering sunlit surface past kelp and whales into the bioluminescent midnight zone, 4,000 metres down, built with React Three Fiber.",
};

export default function Page() {
  return (
    <div className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <AbyssSite />
      <SiteChrome slug="abyss" />
    </div>
  );
}
