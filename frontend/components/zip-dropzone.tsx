"use client";

import { useCallback, useRef, useState } from "react";

interface ZipDropzoneProps {
  disabled: boolean;
  onFile: (file: File) => void;
}

export function ZipDropzone({ disabled, onFile }: ZipDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const isZip =
        file.name.toLowerCase().endsWith(".zip") ||
        file.type === "application/zip" ||
        file.type === "application/x-zip-compressed";
      if (!isZip) {
        setHint("Only .zip archives are accepted.");
        return;
      }
      setHint(null);
      onFile(file);
    },
    [onFile],
  );

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (disabled) return;
          accept(event.dataTransfer.files[0]);
        }}
        className={[
          "flex w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-12 text-center transition",
          dragging
            ? "border-accent bg-accent/8"
            : "border-border bg-background/40 hover:border-accent/50 hover:bg-accent/5",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        ].join(" ")}
      >
        <span className="mb-3 flex size-11 items-center justify-center rounded-xl border border-border bg-card text-accent">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 16V4M12 4l-4 4M12 4l4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <p className="text-sm font-medium">Drop a repo ZIP here</p>
        <p className="mt-1 max-w-xs text-xs leading-5 text-muted">
          Field name is <span className="font-mono text-foreground/70">file</span>.
          Files are saved immediately; embedding continues in the background.
        </p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          accept(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {hint && <p className="mt-2 text-xs text-rose-300">{hint}</p>}
    </div>
  );
}
