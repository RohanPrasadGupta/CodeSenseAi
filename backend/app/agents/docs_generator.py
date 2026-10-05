import asyncio
from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import HTTPException

from app.agents.common import MAX_FILE_CHARS, get_llm, get_repo_or_404, load_file_content, parse_repo_id
from app.models.repo import RepoFile

MAX_FILES_FOR_README = 40


class DocsState(TypedDict, total=False):
    db: AsyncSession
    repo_id: str
    file_path: str | None
    repo_name: str
    summaries: dict[str, str]
    documentation: str
    mode: str


FILE_SYSTEM = """You write documentation for source files. Output the file's full content with
accurate docstrings/JSDoc/GoDoc comments added to every public function, class and method.
Do not change any code behaviour. Return only the documented source in a single fenced code block,
followed by a short bullet list of what each documented symbol does."""

SUMMARY_SYSTEM = "Summarise what this source file is responsible for in 2-3 sentences. No preamble."

README_SYSTEM = """You write a project README in Markdown from per-file summaries.
Include: title, one-paragraph overview, features, project structure (tree with one-line
descriptions), how the pieces fit together, and setup/usage only where the code makes it
evident. Do not invent commands or features that the summaries do not support."""


async def file_docs_node(state: DocsState) -> DocsState:
    content, language = await load_file_content(state["db"], state["repo_id"], state["file_path"])
    if len(content) >= MAX_FILE_CHARS:
        raise HTTPException(status_code=422, detail="File is too large to document in one pass; try a smaller file.")
    resp = await get_llm(8192).ainvoke([
        ("system", FILE_SYSTEM),
        ("user", f"File: {state['file_path']} ({language})\n\n{content}"),
    ])
    if resp.response_metadata.get("stop_reason") == "max_tokens":
        raise HTTPException(status_code=422, detail="Documented output was cut off; try a smaller file.")
    return {"documentation": resp.text, "mode": "file"}


async def summarise_node(state: DocsState) -> DocsState:
    repo = await get_repo_or_404(state["db"], state["repo_id"])
    rows = (
        await state["db"].execute(
            select(RepoFile.file_path, RepoFile.language)
            .where(RepoFile.repo_id == parse_repo_id(state["repo_id"]), RepoFile.language.is_not(None), RepoFile.size_bytes > 0)
            .order_by(RepoFile.size_bytes.desc())
            .limit(MAX_FILES_FOR_README)
        )
    ).all()

    llm = get_llm(400)
    sem = asyncio.Semaphore(5)

    # DB reads happen on one session, so load content first, then fan out LLM calls.
    contents = {}
    for path, _ in rows:
        contents[path], _lang = await load_file_content(state["db"], state["repo_id"], path)

    async def summarise(path: str) -> tuple[str, str]:
        async with sem:
            resp = await llm.ainvoke([("system", SUMMARY_SYSTEM), ("user", f"{path}\n\n{contents[path][:12000]}")])
            return path, resp.text

    results = await asyncio.gather(*(summarise(p) for p, _ in rows), return_exceptions=True)
    summaries = {
        path: (r[1] if not isinstance(r, BaseException) else "(summary unavailable)")
        for (path, _), r in zip(rows, results)
    }
    if not any(not isinstance(r, BaseException) for r in results):
        raise HTTPException(status_code=502, detail="Could not summarise any files; try again.")
    return {"repo_name": repo.name, "summaries": summaries}


async def readme_node(state: DocsState) -> DocsState:
    listing = "\n".join(f"- {p}: {s}" for p, s in sorted(state["summaries"].items()))
    resp = await get_llm(4096).ainvoke([
        ("system", README_SYSTEM),
        ("user", f"Repository: {state['repo_name']}\n\nFile summaries:\n{listing}"),
    ])
    return {"documentation": resp.text, "mode": "repo"}


def route(state: DocsState) -> str:
    return "file_docs" if state.get("file_path") else "summarise"


def build_graph():
    g = StateGraph(DocsState)
    g.add_node("file_docs", file_docs_node)
    g.add_node("summarise", summarise_node)
    g.add_node("readme", readme_node)
    g.add_conditional_edges(START, route, {"file_docs": "file_docs", "summarise": "summarise"})
    g.add_edge("summarise", "readme")
    g.add_edge("file_docs", END)
    g.add_edge("readme", END)
    return g.compile()


_graph = build_graph()


async def run_docs_generator(db: AsyncSession, repo_id: str, file_path: str | None = None) -> dict:
    out = await _graph.ainvoke({"db": db, "repo_id": repo_id, "file_path": file_path})
    return {"mode": out["mode"], "file_path": file_path, "documentation": out["documentation"]}
