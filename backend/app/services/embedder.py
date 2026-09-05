import voyageai
from pinecone import Pinecone
import uuid
from app.config import settings

BATCH_SIZE = 50
voyage_client = voyageai.Client(api_key=settings.VOYAGE_API_KEY)
pc = Pinecone(api_key=settings.PINECONE_API_KEY)
index = pc.Index(settings.PINECONE_INDEX_NAME)

async def embed_chunks(chunks: list, repo_id: str) -> int:
    texts = []
    for chunk in chunks:
        texts.append(f"file: {chunk.file_path}\ntype: {chunk.type}\nname: {chunk.name}\n\n{chunk.code}")
    

    # process inbatch of 50
    for i in range(0,len(texts),BATCH_SIZE):
        batch_texts = texts[i : i+BATCH_SIZE]
        batch_chunks = chunks[i : i+BATCH_SIZE]

        #generate embeddings for this batch
        result = voyage_client.embed(batch_texts,model="voyage-code-3")

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
                    "code": chunk.code,
                },
            })
        
        # store this batch in Pinecone
        index.upsert(
            vectors = vectors,
            namespace = f"repo_{repo_id}"
        )
    return len(chunks)