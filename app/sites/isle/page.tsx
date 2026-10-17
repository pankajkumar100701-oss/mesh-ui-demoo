import type { Metadata } from "next";
import { Fraunces, Nunito } from "next/font/google";
import IsleSite from "@/components/sites/isle/IsleSite";
import SiteChrome from "@/components/SiteChrome";

const display = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-isle-display",
});

const body = Nunito({
  subsets: ["latin"],
  variable: "--font-isle-body",
});

export const metadata: Metadata = {
  title: "Isle Retreats",
  description:
    "A boutique resort on a low-poly floating island. Spin it, tap the glowing hotspots and flip between day and night.",
};

export default function Page() {
  return (
    <div className={`${display.variable} ${body.variable}`}>
      <IsleSite />
      <SiteChrome slug="isle" />
    </div>
  );
}
