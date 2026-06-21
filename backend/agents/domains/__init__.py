"""Domain-specific agent stubs."""

from agents.base import BaseDomainAgent
from agents.router import Domain


class HRAgent(BaseDomainAgent):
    domain = Domain.HR


class LegalAgent(BaseDomainAgent):
    domain = Domain.LEGAL


class EngineeringAgent(BaseDomainAgent):
    domain = Domain.ENGINEERING


class ITSupportAgent(BaseDomainAgent):
    domain = Domain.IT


class FinanceAgent(BaseDomainAgent):
    domain = Domain.FINANCE


class GeneralAgent(BaseDomainAgent):
    domain = Domain.GENERAL


AGENT_REGISTRY: dict[Domain, type[BaseDomainAgent]] = {
    Domain.HR: HRAgent,
    Domain.LEGAL: LegalAgent,
    Domain.ENGINEERING: EngineeringAgent,
    Domain.IT: ITSupportAgent,
    Domain.FINANCE: FinanceAgent,
    Domain.GENERAL: GeneralAgent,
}


def get_domain_agent(domain: Domain) -> BaseDomainAgent:
    agent_cls = AGENT_REGISTRY.get(domain, GeneralAgent)
    return agent_cls()
