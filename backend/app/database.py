"""Database engine, session factory and declarative base.

Development and production share one hosted Postgres (Neon), so the settings
here are written for a database that is reached over the network and is allowed
to go to sleep, rather than for a file on the same disk.

Neon scales an idle project to zero and its pooler hangs up on connections that
have been quiet for a while. A pooled connection is therefore not evidence of a
usable connection: the socket looks open until the first statement on it fails.
Three settings between them cover that, and all three are needed —

  pool_pre_ping   a throwaway SELECT 1 before the connection is handed out, so
                  a dead one is discarded and replaced instead of surfacing as
                  "server closed the connection unexpectedly" mid-request.
  pool_recycle    connections are dropped after five minutes anyway, which
                  keeps the pool from filling with sockets the far end has
                  already forgotten, and costs one reconnect.
  keepalives      the kernel probes an idle socket, so a connection cut by
                  something in between (NAT timeout, laptop suspend, the
                  pooler) is noticed rather than waited on.

connect_timeout matters more than it looks: libpq waits indefinitely by
default, so an unreachable database presents as a request that never answers.
A cold Neon endpoint takes several seconds to wake, hence 15 rather than 5.
"""
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

_url = make_url(settings.database_url)
_is_sqlite = _url.get_backend_name() == "sqlite"
# The settings below are libpq's, not SQLAlchemy's, so they are only legal for a
# driver that wraps libpq — psycopg2 (the default for a bare "postgresql://" URL)
# and psycopg 3. Handing connect_timeout or keepalives to something else, asyncpg
# being the one to watch for, is a TypeError at the first connection rather than
# a warning, so the driver is checked instead of assumed: a deploy that changes
# the URL should not be able to take the process down on boot.
_is_libpq = _url.get_backend_name() == "postgresql" and "psycopg" in (_url.get_driver_name() or "")

if _is_sqlite:
    # SQLite needs check_same_thread=False when used across FastAPI's threads.
    connect_args = {"check_same_thread": False}
    engine_kwargs = {}
elif not _is_libpq:
    # Some other dialect or async driver: keep the pool hygiene, skip the
    # libpq-only arguments.
    connect_args = {}
    engine_kwargs = {"pool_recycle": 300}
else:
    connect_args = {
        "connect_timeout": 15,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 3,
        # Names this process in pg_stat_activity, so a connection left open by
        # a script is tellable from one held by the API.
        "application_name": f"jaikvin-{settings.environment}",
    }
    engine_kwargs = {"pool_recycle": 300}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    **engine_kwargs,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
