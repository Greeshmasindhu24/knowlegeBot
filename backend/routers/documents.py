"""Document listing and reindex endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.rbac import can_access_department, require_permission
from database.connection import get_db
from models.db import Document, User
from models.schemas import DocumentListResponse, DocumentMetadata, ReindexRequest, ReindexResponse
from services.audit import write_audit_log
from services.ingestion import reindex_documents

router = APIRouter(tags=["documents"])


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    user: Annotated[User, Depends(require_permission("documents:read"))],
    db: AsyncSession = Depends(get_db),
    department: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> DocumentListResponse:
    query = select(Document).order_by(Document.created_at.desc())
    if department:
        query = query.where(Document.department == department)

    result = await db.execute(query)
    all_docs = result.scalars().all()

    visible = [d for d in all_docs if can_access_department(user, d.department)]
    page = visible[offset : offset + limit]

    return DocumentListResponse(
        documents=[DocumentMetadata.model_validate(d) for d in page],
        total=len(visible),
    )


@router.post("/reindex", response_model=ReindexResponse)
async def reindex(
    payload: ReindexRequest,
    request: Request,
    user: Annotated[User, Depends(require_permission("reindex"))],
    db: AsyncSession = Depends(get_db),
) -> ReindexResponse:
    count = await reindex_documents(
        db,
        document_id=payload.document_id,
        department=payload.department,
    )

    client_ip = request.client.host if request.client else None
    await write_audit_log(
        db,
        user_id=user.id,
        action="reindex_documents",
        ip_address=client_ip,
        details={
            "document_id": str(payload.document_id) if payload.document_id else None,
            "department": payload.department,
            "processed": count,
        },
    )

    return ReindexResponse(
        status="completed",
        documents_processed=count,
        message=f"Reindexed {count} document(s)",
    )
