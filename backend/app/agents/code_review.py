from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.common import get_llm, load_file_content, numbered


class Issue(BaseModel):
    severity: Literal["critical", "high", "medium", "low"]
    category: Literal["bug", "security", "performance", "error-handling", "maintainability", "style"]
    line: int | None = Field(None, description="1-based line number the issue starts on")
    title: str
    description: str
    suggestion: str = Field(description="Concrete fix")


class ReviewResult(BaseModel):
    summary: str
    issues: list[Issue]


class ReviewState(TypedDict, total=False):
    db: AsyncSession
    repo_id: str
    file_path: str
    content: str
    language: str | None
    result: ReviewResult


SYSTEM = """You are a senior engineer doing a code review. Report only real problems:
bugs, security flaws, unhandled errors, performance traps, and notable maintainability issues.
Do not invent issues; if the file is clean, return an empty list. Line numbers must match the
numbered listing. Rate severity honestly: critical = exploitable/data loss, high = likely bug,
medium = edge-case bug or risky pattern, low = minor."""


async def load_node(state: ReviewState) -> ReviewState:
    content, language = await load_file_content(state["db"], state["repo_id"], state["file_path"])
    return {"content": content, "language": language}


async def review_node(state: ReviewState) -> ReviewState:
    llm = get_llm().with_structured_output(ReviewResult)
    result = await llm.ainvoke([
        ("system", SYSTEM),
        ("user", f"File: {state['file_path']} ({state.get('language') or 'unknown'})\n\n{numbered(state['content'])}"),
    ])
    rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    result.issues.sort(key=lambda i: rank[i.severity])
    return {"result": result}


def build_graph():
    g = StateGraph(ReviewState)
    g.add_node("load", load_node)
    g.add_node("review", review_node)
    g.add_edge(START, "load")
    g.add_edge("load", "review")
    g.add_edge("review", END)
    return g.compile()


_graph = build_graph()


async def run_code_review(db: AsyncSession, repo_id: str, file_path: str) -> dict:
    out = await _graph.ainvoke({"db": db, "repo_id": repo_id, "file_path": file_path})
    return {"file_path": file_path, **out["result"].model_dump()}
