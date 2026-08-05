"""Additive schema migrations run at startup.

`Base.metadata.create_all` creates missing *tables* but never missing
*columns*, so a deployed database would keep the old shape after a model
gains a field. This walks the models, compares them against the live
columns and issues `ALTER TABLE … ADD COLUMN` for whatever is absent.

Additive only — nothing is dropped, renamed or retyped, so it is safe to run
on every boot and safe to run twice. Anything beyond adding a column (a real
type change, a backfill with logic) belongs in Alembic.
"""
import logging

from sqlalchemy import inspect, text
from sqlalchemy.schema import CreateColumn

from .database import Base, engine

log = logging.getLogger(__name__)

# Columns the ORM defaults for, but which existing rows must be given a value
# for too — otherwise old rows read back as NULL and the calculations see None.
BACKFILL = {
    "items": {
        "pack_unit": "0",
        "sticker_mult": "1.1",
        "sticker_round": "false",
        "stickers_fixed": "0",
        "label_spoilage": "1.0",
        "sticker_rule": "'pp'",
        "uom": "'PCS'",
        "source_sheet": "''",
    },
    # Accounts that pre-date email verification start out unverified — their
    # owner proves the address on the next sign-in, exactly like a new user.
    "users": {"email_verified": "false", "otp_attempts": "0"},
    "suppliers": {"addr": "''", "pin": "''", "state": "''", "your_reference": "''"},
    "buyers": {"our_reference": "''"},
    "transports": {"supplier_ids": None},   # JSON — leave NULL, read as []
    # po_lines price columns are deliberately absent: NULL is meaningful there
    # ("no snapshot — read the item master"), so they must not be backfilled.
}


def run_migrations() -> list[str]:
    """Add every model column the database is missing. Returns what it did."""
    applied: list[str] = []
    insp = inspect(engine)
    live_tables = set(insp.get_table_names())
    dialect = engine.dialect

    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in live_tables:
                continue                      # create_all will make it whole
            have = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in have:
                    continue
                # Added nullable, always: a NOT NULL column cannot be bolted
                # onto a table that already has rows without a server default,
                # and the ORM fills the value on every write anyway.
                ddl = str(CreateColumn(col).compile(dialect=dialect)).replace(" NOT NULL", "")
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN {ddl}'))
                applied.append(f"{table.name}.{col.name}")

                default = BACKFILL.get(table.name, {}).get(col.name)
                if default is not None:
                    conn.execute(text(
                        f'UPDATE "{table.name}" SET "{col.name}" = {default} '
                        f'WHERE "{col.name}" IS NULL'
                    ))

    if applied:
        log.info("schema migration added: %s", ", ".join(applied))
    return applied
