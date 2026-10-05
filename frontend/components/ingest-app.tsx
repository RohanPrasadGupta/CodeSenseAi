"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GithubForm } from "@/components/github-form";
import { Header } from "@/components/header";
import { RepoList } from "@/components/repo-list";
import { ZipDropzone } from "@/components/zip-dropzone";
import { ingestFromGithub, uploadZip } from "@/lib/api";

export function IngestApp() {
  const router = useRouter();
  const qc = useQueryClient();

  const onSuccess = (repo: { id: string }) => {
    void qc.invalidateQueries({ queryKey: ["repos"] });
    router.push(`/repos/${repo.id}`);
  };
  const zip = useMutation({ mutationFn: uploadZip, onSuccess });
  const github = useMutation({ mutationFn: ingestFromGithub, onSuccess });

  const busy = zip.isPending || github.isPending;
  const error = (zip.error ?? github.error) as Error | null;

  return (
    <div className="relative flex min-h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg" />
      <div className="glow-orb pointer-events-none absolute -top-24 left-1/2 h-80 w-[42rem] -translate-x-1/2 blur-2xl" />

      <Header />

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 gap-8 px-6 pb-16 pt-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div className="flex flex-col gap-8">
          <section className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent-dim">
              Ingest · Explore · Ask · Analyse
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              Understand any codebase in minutes.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-muted">
              Upload a ZIP or clone a public GitHub repo. CodeSense parses it with Tree-sitter, embeds it for
              semantic search, then lets you browse files, ask grounded questions, and run AI agents for code
              review, documentation and architecture.
            </p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">ZIP archive</h2>
              <p className="mb-4 mt-1 text-xs text-muted">Drop a project folder compressed as .zip</p>
              <ZipDropzone disabled={busy} onFile={(file) => { github.reset(); zip.mutate(file); }} />
              {zip.isPending && <BusyNote label="Extracting and parsing…" />}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">GitHub URL</h2>
              <p className="mb-4 mt-1 text-xs text-muted">Public repositories, shallow clone</p>
              <GithubForm disabled={busy} onSubmit={(url) => { zip.reset(); github.mutate(url); }} />
              {github.isPending && <BusyNote label="Cloning and parsing…" />}
            </section>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error.message}
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:pt-[7.5rem]">
          <RepoList />
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">What ingest skips</h2>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted">
              <li>Vendor and build dirs: node_modules, .git, dist, .next…</li>
              <li>Binaries, images, PDFs, archives, files over 500 KB</li>
              <li>Functions/classes parsed for Python, JS, TS, and Go only</li>
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}

function BusyNote({ label }: { label: string }) {
  return (
    <p className="mt-4 flex items-center gap-2 text-xs text-accent">
      <span className="size-3 animate-spin rounded-full border border-accent/30 border-t-accent" />
      {label}
    </p>
  );
}
