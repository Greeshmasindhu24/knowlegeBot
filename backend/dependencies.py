"""FastAPI dependency injection helpers."""

from functools import lru_cache

from rag.vector_store import VectorStore
from services.embeddings import get_embeddings


@lru_cache
def get_vector_store() -> VectorStore:
    return VectorStore(get_embeddings())
