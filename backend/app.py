"""Enterprise Knowledge Bot — FastAPI application entry point."""

import logging
import os
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from database.connection import init_db
import models.db  # noqa: F401 — register ORM models before create_all
from routers import audit, auth, chat, documents, health, upload

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()


def _warn_if_render_missing_database_url() -> None:
    if not os.getenv("RENDER"):
        return
    host = (urlparse(settings.database_url.replace("+asyncpg", "")).hostname or "").lower()
    if host in {"localhost", "127.0.0.1"}:
        logger.error(
            "RENDER deploy detected but DATABASE_URL points to %s. "
            "Set DATABASE_URL in the Render dashboard to your Postgres Internal URL.",
            host,
        )


def _configure_langchain_tracing() -> None:
    if settings.langchain_tracing_v2:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        if settings.langchain_api_key:
            os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
        os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project


@asynccontextmanager
async def lifespan(app: FastAPI):
    _configure_langchain_tracing()
    _warn_if_render_missing_database_url()
    await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(upload.router)
app.include_router(documents.router)
app.include_router(audit.router)


@app.get("/")
async def root():
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
    }
