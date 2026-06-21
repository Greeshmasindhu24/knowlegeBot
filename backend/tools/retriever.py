"""LangChain tools for agents."""

from typing import Any

from langchain_core.tools import tool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rag.retrieval import DocumentRetriever
from services.embeddings import get_embeddings


def create_retriever_tool(department: str | None = None):
    retriever = DocumentRetriever(get_embeddings())

    @tool
    def document_retrieval(query: str) -> str:
        """Search enterprise documents using semantic vector search. Always use before answering factual questions."""
        result = retriever.retrieve(query, department=department)
        if not result.has_results:
            return "No matching documents found."
        return "\n\n---\n\n".join(
            f"[Source {i}] ({c.metadata.get('title', 'Unknown')}, sim={c.similarity:.2f})\n{c.content}"
            for i, c in enumerate(result.chunks, start=1)
        )

    return document_retrieval


async def metadata_lookup(db: AsyncSession, *, document_name: str | None = None, department: str | None = None) -> str:
    from models.db import Document

    query = select(Document).order_by(Document.created_at.desc()).limit(10)
    if document_name:
        query = query.where(Document.title.ilike(f"%{document_name}%"))
    if department:
        query = query.where(Document.department == department)

    result = await db.execute(query)
    docs = result.scalars().all()
    if not docs:
        return "No documents matched the metadata query."

    lines = [
        f"- {d.title} | dept: {d.department} | source: {d.source} | "
        f"version: {d.version} | sensitivity: {d.sensitivity_level} | owner: {d.owner or 'N/A'}"
        for d in docs
    ]
    return "\n".join(lines)


POLICY_STUBS: dict[str, str] = {
    "HR": "All leave requests must be submitted 2 weeks in advance via the HR portal.",
    "Legal": "Contracts require Legal review before signature for amounts over $10,000.",
    "IT Support": "Password resets require MFA verification through the IT helpdesk.",
    "Finance": "Expenses over $500 require manager approval and receipt upload.",
    "Engineering": "Production deployments require change advisory board approval.",
}


def policy_lookup(domain: str, topic: str) -> str:
    """Look up high-level policy summaries by domain (stub for Phase 1)."""
    base = POLICY_STUBS.get(domain, "No domain-specific policy stub available.")
    return f"[{domain} Policy] {base} (topic hint: {topic})"
