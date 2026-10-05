"use client";

import { useMemo, useState } from "react";
import type { RepoFile } from "@/lib/types";

interface Node {
  name: string;
  path: string;
  children: Map<string, Node>;
  file?: RepoFile;
}

function buildTree(files: RepoFile[]): Node {
  const root: Node = { name: "", path: "", children: new Map() };
  for (const file of files) {
    let cur = root;
    const parts = file.file_path.split("/");
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      if (!cur.children.has(part)) cur.children.set(part, { name: part, path, children: new Map() });
      cur = cur.children.get(part)!;
      if (i === parts.length - 1) cur.file = file;
    });
  }
  return root;
}

function sorted(node: Node) {
  return [...node.children.values()].sort((a, b) => {
    const ad = a.file ? 1 : 0;
    const bd = b.file ? 1 : 0;
    return ad - bd || a.name.localeCompare(b.name);
  });
}

function Row({
  node,
  depth,
  selected,
  onSelect,
  filtering,
}: {
  node: Node;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
  filtering: boolean;
}) {
  const [open, setOpen] = useState(depth < 1);
  const pad = { paddingLeft: `${depth * 12 + 8}px` };

  if (node.file) {
    const active = selected === node.path;
    return (
      <button
        type="button"
        style={pad}
        onClick={() => onSelect(node.path)}
        className={`flex w-full items-center gap-2 truncate rounded-md py-1 pr-2 text-left text-xs ${
          active ? "bg-accent/15 text-accent" : "text-foreground/80 hover:bg-white/5"
        }`}
      >
        <span className="text-muted">{node.file.language ? "◆" : "◇"}</span>
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  const expanded = open || filtering;
  return (
    <div>
      <button
        type="button"
        style={pad}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md py-1 pr-2 text-left text-xs text-muted hover:bg-white/5"
      >
        <span className="w-2 text-[9px]">{expanded ? "▼" : "▶"}</span>
        <span className="truncate">{node.name}</span>
      </button>
      {expanded &&
        sorted(node).map((child) => (
          <Row
            key={child.path}
            node={child}
            depth={depth + 1}
            selected={selected}
            onSelect={onSelect}
            filtering={filtering}
          />
        ))}
    </div>
  );
}

export function FileTree({
  files,
  selected,
  onSelect,
}: {
  files: RepoFile[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const visible = useMemo(
    () => (q ? files.filter((f) => f.file_path.toLowerCase().includes(q)) : files),
    [files, q],
  );
  const root = useMemo(() => buildTree(visible), [visible]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border p-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Filter ${files.length} files…`}
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted focus:border-accent/50"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {sorted(root).map((n) => (
          <Row key={n.path} node={n} depth={0} selected={selected} onSelect={onSelect} filtering={!!q} />
        ))}
        {visible.length === 0 && <p className="p-3 text-xs text-muted">No matching files.</p>}
      </div>
    </div>
  );
}
