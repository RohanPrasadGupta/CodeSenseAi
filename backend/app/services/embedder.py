import asyncio
import logging
import time
import uuid
from collections import deque

import voyageai
from pinecone import Pinecone
from voyageai.error import RateLimitError

from app.config import settings

logger = logging.getLogger(__name__)

BATCH_SIZE = 50
CHARS_PER_TOKEN = 2.5        # deliberately pessimistic estimate for code
TPM_SAFETY = 0.85            # stay under the limit, don't ride it
# One request must fit inside the per-minute token budget (capped for huge budgets).
BATCH_CHAR_BUDGET = min(60_000, int(settings.VOYAGE_TPM * TPM_SAFETY * CHARS_PER_TOKEN))
MAX_CHARS_PER_CHUNK = 6000   # keeps one giant function from eating the token budget
MIN_ANON_LINES = 4           # tiny nested arrow functions add noise, not signal
RATE_LIMIT_RETRIES = 3
RATE_LIMIT_WAIT_S = 21       # free tier is 3 requests/minute
voyage_client = voyageai.Client(api_key=settings.VOYAGE_API_KEY)
pc = Pinecone(api_key=settings.PINECONE_API_KEY)
index = pc.Index(settings.PINECONE_INDEX_NAME)

class RateLimiter:
    """Sliding-window limiter over the last 60s: at most `rpm` requests and `tpm` tokens."""

    def __init__(self, rpm: int, tpm: int):
        self.rpm = rpm
        self.tpm = int(tpm * TPM_SAFETY)
        self.events: deque[tuple[float, int]] = deque()
        self.lock = asyncio.Lock()

    async def acquire(self, tokens: int) -> None:
        async with self.lock:
            while True:
                now = time.monotonic()
                while self.events and now - self.events[0][0] >= 60:
                    self.events.popleft()
                used = sum(t for _, t in self.events)
                if not self.events or (len(self.events) < self.rpm and used + tokens <= self.tpm):
                    self.events.append((now, tokens))
                    return
                wait = 60 - (now - self.events[0][0]) + 0.5
                logger.info("Voyage pacing: waiting %.0fs to stay under %s RPM / %s TPM", wait, self.rpm, self.tpm)
                await asyncio.sleep(wait)


limiter = RateLimiter(settings.VOYAGE_RPM, settings.VOYAGE_TPM)


class EmbeddingError(Exception):
    """Embedding or vector-store step failed; message is safe to show users."""


def _worth_embedding(chunk) -> bool:
    if chunk.name == "<anonymous>" and chunk.end_line - chunk.start_line + 1 < MIN_ANON_LINES:
        return False
    return True


async def embed_texts(texts: list[str]):
    """Embed through the shared rate limiter. Raises EmbeddingError on failure."""
    return await _embed_with_retry(texts)


async def _embed_with_retry(texts: list[str]):
    await limiter.acquire(int(sum(len(t) for t in texts) / CHARS_PER_TOKEN))
    for attempt in range(RATE_LIMIT_RETRIES + 1):
        try:
            return await asyncio.to_thread(voyage_client.embed, texts, model="voyage-code-3")
        except RateLimitError as exc:
            if attempt == RATE_LIMIT_RETRIES:
                raise EmbeddingError(
                    "Voyage AI rate limit hit. Accounts without a payment method are limited to "
                    "3 requests / 10K tokens per minute; add a payment method at "
                    "https://dashboard.voyageai.com/ (free tokens still apply) and retry."
                ) from exc
            logger.warning("Voyage rate limited, waiting %ss (attempt %s)", RATE_LIMIT_WAIT_S, attempt + 1)
            await asyncio.sleep(RATE_LIMIT_WAIT_S)
        except Exception as exc:
            raise EmbeddingError(f"Embedding failed: {exc}") from exc


def delete_namespace(repo_id: str) -> None:
    try:
        index.delete(delete_all=True, namespace=f"repo_{repo_id}")
    except Exception as exc:
        if "not found" in str(exc).lower():   # nothing was upserted yet
            return
        logger.exception("Could not clean Pinecone namespace for %s", repo_id)


def _batches(texts: list[str]):
    """Yield (start, end) slices bounded by both BATCH_SIZE and BATCH_CHAR_BUDGET."""
    start, chars = 0, 0
    for i, t in enumerate(texts):
        if i > start and (i - start >= BATCH_SIZE or chars + len(t) > BATCH_CHAR_BUDGET):
            yield start, i
            start, chars = i, 0
        chars += len(t)
    if start < len(texts):
        yield start, len(texts)


async def embed_chunks(chunks: list, repo_id: str) -> int:
    chunks = [c for c in chunks if _worth_embedding(c)]
    texts = []
    for chunk in chunks:
        body = chunk.code[:MAX_CHARS_PER_CHUNK]
        texts.append(f"file: {chunk.file_path}\ntype: {chunk.type}\nname: {chunk.name}\n\n{body}")
    

    for lo, hi in _batches(texts):
        batch_texts = texts[lo:hi]
        batch_chunks = chunks[lo:hi]

        #generate embeddings for this batch
        result = await _embed_with_retry(batch_texts)

        # process chunks in batches
        vectors = []

        for chunk,embedding in zip(
            batch_chunks,
            result.embeddings
        ):
            vectors.append({
                "id": f"{repo_id}-{str(uuid.uuid4())}",
                "values": embedding,
                "metadata": {
                    "repo_id": repo_id,
                    "file_path": chunk.file_path,
                    "name": chunk.name,
                    "type": chunk.type,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line, 
                    "code": chunk.code[:MAX_CHARS_PER_CHUNK],
                },
            })
        
        # store this batch in Pinecone
        try:
            await asyncio.to_thread(index.upsert, vectors=vectors, namespace=f"repo_{repo_id}")
        except Exception as exc:
            raise EmbeddingError(f"Vector store upsert failed: {exc}") from exc
    return len(chunks)