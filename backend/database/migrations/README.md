# Database Migrations

Phase 1 uses `schema.sql` applied via Docker init or manual `psql -f`.

Phase 2 will add Alembic migrations:

```bash
alembic init alembic
alembic revision --autogenerate -m "initial"
alembic upgrade head
```

For now, run:

```bash
psql $DATABASE_URL -f backend/database/schema.sql
```
