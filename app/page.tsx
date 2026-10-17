import Image from "next/image";
import Link from "next/link";
import Hero3D from "@/components/home/Hero3D";
import CopyButton from "@/components/home/CopyButton";
import { previews } from "@/lib/previews";
import { sites } from "@/lib/sites";

const INSTALL = "npm i three @react-three/fiber @react-three/drei @react-three/postprocessing @react-three/rapier";

export default function Home() {
  return (
    <main className="relative flex-1 overflow-x-clip">
      <div className="relative">
        <div className="absolute inset-0 h-[640px] sm:h-[760px] lg:h-[max(760px,100svh)]">
          <Hero3D />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 h-[640px] bg-[linear-gradient(90deg,#07070a_0%,rgba(7,7,10,0.85)_30%,transparent_65%),linear-gradient(to_bottom,rgba(7,7,10,0.6),transparent_25%,transparent_70%,#07070a)] sm:h-[760px] lg:h-[max(760px,100svh)]"
        />

        <header className="relative z-10 mx-auto flex max-w-6xl xl:max-w-7xl 2xl:max-w-[1600px] items-center justify-between px-4 py-5 sm:px-6 lg:px-10">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 text-xs font-bold text-black">
              M
            </span>
            MeshUI
          </Link>
          <nav className="flex items-center gap-5 text-sm text-white/65">
            <a href="#sites" className="hover:text-white">Websites</a>
            <a href="#start" className="hover:text-white">Get started</a>
          </nav>
        </header>

        <section className="pointer-events-none relative z-10 mx-auto flex h-[560px] max-w-6xl xl:max-w-7xl 2xl:max-w-[1600px] flex-col justify-center px-4 sm:h-[680px] lg:h-[max(680px,calc(100svh-68px))] sm:px-6 lg:px-10">
          <div className="pointer-events-auto max-w-xl 2xl:max-w-2xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-white/75 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {sites.length} complete 3D websites · free to copy
            </p>
            <h1 className="text-5xl font-semibold leading-[1.02] tracking-tight drop-shadow-[0_2px_24px_rgba(0,0,0,0.8)] sm:text-7xl 2xl:text-8xl">
              3D websites,
              <br />
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
                ready to copy.
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-white/70 sm:text-lg 2xl:max-w-xl 2xl:text-xl">
              Full landing pages built with Three.js and React Three Fiber: shaders, physics, glass and scroll-driven
              cameras. Open the live demo, then take the code.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#sites"
                className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-85"
              >
                Browse websites
              </a>
              <Link
                href={`/sites/${sites[0].slug}`}
                className="rounded-full border border-white/15 bg-black/30 px-5 py-2.5 text-sm font-semibold backdrop-blur transition-colors hover:bg-white/10"
              >
                Open a live demo →
              </Link>
            </div>
          </div>
          <p className="mt-auto hidden pb-6 text-xs tracking-wide text-white/40 sm:block">
            Move your cursor over the field. Click to make a splash.
          </p>
        </section>
      </div>

      <section id="sites" className="relative z-10 mx-auto max-w-6xl xl:max-w-7xl 2xl:max-w-[1600px] scroll-mt-6 px-4 py-16 sm:px-6 lg:px-10">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">The collection</h2>
            <p className="mt-2 text-white/60">Every site is a full page: nav, 3D hero, content sections and footer.</p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site, i) => (
            <article
              key={site.slug}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-white/25 ${i === 0 ? "lg:col-span-2" : ""}`}
            >
              <Link
                href={`/sites/${site.slug}`}
                className="relative block aspect-video overflow-hidden bg-[#0b0b10]"
                style={{ backgroundImage: `linear-gradient(135deg, ${site.colors[0]}55, ${site.colors[1]}55)` }}
              >
                {previews[site.slug] && (
                  <Image
                    src={previews[site.slug]}
                    alt={`${site.name} homepage screenshot`}
                    placeholder="blur"
                    sizes={i === 0 ? "(min-width: 1536px) 1040px, (min-width: 1024px) 760px, (min-width: 640px) 50vw, 100vw" : "(min-width: 1536px) 520px, (min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"}
                    className="h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <span className="absolute left-4 top-4 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[11px] text-white/85 backdrop-blur">
                  0{i + 1}
                </span>
                <span className="absolute right-4 top-4 rounded-full bg-white px-3 py-1 text-xs font-semibold text-black opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  Open live demo ↗
                </span>
                <span className="absolute bottom-4 left-4 text-2xl font-semibold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)] sm:text-3xl">
                  {site.name}
                </span>
              </Link>
              <div className="flex flex-1 flex-col p-5">
                <p className="font-medium">{site.tagline}</p>
                <p className="mt-2 flex-1 text-sm leading-6 text-white/60">{site.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {site.tags.map((t) => (
                    <span key={t} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/60">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-5 flex gap-2">
                  <Link
                    href={`/sites/${site.slug}`}
                    className="flex-1 rounded-lg bg-white py-2 text-center text-sm font-semibold text-black transition-opacity hover:opacity-85"
                  >
                    Live demo
                  </Link>
                  <Link
                    href={`/code/${site.slug}`}
                    className="flex-1 rounded-lg border border-white/15 py-2 text-center text-sm font-semibold transition-colors hover:bg-white/10"
                  >
                    {"</> Code"}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="start" className="relative z-10 mx-auto max-w-6xl xl:max-w-7xl 2xl:max-w-[1600px] scroll-mt-6 px-4 py-16 sm:px-6 lg:px-10">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Use one in your project</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          <li className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="font-mono text-xs text-violet-300">01</p>
            <p className="mt-2 font-medium">Install the 3D stack</p>
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-black/60 p-3">
              <code className="flex-1 break-all font-mono text-xs leading-5 text-white/80">{INSTALL}</code>
              <CopyButton text={INSTALL} />
            </div>
          </li>
          <li className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="font-mono text-xs text-violet-300">02</p>
            <p className="mt-2 font-medium">Copy the files</p>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Open any site&apos;s code page and copy each file into the same path in your Next.js app.
            </p>
          </li>
          <li className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="font-mono text-xs text-violet-300">03</p>
            <p className="mt-2 font-medium">Make it yours</p>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Change the copy, colours and shapes. Everything is procedural, so there are no models or textures to
              hunt down.
            </p>
          </li>
        </ol>
      </section>

      <footer className="relative z-10 mx-auto max-w-6xl xl:max-w-7xl 2xl:max-w-[1600px] px-4 py-10 text-sm text-white/45 sm:px-6 lg:px-10">
        MeshUI · Built with Next.js, Three.js and React Three Fiber.
      </footer>
    </main>
  );
}
