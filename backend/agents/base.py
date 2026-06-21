"""Base domain agent."""

from dataclasses import dataclass, field

from agents.router import Domain
from rag.chain import RAGChain, RAGResult
from services.guardrails import apply_output_guardrails


@dataclass
class AgentResponse:
    answer: str
    domain: str
    citations: list
    confidence: float
    tools_used: list[str] = field(default_factory=list)
    refused: bool = False


class BaseDomainAgent:
    domain: Domain = Domain.GENERAL

    def __init__(self) -> None:
        self.rag_chain = RAGChain(domain=self.domain.value)

    def handle(self, question: str, *, department: str | None = None) -> AgentResponse:
        result: RAGResult = self.rag_chain.run(question, department=department or self.domain.value)
        answer = apply_output_guardrails(result.answer)
        tools = ["document_retrieval", "rag_chain"]
        if result.refused:
            tools.append("no_context_refusal")

        return AgentResponse(
            answer=answer,
            domain=self.domain.value,
            citations=result.citations,
            confidence=result.confidence,
            tools_used=tools,
            refused=result.refused,
        )
