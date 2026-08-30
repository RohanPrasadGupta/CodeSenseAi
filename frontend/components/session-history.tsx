"use client";

import type { Repo } from "@/lib/types";

interface SessionHistoryProps {
  repos: Repo[];
  selectedId: string | null;
  onSelect: (repo: Repo) => void;
  onClear: () => void;
}

export function SessionHistory({
  repos,
  selectedId,
  onSelect,
  onClear,
}: SessionHistoryProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">This browser session</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            There is no list API yet, so ids are kept locally after a successful
            ingest.
          </p>
        </div>
        {repos.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {repos.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No ingested repos in this browser yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {repos.map((repo) => {
            const active = repo.id === selectedId;
            return (
              <li key={repo.id}>
                <button
                  type="button"
                  onClick={() => onSelect(repo)}
                  className={[
                    "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                    active
                      ? "border-accent/40 bg-accent/8"
                      : "border-border bg-background/40 hover:border-accent/25",
                  ].join(" ")}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{repo.name}</span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">
                      {repo.id}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {repo.file_count} files
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
