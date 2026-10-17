"use client";

import { useState } from "react";

export default function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); nothing else to do.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/15 hover:text-white"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
