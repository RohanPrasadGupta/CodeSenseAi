import re
from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.common import get_llm, get_repo_or_404, parse_repo_id
from app.models.repo import CodeChunkModel, RepoFile

MAX_FILES = 300
MAX_SYMBOLS_PER_FILE = 12
IMPORT_RE = re.compile(r"^\s*(?:from\s+\S+\s+import\s+.+|import\s+.+|(?:const|let|var)\s+.+=\s*require\(.+\)|.*\bfrom\s+['\"].+['\"];?)\s*$")
MAX_IMPORTS_PER_FILE = 15


class Component(BaseModel):
    name: str
    paths: list[str]
    responsibility: str


class Dependency(BaseModel):
    source: str
    target: str
    description: str


class Architecture(BaseModel):
    overview: str
    languages: list[str]
    entry_points: list[str]
    components: list[Component]
    dependencies: list[Dependency]
    data_flow: str
    mermaid: str


class ArchState(TypedDict, total=False):
    db: AsyncSession
    repo_id: str
    repo_name: str
    outline: str
    result: Architecture


SYSTEM = """You are a software architect. From the repository outline (file tree, per-file symbols,
and import lines) explain how the system is structured. Ground every claim in the outline: only
name components, entry points and dependencies you can see evidence for. `dependencies` are
component-to-component relationships. `mermaid` must be a valid `flowchart TD` diagram of the
components and dependencies (node ids alphanumeric, labels quoted), with no code fences."""


async def gather_node(state: ArchState) -> ArchState:
    db, rid = state["db"], parse_repo_id(state["repo_id"])
    repo = await get_repo_or_404(db, state["repo_id"])

    files = (
        await db.execute(
            select(RepoFile.file_path, RepoFile.language, RepoFile.content)
            .where(RepoFile.repo_id == rid)
            .order_by(RepoFile.file_path)
            .limit(MAX_FILES)
        )
    ).all()
    chunks = (
        await db.execute(
            select(CodeChunkModel.file_path, CodeChunkModel.type, CodeChunkModel.name, CodeChunkModel.parent)
            .where(CodeChunkModel.repo_id == rid)
            .order_by(CodeChunkModel.file_path, CodeChunkModel.start_line)
        )
    ).all()

    symbols: dict[str, list[str]] = {}
    for path, kind, name, parent in chunks:
        symbols.setdefault(path, []).append(f"{kind} {parent + '.' if parent else ''}{name}")

    lines = []
    for path, language, content in files:
        lines.append(f"{path} [{language or 'other'}]")
        syms = symbols.get(path, [])[:MAX_SYMBOLS_PER_FILE]
        if syms:
            lines.append("    symbols: " + ", ".join(syms))
        if content and language:
            imports = [l.strip() for l in content.splitlines() if IMPORT_RE.match(l)][:MAX_IMPORTS_PER_FILE]
            if imports:
                lines.append("    imports: " + " | ".join(imports))
    return {"repo_name": repo.name, "outline": "\n".join(lines)}


async def explain_node(state: ArchState) -> ArchState:
    llm = get_llm(6000).with_structured_output(Architecture)
    result = await llm.ainvoke([
        ("system", SYSTEM),
        ("user", f"Repository: {state['repo_name']}\n\n{state['outline']}"),
    ])
    return {"result": result}


def build_graph():
    g = StateGraph(ArchState)
    g.add_node("gather", gather_node)
    g.add_node("explain", explain_node)
    g.add_edge(START, "gather")
    g.add_edge("gather", "explain")
    g.add_edge("explain", END)
    return g.compile()


_graph = build_graph()


async def run_architecture_explainer(db: AsyncSession, repo_id: str) -> dict:
    out = await _graph.ainvoke({"db": db, "repo_id": repo_id})
    return out["result"].model_dump()
