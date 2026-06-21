# Secure Coding Guidelines

**Department:** Engineering  
**Classification:** Confidential  
**Owner:** Application Security

## Authentication and sessions

- Use company SSO (OIDC) for user-facing apps; no custom password stores.
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax` minimum.
- Access tokens expire within **15 minutes**; refresh via rotating refresh tokens.

## Input validation

- Validate all inputs server-side; never trust client-only checks.
- Parameterize SQL queries; ORMs must disable raw string concatenation in production paths.
- Sanitize HTML using an allowlist library before rendering user content.

## Secrets management

- No secrets in Git — use the vault integration in CI/CD.
- Rotate API keys every **90 days** or immediately after suspected exposure.

## Dependency hygiene

- Weekly automated dependency scans; critical CVEs patched within **7 days**.
- Pin production dependencies; review major upgrades in architecture review.

## Logging

- Never log passwords, tokens, full credit card numbers, or government IDs.
- Security events (failed login spikes, permission changes) ship to SIEM within 5 minutes.

## Reporting

Report vulnerabilities to security@acmecorp.com or #appsec Slack channel.
