import zipfile
import io
import shutil
import tempfile
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import UploadFile, HTTPException
from app.models.repo import Repo, RepoFile, RepoStatus


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

def should_include_file(path: Path) ->bool :
    if any(part in IGNORED_DIRS for part in path.parts):
        return False
    
    if path.suffix.lower() in IGNORED_EXTENSIONS:
        return False
    
    if path.stat().st_size > 500 * 1024: #500KB
        return False
    
    return True


def detect_language(path: Path) -> str | None:
    return LANGUAGE_MAP.get(path.suffix.lower())

async def process_zip_upload(file: UploadFile, db: AsyncSession) -> Repo:
    #step 1: Read the uploaded file content
    contents  = await file.read()

    # step 2 : Validate that the uploaded file is a real ZIP
    if not zipfile.is_zipfile(io.BytesIO(contents)):
        raise HTTPException(
            status_code = 400,
            detail = "Uploaded file is not a valid ZIP",
        )

    # create a temporary directory to extract the ZIP file
    temp_dir  = tempfile.mkdtemp()

    # open the zip from memory and extract it to the temporary directory temp_dir
    with zipfile.ZipFile(io.BytesIO(contents), "r") as zip_file:
        zip_file.extractall(temp_dir)
    
    # Step 4: Walk through extracted files and collect metadata
    collected_files = []

    for path in Path(temp_dir).rglob("*"):
        if path.is_dir():
            continue
        if not should_include_file(path):
            continue

        collected_files.append({
            "file_path": str(path.relative_to(temp_dir)),
            "language": detect_language(path),
            "size_bytes": path.stat().st_size,
        })
    
    # step 5 — save to the database.
    repo = Repo(
        name=file.filename,
        source="zip",
        status=RepoStatus.INGESTED,
        file_count=len(collected_files),
        )
    db.add(repo)
    await db.commit()
    await db.refresh(repo)

    # step 6 — save the files to the database
    for f in collected_files:
        repo_file = RepoFile(
            repo_id=repo.id,
            file_path=f["file_path"],
            language=f["language"],
            size_bytes=f["size_bytes"],
        )
        db.add(repo_file)
    await db.commit()

    shutil.rmtree(temp_dir, ignore_errors=True) # clean up the temporary directory
    return repo

        
        