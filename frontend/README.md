# CodeSense AI — Frontend

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4. Talks to the FastAPI backend in `../backend`.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL` if the API is not at `http://localhost:8000` (the backend's `CORS_ORIGINS` must allow the frontend origin).

## Pages

| Route | What it does |
|---|---|
| `/` | Ingest a repo (ZIP drop or GitHub URL), list existing repos |
| `/repos/[id]` | Dashboard: file tree · code viewer · **Ask** (RAG chat) and **Agents** (review, docs, architecture) |

## Structure

- `lib/api.ts` — typed client for every backend endpoint; `lib/types.ts` — response types
- `lib/highlight.ts` — lazy Shiki highlighting hook
- `components/` — `repo-dashboard`, `file-tree`, `code-viewer`, `chat-panel`, `agent-panel`, `markdown`, `mermaid-diagram`, ingest forms
- State: TanStack Query (`Providers` in `app/layout.tsx`)

Agent calls are synchronous and can take 10–60 s; the UI shows a spinner until they return. Auth is intentionally not implemented.
