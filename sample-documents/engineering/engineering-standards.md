# Engineering Standards

**Department:** Engineering  
**Classification:** Internal  
**Version:** 4.0

## Source control

- All production code lives in Git; trunk-based development with short-lived feature branches (< 3 days).
- Pull requests require **2 approvals** for core services, **1 approval** for internal tools.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`).

## Testing requirements

| Change type | Minimum bar |
|-------------|-------------|
| Bug fix | Regression test required |
| New API endpoint | Unit + integration tests |
| UI change | Snapshot or e2e test for critical flows |

CI must pass before merge. Flaky tests are P1 incidents.

## Release process

1. Feature flags default **off** in production
2. Canary deploy to 5% traffic for 30 minutes
3. On-call engineer monitors error budget
4. Rollback if p99 latency increases > 20% or error rate > 0.5%

## Documentation

Every service maintains a `README` with runbook link, on-call rotation, and dependency map. Architecture Decision Records (ADRs) required for cross-team contracts.

## On-call

Primary rotation: 1 week. Secondary backs up within 15 minutes. Post-incident reviews within 3 business days.
