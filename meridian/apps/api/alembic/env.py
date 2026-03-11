import asyncio
import os
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Import all ORM models so Alembic can detect them
from models.geo_event import GeoEventORM  # noqa: F401
from models.user import User  # noqa: F401
from models.alert import AlertRule, AlertNotification  # noqa: F401
from models.plan_room import PlanRoom, PlanRoomMember, Annotation, TimelineEntry, Task  # noqa: F401
from models.watch_list import WatchListEntity, IntelNote  # noqa: F401
from models.org import Organization, OrganizationMember, APIToken, AuditLog  # noqa: F401
from models.collab import AnnotationComment, ShareableLink  # noqa: F401
from core.database import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    return (
        f"postgresql+asyncpg://"
        f"{os.environ.get('DB_USER', 'meridian')}:"
        f"{os.environ.get('DB_PASS', 'meridian')}@"
        f"{os.environ.get('DB_HOST', 'localhost')}:"
        f"{os.environ.get('DB_PORT', '5432')}/"
        f"{os.environ.get('DB_NAME', 'meridian')}"
    )


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    cfg = config.get_section(config.config_ini_section, {})
    cfg["sqlalchemy.url"] = get_url()
    connectable = async_engine_from_config(
        cfg,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
