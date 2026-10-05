"use client";

import { FormEvent, useState } from "react";

interface GithubFormProps {
  disabled: boolean;
  onSubmit: (url: string) => void;
}

export function GithubForm({ disabled, onSubmit }: GithubFormProps) {
  const [url, setUrl] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed.startsWith("https://github.com/")) {
      setHint("URL must start with https://github.com/");
      return;
    }
    setHint(null);
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor="github-url" className="text-sm font-medium">
        GitHub repository URL
      </label>
      <input
        id="github-url"
        type="url"
        placeholder="https://github.com/owner/repo"
        value={url}
        disabled={disabled}
        onChange={(event) => {
          setUrl(event.target.value);
          if (hint) setHint(null);
        }}
        className="h-11 rounded-xl border border-border bg-background/60 px-3.5 font-mono text-sm outline-none ring-accent/40 placeholder:text-muted/70 focus:border-accent/60 focus:ring-2 disabled:opacity-50"
      />
      <p className="text-xs leading-5 text-muted">
        Public HTTPS URLs only. The clone is shallow; embedding then continues in
        the background.
      </p>
      {hint && <p className="text-xs text-rose-300">{hint}</p>}
      <button
        type="submit"
        disabled={disabled || !url.trim()}
        className="mt-1 h-11 rounded-xl bg-accent text-sm font-semibold text-[#04110e] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Clone and ingest
      </button>
    </form>
  );
}
