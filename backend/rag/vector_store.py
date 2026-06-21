"""ChromaDB vector store wrapper with metadata filtering."""

import uuid
from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings
from langchain_core.embeddings import Embeddings

from config import get_settings

settings = get_settings()


class VectorStore:
    def __init__(self, embeddings: Embeddings) -> None:
        self.embeddings = embeddings
        self._client = self._create_client()
        self._collection = self._client.get_or_create_collection(
            name=settings.chroma_collection,
            metadata={"hnsw:space": "cosine"},
        )

    def _create_client(self) -> chromadb.ClientAPI | chromadb.HttpClient:
        if settings.chroma_persist_dir:
            return chromadb.PersistentClient(
                path=settings.chroma_persist_dir,
                settings=ChromaSettings(anonymized_telemetry=False),
            )
        return chromadb.HttpClient(
            host=settings.chroma_host,
            port=settings.chroma_port,
            settings=ChromaSettings(anonymized_telemetry=False),
        )

    def add_text(self, text: str, metadata: dict[str, Any]) -> str:
        doc_id = str(uuid.uuid4())
        vector = self.embeddings.embed_query(text)
        safe_metadata = {k: (v if isinstance(v, (str, int, float, bool)) else str(v)) for k, v in metadata.items()}
        self._collection.add(
            ids=[doc_id],
            documents=[text],
            embeddings=[vector],
            metadatas=[safe_metadata],
        )
        return doc_id

    def similarity_search(
        self,
        query: str,
        *,
        k: int = 5,
        department: str | None = None,
        sensitivity_max: str | None = None,
    ) -> list[dict[str, Any]]:
        query_vector = self.embeddings.embed_query(query)
        where_filter = self._build_filter(department, sensitivity_max)

        results = self._collection.query(
            query_embeddings=[query_vector],
            n_results=k,
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )

        matches: list[dict[str, Any]] = []
        if not results["ids"] or not results["ids"][0]:
            return matches

        for idx, doc_id in enumerate(results["ids"][0]):
            distance = results["distances"][0][idx] if results["distances"] else 1.0
            similarity = 1.0 - distance
            matches.append(
                {
                    "id": doc_id,
                    "content": results["documents"][0][idx],
                    "metadata": results["metadatas"][0][idx] or {},
                    "similarity": similarity,
                }
            )
        return matches

    @staticmethod
    def _build_filter(department: str | None, sensitivity_max: str | None) -> dict[str, Any] | None:
        clauses: list[dict[str, Any]] = []
        if department and department != "General":
            clauses.append(
                {
                    "$or": [
                        {"department": department},
                        {"department": "General"},
                    ]
                }
            )
        if sensitivity_max:
            clauses.append({"sensitivity_level": sensitivity_max})
        if not clauses:
            return None
        if len(clauses) == 1:
            return clauses[0]
        return {"$and": clauses}

    def health_check(self) -> bool:
        try:
            self._collection.count()
            return True
        except Exception:
            return False
