from typing import TypedDict
import anthropic
from app.services.embedder import voyage_client, index
from app.config import settings


class Source(TypedDict):
    file_path : str
    name : str
    start_line : int
    end_line : int

class AnswerResponse(TypedDict):
    answer : str
    sources : list[Source]


async def answer_question(repo_id: str , question: str) -> dict:
    
    result = voyage_client.embed([question], model = "voyage-code-3")
    question_vector = result.embeddings[0]
    print(f"✅ Embedded question — vector length: {len(question_vector)}")

    search_result = index.query(
        vector = question_vector,
        top_k = 5,
        namespace = f"repo_{repo_id}",
        include_metadata = True,
    )
    print(f"✅ Pinecone returned {len(search_result.matches)} matches")
    for i, match in enumerate(search_result.matches):
        print(f"  Match {i+1}: score={match.score:.3f} | {match.metadata.get('file_path')} | {match.metadata.get('name')}")

    context_parts = []
    sources = []

    for match in search_result.matches:
        context_parts.append(
            f"File: {match.metadata['file_path']}\n"
            f"Function: {match.metadata['name']}\n"
            f"Lines: {match.metadata['start_line']}-{match.metadata['end_line']}\n"
            f"Code: {match.metadata.get('code','')}\n"
        )

        sources.append({
            "file_path": match.metadata["file_path"],
            "name": match.metadata["name"],
            "start_line": match.metadata["start_line"],
            "end_line": match.metadata["end_line"],
        })
    
    context = "\n---\n".join(context_parts)
    print(f"✅ Context assembled — {len(context)} characters, {len(sources)} sources")
    print(f"--- CONTEXT PREVIEW ---\n{context[:500]}\n---")

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    message = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=1024,
        system="""You are a code analysis assistant. Answer questions about the codebase
    using ONLY the provided code context. Always cite the specific file and function
    where you found the answer. If the answer is not in the context, say so clearly.""",
        messages=[
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {question}"
            }
        ]
    )

    answer = message.content[0].text

    return AnswerResponse(
        answer=answer,
        sources=sources,
    )
