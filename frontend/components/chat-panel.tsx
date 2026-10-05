"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { askQuestion } from "@/lib/api";
import type { Source } from "@/lib/types";
import { Markdown } from "@/components/markdown";

interface Message {
  role: "user" | "assistant" | "error";
  text: string;
  sources?: Source[];
}

const SUGGESTIONS = [
  "What does this project do?",
  "Where is the entry point?",
  "How is the database accessed?",
];

export function ChatPanel({
  repoId,
  onOpenFile,
  disabled = false,
}: {
  repoId: string;
  onOpenFile: (path: string, line?: number) => void;
  disabled?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: (q: string) => askQuestion(repoId, q),
    onSuccess: (res) =>
      setMessages((m) => [...m, { role: "assistant", text: res.answer, sources: res.sources }]),
    onError: (err: Error) => setMessages((m) => [...m, { role: "error", text: err.message }]),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ask.isPending]);

  function send(q: string) {
    const question = q.trim();
    if (!question || ask.isPending || disabled) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    ask.mutate(question);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Ask anything about this codebase. Answers are grounded in retrieved code and cite sources.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:border-accent/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-8 rounded-xl bg-accent/10 px-3 py-2 text-sm">
              {m.text}
            </div>
          ) : m.role === "error" ? (
            <div key={i} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {m.text}
            </div>
          ) : (
            <div key={i} className="space-y-3">
              <Markdown>{m.text}</Markdown>
              {m.sources && m.sources.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wider text-muted">Sources</p>
                  {m.sources.map((s, j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => onOpenFile(s.file_path, s.start_line)}
                      className="block w-full truncate rounded-lg border border-border px-2.5 py-1.5 text-left font-mono text-[11px] text-foreground/80 hover:border-accent/40"
                    >
                      {s.file_path}:{s.start_line}-{s.end_line}{" "}
                      <span className="text-accent">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
        {ask.isPending && (
          <p className="flex items-center gap-2 text-xs text-accent">
            <span className="size-3 animate-spin rounded-full border border-accent/30 border-t-accent" />
            Searching code and thinking…
          </p>
        )}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t border-border p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={disabled ? "Ask unlocks once embedding finishes…" : "Ask about the code…"}
          disabled={disabled}
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent/50"
        />
        <button
          type="submit"
          disabled={disabled || ask.isPending || !input.trim()}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-[#04110e] disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
