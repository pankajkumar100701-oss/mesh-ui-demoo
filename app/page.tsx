import type { Metadata } from "next";
import AdExperience from "@/components/ad/AdExperience";

export const metadata: Metadata = {
  title: { absolute: "MeshUI — 30s Ad" },
  description: "A 30-second, auto-scrolling 3D ad for MeshUI, made to be screen-recorded.",
};

export default function Page() {
  return <AdExperience />;
}
