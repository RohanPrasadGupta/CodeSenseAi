export type RepoStatus = "PENDING" | "INGESTED" | "FAILED";

export interface Repo {
  id: string;
  name: string;
  source: "zip" | "github_url";
  status: RepoStatus;
  file_count: number;
  created_at: string;
  updated_at: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  app: string;
  version: string;
  services: {
    database: string;
  };
}

export interface ErrorResponse {
  detail:
    | string
    | Array<{
        loc: (string | number)[];
        msg: string;
        type: string;
      }>;
}

export interface RepoFile {
  file_path: string;
  language: string | null;
  size_bytes: number;
}

export interface FileContent {
  file_path: string;
  language: string | null;
  content: string | null;
}

export interface Source {
  file_path: string;
  name: string;
  start_line: number;
  end_line: number;
}

export interface AskResponse {
  answer: string;
  sources: Source[];
}

export type Severity = "critical" | "high" | "medium" | "low";

export interface ReviewIssue {
  severity: Severity;
  category: string;
  line: number | null;
  title: string;
  description: string;
  suggestion: string;
}

export interface ReviewResult {
  file_path: string;
  summary: string;
  issues: ReviewIssue[];
}

export interface DocsResult {
  mode: "file" | "repo";
  file_path: string | null;
  documentation: string;
}

export interface ArchitectureResult {
  overview: string;
  languages: string[];
  entry_points: string[];
  components: { name: string; paths: string[]; responsibility: string }[];
  dependencies: { source: string; target: string; description: string }[];
  data_flow: string;
  mermaid: string;
}
