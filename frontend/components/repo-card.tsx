"use client";

import { useState } from "react";
import type { Repo } from "@/lib/types";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function RepoCard({ repo }: { repo: Repo }) {
  const [copied, setCopied] = useState(false);

  async function copyId() {
    await navigator.clipboard.writeText(repo.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <article className="rounded-2xl border border-accent/25 bg-accent/6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-accent-dim">
            Ingested
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{repo.name}</h2>
        </div>
        <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 font-mono text-[11px] text-accent">
          {repo.status}
        </span>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/70 px-3 py-2.5">
          <dt className="text-[11px] uppercase tracking-wider text-muted">Files stored</dt>
          <dd className="mt-0.5 font-mono text-lg">{repo.file_count}</dd>
        </div>
        <div className="rounded-xl border border-border bg-card/70 px-3 py-2.5">
          <dt className="text-[11px] uppercase tracking-wider text-muted">Source</dt>
          <dd className="mt-0.5 font-mono text-sm">
            {repo.source === "zip" ? "ZIP upload" : "GitHub URL"}
          </dd>
        </div>
        <div className="rounded-xl border border-border bg-card/70 px-3 py-2.5 sm:col-span-2">
          <dt className="text-[11px] uppercase tracking-wider text-muted">Repo id</dt>
          <dd className="mt-1 flex items-center justify-between gap-2">
            <code className="truncate font-mono text-xs text-foreground/80">{repo.id}</code>
            <button
              type="button"
              onClick={() => void copyId()}
              className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] text-muted hover:text-foreground"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-muted">
        Created {formatWhen(repo.created_at)}. Files and parsed chunks are in the
        database, but listing them is not available yet.
      </p>
    </article>
  );
}
