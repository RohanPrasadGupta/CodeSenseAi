"use client";

import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api";
import type { HealthResponse } from "@/lib/types";

export function HealthBadge() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        const data = await getHealth();
        if (!cancelled) {
          setHealth(data);
          setOffline(false);
        }
      } catch {
        if (!cancelled) {
          setHealth(null);
          setOffline(true);
        }
      }
    }

    void ping();
    const id = setInterval(() => void ping(), 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const tone = offline
    ? "offline"
    : health?.status === "ok"
      ? "ok"
      : health
        ? "degraded"
        : "loading";

  const label =
    tone === "ok"
      ? "Backend up"
      : tone === "degraded"
        ? "Degraded"
        : tone === "offline"
          ? "Unreachable"
          : "Checking…";

  const db = health?.services.database ?? "";

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs tracking-wide"
      title={
        health
          ? `${health.app} ${health.version} · database ${db}`
          : "Waiting for GET /health"
      }
    >
      <span
        className={[
          "size-1.5 rounded-full",
          tone === "ok" && "bg-accent shadow-[0_0_8px_var(--accent)]",
          tone === "degraded" && "bg-amber-400",
          tone === "offline" && "bg-rose-400",
          tone === "loading" && "animate-pulse bg-muted",
        ]
          .filter(Boolean)
          .join(" ")}
      />
      <span className="text-foreground/90">{label}</span>
      {health && (
        <span className="hidden font-mono text-muted sm:inline">
          v{health.version}
        </span>
      )}
    </div>
  );
}
