"""Document ingestion service — chunk, embed, store."""

from pathlib import Path
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models.db import Document, DocumentChunk, User
from rag.chunking import chunk_text
from rag.vector_store import VectorStore
from services.embeddings import get_embeddings

settings = get_settings()


async def ingest_text_document(
    db: AsyncSession,
    *,
    title: str,
    content: str,
    user: User,
    department: str | None = None,
    source: str = "manual_upload",
    owner: str | None = None,
    sensitivity_level: str = "internal",
    file_type: str = "txt",
) -> tuple[Document, int]:
    """Ingest plain text: persist document, chunk, embed into ChromaDB."""
    doc = Document(
        title=title,
        source=source,
        department=department or user.department,
        owner=owner or user.full_name,
        sensitivity_level=sensitivity_level,
        file_type=file_type,
        uploaded_by=user.id,
    )
    db.add(doc)
    await db.flush()

    chunks = chunk_text(content, settings.chunk_size, settings.chunk_overlap)
    vector_store = VectorStore(get_embeddings())

    chroma_ids: list[str] = []
    for idx, chunk_content in enumerate(chunks):
        metadata = {
            "document_id": str(doc.id),
            "title": doc.title,
            "source": doc.source,
            "department": doc.department,
            "owner": doc.owner or "",
            "version": doc.version,
            "sensitivity_level": doc.sensitivity_level,
            "last_updated": doc.last_updated.isoformat(),
            "chunk_index": idx,
        }
        chroma_id = vector_store.add_text(chunk_content, metadata)
        chroma_ids.append(chroma_id)

        db_chunk = DocumentChunk(
            document_id=doc.id,
            chunk_index=idx,
            content=chunk_content,
            chroma_id=chroma_id,
            chunk_metadata=metadata,
        )
        db.add(db_chunk)

    await db.flush()
    return doc, len(chunks)


async def ingest_file(
    db: AsyncSession,
    *,
    filename: str,
    file_bytes: bytes,
    user: User,
    department: str | None = None,
) -> tuple[Document, int]:
    """Phase 1 stub: treat file as UTF-8 text. Phase 2 adds PDF/DOCX parsers."""
    suffix = Path(filename).suffix.lower()
    try:
        content = file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        content = file_bytes.decode("latin-1", errors="replace")

    return await ingest_text_document(
        db,
        title=filename,
        content=content,
        user=user,
        department=department,
        file_type=suffix.lstrip(".") or "txt",
    )


async def reindex_documents(
    db: AsyncSession,
    *,
    document_id: UUID | None = None,
    department: str | None = None,
) -> int:
    """Re-embed existing chunks into ChromaDB."""
    from sqlalchemy import select

    query = select(Document)
    if document_id:
        query = query.where(Document.id == document_id)
    if department:
        query = query.where(Document.department == department)

    result = await db.execute(query)
    documents = result.scalars().all()

    vector_store = VectorStore(get_embeddings())
    processed = 0

    for doc in documents:
        chunk_result = await db.execute(
            select(DocumentChunk).where(DocumentChunk.document_id == doc.id)
        )
        chunks = chunk_result.scalars().all()
        for chunk in chunks:
            metadata = {
                "document_id": str(doc.id),
                "title": doc.title,
                "source": doc.source,
                "department": doc.department,
                "owner": doc.owner or "",
                "version": doc.version,
                "sensitivity_level": doc.sensitivity_level,
                "last_updated": doc.last_updated.isoformat(),
                "chunk_index": chunk.chunk_index,
            }
            chroma_id = vector_store.add_text(chunk.content, metadata)
            chunk.chroma_id = chroma_id
            chunk.chunk_metadata = metadata
        processed += 1

    await db.flush()
    return processed
