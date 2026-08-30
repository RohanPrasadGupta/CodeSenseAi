"use client";

import { HealthBadge } from "@/components/health-badge";

export function Header() {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 font-mono text-sm font-semibold text-accent">
          {"{ }"}
        </span>
        <div>
          <p className="text-sm font-semibold tracking-tight">CodeSense AI</p>
          <p className="text-[11px] text-muted">Ingest a repo. Query comes later.</p>
        </div>
      </div>
      <HealthBadge />
    </header>
  );
}
