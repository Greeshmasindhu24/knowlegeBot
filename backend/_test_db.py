import asyncio
import asyncpg

async def main():
    tests = [
        ("local", "postgresql://ekb:ekb@127.0.0.1:5432/ekb", False),
        ("supa6543", "postgresql://postgres:8r2c0Dq2f2yD1P1S2g0J1L0S1R0M1Z0X0K0V0Q0N0L0M0J0I0H0G0F0E0D0C0B0A09080706050403020100@hpjketpuzlxpsvyetrxu.supabase.co:6543/postgres", True),
    ]
    for label, dsn, ssl in tests:
        try:
            conn = await asyncio.wait_for(asyncpg.connect(dsn, ssl="require" if ssl else False), timeout=10)
            print(label, "OK")
            await conn.close()
        except Exception as e:
            print(label, "FAIL", type(e).__name__, str(e)[:200])

asyncio.run(main())
