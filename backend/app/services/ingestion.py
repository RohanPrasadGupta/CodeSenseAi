import asyncio
import os
import logging
import subprocess
import zipfile
import io
import shutil
import tempfile
import uuid
from pathlib import Path
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import BackgroundTasks, UploadFile, HTTPException
from app.models.repo import Repo, RepoFile, RepoStatus
from app.services.parser import parse_file
from app.models.repo import CodeChunkModel
from app.database import AsyncSessionLocal
from app.services.embedder import EmbeddingError, delete_namespace, embed_chunks, index


LANGUAGE_MAP = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".go": "go",
    ".java": "java",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
    ".rs": "rust",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".cs": "csharp",
    ".scala": "scala",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".sql": "sql",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "scss",
    ".sass": "sass",
    ".vue": "vue",
    ".svelte": "svelte",
}

IGNORED_DIRS = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    ".next",
    "__MACOSX",     # macOS zip metadata (binary AppleDouble files)
    "target",       # Rust/Java build output
    ".idea",        # IDE files
    ".vscode",
}

IGNORED_EXTENSIONS = {
    ".pyc",
    ".pyo",
    ".exe",
    ".bin",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".ico",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
}

IGNORED_NAMES = {
    ".DS_Store",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "bun.lockb",
}


MAX_ZIP_BYTES = 50 * 1024 * 1024            # compressed upload
MAX_UNZIPPED_BYTES = 300 * 1024 * 1024      # zip-bomb guard
MAX_ZIP_ENTRIES = 20_000
CLONE_TIMEOUT_S = 120


def should_include_file(path: Path) ->bool :
    # A symlink in an uploaded/cloned repo could point at host files (e.g. /etc/passwd).
    if path.is_symlink():
        return False

    if any(part in IGNORED_DIRS for part in path.parts):
        return False

    # Never ingest secrets: file contents are stored in the DB and sent to LLM/embedding APIs.
    if path.name in IGNORED_NAMES or path.name.startswith(".env") or path.name.startswith("._"):
        return False
    
    if path.suffix.lower() in IGNORED_EXTENSIONS:
        return False
    
    try:
        if path.stat().st_size > 500 * 1024: #500KB
            return False
    except OSError:
        return False
    
    return True


def detect_language(path: Path) -> str | None:
    return LANGUAGE_MAP.get(path.suffix.lower())

def collect_files(root: str) -> list[dict]:
    collected = []
    for path in Path(root).rglob("*"):
        if path.is_dir() or path.is_symlink():
            continue
        if not should_include_file(path):
            continue
        collected.append({
            "file_path": str(path.relative_to(root)),
            "file_path_absolute": str(path),
            "language": detect_language(path),
            "size_bytes": path.stat().st_size,
        })
    return collected


def read_text(path: str) -> str | None:
    try:
        text = Path(path).read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None
    # Postgres text columns reject NUL bytes; a NUL means it's really a binary file.
    return None if "\x00" in text else text


logger = logging.getLogger(__name__)


async def persist_and_embed(
    repo: Repo, collected_files: list[dict], db: AsyncSession, background: BackgroundTasks
) -> None:
    """Save files + chunks now; embed in the background (paced to the Voyage limits).

    The repo stays PENDING until embedding finishes, then becomes INGESTED or FAILED.
    Chunk paths are repo-relative."""
    for f in collected_files:
        db.add(RepoFile(
            repo_id=repo.id,
            file_path=f["file_path"],
            language=f["language"],
            size_bytes=f["size_bytes"],
            content=read_text(f["file_path_absolute"]),
        ))

    all_chunks = []
    for f in collected_files:
        if f["language"] is None:
            continue
        chunks = parse_file(f["file_path_absolute"], f["language"], display_path=f["file_path"])
        all_chunks.extend(chunks)
        for chunk in chunks:
            db.add(CodeChunkModel(
                repo_id=repo.id,
                file_path=chunk.file_path,
                language=chunk.language,
                type=chunk.type,
                name=chunk.name,
                start_line=chunk.start_line,
                end_line=chunk.end_line,
                code=chunk.code,
                parent=chunk.parent,
            ))

    try:
        await db.commit()
    except Exception as exc:
        # Nothing useful was saved: drop the half-created repo instead of leaving an empty orphan.
        await db.rollback()
        await db.delete(await db.get(Repo, repo.id))
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to save repository files: {type(exc).__name__}") from exc

    background.add_task(embed_in_background, str(repo.id), all_chunks)


async def embed_in_background(repo_id: str, chunks: list) -> None:
    status = RepoStatus.INGESTED
    try:
        await embed_chunks(chunks, repo_id)
    except EmbeddingError:
        logger.exception("Embedding failed for repo %s", repo_id)
        status = RepoStatus.FAILED
        delete_namespace(repo_id)
    except Exception:
        logger.exception("Unexpected error embedding repo %s", repo_id)
        status = RepoStatus.FAILED
    async with AsyncSessionLocal() as db:
        repo = await db.get(Repo, uuid.UUID(repo_id))
        if repo is None:
            # Deleted while embedding: don't leave orphan vectors behind.
            delete_namespace(repo_id)
            return
        repo.status = status
        await db.commit()


async def delete_repo(repo_id: uuid.UUID, db: AsyncSession) -> None:
    """Remove a repo everywhere: Pinecone vectors, code_chunks, repo_files, repos."""
    repo = await db.get(Repo, repo_id)
    if repo is None:
        raise HTTPException(status_code=404, detail="Repo not found")

    # Vectors first: if this fails we keep the DB rows so the delete can be retried.
    try:
        await asyncio.to_thread(index.delete, delete_all=True, namespace=f"repo_{repo_id}")
    except Exception as exc:
        if "not found" not in str(exc).lower():   # namespace never created / already gone
            raise HTTPException(status_code=502, detail=f"Could not delete vectors: {exc}") from exc

    await db.execute(delete(CodeChunkModel).where(CodeChunkModel.repo_id == repo_id))
    await db.execute(delete(RepoFile).where(RepoFile.repo_id == repo_id))
    await db.execute(delete(Repo).where(Repo.id == repo_id))
    await db.commit()


async def process_zip_upload(file: UploadFile, db: AsyncSession, background: BackgroundTasks) -> Repo:
    contents = await file.read()

    if len(contents) > MAX_ZIP_BYTES:
        raise HTTPException(status_code=413, detail=f"ZIP too large (max {MAX_ZIP_BYTES // (1024 * 1024)} MB)")

    if not zipfile.is_zipfile(io.BytesIO(contents)):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid ZIP")

    temp_dir = tempfile.mkdtemp()
    try:
        with zipfile.ZipFile(io.BytesIO(contents), "r") as zip_file:
            infos = zip_file.infolist()
            if len(infos) > MAX_ZIP_ENTRIES or sum(i.file_size for i in infos) > MAX_UNZIPPED_BYTES:
                raise HTTPException(status_code=413, detail="ZIP expands to too much data")
            zip_file.extractall(temp_dir)

        collected_files = collect_files(temp_dir)

        repo = Repo(
            name=file.filename,
            source="zip",
            status=RepoStatus.PENDING,
            file_count=len(collected_files),
        )
        db.add(repo)
        await db.commit()
        await db.refresh(repo)

        await persist_and_embed(repo, collected_files, db, background)
        return repo
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


async def process_url_upload(url: str, db: AsyncSession, background: BackgroundTasks) -> Repo:
    # step 1: Validate the URL

    if not url.startswith("https://github.com/"):
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub URL",
        )
    
    # step 2 : Extract the repository name from the URL

    repo_name = url.split("?")[0].split("#")[0].rstrip("/").split("/")[-1].removesuffix(".git")

    if not repo_name:
        raise HTTPException(
            status_code=400,
            detail="Invalid repository name",
        )
    
    # step 3 : Create a temporary directory to clone the repository
    temp_dir = tempfile.mkdtemp()

    try:
        #step 4 : clone the repository
        try:
            await asyncio.to_thread(
                subprocess.run,
                ["git", "clone", "--depth", "1", "--", url, temp_dir],
                check=True,
                capture_output=True,
                text=True,
                timeout=CLONE_TIMEOUT_S,
                env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},  # fail instead of hanging on a login prompt
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(status_code=504, detail=f"Clone timed out after {CLONE_TIMEOUT_S}s") from exc
        except subprocess.CalledProcessError as exc:
            reason = (exc.stderr or "").strip().splitlines()[-1:] or ["unknown error"]
            raise HTTPException(
                status_code=400,
                detail=f"Failed to clone the repository (is it public?): {reason[0]}",
            ) from exc
        except OSError as exc:
            raise HTTPException(status_code=500, detail="git is not available on the server") from exc

        collected_files = collect_files(temp_dir)

        repo = Repo(
            name = repo_name,
            source = "github_url",
            status = RepoStatus.PENDING,
            file_count = len(collected_files),
        )
        db.add(repo)
        await db.commit()
        await db.refresh(repo)

        await persist_and_embed(repo, collected_files, db, background)
        return repo

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)