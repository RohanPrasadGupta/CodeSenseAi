# CodeSense AI

CodeSense AI is a code-understanding platform. You ingest a repository (ZIP upload or GitHub URL), the backend parses it into named code chunks (functions and classes), and later phases will add semantic search, RAG Q&A, and specialized agents.

This repo is a monorepo:

| Directory | Stack | Status |
|---|---|---|
| [`backend/`](./backend) | FastAPI, PostgreSQL (Neon), Alembic, Tree-sitter | Phases 0–2 done |
| [`frontend/`](./frontend) | Next.js 16, React 19, Tailwind | Scaffold only (Phase 6) |

Backend version: **0.1.0** · Python **3.12+**

For API contracts, env vars, data models, and local backend setup, see **[backend/README.md](./backend/README.md)**.

---

## Roadmap

### Done

**Phase 0 — Infrastructure**
- FastAPI + PostgreSQL (Neon) + Alembic
- `config.py`, `database.py`, `main.py`
- `GET /health` working

**Phase 1 — Repository Ingestion**
- `POST /repos/upload` — ZIP file ingestion
- `POST /repos/from-url` — GitHub URL cloning
- File walking, language detection, saved to `repos` + `repo_files`

**Phase 2 — Tree-sitter Parsing**
- Structural parsing — functions and classes extracted as named chunks
- `parse_file()` + `extract_chunks()` for Python, JavaScript, TypeScript, Go
- Chunks saved to `code_chunks` with line numbers and full source

### Upcoming

**Phase 3 — Embeddings + Pinecone**
- Embed each code chunk with Voyage AI (`voyage-code-3`)
- Store vectors in Pinecone, namespace per repo
- Enables semantic search

**Phase 4 — RAG / Question Answering**
- `POST /repos/{id}/ask`
- Question → embed → search Pinecone → Claude answers with sources

**Phase 5 — LangGraph Agents**
- Code Review Agent
- Architecture Explanation Agent
- Documentation Generation Agent

**Phase 6 — React Frontend**
- Upload page, file tree, chat interface, agent panel

**Phase 7 — Auth + Background Jobs + Deployment**
- JWT auth
- ARQ + Redis for background jobs
- Deploy to Render + Netlify

---

## What works today

You can ingest a repo and get back metadata. Files and parsed chunks are stored in Postgres but are **not yet exposed via API**. There is no list/get/delete, no chat, and no auth.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | App + database health |
| `POST` | `/repos/upload` | Ingest a ZIP (`multipart/form-data`, field `file`) |
| `POST` | `/repos/from-url` | Clone a public GitHub URL (`{ "url": "https://github.com/..." }`) |

Typical local URLs:

- Backend: `http://localhost:8000`
- OpenAPI docs: `http://localhost:8000/docs`
- Frontend: `http://localhost:3000` (CORS already allows this origin)

---

## Architecture (current)

```
Frontend (Next.js)          Backend (FastAPI)
localhost:3000              localhost:8000
       │                           │
       │  POST /repos/upload       │
       │  POST /repos/from-url     │
       └──────────────────────────►│
                                   │  1. Extract ZIP or git clone
                                   │  2. Walk files, detect language
                                   │  3. Save repos + repo_files
                                   │  4. Tree-sitter → code_chunks
                                   ▼
                            PostgreSQL (Neon)
```

Later: Voyage embeddings → Pinecone → Claude (RAG) → LangGraph agents.

---

## Quick start

### Backend

```bash
cd backend
poetry install
# Create backend/.env with DATABASE_URL (and optional API keys)
poetry run alembic upgrade head
poetry run uvicorn app.main:app --reload --port 8000
```

Required env: `DATABASE_URL` (async Postgres, e.g. Neon).  
Optional (unused until later phases): `ANTHROPIC_API_KEY`, `PINECONE_API_KEY`, `VOYAGE_API_KEY`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend is still the default Next.js scaffold. Point it at `http://localhost:8000` when wiring APIs.

---

## Repository layout

```
codesenseai/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS
│   │   ├── config.py            # Settings from .env
│   │   ├── database.py          # Async SQLAlchemy + Neon
│   │   ├── api/routes/          # health, repos
│   │   ├── models/repo.py       # Repo, RepoFile, CodeChunk
│   │   └── services/
│   │       ├── ingestion.py     # ZIP + GitHub ingest
│   │       └── parser.py        # Tree-sitter chunks
│   ├── alembic/                 # Migrations
│   └── README.md                # API + backend docs
├── frontend/                    # Next.js app (Phase 6)
└── README.md                    # This file
```

---

## Frontend integration (short)

- **No auth.** No `/api` prefix.
- Upload ZIP with `FormData` field name `file`. Do not set `Content-Type` manually.
- GitHub URLs must start with `https://github.com/`.
- Both ingest endpoints are **synchronous** — keep a loading state; clone/parse can take a while.
- Success body is repo metadata only (`id`, `name`, `source`, `status`, `file_count`, timestamps). Save `id` client-side; there is no `GET /repos/{id}` yet.
- Error shape: `{ "detail": "..." }` (400) or FastAPI validation array (422).

Full request/response examples, TypeScript types, ignored paths, and language maps: **[backend/README.md](./backend/README.md)**.
