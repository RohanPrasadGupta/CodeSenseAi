import type { ErrorResponse, HealthResponse, Repo } from "./types";

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
