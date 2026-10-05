import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    String,
    Integer,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RepoStatus(str, enum.Enum):
    PENDING = "PENDING"
    INGESTED = "INGESTED"
    FAILED = "FAILED"


class Repo(Base):
    __tablename__ = "repos"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    name: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    source: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    status: Mapped[RepoStatus] = mapped_column(
        SAEnum(RepoStatus),
        default=RepoStatus.PENDING,
        nullable=False,
    )

    file_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    files: Mapped[list["RepoFile"]] = relationship(
        "RepoFile",
        back_populates="repo",
        cascade="all, delete-orphan",
    )

    chunks: Mapped[list["CodeChunkModel"]] = relationship(
        "CodeChunkModel",
        back_populates="repo",
        cascade="all, delete-orphan",
)


class RepoFile(Base):
    __tablename__ = "repo_files"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    repo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("repos.id", ondelete="CASCADE"),
        nullable=False,
    )

    file_path: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    language: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    size_bytes: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    # Full source text, so agents can read files after the temp dir is gone.
    content: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    repo: Mapped["Repo"] = relationship(
        "Repo",
        back_populates="files",
    )

class CodeChunkModel(Base):
    __tablename__ = "code_chunks"

    id : Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    repo: Mapped["Repo"] = relationship(
        "Repo",
        back_populates="chunks",
        )

    repo_id : Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("repos.id", ondelete="CASCADE"),
        nullable=False,
    )
    file_path : Mapped[str] = mapped_column(
        String,
        nullable=False,
    )
    language : Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )
    type : Mapped[str] = mapped_column(
        String,
        nullable=False,
    )
    name : Mapped[str] = mapped_column(
        String,
        nullable=False,
    )
    start_line : Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    end_line : Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    code : Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    parent : Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )
    created_at : Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
