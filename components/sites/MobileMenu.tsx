"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  /** Section links as [href, label] pairs. */
  links: [string, string][];
  /** "dark" for dark sites (light icon), "light" for light sites (dark icon). */
  tone?: "dark" | "light";
  /** Tailwind classes that hide the button once the desktop nav shows, e.g. "md:hidden". */
  hideAt?: string;
};

/**
 * Hamburger menu for phones: section links plus a way back to MeshUI. Plain DOM, no 3D. The panel is
 * portalled to <body> so it sits above each site's own stacking contexts (heroes, HUDs, fixed headers).
 */
export default function MobileMenu({ links, tone = "dark", hideAt = "md:hidden" }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const button =
    tone === "dark"
      ? "border-white/20 bg-black/40 text-white"
      : "border-black/15 bg-white/70 text-stone-900";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className={`pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full border backdrop-blur-md ${button} ${hideAt}`}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {open &&
        createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="pointer-events-auto fixed inset-0 z-[300] flex flex-col bg-black/85 px-6 pb-10 pt-5 text-white backdrop-blur-xl"
        >
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10"
            >
              ← Back to MeshUI
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="grid size-10 place-items-center rounded-full border border-white/20 text-xl leading-none"
            >
              ×
            </button>
          </div>
          <nav className="mt-12 flex flex-col gap-1">
            {links.map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="border-b border-white/10 py-4 text-3xl font-semibold tracking-tight"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>,
        document.body,
      )}
    </>
  );
}
