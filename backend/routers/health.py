"""Health check endpoints."""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database.connection import get_db
from dependencies import get_vector_store
from models.schemas import HealthResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])
settings = get_settings()


@router.get("/health", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    db_status = "ok"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = "error"
        logger.error("Database health check failed: %s: %s", type(exc).__name__, exc)

    try:
        chroma_status = "ok" if get_vector_store().health_check() else "degraded"
    except Exception:
        chroma_status = "degraded"

    overall = "healthy" if db_status == "ok" else "degraded"
    return HealthResponse(
        status=overall,
        version=settings.app_version,
        database=db_status,
        chroma=chroma_status,
    )
