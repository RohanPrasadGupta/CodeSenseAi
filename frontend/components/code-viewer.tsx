"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFileContent } from "@/lib/api";
import { langForPath, useHighlighted } from "@/lib/highlight";

function Code({ code, lang, line }: { code: string; lang: string; line: number | null }) {
  const html = useHighlighted(code, lang, line ? [line] : []);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!line) return;
    const el = ref.current?.querySelector(".line.hl");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [line, html]);

  return (
    <div
      ref={ref}
      className="code-view h-full overflow-auto py-3"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function CodeViewer({
  repoId,
  path,
  line,
}: {
  repoId: string;
  path: string | null;
  line: number | null;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["file", repoId, path],
    queryFn: () => getFileContent(repoId, path!),
    enabled: !!path,
  });

  if (!path) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted">
        Select a file from the tree to view its source.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <code className="truncate font-mono text-xs text-foreground/80">{path}</code>
        {line && <span className="text-[11px] text-accent">line {line}</span>}
      </div>
      <div className="min-h-0 flex-1">
        {isLoading && <p className="p-4 text-sm text-muted">Loading…</p>}
        {error && <p className="p-4 text-sm text-red-400">{(error as Error).message}</p>}
        {data &&
          (data.content ? (
            <Code code={data.content} lang={langForPath(path, data.language)} line={line} />
          ) : (
            <p className="p-4 text-sm text-muted">
              No stored text for this file (binary, or ingested before content storage).
            </p>
          ))}
      </div>
    </div>
  );
}
