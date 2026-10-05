from pydantic import BaseModel
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, UploadFile, File, Depends, status
from sqlalchemy import select
from app.agents.architecture import run_architecture_explainer
from app.agents.code_review import run_code_review
from app.agents.common import get_repo_or_404, parse_repo_id
from app.agents.docs_generator import run_docs_generator
from app.models.repo import Repo, RepoFile
from app.services.qa import answer_question
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.ingestion import delete_repo, process_url_upload, process_zip_upload

router = APIRouter()

class RepoUrlRequest(BaseModel):
    url: str

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_repo(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    repo = await process_zip_upload(file, db, background)
    return repo


@router.post("/from-url", status_code=status.HTTP_201_CREATED)
async def upload_repo_url(
    request: RepoUrlRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    repo = await process_url_upload(request.url, db, background)
    return repo


@router.get("/{repo_id}/ask")
async def ask_question(
    repo_id: str,
    question: str = Query(..., min_length=1, max_length=2000),
    db: AsyncSession = Depends(get_db),
):
    return await answer_question(db, repo_id, question)


@router.get("")
async def list_repos(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Repo).order_by(Repo.created_at.desc()))
    return result.scalars().all()


@router.get("/{repo_id}")
async def get_repo(repo_id: str, db: AsyncSession = Depends(get_db)):
    return await get_repo_or_404(db, repo_id)


@router.delete("/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_repo(repo_id: str, db: AsyncSession = Depends(get_db)):
    await delete_repo(parse_repo_id(repo_id), db)


@router.get("/{repo_id}/files")
async def list_repo_files(repo_id: str, db: AsyncSession = Depends(get_db)):
    await get_repo_or_404(db, repo_id)
    result = await db.execute(
        select(RepoFile.file_path, RepoFile.language, RepoFile.size_bytes)
        .where(RepoFile.repo_id == parse_repo_id(repo_id))
        .order_by(RepoFile.file_path)
    )
    return [
        {"file_path": p, "language": lang, "size_bytes": size}
        for p, lang, size in result.all()
    ]


@router.get("/{repo_id}/files/content")
async def get_file_content(repo_id: str, path: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RepoFile).where(
            RepoFile.repo_id == parse_repo_id(repo_id), RepoFile.file_path == path
        )
    )
    repo_file = result.scalar_one_or_none()
    if repo_file is None:
        raise HTTPException(status_code=404, detail="File not found")
    return {
        "file_path": repo_file.file_path,
        "language": repo_file.language,
        "content": repo_file.content,
    }


class ReviewRequest(BaseModel):
    file_path: str


class DocsRequest(BaseModel):
    file_path: str | None = None  # omit to generate a repo-level README


@router.post("/{repo_id}/agents/review")
async def agent_code_review(
    repo_id: str, request: ReviewRequest, db: AsyncSession = Depends(get_db)
):
    await get_repo_or_404(db, repo_id)
    return await run_code_review(db, repo_id, request.file_path)


@router.post("/{repo_id}/agents/docs")
async def agent_docs(
    repo_id: str, request: DocsRequest, db: AsyncSession = Depends(get_db)
):
    await get_repo_or_404(db, repo_id)
    return await run_docs_generator(db, repo_id, request.file_path)


@router.post("/{repo_id}/agents/architecture")
async def agent_architecture(repo_id: str, db: AsyncSession = Depends(get_db)):
    await get_repo_or_404(db, repo_id)
    return await run_architecture_explainer(db, repo_id)
