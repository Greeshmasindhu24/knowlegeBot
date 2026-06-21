# Document Hub — Administrator Guide

**Audience:** Platform administrators  
**Classification:** Internal

## Administrator responsibilities

Admins manage the knowledge corpus, user access, and AI governance for Acme Corp's Enterprise Knowledge Bot.

## Document Hub operations

1. **Upload** — Ingest PDF, DOCX, TXT, or MD files with correct department tags.
2. **Reindex** — Run reindex after bulk uploads or embedding model changes (Reviewers may also reindex).
3. **Delete** — Remove outdated policies; deletion cascades to vector chunks.
4. **Clear knowledge base** — Emergency action; requires written change ticket.

## Department tagging rules

- **General** — Visible to all employees in AI Chat retrieval.
- **Department-specific** — Only visible to matching department employees, reviewers, and admins.
- Mis-tagged documents are the #1 cause of "I don't know" answers — validate tags quarterly.

## Review queue

Flagged AI responses appear when confidence is low or guardrails trigger. Admins assign reviewers and mark outcomes: approved, rejected, or revised.

## Audit

All uploads, deletions, and chat queries write to audit logs. Export available for compliance reviews.

## Support escalation

Platform issues: #knowledge-bot-admin Slack channel or admin-support@acmecorp.com.
