# CodeSense AI

CodeSense AI is a code-understanding platform. You ingest a repository (ZIP upload or GitHub URL), the backend parses it into named code chunks (functions and classes), embeds those chunks, and answers questions about the codebase with cited sources.

This repo is a monorepo:

| Directory | Stack | Status |
|---|---|---|
| [`backend/`](./backend) | FastAPI, PostgreSQL (Neon), Alembic, Tree-sitter, Voyage AI, Pinecone, Claude | Phases 0–4 done |
| [`frontend/`](./frontend) | Next.js 16, React 19, Tailwind | Ingest UI live; chat / file tree / agents not yet |

Backend version: **0.1.0** · Python **3.12+** (below 3.15)

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

**Phase 3 — Embeddings + Pinecone**
- Embed each code chunk with Voyage AI (`voyage-code-3`)
- Store vectors in Pinecone, namespace per repo (`repo_{id}`)
- Runs automatically after ZIP or GitHub ingest

**Phase 4 — RAG / Question Answering**
- `GET /repos/{id}/ask?question=...`
- Question → embed → search Pinecone (top 5) → Claude answers with sources

**Phase 5 — LangGraph Agents**
- `POST /repos/{id}/agents/review` — Code Review Agent (bugs, security, severity, line numbers)
- `POST /repos/{id}/agents/docs` — Documentation Agent (docstrings for a file, or a repo README)
- `POST /repos/{id}/agents/architecture` — Architecture Agent (components, dependencies, Mermaid diagram)
- Read APIs: `GET /repos`, `GET /repos/{id}`, `GET /repos/{id}/files`, `GET /repos/{id}/files/content?path=`
- File contents are now stored in `repo_files.content`, and chunk paths are repo-relative

### Upcoming

**Phase 6 — Frontend** (done — Next.js 16 / React 19 / TypeScript, not Vite)
- Home: ZIP dropzone + GitHub URL form, repo list from `GET /repos`
- Repo dashboard at `/repos/[id]`: file tree, Shiki-highlighted code viewer, grounded chat with clickable sources, agent panel (review, docs, architecture with Mermaid diagram)
- TanStack Query for all API calls

**Phase 7 — Auth + Background Jobs + Deployment**
- JWT auth
- ARQ + Redis for background jobs
- Deploy to Render + Netlify

---

## What works today

Ingest a repo, ask questions about it, browse its files, and run the three LangGraph agents. Files and chunks stay in Postgres; vectors live in Pinecone. Repos can be deleted (vectors and all DB rows). There is no auth.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | App + database health |
| `POST` | `/repos/upload` | Ingest a ZIP (`multipart/form-data`, field `file`) |
| `POST` | `/repos/from-url` | Clone a public GitHub URL (`{ "url": "https://github.com/..." }`) |
| `GET` | `/repos/{id}/ask` | Ask a question (`?question=...`); returns answer + sources |

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
                                   │  5. Voyage voyage-code-3 embeddings
                                   ▼
                            PostgreSQL (Neon)
                            Pinecone (namespace repo_{id})

       │  GET /repos/{id}/ask?question=
       └──────────────────────────►│
                                   │  1. Embed the question
                                   │  2. Query Pinecone (top 5)
                                   │  3. Claude Haiku answers with sources
                                   ▼
                            { answer, sources[] }
```

Agents (`/repos/{id}/agents/*`) run LangGraph graphs for review, docs and architecture. Later: JWT, background jobs.

---

## Quick start

### Backend

```bash
cd backend
poetry install
# Create backend/.env (see backend/README.md)
poetry run alembic upgrade head
poetry run uvicorn app.main:app --reload --port 8000
```

Required env: `DATABASE_URL`, `VOYAGE_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `ANTHROPIC_API_KEY`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Optional: `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8000`).

The frontend covers the whole backend API: ingest (ZIP / GitHub URL), repo list, file tree + code viewer, chat against `/repos/{id}/ask`, and the three agents. No auth.

---

## Repository layout

```
codesenseai/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS
│   │   ├── config.py            # Settings from .env
│   │   ├── database.py          # Async SQLAlchemy + Neon
│   │   ├── api/routes/          # health, repos, ask
│   │   ├── models/repo.py       # Repo, RepoFile, CodeChunk
│   │   └── services/
│   │       ├── ingestion.py     # ZIP + GitHub ingest
│   │       ├── parser.py        # Tree-sitter chunks
│   │       ├── embedder.py      # Voyage + Pinecone
│   │       └── qa.py            # RAG ask
│   ├── alembic/                 # Migrations
│   └── README.md                # API + backend docs
├── frontend/
│   ├── app/                     # Next.js App Router
│   ├── components/              # Ingest UI
│   └── lib/                     # API client, types, session storage
└── README.md                    # This file
```

---

## Frontend integration (short)

- **No auth.** No `/api` prefix.
- Upload ZIP with `FormData` field name `file`. Do not set `Content-Type` manually.
- GitHub URLs must start with `https://github.com/`.
- Ingest endpoints are **synchronous** and now also embed into Pinecone — keep a loading state.
- Success body is repo metadata only. Save `id`; there is no `GET /repos/{id}`.
- Ask with `GET /repos/{id}/ask?question=...`. Response: `{ answer, sources }`.
- Error shape: `{ "detail": "..." }` (400) or FastAPI validation array (422).

Full request/response examples, TypeScript types, ignored paths, and language maps: **[backend/README.md](./backend/README.md)**.
