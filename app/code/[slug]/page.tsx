import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CopyButton from "@/components/home/CopyButton";
import { getSite, sites } from "@/lib/sites";

const SHARED_FILES = ["components/SiteChrome.tsx", "lib/random.ts"];

async function loadSources(slug: string) {
  "use cache";
  const site = getSite(slug);
  if (!site) return [];
  const files = [`app/sites/${slug}/page.tsx`, ...site.files, ...SHARED_FILES];
  return Promise.all(
    files.map(async (file) => ({
      file,
      // Every code page is prerendered, so skip tracing the whole project into the server bundle.
      code: await readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), file), "utf8"),
    })),
  );
}

export async function generateStaticParams() {
  return sites.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/code/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const site = getSite(slug);
  return { title: site ? `${site.name} code` : "Code" };
}

export default async function CodePage({ params }: PageProps<"/code/[slug]">) {
  const { slug } = await params;
  const site = getSite(slug);
  if (!site) notFound();

  const sources = await loadSources(slug);

  return (
    <main className="mx-auto w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-10">
      <nav className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-white/60 hover:text-white">
          ← MeshUI
        </Link>
        <Link
          href={`/sites/${site.slug}`}
          className="rounded-full bg-white px-4 py-1.5 font-semibold text-black transition-opacity hover:opacity-85"
        >
          Open live demo
        </Link>
      </nav>

      <header className="mt-8">
        <p className="font-mono text-xs uppercase tracking-widest text-violet-300">Source code</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{site.name}</h1>
        <p className="mt-3 max-w-2xl text-white/60">{site.description}</p>
      </header>

      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        <p className="font-medium">Files</p>
        <p className="mt-1 text-white/55">
          Copy each one to the same path in a Next.js app with Tailwind, then install the 3D packages listed on the
          MeshUI home page.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {sources.map(({ file }) => (
            <li key={file}>
              <a
                href={`#${file}`}
                className="block rounded-md border border-white/10 bg-black/40 px-2.5 py-1 font-mono text-xs text-white/75 hover:border-white/30 hover:text-white"
              >
                {file}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 space-y-6 pb-16">
        {sources.map(({ file, code }) => (
          <section
            key={file}
            id={file}
            className="scroll-mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d12]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
              <span className="truncate font-mono text-xs text-white/75">{file}</span>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden text-xs text-white/40 sm:inline">{code.split("\n").length} lines</span>
                <CopyButton text={code} />
              </div>
            </div>
            <pre className="max-h-[70vh] overflow-auto p-4 font-mono text-[12.5px] leading-5 text-white/85">
              <code>{code}</code>
            </pre>
          </section>
        ))}
      </div>
    </main>
  );
}
