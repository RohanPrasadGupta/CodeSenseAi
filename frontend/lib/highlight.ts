import { useEffect, useState } from "react";

const EXT_LANG: Record<string, string> = {
  tsx: "tsx",
  jsx: "jsx",
  ts: "typescript",
  js: "javascript",
  py: "python",
  go: "go",
  md: "markdown",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  css: "css",
  html: "html",
  sh: "bash",
  sql: "sql",
  rs: "rust",
  java: "java",
};

export function langForPath(path: string, language?: string | null): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? language ?? "text";
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Highlight with Shiki (loaded lazily); falls back to plain text. */
export function useHighlighted(
  code: string,
  lang: string,
  highlightLines: number[] = [],
): string {
  const key = highlightLines.join(",");
  const [html, setHtml] = useState(
    `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`,
  );

  useEffect(() => {
    let cancelled = false;
    const lines = new Set(key ? key.split(",").map(Number) : []);
    (async () => {
      const { codeToHtml } = await import("shiki");
      let out: string;
      try {
        out = await codeToHtml(code, {
          lang,
          theme: "github-dark-default",
          transformers: [
            {
              line(node, line) {
                if (lines.has(line)) this.addClassToHast(node, "hl");
              },
            },
          ],
        });
      } catch {
        out = await codeToHtml(code, { lang: "text", theme: "github-dark-default" });
      }
      if (!cancelled) setHtml(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [code, lang, key]);

  return html;
}
