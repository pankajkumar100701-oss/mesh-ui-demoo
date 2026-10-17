import Link from "next/link";

/** Small floating pill shown on every demo site to get back to MeshUI or view its code. */
export default function SiteChrome({ slug }: { slug: string }) {
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/70 p-1 text-xs font-medium text-white shadow-xl backdrop-blur-md">
      <Link
        href="/"
        className="whitespace-nowrap rounded-full px-3 py-1.5 transition-colors hover:bg-white/10"
      >
        ← Back to MeshUI
      </Link>
      <Link
        href={`/code/${slug}`}
        className="whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-black transition-opacity hover:opacity-85"
      >
        View code
      </Link>
    </div>
  );
}
