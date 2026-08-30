# CodeSense AI — Backend

FastAPI service that ingests repositories, stores file metadata, and parses source into named code chunks (functions and classes).

**Version:** 0.1.0  
**Python:** 3.12+  
**App name:** CodeSense AI

This is the API and setup reference for frontend and backend work. Product overview and roadmap live in the [root README](../README.md).

---

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Infrastructure — FastAPI, PostgreSQL (Neon), Alembic, `/health` | Done |
| 1 | Repository ingestion — ZIP + GitHub URL, `repos` + `repo_files` | Done |
| 2 | Tree-sitter parsing — Python, JS, TS, Go → `code_chunks` | Done |
| 3 | Embeddings + Pinecone (Voyage `voyage-code-3`) | Upcoming |
| 4 | RAG Q&A — `POST /repos/{id}/ask` | Upcoming |
| 5 | LangGraph agents (review, architecture, docs) | Upcoming |
| 6 | React frontend | Upcoming |
| 7 | JWT auth, ARQ + Redis, Render + Netlify | Upcoming |

**Usable from a client today:** `GET /health`, `POST /repos/upload`, `POST /repos/from-url`.  
Files and chunks are written to Postgres but **not exposed** by any read API yet. No auth.

---

## Stack

- FastAPI 0.115 + Uvicorn
- SQLAlchemy 2 (async) + asyncpg
- PostgreSQL (Neon)
- Alembic migrations
- Tree-sitter (Python, JavaScript, TypeScript, Go)
- python-multipart (ZIP uploads)

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

# Unused until Phases 3–4
ANTHROPIC_API_KEY=
PINECONE_API_KEY=
VOYAGE_API_KEY=
```

`DATABASE_URL` is required. Use the SQLAlchemy async form (`postgresql+asyncpg://...`).

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
│   │   └── repos.py            # POST /repos/upload, /from-url
│   ├── models/repo.py          # Repo, RepoFile, CodeChunkModel
│   └── services/
│       ├── ingestion.py        # ZIP + GitHub walk/save
│       └── parser.py           # Tree-sitter extract_chunks
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

Ingest a ZIP. **201**. `multipart/form-data`, field name **`file`**.

The request stays open until extract, parse, and DB writes finish. Show a loading state on the client.

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

Clone a **public** GitHub repo (`git clone --depth 1`). **201**. JSON body.

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

interface ErrorResponse {
  detail: string | Array<{ loc: (string | number)[]; msg: string; type: string }>;
}
```

`PENDING` / `FAILED` exist on the model. Current ingest handlers return `INGESTED` or raise HTTP errors — there is no job polling.

Keep `repo.id` in client state. There is no `GET /repos` or `GET /repos/{id}`.

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

Parsing runs only for **python, javascript, typescript, go**. Other languages are stored as files only.

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

## Not available yet (do not call)

- `GET /repos`, `GET /repos/{id}`
- File tree / file contents endpoints
- Chunk list endpoints
- `POST /repos/{id}/ask` (Phase 4)
- Agent endpoints (Phase 5)
- Auth, background jobs, progress/status polling (Phase 7)

Config already has `ANTHROPIC_API_KEY`, `PINECONE_API_KEY`, and `VOYAGE_API_KEY` for Phases 3–4. They are unused now.
