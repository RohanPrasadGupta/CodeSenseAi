import type {
  ArchitectureResult,
  AskResponse,
  DocsResult,
  ErrorResponse,
  FileContent,
  HealthResponse,
  Repo,
  RepoFile,
  ReviewResult,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function formatDetail(detail: ErrorResponse["detail"]): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(". ");
  }
  return "Request failed";
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorResponse;
    return formatDetail(body.detail);
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
  if (!res.ok) {
    throw new ApiError(await readError(res), res.status);
  }
  return res.json();
}

export async function uploadZip(file: File): Promise<Repo> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/repos/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new ApiError(await readError(res), res.status);
  }
  return res.json();
}

export async function ingestFromGithub(url: string): Promise<Repo> {
  const res = await fetch(`${API_URL}/repos/from-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    throw new ApiError(await readError(res), res.status);
  }
  return res.json();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  if (!res.ok) {
    throw new ApiError(await readError(res), res.status);
  }
  return res.json();
}

function postJson<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export const getRepos = () => request<Repo[]>("/repos");

export const getRepo = (id: string) => request<Repo>(`/repos/${id}`);

export const getRepoFiles = (id: string) =>
  request<RepoFile[]>(`/repos/${id}/files`);

export const getFileContent = (id: string, path: string) =>
  request<FileContent>(
    `/repos/${id}/files/content?path=${encodeURIComponent(path)}`,
  );

export const askQuestion = (id: string, question: string) =>
  request<AskResponse>(
    `/repos/${id}/ask?question=${encodeURIComponent(question)}`,
  );

export const runReview = (id: string, filePath: string) =>
  postJson<ReviewResult>(`/repos/${id}/agents/review`, { file_path: filePath });

export const runDocs = (id: string, filePath?: string) =>
  postJson<DocsResult>(
    `/repos/${id}/agents/docs`,
    filePath ? { file_path: filePath } : {},
  );

export const runArchitecture = (id: string) =>
  postJson<ArchitectureResult>(`/repos/${id}/agents/architecture`);

export async function deleteRepo(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/repos/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new ApiError(await readError(res), res.status);
  }
}
