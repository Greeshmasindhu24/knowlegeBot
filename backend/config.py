"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[
            str(BASE_DIR / ".env"),
            str(ROOT_DIR / ".env.local"),
        ],
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Enterprise Knowledge Bot API"
    app_version: str = "0.1.0"
    debug: bool = False
    api_prefix: str = ""

    # Database
    database_url: str = Field(
        "postgresql+asyncpg://ekb:ekb@localhost:5432/ekb",
        env=["NEON_DATABASE_URL", "DATABASE_URL"],
    )

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24

    # ChromaDB
    chroma_host: str = "localhost"
    chroma_port: int = 8001
    chroma_collection: str = "enterprise_documents"
    chroma_persist_dir: str | None = None  # in-process mode when set

    # LLM
    llm_provider: Literal["openai", "ollama"] = "openai"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    ollama_embedding_model: str = "nomic-embed-text"

    # LangChain observability
    langchain_tracing_v2: bool = False
    langchain_api_key: str | None = None
    langchain_project: str = "enterprise-knowledge-bot"

    # RAG
    chunk_size: int = 1000
    chunk_overlap: int = 200
    retrieval_top_k: int = 5
    similarity_threshold: float = 0.25

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
