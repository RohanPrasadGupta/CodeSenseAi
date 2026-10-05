"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { runArchitecture, runDocs, runReview } from "@/lib/api";
import type { Severity } from "@/lib/types";
import { Markdown } from "@/components/markdown";
import { MermaidDiagram } from "@/components/mermaid-diagram";

type Agent = "review" | "docs" | "architecture";

const AGENTS: { id: Agent; label: string; blurb: string }[] = [
  { id: "review", label: "Code review", blurb: "Finds bugs, security and performance issues in the selected file." },
  { id: "docs", label: "Docs", blurb: "Adds docstrings to the selected file, or writes a README for the whole repo." },
  { id: "architecture", label: "Architecture", blurb: "Maps components, dependencies and data flow." },
];

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "border-red-500/40 bg-red-500/10 text-red-300",
  high: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  medium: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
  low: "border-sky-500/40 bg-sky-500/10 text-sky-300",
};

function Spinner({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-xs text-accent">
      <span className="size-3 animate-spin rounded-full border border-accent/30 border-t-accent" />
      {label}
    </p>
  );
}

function RunButton({ onClick, pending, children }: { onClick: () => void; pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-xl bg-accent px-3.5 py-2 text-xs font-medium text-[#04110e] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ErrorNote({ error }: { error: Error | null }) {
  if (!error) return null;
  return <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error.message}</p>;
}

export function AgentPanel({
  repoId,
  selectedPath,
  onOpenFile,
}: {
  repoId: string;
  selectedPath: string | null;
  onOpenFile: (path: string, line?: number) => void;
}) {
  const [agent, setAgent] = useState<Agent>("review");
  const review = useMutation({ mutationFn: (p: string) => runReview(repoId, p) });
  const docs = useMutation({ mutationFn: (p?: string) => runDocs(repoId, p) });
  const arch = useMutation({ mutationFn: () => runArchitecture(repoId) });
  const current = AGENTS.find((a) => a.id === agent)!;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-1 border-b border-border p-2">
        {AGENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAgent(a.id)}
            className={`rounded-lg px-2.5 py-1 text-xs ${
              agent === a.id ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-xs text-muted">{current.blurb}</p>

        {agent === "review" && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <RunButton pending={review.isPending || !selectedPath} onClick={() => selectedPath && review.mutate(selectedPath)}>
                Review file
              </RunButton>
              <code className="truncate text-[11px] text-muted">{selectedPath ?? "Select a file first"}</code>
            </div>
            {review.isPending && <Spinner label="Reviewing — this can take up to a minute…" />}
            <ErrorNote error={review.error} />
            {review.data && (
              <div className="space-y-3">
                <p className="text-sm leading-6">{review.data.summary}</p>
                {review.data.issues.length === 0 && <p className="text-sm text-accent">No issues found.</p>}
                {review.data.issues.map((issue, i) => (
                  <article key={i} className="space-y-2 rounded-xl border border-border bg-background p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${SEVERITY_STYLE[issue.severity]}`}>
                        {issue.severity}
                      </span>
                      <span className="text-[11px] text-muted">{issue.category}</span>
                      {issue.line && (
                        <button
                          type="button"
                          onClick={() => onOpenFile(review.data!.file_path, issue.line!)}
                          className="ml-auto font-mono text-[11px] text-accent hover:underline"
                        >
                          line {issue.line}
                        </button>
                      )}
                    </div>
                    <h3 className="text-sm font-medium">{issue.title}</h3>
                    <p className="text-xs leading-5 text-foreground/80">{issue.description}</p>
                    <p className="rounded-lg bg-accent/8 px-2.5 py-2 text-xs leading-5">
                      <span className="text-accent">Fix: </span>
                      {issue.suggestion}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {agent === "docs" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <RunButton pending={docs.isPending || !selectedPath} onClick={() => selectedPath && docs.mutate(selectedPath)}>
                Document file
              </RunButton>
              <RunButton pending={docs.isPending} onClick={() => docs.mutate(undefined)}>
                Generate README
              </RunButton>
            </div>
            <code className="block truncate text-[11px] text-muted">{selectedPath ?? "Select a file to document it"}</code>
            {docs.isPending && <Spinner label="Writing documentation…" />}
            <ErrorNote error={docs.error} />
            {docs.data && (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-muted">
                  {docs.data.mode === "repo" ? "Repository README" : docs.data.file_path}
                </p>
                <Markdown>{docs.data.documentation}</Markdown>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(docs.data!.documentation)}
                  className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted hover:text-foreground"
                >
                  Copy markdown
                </button>
              </div>
            )}
          </>
        )}

        {agent === "architecture" && (
          <>
            <RunButton pending={arch.isPending} onClick={() => arch.mutate()}>
              Explain architecture
            </RunButton>
            {arch.isPending && <Spinner label="Analysing structure…" />}
            <ErrorNote error={arch.error} />
            {arch.data && (
              <div className="space-y-5">
                <p className="text-sm leading-6">{arch.data.overview}</p>
                <MermaidDiagram chart={arch.data.mermaid} />
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Components</h3>
                  <div className="space-y-2">
                    {arch.data.components.map((c) => (
                      <div key={c.name} className="rounded-xl border border-border bg-background p-3">
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="mt-1 text-xs leading-5 text-foreground/80">{c.responsibility}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.paths.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => onOpenFile(p)}
                              className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-accent hover:bg-white/10"
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Dependencies</h3>
                  <ul className="space-y-1.5 text-xs">
                    {arch.data.dependencies.map((d, i) => (
                      <li key={i} className="leading-5">
                        <span className="font-medium">{d.source}</span> <span className="text-accent">→</span>{" "}
                        <span className="font-medium">{d.target}</span>
                        <span className="text-muted"> — {d.description}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Entry points</h3>
                  <ul className="space-y-1 text-xs text-foreground/80">
                    {arch.data.entry_points.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Data flow</h3>
                  <p className="text-xs leading-5 text-foreground/80">{arch.data.data_flow}</p>
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
