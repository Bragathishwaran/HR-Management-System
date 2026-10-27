import asyncio
from app.database import AsyncSessionLocal, init_db
from app.models import User
from sqlalchemy import select


async def main():
    await init_db()
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User))
        for u in res.scalars():
            print(getattr(u, 'username'), getattr(getattr(u, 'role'), 'value', u.role), getattr(u, 'email'), getattr(u, 'is_active', None))


if __name__ == '__main__':
    asyncio.run(main())
