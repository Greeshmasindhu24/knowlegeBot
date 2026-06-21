"""Citation formatting for RAG responses."""

from rag.retrieval import RetrievedChunk
from models.schemas import Citation


def format_context_block(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return ""

    blocks: list[str] = []
    for idx, chunk in enumerate(chunks, start=1):
        meta = chunk.metadata
        page = meta.get("page_number") or meta.get("pageNumber") or "N/A"
        blocks.append(
            f"[Source {idx}]\n"
            f"Document: {meta.get('title', 'Unknown')}\n"
            f"Department: {meta.get('department', 'N/A')}\n"
            f"Source: {meta.get('source', 'N/A')}\n"
            f"Page: {page}\n"
            f"Content:\n{chunk.content}"
        )
    return "\n\n---\n\n".join(blocks)


def chunks_to_citations(chunks: list[RetrievedChunk]) -> list[Citation]:
    citations: list[Citation] = []
    for idx, chunk in enumerate(chunks, start=1):
        meta = chunk.metadata
        page_raw = meta.get("page_number") or meta.get("pageNumber")
        citations.append(
            Citation(
                source_index=idx,
                document_id=str(meta.get("document_id", chunk.id)),
                title=str(meta.get("title", "Unknown")),
                source=str(meta.get("source")) if meta.get("source") else None,
                department=str(meta.get("department")) if meta.get("department") else None,
                page_number=int(page_raw) if page_raw is not None else None,
                content_snippet=chunk.content[:300],
            )
        )
    return citations


NO_CONTEXT_MESSAGE = (
    "I don't have any relevant documents in the knowledge base to answer this question. "
    "Please upload related documents or rephrase your question with more specific terms."
)
