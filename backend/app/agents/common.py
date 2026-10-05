import uuid

from fastapi import HTTPException
from langchain_anthropic import ChatAnthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.repo import CodeChunkModel, Repo, RepoFile

MAX_FILE_CHARS = 40_000


def get_llm(max_tokens: int = 4096) -> ChatAnthropic:
    return ChatAnthropic(
        model=settings.AGENT_MODEL,
        api_key=settings.ANTHROPIC_API_KEY,
        max_tokens=max_tokens,
    )


def parse_repo_id(repo_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(repo_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid repo id")


async def get_repo_or_404(db: AsyncSession, repo_id: str) -> Repo:
    repo = await db.get(Repo, parse_repo_id(repo_id))
    if repo is None:
        raise HTTPException(status_code=404, detail="Repo not found")
    return repo


async def load_file_content(db: AsyncSession, repo_id: str, file_path: str) -> tuple[str, str | None]:
    """Return (content, language) for a repo file.

    Reads RepoFile.content; for repos ingested before that column existed,
    falls back to stitching the file's code chunks together.
    """
    rid = parse_repo_id(repo_id)
    result = await db.execute(
        select(RepoFile).where(RepoFile.repo_id == rid, RepoFile.file_path == file_path)
    )
    repo_file = result.scalar_one_or_none()
    if repo_file is None:
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    if repo_file.content:
        return repo_file.content[:MAX_FILE_CHARS], repo_file.language

    chunks = (
        await db.execute(
            select(CodeChunkModel)
            .where(CodeChunkModel.repo_id == rid, CodeChunkModel.file_path == file_path)
            .order_by(CodeChunkModel.start_line)
        )
    ).scalars().all()
    if not chunks:
        raise HTTPException(status_code=422, detail="File has no stored content")
    return "\n\n".join(c.code for c in chunks)[:MAX_FILE_CHARS], repo_file.language


def numbered(content: str) -> str:
    """Prefix lines with numbers so the model can cite real line numbers."""
    return "\n".join(f"{i:>4} | {line}" for i, line in enumerate(content.splitlines(), 1))
