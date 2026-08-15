from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.config import settings


router = APIRouter()


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    database_status = "ok"
    app_status = "ok"

    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        database_status = f"error : {str(e)}"
        app_status = "degraded"

    return {
        "status": app_status,
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "services": {
            "database": database_status,
        },
    }