"""Document upload endpoint."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from auth.rbac import require_permission
from database.connection import get_db
from models.db import User
from models.schemas import UploadResponse
from services.audit import write_audit_log
from services.ingestion import ingest_file

router = APIRouter(tags=["upload"])


@router.post("/upload", response_model=UploadResponse)
async def upload_document(
    request: Request,
    user: Annotated[User, Depends(require_permission("upload"))],
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
    department: str | None = Form(default=None),
    sensitivity_level: str = Form(default="internal"),
) -> UploadResponse:
    content = await file.read()
    doc, chunk_count = await ingest_file(
        db,
        filename=file.filename or "upload.txt",
        file_bytes=content,
        user=user,
        department=department,
    )

    client_ip = request.client.host if request.client else None
    await write_audit_log(
        db,
        user_id=user.id,
        action="upload_document",
        resource_type="document",
        resource_id=str(doc.id),
        ip_address=client_ip,
        details={"title": doc.title, "chunks": chunk_count, "department": doc.department},
    )

    return UploadResponse(
        document_id=doc.id,
        title=doc.title,
        chunks_created=chunk_count,
        message="Document ingested successfully",
    )
