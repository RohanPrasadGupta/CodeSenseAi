from pydantic import BaseModel
from fastapi import APIRouter, UploadFile, File, Depends, status
from app.services.qa import answer_question
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.ingestion import process_url_upload, process_zip_upload

router = APIRouter()

class RepoUrlRequest(BaseModel):
    url: str

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_repo(
    file: UploadFile = File(...), 
    db: AsyncSession = Depends(get_db)
    ): 
    repo = await process_zip_upload(file, db)
    return repo


@router.post("/from-url", status_code=status.HTTP_201_CREATED)
async def upload_repo_url(
    request: RepoUrlRequest,
    db: AsyncSession = Depends(get_db),
):
    repo = await process_url_upload(request.url, db)
    return repo


@router.get("/{repo_id}/ask")
async def ask_question(repo_id:str, question:str):
    return await answer_question(repo_id, question)    