"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { GithubForm } from "@/components/github-form";
import { Header } from "@/components/header";
import { RepoCard } from "@/components/repo-card";
import { SessionHistory } from "@/components/session-history";
import { ZipDropzone } from "@/components/zip-dropzone";
import { ingestFromGithub, uploadZip } from "@/lib/api";
import {
  clearSessionRepos,
  getServerSessionSnapshot,
  getSessionSnapshot,
  parseSessionRepos,
  saveSessionRepo,
  subscribeSession,
} from "@/lib/storage";
import type { Repo } from "@/lib/types";

export function IngestApp() {
  const [busy, setBusy] = useState<"zip" | "github" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<Repo | null>(null);
  const sessionRaw = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSessionSnapshot,
  );
  const history = useMemo(() => parseSessionRepos(sessionRaw), [sessionRaw]);
  const selected = latest ?? history[0] ?? null;

  async function run(kind: "zip" | "github", work: () => Promise<Repo>) {
    setBusy(kind);
    setError(null);
    try {
      const repo = await work();
      saveSessionRepo(repo);
      setLatest(repo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative flex min-h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg" />
      <div className="glow-orb pointer-events-none absolute -top-24 left-1/2 h-80 w-[42rem] -translate-x-1/2 blur-2xl" />

      <Header />

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 gap-8 px-6 pb-16 pt-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div className="flex flex-col gap-8">
          <section className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent-dim">
              Phase 1 · ingest
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              Bring a codebase in. We parse what we can today.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-muted">
              Upload a ZIP or clone a public GitHub repo. The API returns metadata
              only — no file tree, chunks, or chat until those routes exist. Keep
              this id; you cannot fetch the repo again from the frontend.
            </p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">ZIP archive</h2>
              <p className="mb-4 mt-1 text-xs text-muted">POST /repos/upload</p>
              <ZipDropzone
                disabled={busy !== null}
                onFile={(file) => void run("zip", () => uploadZip(file))}
              />
              {busy === "zip" && <BusyNote label="Extracting and parsing ZIP…" />}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">GitHub URL</h2>
              <p className="mb-4 mt-1 text-xs text-muted">POST /repos/from-url</p>
              <GithubForm
                disabled={busy !== null}
                onSubmit={(url) => void run("github", () => ingestFromGithub(url))}
              />
              {busy === "github" && <BusyNote label="Cloning (shallow) and parsing…" />}
            </section>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {selected && <RepoCard repo={selected} />}
        </div>

        <aside className="flex flex-col gap-4 lg:pt-[7.5rem]">
          <SessionHistory
            repos={history}
            selectedId={selected?.id ?? null}
            onSelect={setLatest}
            onClear={() => {
              clearSessionRepos();
              setLatest(null);
            }}
          />
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
