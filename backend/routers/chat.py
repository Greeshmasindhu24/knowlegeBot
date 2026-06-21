"""Chat endpoint — multi-agent RAG pipeline."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from agents.domains import get_domain_agent
from agents.router import route_domain
from auth.rbac import require_permission
from database.connection import get_db
from models.db import Conversation, Message, User
from models.schemas import ChatRequest, ChatResponse
from services.audit import write_audit_log
from services.guardrails import apply_input_guardrails

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    request: Request,
    user: Annotated[User, Depends(require_permission("chat"))],
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    guard = apply_input_guardrails(payload.message)
    if guard.blocked:
        return ChatResponse(
            answer=guard.reason or "Invalid input",
            domain="General",
            confidence=0.0,
        )

    department = payload.department or user.department
    domain = route_domain(guard.text, user_department=department)
    agent = get_domain_agent(domain)
    result = agent.handle(guard.text, department=department)

    conversation_id = payload.conversation_id
    if conversation_id is None:
        conv = Conversation(
            user_id=user.id,
            title=payload.message[:60],
            domain=result.domain,
        )
        db.add(conv)
        await db.flush()
        conversation_id = conv.id
    else:
        conv = await db.get(Conversation, conversation_id)

    db.add(
        Message(
            conversation_id=conversation_id,
            role="user",
            content=payload.message,
            domain=result.domain,
        )
    )
    db.add(
        Message(
            conversation_id=conversation_id,
            role="assistant",
            content=result.answer,
            citations=[c.model_dump() for c in result.citations],
            domain=result.domain,
            confidence=result.confidence,
            tools_used=result.tools_used,
        )
    )

    client_ip = request.client.host if request.client else None
    await write_audit_log(
        db,
        user_id=user.id,
        action="ask_question",
        ip_address=client_ip,
        details={
            "domain": result.domain,
            "confidence": result.confidence,
            "citations_count": len(result.citations),
            "refused": result.refused,
        },
    )

    return ChatResponse(
        answer=result.answer,
        citations=result.citations,
        domain=result.domain,
        confidence=result.confidence,
        tools_used=result.tools_used,
        conversation_id=conversation_id,
    )
