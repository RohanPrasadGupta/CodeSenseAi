import type { Repo } from "./types";

const KEY = "codesense.session.repos";
const MAX = 20;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionSnapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function getServerSessionSnapshot(): string {
  return "[]";
}

export function parseSessionRepos(raw: string): Repo[] {
  try {
    const parsed = JSON.parse(raw) as Repo[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessionRepo(repo: Repo): void {
  const existing = parseSessionRepos(getSessionSnapshot()).filter(
    (item) => item.id !== repo.id,
  );
  const next = [repo, ...existing].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
  emit();
}

export function clearSessionRepos(): void {
  localStorage.removeItem(KEY);
  emit();
}
