"""RAG chain — NEVER answers without retrieval results."""

from dataclasses import dataclass

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from config import get_settings
from rag.citations import NO_CONTEXT_MESSAGE, chunks_to_citations, format_context_block
from rag.retrieval import DocumentRetriever, RetrievalResult
from models.schemas import Citation
from services.embeddings import get_embeddings

settings = get_settings()


@dataclass
class RAGResult:
    answer: str
    citations: list[Citation]
    confidence: float
    retrieval: RetrievalResult
    refused: bool = False


def get_llm() -> BaseChatModel:
    if settings.llm_provider == "ollama":
        try:
            from langchain_ollama import ChatOllama
        except ImportError:
            from langchain_community.chat_models import ChatOllama  # type: ignore[attr-defined]

        return ChatOllama(
            base_url=settings.ollama_base_url,
            model=settings.ollama_model,
            temperature=0.1,
        )
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")
    return ChatOpenAI(
        openai_api_key=settings.openai_api_key,
        model=settings.openai_model,
        temperature=0.1,
    )


class RAGChain:
    """Mandatory retrieval-before-generation pipeline."""

    def __init__(self, domain: str = "General") -> None:
        self.domain = domain
        self.retriever = DocumentRetriever(get_embeddings())
        self.llm = get_llm()

    def run(self, question: str, *, department: str | None = None) -> RAGResult:
        retrieval = self.retriever.retrieve(question, department=department or self.domain)

        if not retrieval.has_results:
            return RAGResult(
                answer=NO_CONTEXT_MESSAGE,
                citations=[],
                confidence=0.0,
                retrieval=retrieval,
                refused=True,
            )

        context = format_context_block(retrieval.chunks)
        system_prompt = f"""You are an Enterprise Knowledge Bot assistant for the {self.domain} domain.
Answer ONLY using the Context below. Rules:
1. Never use external knowledge.
2. If Context lacks the answer, say the documents do not contain it.
3. Cite sources inline as [Source N].
4. Be professional and structured (markdown allowed).

Context:
{context}"""

        response = self.llm.invoke(
            [SystemMessage(content=system_prompt), HumanMessage(content=question)]
        )
        answer = response.content if isinstance(response.content, str) else str(response.content)
        citations = chunks_to_citations(retrieval.chunks)
        top_similarity = retrieval.chunks[0].similarity if retrieval.chunks else 0.0

        return RAGResult(
            answer=answer,
            citations=citations,
            confidence=top_similarity,
            retrieval=retrieval,
            refused=False,
        )
