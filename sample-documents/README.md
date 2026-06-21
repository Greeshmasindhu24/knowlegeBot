# Sample Documents for Document Hub

Use these files to populate the Enterprise Knowledge Bot during demos and testing. Upload them through **Document Hub** (`/upload`) as `.md` or `.txt` files (PDF/DOCX also supported).

## How access works

| Role | What they can retrieve in AI Chat |
|------|-----------------------------------|
| **employee** | Documents tagged **General** plus documents in **their own department** |
| **reviewer** | All departments (used to audit AI answers and reindex content) |
| **admin** | All departments; can delete any document and manage the review queue |

**Department** controls retrieval scope. **Sensitivity label** (`public`, `internal`, `confidential`, `restricted`) is metadata for governance — tag restricted content appropriately when uploading.

## Quick upload guide by role

### Admin (`admin`)

Upload company-wide and operational content. Good starting set:

1. `general/employee-handbook-overview.md` → Department: **General**, Sensitivity: **internal**
2. `general/company-code-of-conduct.md` → Department: **General**, Sensitivity: **public**
3. `admin/document-hub-admin-guide.md` → Department: **General**, Sensitivity: **internal**
4. Optionally upload one file per department so every team has grounding data.

### Employee (`employee`)

Upload documents for **your department** plus anything that should be org-wide:

| If you work in… | Upload these samples |
|-----------------|----------------------|
| **HR** | `hr/leave-and-pto-policy.md`, `hr/onboarding-checklist.md` |
| **Engineering** | `engineering/engineering-standards.md`, `engineering/secure-coding-guidelines.md` |
| **Finance** | `finance/expense-reimbursement-policy.md` |
| **Legal** | `legal/data-privacy-policy.md` |
| **Marketing** | `marketing/brand-guidelines.md`, `marketing/campaign-approval-process.md` |
| **Any department** | `general/employee-handbook-overview.md` (General) |

Set **Department** on upload to match the content owner (e.g. HR policy → **HR**). Use **General** only for policies that every employee should see.

### Reviewer (`reviewer`)

Reviewers typically **do not own** most policy corpuses; they validate AI answers against uploaded sources. Upload:

1. `reviewer/ai-response-review-guidelines.md` → Department: **General**
2. Ask the admin to ingest department policies so you can test cross-department retrieval.

## Suggested demo questions (after upload)

- *"What is the company leave policy?"* → needs `hr/leave-and-pto-policy.md`
- *"Summarize the key engineering standards."* → needs `engineering/engineering-standards.md`
- *"How are travel reimbursements handled?"* → needs `finance/expense-reimbursement-policy.md`
- *"What is the onboarding checklist for new hires?"* → needs `hr/onboarding-checklist.md`

## File index

| Path | Purpose | Upload as department |
|------|---------|----------------------|
| `general/employee-handbook-overview.md` | Core benefits, hours, conduct summary | General |
| `general/company-code-of-conduct.md` | Ethics and workplace behavior | General |
| `hr/leave-and-pto-policy.md` | PTO accrual, holidays, sick leave | HR |
| `hr/onboarding-checklist.md` | First-week tasks for new hires | HR |
| `engineering/engineering-standards.md` | SDLC, reviews, release process | Engineering |
| `engineering/secure-coding-guidelines.md` | OWASP-aligned dev security rules | Engineering |
| `finance/expense-reimbursement-policy.md` | Receipts, per diem, approval limits | Finance |
| `legal/data-privacy-policy.md` | GDPR/CCPA handling, retention | Legal |
| `marketing/brand-guidelines.md` | Logo, colors, voice, imagery standards | Marketing |
| `marketing/campaign-approval-process.md` | Campaign tiers, approvals, social posting rules | Marketing |
| `admin/document-hub-admin-guide.md` | Admin operations for Document Hub | General |
| `reviewer/ai-response-review-guidelines.md` | HITL review criteria for flagged answers | General |
