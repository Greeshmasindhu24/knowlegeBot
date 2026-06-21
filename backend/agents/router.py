"""Domain router agent — classifies queries to specialist agents."""

import re
from enum import Enum

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from config import get_settings
from rag.chain import get_llm

settings = get_settings()


class Domain(str, Enum):
    HR = "HR"
    LEGAL = "Legal"
    ENGINEERING = "Engineering"
    IT = "IT Support"
    FINANCE = "Finance"
    GENERAL = "General"


DOMAIN_KEYWORDS: dict[Domain, list[str]] = {
    Domain.HR: ["leave", "pto", "benefits", "payroll", "onboarding", "hr", "vacation", "hiring"],
    Domain.LEGAL: ["contract", "legal", "compliance", "nda", "liability", "regulation", "gdpr"],
    Domain.ENGINEERING: ["architecture", "deploy", "api", "code", "engineering", "sprint", "devops"],
    Domain.IT: ["password", "vpn", "laptop", "it support", "ticket", "sso", "mfa", "helpdesk"],
    Domain.FINANCE: ["budget", "expense", "invoice", "finance", "reimbursement", "fiscal", "accounting"],
}


def _keyword_route(message: str) -> Domain | None:
    lower = message.lower()
    scores: dict[Domain, int] = {d: 0 for d in Domain if d != Domain.GENERAL}
    for domain, keywords in DOMAIN_KEYWORDS.items():
        for kw in keywords:
            if kw in lower:
                scores[domain] += 1
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else None


def route_domain(message: str, user_department: str | None = None, llm: BaseChatModel | None = None) -> Domain:
    """Route to domain agent using keyword heuristics + optional LLM fallback."""
    keyword_match = _keyword_route(message)
    if keyword_match:
        return keyword_match

    if user_department:
        dept_map = {
            "HR": Domain.HR,
            "Legal": Domain.LEGAL,
            "Engineering": Domain.ENGINEERING,
            "IT Support": Domain.IT,
            "Finance": Domain.FINANCE,
        }
        if user_department in dept_map:
            return dept_map[user_department]

    # LLM classification fallback
    try:
        model = llm or get_llm()
        prompt = """Classify the user question into exactly one domain:
HR, Legal, Engineering, IT Support, Finance, or General.
Reply with only the domain name."""
        response = model.invoke([SystemMessage(content=prompt), HumanMessage(content=message)])
        text = response.content if isinstance(response.content, str) else str(response.content)
        text = text.strip()
        for domain in Domain:
            if re.search(rf"\b{re.escape(domain.value)}\b", text, re.IGNORECASE):
                return domain
    except Exception:
        pass

    return Domain.GENERAL
