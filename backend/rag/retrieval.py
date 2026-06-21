"""Retrieval layer over ChromaDB."""

from dataclasses import dataclass, field
from typing import Any

from langchain_core.embeddings import Embeddings

from config import get_settings
from rag.vector_store import VectorStore

settings = get_settings()


@dataclass
class RetrievedChunk:
    id: str
    content: str
    metadata: dict[str, Any]
    similarity: float


@dataclass
class RetrievalResult:
    chunks: list[RetrievedChunk] = field(default_factory=list)
    query: str = ""

    @property
    def has_results(self) -> bool:
        return len(self.chunks) > 0


class DocumentRetriever:
    def __init__(self, embeddings: Embeddings) -> None:
        self.vector_store = VectorStore(embeddings)

    def retrieve(
        self,
        query: str,
        *,
        department: str | None = None,
        top_k: int | None = None,
        threshold: float | None = None,
    ) -> RetrievalResult:
        k = top_k or settings.retrieval_top_k
        min_sim = threshold or settings.similarity_threshold

        raw_matches = self.vector_store.similarity_search(query, k=k, department=department)
        chunks = [
            RetrievedChunk(
                id=m["id"],
                content=m["content"],
                metadata=m["metadata"],
                similarity=m["similarity"],
            )
            for m in raw_matches
            if m["similarity"] >= min_sim
        ]
        return RetrievalResult(chunks=chunks, query=query)
