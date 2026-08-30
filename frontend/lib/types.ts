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
