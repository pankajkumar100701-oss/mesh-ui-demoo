import type { Metadata } from "next";
import { Fredoka } from "next/font/google";
import BounceSite from "@/components/sites/bounce/BounceSite";
import SiteChrome from "@/components/SiteChrome";

const fredoka = Fredoka({
  variable: "--font-bounce",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Bounce Candy Co.",
  description: "A playful candy brand with a real physics playground — grab, throw and shake the sweets.",
};

export default function Page() {
  return (
    <div className={fredoka.variable}>
      <BounceSite />
      <SiteChrome slug="bounce" />
    </div>
  );
}
