from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings


# Database engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,      # logs SQL in dev, silent in prod
    pool_pre_ping=True,       # critical for Neon — tests connection before use
)


# Session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# Base class for all SQLAlchemy models
class Base(DeclarativeBase):
    pass


# FastAPI database dependency
async def get_db()-> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise