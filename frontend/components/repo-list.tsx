"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteRepo, getRepos } from "@/lib/api";
import { useToast } from "@/components/toast";
import type { Repo } from "@/lib/types";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function DeleteRepoButton({
  repo,
  onDeleted,
}: {
  repo: Repo;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const del = useMutation({
    mutationFn: () => deleteRepo(repo.id),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["repo", repo.id] });
      void qc.invalidateQueries({ queryKey: ["repos"] });
      toast(`Deleted "${repo.name}" and all its stored data`);
      onDeleted?.();
    },
    onError: (err: Error) => toast(`Could not delete "${repo.name}": ${err.message}`, "error"),
  });

  if (del.isPending) return <span className="text-[11px] text-muted">Deleting…</span>;

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5 text-[11px]">
        {del.error && <span className="text-rose-300">{(del.error as Error).message}</span>}
        <button
          type="button"
          onClick={() => del.mutate()}
          className="rounded-md bg-rose-500/20 px-2 py-1 text-rose-200 hover:bg-rose-500/30"
        >
          Delete everything
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            del.reset();
          }}
          className="px-1.5 py-1 text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label={`Delete ${repo.name}`}
      title="Delete repository"
      className="rounded-md px-2 py-1 text-[11px] text-muted hover:bg-rose-500/10 hover:text-rose-300"
    >
      Delete
    </button>
  );
}

export function RepoList() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["repos"], queryFn: getRepos,
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "PENDING") ? 5000 : false),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Your repositories</h2>
        <button type="button" onClick={() => void refetch()} className="text-xs text-muted hover:text-foreground">
          Refresh
        </button>
      </div>

      {isLoading && <p className="mt-4 text-sm text-muted">Loading…</p>}
      {error && <p className="mt-4 text-sm text-rose-300">{(error as Error).message}</p>}
      {data && data.length === 0 && <p className="mt-4 text-sm text-muted">Nothing ingested yet.</p>}

      <ul className="mt-4 space-y-2">
        {data?.map((repo) => (
          <li key={repo.id} className="rounded-xl border border-border transition-colors hover:border-accent/40">
            <Link
              href={`/repos/${repo.id}`}
              className="block rounded-t-xl px-3 pt-2.5 hover:bg-accent/5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{repo.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-accent">{repo.status}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted">
                {repo.file_count} files · {repo.source === "zip" ? "ZIP" : "GitHub"} · {formatWhen(repo.created_at)}
              </p>
            </Link>
            <div className="flex justify-end px-2 pb-1.5 pt-0.5">
              <DeleteRepoButton repo={repo} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
