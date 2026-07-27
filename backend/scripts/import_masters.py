"""Load the workbook extract into the configured database.

    python backend/scripts/import_masters.py              # add what's missing
    python backend/scripts/import_masters.py --overwrite   # also refresh existing

Reads DATABASE_URL from backend/.env, the same file the API and Docker use.
Equivalent to POST /api/masters/import, for when there is no running server.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base, SessionLocal, engine  # noqa: E402
from app import models  # noqa: E402,F401
from app.migrate import run_migrations  # noqa: E402
from app.masters_import import import_masters  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--overwrite", action="store_true",
                    help="refresh records that already exist (discards Setup edits)")
    args = ap.parse_args()

    Base.metadata.create_all(bind=engine)
    added = run_migrations()
    if added:
        print("schema: added " + ", ".join(added))

    db = SessionLocal()
    try:
        stats = import_masters(db, overwrite_existing=args.overwrite)
    finally:
        db.close()

    for table, s in stats.items():
        print(f"{table:<11} created {s['created']:>4}  updated {s['updated']:>4}  "
              f"unchanged {s['unchanged']:>4}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
