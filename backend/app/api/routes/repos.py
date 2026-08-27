from fastapi import APIRouter, UploadFile, File, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.ingestion import process_zip_upload

router = APIRouter()

# Phase 1 endpoints go here

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_repo(
    file: UploadFile = File(...), 
    db: AsyncSession = Depends(get_db)
    ): 
    repo = await process_zip_upload(file, db)
    return repo
