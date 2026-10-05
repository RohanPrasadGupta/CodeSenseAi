"use client";

import ReactMarkdown from "react-markdown";
import { useHighlighted } from "@/lib/highlight";

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const html = useHighlighted(code, lang);
  return <div className="md-block my-3" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 text-sm leading-6 text-foreground/90 [&_a]:text-accent [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc">
      <ReactMarkdown
        components={{
          pre: ({ children }) => <>{children}</>,
          code({ className, children }) {
            const text = String(children).replace(/\n$/, "");
            const match = /language-(\w+)/.exec(className ?? "");
            if (match || text.includes("\n")) {
              return <CodeBlock code={text} lang={match?.[1] ?? "text"} />;
            }
            return (
              <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px]">
                {children}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
