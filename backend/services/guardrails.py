"""PII masking and input/output guardrails."""

import re
from dataclasses import dataclass

EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")
PHONE_PATTERN = re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")
SSN_PATTERN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
CREDIT_CARD_PATTERN = re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b")


@dataclass
class GuardrailResult:
    text: str
    masked: bool
    blocked: bool = False
    reason: str | None = None


def mask_pii(text: str) -> GuardrailResult:
    """Mask common PII patterns before logging or external calls."""
    masked = text
    changed = False

    for pattern, replacement in (
        (EMAIL_PATTERN, "[EMAIL_REDACTED]"),
        (PHONE_PATTERN, "[PHONE_REDACTED]"),
        (SSN_PATTERN, "[SSN_REDACTED]"),
        (CREDIT_CARD_PATTERN, "[CARD_REDACTED]"),
    ):
        new_text, count = pattern.subn(replacement, masked)
        if count:
            masked = new_text
            changed = True

    return GuardrailResult(text=masked, masked=changed)


def apply_input_guardrails(text: str) -> GuardrailResult:
    """Block obviously malicious or empty input."""
    stripped = text.strip()
    if not stripped:
        return GuardrailResult(text="", masked=False, blocked=True, reason="Empty message")

    if len(stripped) > 8000:
        return GuardrailResult(
            text=stripped[:8000],
            masked=False,
            blocked=True,
            reason="Message too long",
        )

    pii_result = mask_pii(stripped)
    return pii_result


def apply_output_guardrails(text: str) -> str:
    """Mask PII in model output before returning to client."""
    return mask_pii(text).text
