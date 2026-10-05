"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AgentPanel } from "@/components/agent-panel";
import { ChatPanel } from "@/components/chat-panel";
import { CodeViewer } from "@/components/code-viewer";
import { FileTree } from "@/components/file-tree";
import { HealthBadge } from "@/components/health-badge";
import { DeleteRepoButton } from "@/components/repo-list";
import { getRepo, getRepoFiles } from "@/lib/api";

export function RepoDashboard({ repoId }: { repoId: string }) {
  const router = useRouter();
  const [path, setPath] = useState<string | null>(null);
  const [line, setLine] = useState<number | null>(null);
  const [tab, setTab] = useState<"chat" | "agents">("chat");

  const repo = useQuery({
    queryKey: ["repo", repoId],
    queryFn: () => getRepo(repoId),
    // keep checking while the backend embeds in the background
    refetchInterval: (q) => (q.state.data?.status === "PENDING" ? 4000 : false),
  });
  const pending = repo.data?.status === "PENDING";
  const files = useQuery({ queryKey: ["files", repoId], queryFn: () => getRepoFiles(repoId) });

  function open(p: string, l?: number) {
    setPath(p);
    setLine(l ?? null);
  }

  if (repo.error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-red-300">{(repo.error as Error).message}</p>
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Back to repositories
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <header className="flex items-center gap-4 border-b border-border px-4 py-2.5">
        <Link href="/" className="text-xs text-muted hover:text-foreground">
          ← Repos
        </Link>
        <h1 className="truncate text-sm font-semibold">{repo.data?.name ?? "Loading…"}</h1>
        {repo.data && (
          <span className="hidden rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent sm:inline">
            {repo.data.file_count} files
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {repo.data && <DeleteRepoButton repo={repo.data} onDeleted={() => router.push("/")} />}
          <HealthBadge />
        </div>
      </header>

      {pending && (
        <p className="flex items-center gap-2 border-b border-accent/30 bg-accent/10 px-4 py-2 text-xs text-accent">
          <span className="size-3 animate-spin rounded-full border border-accent/30 border-t-accent" />
          Embedding in the background (paced to the embedding provider&apos;s rate limit — large repos can take
          several minutes). Files are browsable now; Ask unlocks when it finishes.
        </p>
      )}

      {repo.data?.status === "FAILED" && (
        <p className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
          Embedding failed for this repo (often an embedding-provider rate limit). Files are browsable, but Ask
          has no vectors to search — re-ingest once the limit is resolved.
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)_26rem]">
        <aside className="min-h-0 border-b border-border lg:border-b-0 lg:border-r max-lg:h-56">
          {files.isLoading && <p className="p-4 text-xs text-muted">Loading files…</p>}
          {files.error && <p className="p-4 text-xs text-red-300">{(files.error as Error).message}</p>}
          {files.data && <FileTree files={files.data} selected={path} onSelect={(p) => open(p)} />}
        </aside>

        <main className="min-h-0 border-b border-border lg:border-b-0 lg:border-r max-lg:h-96">
          <CodeViewer repoId={repoId} path={path} line={line} />
        </main>

        <section className="flex min-h-0 flex-col max-lg:h-[36rem]">
          <div className="flex border-b border-border">
            {(["chat", "agents"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-xs font-medium capitalize ${
                  tab === t ? "border-b-2 border-accent text-accent" : "text-muted hover:text-foreground"
                }`}
              >
                {t === "chat" ? "Ask" : "Agents"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {/* both stay mounted so chat history and agent results survive tab switches */}
            <div className={tab === "chat" ? "h-full" : "hidden"}>
              <ChatPanel repoId={repoId} onOpenFile={open} disabled={pending || repo.data?.status === "FAILED"} />
            </div>
            <div className={tab === "agents" ? "h-full" : "hidden"}>
              <AgentPanel repoId={repoId} selectedPath={path} onOpenFile={open} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
