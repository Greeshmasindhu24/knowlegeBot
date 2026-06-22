"""Embedding service — OpenAI or Ollama via LangChain."""

from langchain_core.embeddings import Embeddings
from langchain_openai import OpenAIEmbeddings

from config import get_settings

settings = get_settings()


def get_embeddings() -> Embeddings:
    if settings.llm_provider == "ollama":
        try:
            from langchain_ollama import OllamaEmbeddings
        except ImportError:
            from langchain_community.embeddings import OllamaEmbeddings

        return OllamaEmbeddings(
            base_url=settings.ollama_base_url,
            model=settings.ollama_embedding_model,
        )

    if settings.llm_provider == "gemini":
        raise RuntimeError(
            "Backend embeddings support only LLM_PROVIDER=openai or ollama; "
            "Gemini is handled by the frontend."
        )

    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")

    return OpenAIEmbeddings(
        openai_api_key=settings.openai_api_key,
        model=settings.openai_embedding_model,
    )
