# CodeSense AI — Backend

FastAPI service that ingests repositories, parses source into named code chunks, embeds them in Pinecone, and answers questions with cited sources.

**Version:** 0.1.0  
**Python:** 3.12+ (below 3.15)  
**App name:** CodeSense AI

This is the API and setup reference for frontend and backend work. Product overview and roadmap live in the [root README](../README.md).

---

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Infrastructure — FastAPI, PostgreSQL (Neon), Alembic, `/health` | Done |
| 1 | Repository ingestion — ZIP + GitHub URL, `repos` + `repo_files` | Done |
| 2 | Tree-sitter parsing — Python, JS, TS, Go → `code_chunks` | Done |
| 3 | Embeddings + Pinecone (Voyage `voyage-code-3`) | Done |
| 4 | RAG Q&A — `GET /repos/{id}/ask` | Done |
| 5 | LangGraph agents (review, architecture, docs) | Done |
| 6 | Frontend (Next.js) — ingest, file tree, code viewer, chat, agent panel | Done |
| 7 | JWT auth, ARQ + Redis, Render + Netlify | Upcoming |

**Usable from a client today:** `GET /health`, `POST /repos/upload`, `POST /repos/from-url`, `GET /repos`, `GET /repos/{id}`, `GET /repos/{id}/files`, `GET /repos/{id}/files/content?path=`, `GET /repos/{id}/ask`, and `POST /repos/{id}/agents/{review|docs|architecture}`.  
Chunks are written to Postgres but not exposed by a read API. No auth.

---

## Stack

- FastAPI 0.115 + Uvicorn
- SQLAlchemy 2 (async) + asyncpg
- PostgreSQL (Neon)
- Alembic migrations
- Tree-sitter (Python, JavaScript, TypeScript, Go)
- python-multipart (ZIP uploads)
- Voyage AI (`voyage-code-3`) — embeddings
- Pinecone — vector index, namespace per repo
- Anthropic Claude (`claude-haiku-4-5`) — RAG answers

---

## Local setup

```bash
cd backend
poetry install
```

Create `backend/.env`:

```env
DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST/DB?ssl=require
DEBUG=true
ENVIRONMENT=development
CORS_ORIGINS=["http://localhost:3000"]

VOYAGE_API_KEY=
# Voyage limits (defaults = free tier, no payment method). Raise after adding billing:
# VOYAGE_RPM=2000
# VOYAGE_TPM=3000000
PINECONE_API_KEY=
PINECONE_INDEX_NAME=
ANTHROPIC_API_KEY=
```

`DATABASE_URL` is required for boot. Voyage, Pinecone, and Anthropic keys are required for ingest embeddings and Q&A.

Use the SQLAlchemy async form (`postgresql+asyncpg://...`). Create the Pinecone index in the Pinecone console first and set `PINECONE_INDEX_NAME` to that name. Dimension must match Voyage `voyage-code-3`.

```bash
poetry run alembic upgrade head
poetry run uvicorn app.main:app --reload --port 8000
```

- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

CORS allows `http://localhost:3000` with credentials. Git clone for `/repos/from-url` requires `git` on PATH.

---

## Project structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app, CORS, routers
│   ├── config.py               # pydantic-settings from .env
│   ├── database.py             # async engine, sessions
│   ├── api/routes/
│   │   ├── health.py           # GET /health
│   │   └── repos.py            # upload, from-url, ask
│   ├── models/repo.py          # Repo, RepoFile, CodeChunkModel
│   └── services/
│       ├── ingestion.py        # ZIP + GitHub walk/save + embed
│       ├── parser.py           # Tree-sitter extract_chunks
│       ├── embedder.py         # Voyage batch embed → Pinecone upsert
│       └── qa.py               # embed question → Pinecone → Claude
├── alembic/versions/           # schema migrations
└── pyproject.toml
```

---

## API

Base URL (local): `http://localhost:8000`  
No `/api` prefix. No authentication.

### `GET /health`

App + database ping. Always HTTP **200**, even if the database is down (`status: "degraded"`).

**200**

```json
{
  "status": "ok",
  "app": "CodeSense AI",
  "version": "0.1.0",
  "services": {
    "database": "ok"
  }
}
```

`services.database` is `"ok"` or `"error : ..."`.

---

### `POST /repos/upload`

Ingest a ZIP, parse chunks, embed into Pinecone. **201**. `multipart/form-data`, field name **`file`**.

The request stays open until extract, parse, DB writes, and embedding finish. Show a loading state on the client.

```bash
curl -X POST http://localhost:8000/repos/upload \
  -F "file=@my-repo.zip"
```

```ts
const form = new FormData();
form.append("file", zipFile); // field name must be "file"

const res = await fetch("http://localhost:8000/repos/upload", {
  method: "POST",
  body: form, // do not set Content-Type
});
```

**201 body** — repo metadata only (not files or chunks):

```json
{
  "id": "3ebf8141-cf59-4308-ad3c-5185f40b90b1",
  "name": "my-repo.zip",
  "source": "zip",
  "status": "INGESTED",
  "file_count": 24,
  "created_at": "2026-08-29T17:35:40.926254+00:00",
  "updated_at": "2026-08-29T17:35:40.926254+00:00"
}
```

`name` is the uploaded filename.

| Status | When | `detail` |
|---|---|---|
| 400 | Not a valid ZIP | `"Uploaded file is not a valid ZIP"` |
| 422 | Missing `file` | FastAPI validation array |

---

### `POST /repos/from-url`

Clone a **public** GitHub repo (`git clone --depth 1`), parse, embed. **201**. JSON body.

URL must start with `https://github.com/`.

```bash
curl -X POST http://localhost:8000/repos/from-url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/owner/repo"}'
```

```ts
await fetch("http://localhost:8000/repos/from-url", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://github.com/owner/repo" }),
});
```

**201 body** — same `Repo` shape as ZIP upload, with `source: "github_url"` and `name` equal to the last URL path segment (`repo`).

| Status | When | `detail` |
|---|---|---|
| 400 | URL not `https://github.com/...` | `"Invalid GitHub URL"` |
| 400 | Empty repo name | `"Invalid repository name"` |
| 400 | Clone failed (private, missing, no git) | `"Failed to clone the repository: ..."` |
| 422 | Missing/invalid `url` | FastAPI validation array |

---

### Ingest is asynchronous

`POST /repos/upload` and `/repos/from-url` save files and chunks, then return the repo immediately with `status: "PENDING"`. Embedding runs in a background task, paced by a sliding-window limiter to `VOYAGE_RPM` / `VOYAGE_TPM`, so the free tier never errors — it just takes longer (~10K tokens/min; a 100K-token repo ≈ 12 min). Poll `GET /repos/{id}` until `status` is `INGESTED` (or `FAILED`). Files, file content and agents work while PENDING; `/ask` needs `INGESTED`. If the server restarts mid-embedding the repo stays PENDING — re-ingest it.

### Read endpoints

- `GET /repos` — all repos, newest first
- `GET /repos/{repo_id}` — one repo (404 if missing)
- `DELETE /repos/{repo_id}` — removes the repo's Pinecone vectors, `code_chunks`, `repo_files` and the `repos` row (204; 404 if missing). If the vector delete fails the DB rows are kept so it can be retried. Deleting a repo that is still embedding is safe: the background job notices and cleans up its own vectors.
- `GET /repos/{repo_id}/files` — `[{ file_path, language, size_bytes }]`
- `GET /repos/{repo_id}/files/content?path=src/app.js` — `{ file_path, language, content }`

### Agents (LangGraph)

Each agent is a small `StateGraph` in `app/agents/`, run on the model set by `AGENT_MODEL` (default `claude-sonnet-5-5`). All are synchronous request/response and can take 10–60s.

| Endpoint | Body | Returns |
|---|---|---|
| `POST /repos/{id}/agents/review` | `{ "file_path": "app/x.py" }` | `{ file_path, summary, issues: [{ severity, category, line, title, description, suggestion }] }`, sorted critical → low |
| `POST /repos/{id}/agents/docs` | `{ "file_path": "app/x.py" }` or `{}` | `{ mode: "file"\|"repo", file_path, documentation }` — file mode returns the source with docstrings added; repo mode returns a README |
| `POST /repos/{id}/agents/architecture` | none | `{ overview, languages, entry_points, components, dependencies, data_flow, mermaid }` |

`404` for an unknown repo or file. Repos ingested before Phase 5 have no stored file content, so agents fall back to stitching that file's code chunks together.

### `GET /repos/{repo_id}/ask`

Errors: `404` unknown repo, `409` repo still `PENDING` or `FAILED`, `422` empty/over-long question, `503` embedding provider failed, `502` vector search or LLM failed.

Ask a question about an ingested repo. Query param **`question`** (required).

Flow: embed the question with Voyage → search that repo’s Pinecone namespace (`top_k=5`) → Claude Haiku answers using only retrieved code.

```bash
curl "http://localhost:8000/repos/3ebf8141-cf59-4308-ad3c-5185f40b90b1/ask?question=How%20does%20auth%20work"
```

```ts
const params = new URLSearchParams({ question });
const res = await fetch(
  `http://localhost:8000/repos/${repoId}/ask?${params}`,
);
```

**200**

```json
{
  "answer": "Auth hashes the password in userServices.js and issues a token on login.",
  "sources": [
    {
      "file_path": "services/userServices.js",
      "name": "<anonymous>",
      "start_line": 40,
      "end_line": 112
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `answer` | string | Claude’s reply; cites file/function when possible |
| `sources` | array | Up to 5 Pinecone matches used as context |
| `sources[].file_path` | string | Path stored at embed time |
| `sources[].name` | string | Function/class name, or `"<anonymous>"` |
| `sources[].start_line` | number | 1-based |
| `sources[].end_line` | number | 1-based |

| Status | When |
|---|---|
| 422 | Missing `question` query param |

There is no check that `repo_id` exists in Postgres. An unknown id queries an empty Pinecone namespace; Claude will typically say the answer is not in the context. Sources may be an empty array.

Long questions go in the query string (URL length limits apply).

---

## Types (frontend)

```ts
type RepoStatus = "PENDING" | "INGESTED" | "FAILED";

interface Repo {
  id: string;           // UUID
  name: string;
  source: "zip" | "github_url";
  status: RepoStatus;   // successful ingest is always "INGESTED"
  file_count: number;
  created_at: string;   // ISO datetime
  updated_at: string;
}

interface AskSource {
  file_path: string;
  name: string;
  start_line: number;
  end_line: number;
}

interface AskResponse {
  answer: string;
  sources: AskSource[];
}

interface ErrorResponse {
  detail: string | Array<{ loc: (string | number)[]; msg: string; type: string }>;
}
```

`PENDING` / `FAILED` exist on the model. Current ingest handlers return `INGESTED` or raise HTTP errors — there is no job polling.

Keep `repo.id` in client state. There is no `GET /repos` or `GET /repos/{id}`.

---

## Embeddings (Phase 3)

After chunks are saved, `embed_chunks()` runs for both ZIP and GitHub ingest.

- Model: Voyage **`voyage-code-3`**
- Batch size: 50
- Pinecone namespace: `repo_{repo_id}`
- Vector id: `{repo_id}-{uuid}`
- Embedded text: `file`, `type`, `name`, then the chunk source

Pinecone metadata per vector:

| Key | Value |
|---|---|
| `repo_id` | Repo UUID string |
| `file_path` | Chunk path |
| `name` | Function/class name |
| `type` | `"function"` or `"class"` |
| `start_line` / `end_line` | Line range |
| `code` | Full chunk source (used as RAG context) |

---

## RAG (Phase 4)

`answer_question()`:

1. Embed the question with `voyage-code-3`
2. `index.query` in `repo_{repo_id}`, `top_k=5`, `include_metadata=true`
3. Build context from each match’s file, name, lines, and code
4. Call **`claude-haiku-4-5`** (`max_tokens=1024`) with a system prompt that answers only from that context and cites file + function

---

## Data models (stored, not all exposed)

### `repos`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | string | ZIP filename or GitHub repo name |
| `source` | string | `"zip"` or `"github_url"` |
| `status` | enum | `PENDING`, `INGESTED`, `FAILED` |
| `file_count` | int | Files kept after ignore rules |
| `created_at` / `updated_at` | timestamptz | UTC |

### `repo_files` (not in API responses)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `repo_id` | UUID | FK → `repos.id` (cascade delete) |
| `file_path` | string | Relative path, e.g. `src/app.js` |
| `language` | string \| null | From extension; `null` if unknown |
| `size_bytes` | int | |
| `content` | text \| null | Full source (null for binary files or repos ingested before migration `a1b2c3d4e5f6`) |
| `created_at` | timestamptz | |

### `code_chunks` (not in API responses)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `repo_id` | UUID | FK → `repos.id` (cascade delete) |
| `file_path` | string | Path used at parse time |
| `language` | string \| null | |
| `type` | string | `"function"` or `"class"` |
| `name` | string | Or `"<anonymous>"` |
| `start_line` / `end_line` | int | 1-based |
| `code` | text | Full chunk source |
| `parent` | string \| null | Enclosing class/function name |
| `created_at` | timestamptz | |

Parsing runs only for **python, javascript, typescript, go**. Other languages are stored as files only (and are not embedded).

---

## Ingestion rules

**Skipped directories:** `.git`, `node_modules`, `__pycache__`, `.venv`, `venv`, `dist`, `build`, `.next`, `target`, `.idea`, `.vscode`

**Skipped extensions:** `.pyc`, `.pyo`, `.exe`, `.bin`, `.jpg`, `.jpeg`, `.png`, `.gif`, `.ico`, `.pdf`, `.zip`, `.tar`, `.gz`

**Max file size:** 500 KB

**Language map (extension → tag):**

| Extensions | Language |
|---|---|
| `.py` | python |
| `.js`, `.jsx` | javascript |
| `.ts`, `.tsx` | typescript |
| `.go` | go |
| `.java` | java |
| `.c`, `.h` | c |
| `.cpp`, `.cc`, `.cxx`, `.hpp` | cpp |
| `.rs` | rust |
| `.rb` | ruby |
| `.php` | php |
| `.swift` | swift |
| `.kt`, `.kts` | kotlin |
| `.cs` | csharp |
| `.scala` | scala |
| `.sh`, `.bash`, `.zsh` | shell |
| `.sql` | sql |
| `.html`, `.htm` | html |
| `.css` | css |
| `.scss` / `.sass` | scss / sass |
| `.vue` | vue |
| `.svelte` | svelte |

Unknown extensions get `language: null` (e.g. `package.json`).

---

## Limits and safeguards

- ZIP uploads: 50 MB compressed, 300 MB / 20,000 entries unzipped (413 beyond that). GitHub clones time out after 120 s.
- Symlinks, `.env*`, lockfiles, `__MACOSX` and binaries are never ingested.
- Retrieved code is passed to the model inside `<code_context>` tags and treated as untrusted data.

## Not available yet (do not call)

- Chunk list endpoints
- Auth, background jobs, progress/status polling (Phase 7)
